// FileForge Pro — File Operation Engine
//
// Unified engine for all file operations: copy, move, delete, extract,
// compress, rename, create. Each operation runs in the background and
// reports real progress (bytesCopied/totalBytes, filesProcessed/totalFiles).
//
// The engine is a singleton that holds a list of active operations. The UI
// subscribes via the operationStore and renders a real progress bar.

"use client";

import { fileRepository } from "./file-repository";
import { getArchiveProvider } from "./archive-provider";
import { nativeFileSystem, isNative, getNativePlugin, subscribeNativeOperationEvents, prepareNativeOperationEvents, cancelNativeFileOperation, pauseNativeFileOperation, resumeNativeFileOperation } from "./native-bridge";
import { logger } from "./logger";
import { journalOperation, removeJournaledOperation, recoverInterruptedOperations } from "./operation-journal";
import { getRecoveredNativeFileOperations } from "./native-bridge";

export type OperationType = "copy" | "move" | "delete" | "extract" | "compress" | "rename" | "createFolder" | "createFile";

export type OperationStatus = "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface FileOperation {
  id: string;
  type: OperationType;
  description: string;
  status: OperationStatus;
  progress: number;        // 0..1
  current: number;         // bytes or files processed
  total: number;           // total bytes or files
  speed?: number;          // bytes/sec for byte-based operations
  etaSeconds?: number;     // estimated remaining seconds from real throughput
  progressBasis?: "bytes" | "files";
  currentPath?: string;    // item currently being processed
  filesProcessed?: number;
  filesTotal?: number;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  cancellable: boolean;
  // Internal cancel flag
  _cancelFlag?: { cancelled: boolean; paused?: boolean };
}

export type OperationListener = (ops: FileOperation[]) => void;

export type ConflictChoice = "overwrite" | "skip" | "keep_both" | "cancel";
export type ConflictResolver = (fileName: string) => Promise<ConflictChoice>;

class FileOperationEngine {
  private operations: FileOperation[] = [];
  private listeners = new Set<OperationListener>();
  private opIdCounter = 0;
  private static MAX_CONCURRENT = 3;
  private runningCount = 0;
  private queue: Array<() => boolean> = [];
  private conflictResolver: ConflictResolver | null = null;
  private operationTasks = new Map<string, () => void>();
  private nativeEventsUnsubscribe: (() => void) | null = null;
  private nativeEventTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingNativeUpdates = new Map<string, Partial<FileOperation>>();
  private recoveryLoaded = false;

  private ensureRecoveryJournal(): void {
    if (this.recoveryLoaded || typeof window === "undefined") return;
    this.recoveryLoaded = true;

    // Native operations have a durable SQLite journal owned by the native
    // operation engine. Never mirror those records into WebView localStorage:
    // doing so creates a second recovery authority that can diverge after
    // process death. Web operations retain their browser-local journal because
    // they have no native durable transaction owner.
    if (isNative()) {
      void getRecoveredNativeFileOperations().then(recovered => {
        for (const raw of recovered) {
          const r = raw as Record<string, unknown>;
          const id = typeof r.id === "string" ? r.id : "";
          if (!id || this.operations.some(op => op.id === id)) continue;
          const total = typeof r.totalBytes === "number" ? Math.max(0, r.totalBytes) : 0;
          const current = typeof r.bytesProcessed === "number" ? Math.max(0, r.bytesProcessed) : 0;
          const type = r.type as FileOperation["type"];
          if (!type) continue;
          this.operations.push({
            id,
            type,
            description: `[Recovered] ${typeof r.description === "string" ? r.description : type}`,
            status: "failed",
            progress: total > 0 ? Math.min(1, current / total) : 0,
            current,
            total,
            progressBasis: "bytes",
            currentPath: typeof r.currentPath === "string" ? r.currentPath : undefined,
            startedAt: typeof r.startedAt === "number" ? r.startedAt : Date.now(),
            finishedAt: Date.now(),
            error: typeof r.error === "string" ? r.error : "Operation was interrupted when the app stopped.",
            cancellable: false,
          });
        }
        this.notify();
      }).catch(() => undefined);
      return;
    }

    const recovered = recoverInterruptedOperations();
    for (const r of recovered) {
      this.operations.push({
        id: r.id, type: r.type, description: `[Recovered] ${r.description}`,
        status: "failed", progress: r.total > 0 ? Math.min(1, r.current / r.total) : 0,
        current: r.current, total: r.total, progressBasis: r.progressBasis,
        currentPath: r.currentPath, startedAt: r.startedAt, finishedAt: Date.now(),
        error: r.error || "Operation was interrupted when the app stopped.", cancellable: false,
      });
    }
  }

