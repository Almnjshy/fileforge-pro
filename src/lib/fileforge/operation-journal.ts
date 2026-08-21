// FileForge Pro — Operation Recovery Journal
// Lightweight crash/process-death journal. It deliberately stores metadata,
// not file contents. Interrupted jobs are surfaced as recoverable records and
// can be retried explicitly by the operation engine.
"use client";

import type { FileOperation } from "./file-operation-engine";

const STORAGE_KEY = "fileforge-operation-journal-v1";
const MAX_RECORDS = 100;

export type RecoveryStatus = "running" | "paused" | "pending" | "interrupted";

export interface OperationJournalRecord {
  id: string;
  type: FileOperation["type"];
  description: string;
  status: RecoveryStatus;
  current: number;
  total: number;
  progressBasis?: FileOperation["progressBasis"];
  currentPath?: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

function read(): OperationJournalRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(records: OperationJournalRecord[]): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-MAX_RECORDS))); } catch { /* best effort */ }
}

export function journalOperation(op: FileOperation): void {
  const records = read().filter(r => r.id !== op.id);
  records.push({
    id: op.id, type: op.type, description: op.description, status: op.status === "running" || op.status === "paused" || op.status === "pending" ? op.status : "interrupted",
    current: op.current, total: op.total, progressBasis: op.progressBasis,
    currentPath: op.currentPath, startedAt: op.startedAt, updatedAt: Date.now(), error: op.error,
  });
  write(records);
}

export function removeJournaledOperation(id: string): void {
  write(read().filter(r => r.id !== id));
}

/** Convert jobs that were active before process death into explicit recovery records. */
export function recoverInterruptedOperations(): OperationJournalRecord[] {
  const records = read();
  let changed = false;
  const recovered = records.map(r => {
    if (r.status === "running" || r.status === "paused" || r.status === "pending") {
      changed = true;
      return { ...r, status: "interrupted" as const, updatedAt: Date.now(), error: "Application stopped before this operation completed." };
    }
    return r;
  });
  if (changed) write(recovered);
  return recovered.filter(r => r.status === "interrupted");
}

export function clearOperationJournal(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