  private ensureNativeEventBridge(): void {
    if (this.nativeEventsUnsubscribe || !isNative()) return;
    this.nativeEventsUnsubscribe = subscribeNativeOperationEvents((event) => {
      const op = this.operations.find(item => item.id === event.operationId);
      if (!op) return;
      const updates: Partial<FileOperation> = {};
      if (typeof event.bytesProcessed === "number") updates.current = event.bytesProcessed;
      if (typeof event.totalBytes === "number" && event.totalBytes > 0) {
        updates.total = event.totalBytes;
        updates.progressBasis = "bytes";
      }
      if (event.currentPath) updates.currentPath = event.currentPath;
      if (event.status === "running") updates.status = "running";
      if (event.status === "paused") updates.status = "paused";
      if (event.status === "completed") { updates.status = "completed"; updates.finishedAt = Date.now(); }
      if (event.status === "cancelled") { updates.status = "cancelled"; updates.finishedAt = Date.now(); }
      if (event.status === "failed") { updates.status = "failed"; updates.finishedAt = Date.now(); updates.error = event.error || event.message || "Native operation failed"; }
      if (event.status === "cancelling") updates.status = "running";

      // Native streams can emit dozens of progress events per second. Coalesce
      // non-terminal events so React does not re-render on every 64 KiB chunk.
      const terminal = ["completed", "cancelled", "failed"].includes(event.status || "");
      const previous = this.pendingNativeUpdates.get(event.operationId) || {};
      this.pendingNativeUpdates.set(event.operationId, { ...previous, ...updates });
      const flush = () => {
        const pending = this.pendingNativeUpdates.get(event.operationId);
        this.pendingNativeUpdates.delete(event.operationId);
        this.nativeEventTimers.delete(event.operationId);
        if (pending) this.updateOp(op, pending);
      };
      if (terminal) {
        const timer = this.nativeEventTimers.get(event.operationId);
        if (timer) clearTimeout(timer);
        flush();
      } else if (!this.nativeEventTimers.has(event.operationId)) {
        this.nativeEventTimers.set(event.operationId, setTimeout(flush, 100));
      }
    });
  }

  /** Set a conflict resolver callback. The UI registers this to show ConflictDialog. */
  setConflictResolver(resolver: ConflictResolver | null): void {
    this.conflictResolver = resolver;
  }

  /** Check if a target path exists and resolve conflict if so. */
  private async resolveConflict(targetPath: string): Promise<"proceed" | "skip" | "rename" | "cancel"> {
    // Check if target exists
    const { fileRepository } = await import("./file-repository");
    const meta = await fileRepository.getMetadata(targetPath);
    if (!meta) return "proceed"; // no conflict

    if (!this.conflictResolver) return "proceed"; // no resolver set, overwrite by default

    const fileName = targetPath.substring(targetPath.lastIndexOf("/") + 1);
    const choice = await this.conflictResolver(fileName);
    switch (choice) {
      case "overwrite": return "proceed";
      case "skip": return "skip";
      case "keep_both": return "rename";
      case "cancel": return "cancel";
    }
  }

  /** Generate a unique filename by appending " (copy)" or a number. */
  private async generateUniqueName(targetDir: string, name: string): Promise<string> {
    const { fileRepository } = await import("./file-repository");
    const dotIdx = name.lastIndexOf(".");
    const baseName = dotIdx > 0 ? name.substring(0, dotIdx) : name;
    const ext = dotIdx > 0 ? name.substring(dotIdx) : "";
    let candidate = `${baseName} (copy)${ext}`;
    let counter = 1;
    while (true) {
      const candidatePath = `${targetDir.endsWith("/") ? targetDir : targetDir + "/"}${candidate}`;
      const meta = await fileRepository.getMetadata(candidatePath);
      if (!meta) return candidatePath;
      counter++;
      candidate = `${baseName} (copy ${counter})${ext}`;
      if (counter > 100) return candidatePath; // safety valve
    }
  }

  private async acquireSlot(op?: FileOperation): Promise<boolean> {
    if (op?._cancelFlag?.cancelled) return false;
    if (this.runningCount < FileOperationEngine.MAX_CONCURRENT) {
      this.runningCount++;
      return true;
    }
    return new Promise<boolean>((resolve) => {
      this.queue.push(() => {
        if (op?._cancelFlag?.cancelled) {
          resolve(false);
          return false;
        }
        this.runningCount++;
        resolve(true);
        return true;
      });
    });
  }

  private releaseSlot(): void {
    this.runningCount = Math.max(0, this.runningCount - 1);
    while (this.queue.length > 0 && this.runningCount < FileOperationEngine.MAX_CONCURRENT) {
      const next = this.queue.shift()!;
      if (next()) break;
    }
  }

  subscribe(listener: OperationListener): () => void {
    this.ensureRecoveryJournal();
    this.listeners.add(listener);
    listener(this.operations);
    return () => this.listeners.delete(listener);
  }

  getOperations(): FileOperation[] {
    return [...this.operations];
  }

  private notify() {
    const snapshot = [...this.operations];
    // Native operations persist lifecycle state in NativeOperationJournal.
    // Keeping a second WebView journal for the same operation would be a
    // conflicting recovery source, so only non-native operations use it.
    if (!isNative()) {
      snapshot.forEach(op => {
        if (["pending", "running", "paused"].includes(op.status)) journalOperation(op);
        else if (["completed", "failed", "cancelled"].includes(op.status)) removeJournaledOperation(op.id);
      });
    }
    this.listeners.forEach(l => l(snapshot));
  }

  private markRunning(op: FileOperation): void {
    if (op.status === "pending" || op.status === "paused") {
      this.updateOp(op, { status: "running", startedAt: op.startedAt || Date.now() });
    }
  }

  private createOp(
    type: OperationType,
    description: string,
    total: number,
    cancellable = true,
  ): FileOperation {
    this.ensureNativeEventBridge();
    const op: FileOperation = {
      id: `op-${++this.opIdCounter}-${Date.now()}`,
      type,
      description,
      status: "pending",
      progress: 0,
      current: 0,
      total,
      startedAt: Date.now(),
      cancellable,
      progressBasis: type === "extract" ? "files" : ["copy", "move", "compress"].includes(type) ? "bytes" : "files",
      _cancelFlag: { cancelled: false },
    };
    this.operations.push(op);
    this.notify();
    return op;
  }

  private updateOp(op: FileOperation, updates: Partial<FileOperation>) {
    Object.assign(op, updates);
    if (op.total > 0) {
      op.progress = Math.min(1, op.current / op.total);
    }
    // Estimate throughput from actual completed work. This is deliberately
    // calculated from the operation clock rather than an animation so the UI
    // can show real speed/ETA information.
    if ((op.type === "copy" || op.type === "move" || op.type === "compress" || op.type === "extract") && op.current > 0) {
      const elapsed = Math.max(0.001, (Date.now() - op.startedAt) / 1000);
      op.speed = op.current / elapsed;
      if (op.speed > 0 && op.total > op.current) {
        op.etaSeconds = Math.max(0, (op.total - op.current) / op.speed);
      } else if (op.current >= op.total && op.total > 0) {
        op.etaSeconds = 0;
      }
    }
    this.notify();
  }

  cancelOperation(id: string) {
    const op = this.operations.find(o => o.id === id);
    if (!op || !op._cancelFlag || ["completed", "failed", "cancelled"].includes(op.status)) return;
    op._cancelFlag.cancelled = true;
    if (isNative() && ["copy", "move", "extract", "compress"].includes(op.type)) {
      void cancelNativeFileOperation(id);
    }
    if (op.status === "pending" || op.status === "paused") {
      this.updateOp(op, { status: "cancelled", finishedAt: Date.now() });
      return;
    }
    this.notify();
  }

  pauseOperation(id: string): boolean {
    const op = this.operations.find(o => o.id === id);
    if (!op || op.status !== "running" || !op.cancellable) return false;
    // Cooperative pause: operations stop between file-level work units.
    // Native byte-stream operations remain atomic until their current chunk completes.
    if (op._cancelFlag) (op._cancelFlag as any).paused = true;
    if (isNative() && ["copy", "move", "extract", "compress"].includes(op.type)) void pauseNativeFileOperation(id);
    this.updateOp(op, { status: "paused" });
    return true;
  }

  resumeOperation(id: string): boolean {
    const op = this.operations.find(o => o.id === id);
    if (!op || op.status !== "paused" || op._cancelFlag?.cancelled) return false;
    if (op._cancelFlag) (op._cancelFlag as any).paused = false;
    if (isNative() && ["copy", "move", "extract", "compress"].includes(op.type)) void resumeNativeFileOperation(id);
    this.updateOp(op, { status: "running" });
    return true;
  }

  getActiveOperations(): FileOperation[] {
    return this.operations.filter(o => o.status === "pending" || o.status === "running" || o.status === "paused");
  }

  clearFinishedOperations(): void {
    this.operations = this.operations.filter(o => o.status === "pending" || o.status === "running" || o.status === "paused");
    this.notify();
  }

  removeOperation(id: string) {
    const timer = this.nativeEventTimers.get(id);
    if (timer) clearTimeout(timer);
    this.nativeEventTimers.delete(id);
    this.pendingNativeUpdates.delete(id);
    this.operations = this.operations.filter(o => o.id !== id);
    this.notify();
  }

  // ============ Operations ============

  async copyPaths(sources: string[], targetDir: string): Promise<FileOperation> {
    if (isNative()) await prepareNativeOperationEvents();
    const total = await this.estimateSize(sources);
    const op = this.createOp("copy", `Copying ${sources.length} item${sources.length > 1 ? "s" : ""}`, total);
    if (!(await this.acquireSlot(op))) return op;
    this.markRunning(op);

    (async () => {
      let copied = 0;
      try {
        for (const src of sources) {
          if (op._cancelFlag?.cancelled) break;
          while (op._cancelFlag?.paused && !op._cancelFlag?.cancelled) await new Promise(r => setTimeout(r, 100));
          const name = src.substring(src.lastIndexOf("/") + 1);
          let target = `${targetDir.endsWith("/") ? targetDir : targetDir + "/"}${name}`;

          // Conflict resolution
          const conflictResult = await this.resolveConflict(target);
          if (conflictResult === "cancel") {
            this.updateOp(op, { status: "cancelled", finishedAt: Date.now() });
            break;
          }
          if (conflictResult === "skip") continue;
          if (conflictResult === "rename") {
            target = await this.generateUniqueName(targetDir, name);
          }

          await fileRepository.copy(src, target, op.id);
          copied += await this.estimateSize([src]);
          this.updateOp(op, { current: copied, currentPath: src, filesProcessed: sources.indexOf(src) + 1, filesTotal: sources.length });
        }
        if (!op._cancelFlag?.cancelled) {
          this.updateOp(op, { status: "completed", current: total, finishedAt: Date.now() });
        }
      } catch (e) {
        this.updateOp(op, {
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          finishedAt: Date.now(),
        });
      } finally {
        this.releaseSlot();
      }
    })();

    return op;
  }

  async movePaths(sources: string[], targetDir: string): Promise<FileOperation> {
    if (isNative()) await prepareNativeOperationEvents();
    const total = await this.estimateSize(sources);
    const op = this.createOp("move", `Moving ${sources.length} item${sources.length > 1 ? "s" : ""}`, total);
    op.filesTotal = sources.length;
    if (!(await this.acquireSlot(op))) return op;
    this.markRunning(op);

    (async () => {
      let moved = 0;
      try {
        for (const src of sources) {
          if (op._cancelFlag?.cancelled) break;
          while (op._cancelFlag?.paused && !op._cancelFlag?.cancelled) await new Promise(r => setTimeout(r, 100));
          const name = src.substring(src.lastIndexOf("/") + 1);
          let target = `${targetDir.endsWith("/") ? targetDir : targetDir + "/"}${name}`;

          // Conflict resolution
          const conflictResult = await this.resolveConflict(target);
          if (conflictResult === "cancel") {
            this.updateOp(op, { status: "cancelled", finishedAt: Date.now() });
            break;
          }
          if (conflictResult === "skip") continue;
          if (conflictResult === "rename") {
            target = await this.generateUniqueName(targetDir, name);
          }

          await fileRepository.move(src, target, op.id);
          moved++;
          const processedBytes = await this.estimateSize(sources.slice(0, moved));
          this.updateOp(op, { current: Math.min(total, processedBytes), filesProcessed: moved, currentPath: src });
        }
        if (!op._cancelFlag?.cancelled) {
          this.updateOp(op, { status: "completed", current: total, filesProcessed: moved, filesTotal: sources.length, finishedAt: Date.now() });
        }
      } catch (e) {
        this.updateOp(op, {
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          finishedAt: Date.now(),
        });
      } finally {
        this.releaseSlot();
      }
    })();

    return op;
  }

  async deletePaths(sources: string[]): Promise<FileOperation> {
    const op = this.createOp("delete", `Deleting ${sources.length} item${sources.length > 1 ? "s" : ""}`, sources.length);
    if (!(await this.acquireSlot(op))) return op;
    this.markRunning(op);

    (async () => {
      let deleted = 0;
      try {
        for (const src of sources) {
          if (op._cancelFlag?.cancelled) break;
          while (op._cancelFlag?.paused && !op._cancelFlag?.cancelled) await new Promise(r => setTimeout(r, 100));
          await fileRepository.delete([src]);
          deleted++;
          this.updateOp(op, { current: deleted, currentPath: src, filesProcessed: deleted, filesTotal: sources.length });
        }
        if (!op._cancelFlag?.cancelled) {
          this.updateOp(op, { status: "completed", current: sources.length, finishedAt: Date.now() });
        }
      } catch (e) {
        this.updateOp(op, {
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          finishedAt: Date.now(),
        });
      } finally {
        this.releaseSlot();
      }
    })();

    return op;
  }

  async extractArchive(archivePath: string, targetDir: string, password?: string): Promise<FileOperation> {
    // We don't know total entries ahead of time on all formats; use 100 as a placeholder
    // and update once the archive is opened.
    const op = this.createOp("extract", `Extracting ${archivePath.substring(archivePath.lastIndexOf("/") + 1)}`, 100);
    if (!(await this.acquireSlot(op))) return op;
    this.markRunning(op);

    (async () => {
      try {
        const provider = getArchiveProvider();
        // First, list entries to get a real total
        const result = await provider.listEntries(archivePath, password);
        const totalEntries = result.entries.filter(e => !e.isDirectory).length;
        op.total = totalEntries || 1;
        op.progressBasis = "files";
        this.notify();

        // Use the provider's extractAll (native: streams to disk)
        const count = await provider.extractAll(archivePath, targetDir, password, op.id);
        if (op._cancelFlag?.cancelled) return;
        this.updateOp(op, {
          status: "completed",
          current: count,
          progress: 1,
          finishedAt: Date.now(),
        });
      } catch (e) {
        if (op._cancelFlag?.cancelled) {
          this.updateOp(op, { status: "cancelled", finishedAt: Date.now() });
        } else {
          this.updateOp(op, {
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
            finishedAt: Date.now(),
          });
        }
      } finally {
        this.releaseSlot();
      }
    })();

    return op;
  }

  async compressPaths(sources: string[], targetArchive: string, format = "zip"): Promise<FileOperation> {
    // Estimate total from file sizes on native, or use sources.length on web
    let total = sources.length;
    if (isNative() && sources.some(s => s.startsWith("/"))) {
      try {
        let totalBytes = 0;
        for (const src of sources) {
          const meta = await fileRepository.getMetadata(src);
          if (meta) totalBytes += meta.size;
        }
        total = totalBytes || sources.length;
      } catch { /* fall back to count */ }
    }
    const op = this.createOp("compress", `Compressing ${sources.length} item${sources.length > 1 ? "s" : ""}`, total);
    if (!(await this.acquireSlot(op))) return op;
    this.markRunning(op);

    (async () => {
      try {
        if (isNative()) {
          // Android archive creation stays entirely inside the Native ArchiveEngine.
          // Never fall back to JSZip on Android: that would reintroduce whole-file
          // Base64/Blob buffering and bypass the Native Job Protocol.
          const plugin = getNativePlugin();
          if (!plugin || typeof plugin.archiveCreate !== "function") {
            throw new Error("Native archive engine is unavailable on this device");
          }
          const result = await plugin.archiveCreate({ sources, target: targetArchive, format, operationId: op.id });
          if (op._cancelFlag?.cancelled) {
            this.updateOp(op, { status: "cancelled", finishedAt: Date.now() });
            return;
          }
          if (!result?.success) throw new Error(result?.error || "Native compression failed");
          this.updateOp(op, { status: "completed", current: total, progress: 1, finishedAt: Date.now() });
          return;
        }

        // Browser-only fallback: JSZip is never used for Android operations.
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        let processed = 0;
        for (const src of sources) {
          if (op._cancelFlag?.cancelled) break;
          while (op._cancelFlag?.paused && !op._cancelFlag?.cancelled) await new Promise(r => setTimeout(r, 100));
          const name = src.substring(src.lastIndexOf("/") + 1);
          const { getNode } = await import("./filesystem");
          const node = getNode(src);
          if (node?.content) zip.file(name, node.content);
          processed++;
          this.updateOp(op, { current: processed });
        }
        if (op._cancelFlag?.cancelled) return;
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = targetArchive.split("/").pop() || "archive.zip";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.updateOp(op, { status: "completed", current: sources.length, progress: 1, finishedAt: Date.now() });
      } catch (e) {
        if (op._cancelFlag?.cancelled) {
          this.updateOp(op, { status: "cancelled", finishedAt: Date.now() });
        } else {
          this.updateOp(op, {
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
            finishedAt: Date.now(),
          });
        }
      } finally {
        this.releaseSlot();
      }
    })();

    return op;
  }

  async renamePath(path: string, newName: string): Promise<FileOperation> {
    const op = this.createOp("rename", `Renaming to ${newName}`, 1, false);
    if (!(await this.acquireSlot(op))) return op;
    this.markRunning(op);

    (async () => {
      try {
        const result = await fileRepository.rename(path, newName);
        if (result.ok) {
          this.updateOp(op, { status: "completed", current: 1, progress: 1, finishedAt: Date.now() });
        } else {
          this.updateOp(op, {
            status: "failed",
            error: result.error || "Rename failed",
            finishedAt: Date.now(),
          });
        }
      } catch (e) {
        this.updateOp(op, {
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          finishedAt: Date.now(),
        });
      } finally {
        this.releaseSlot();
      }
    })();

    return op;
  }

  async createFolder(parentPath: string, name: string): Promise<FileOperation> {
    const op = this.createOp("createFolder", `Creating folder ${name}`, 1, false);
    if (!(await this.acquireSlot(op))) return op;
    this.markRunning(op);

    (async () => {
      try {
        const ok = await fileRepository.createFolder(parentPath, name);
        if (ok) {
          this.updateOp(op, { status: "completed", current: 1, progress: 1, finishedAt: Date.now() });
        } else {
          this.updateOp(op, { status: "failed", error: "Folder creation failed", finishedAt: Date.now() });
        }
      } catch (e) {
        this.updateOp(op, {
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          finishedAt: Date.now(),
        });
      } finally {
        this.releaseSlot();
      }
    })();

    return op;
  }

  async createFile(parentPath: string, name: string, content = ""): Promise<FileOperation> {
    const op = this.createOp("createFile", `Creating file ${name}`, 1, false);
    if (!(await this.acquireSlot(op))) return op;
    this.markRunning(op);

    (async () => {
      try {
        const id = await fileRepository.createFile(parentPath, name, content);
        if (id) {
          this.updateOp(op, { status: "completed", current: 1, progress: 1, finishedAt: Date.now() });
        } else {
          this.updateOp(op, { status: "failed", error: "File creation failed", finishedAt: Date.now() });
        }
      } catch (e) {
        this.updateOp(op, {
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
          finishedAt: Date.now(),
        });
      } finally {
        this.releaseSlot();
      }
    })();

    return op;
  }

  private async estimateSize(paths: string[]): Promise<number> {
    if (!isNative()) return paths.length;
    let total = 0;
    for (const p of paths) {
      try {
        const meta = await fileRepository.getMetadata(p);
        if (meta) total += meta.size;
      } catch { /* ignore */ }
    }
    return total || paths.length;
  }
}

// Singleton
export const fileOperationEngine = new FileOperationEngine();
