// FileForge Pro — Large Document Engine
//
// A bounded-memory editor model for large text files.  The document is never
// materialised as one JavaScript string. Pages are byte ranges owned by the
// original file, with UTF-8/UTF-16 boundaries aligned before decoding. Edited
// pages are kept in memory; untouched pages are streamed directly from Native
// when saving into a native transactional temporary target.

import { nativeFileSystem } from "./native-bridge";

export const LARGE_DOCUMENT_PAGE_BYTES = 256 * 1024;
export const LARGE_DOCUMENT_MAX_CACHED_PAGES = 6;
export const LARGE_DOCUMENT_MAX_UNDO = 50;

type TextEncodingName = "utf-8" | "utf-16le" | "utf-16be";

type Page = {
  index: number;
  start: number;
  end: number;
  text: string;
  dirty: boolean;
  undo: string[];
  redo: string[];
};

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob !== "function") throw new Error("Base64 decoder is unavailable");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== "function") throw new Error("Base64 encoder is unavailable");
  let result = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    result += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(result);
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const at = i * 2;
    if (littleEndian) {
      out[at] = code & 0xff;
      out[at + 1] = code >>> 8;
    } else {
      out[at] = code >>> 8;
      out[at + 1] = code & 0xff;
    }
  }
  return out;
}

function decode(bytes: Uint8Array, encoding: TextEncodingName): string {
  return new TextDecoder(encoding, { fatal: false }).decode(bytes);
}

function encode(text: string, encoding: TextEncodingName): Uint8Array {
  if (encoding === "utf-8") return new TextEncoder().encode(text);
  return encodeUtf16(text, encoding === "utf-16le");
}

function isUtf8Continuation(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

/**
 * Detect the encoding from a bounded prefix. UTF-8 is the safe default for
 * Android text files; BOMs are preserved when saving so UTF-16 files are not
 * silently converted to UTF-8.
 */
async function detectEncoding(path: string, fileSize: number): Promise<{
  encoding: TextEncodingName;
  bomLength: number;
}> {
  const sample = Math.min(4, fileSize);
  if (sample <= 0) return { encoding: "utf-8", bomLength: 0 };
  const chunk = await nativeFileSystem.readFileChunk(path, 0, sample);
  if (!chunk) throw new Error("Unable to inspect text encoding");
  const bytes = base64ToBytes(chunk.content);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: "utf-16le", bomLength: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: "utf-16be", bomLength: 2 };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: "utf-8", bomLength: 3 };
  }
  return { encoding: "utf-8", bomLength: 0 };
}

export class LargeDocumentEngine {
  readonly path: string;
  private _fileSize: number;
  private pages = new Map<number, Page>();
  private _dirty = false;
  private readonly encoding: TextEncodingName;
  private readonly bomLength: number;
  private boundaries = new Map<number, { start: number; end: number }>();

  private constructor(
    path: string,
    fileSize: number,
    encoding: TextEncodingName,
    bomLength: number,
  ) {
    this.path = path;
    this._fileSize = fileSize;
    this.encoding = encoding;
    this.bomLength = bomLength;
  }

  static async open(path: string, fileSize: number): Promise<LargeDocumentEngine> {
    if (fileSize < 0) throw new Error("Invalid document size");
    const detected = await detectEncoding(path, fileSize);
    return new LargeDocumentEngine(path, fileSize, detected.encoding, detected.bomLength);
  }

  get fileSize(): number { return this._fileSize; }
  get dirty(): boolean { return this._dirty; }
  get encodingName(): string { return this.encoding.toUpperCase(); }
  get pageCount(): number {
    const contentBytes = Math.max(0, this.fileSize - this.bomLength);
    return Math.max(1, Math.ceil(contentBytes / LARGE_DOCUMENT_PAGE_BYTES));
  }

  private async readBytes(offset: number, length: number): Promise<Uint8Array> {
    if (length <= 0) return new Uint8Array();
    const result = await nativeFileSystem.readFileChunk(this.path, offset, length);
    if (!result) throw new Error(`Unable to read document bytes at ${offset}`);
    return base64ToBytes(result.content);
  }

  /** Find the first valid character boundary at or after a byte offset. */
  private async alignForward(offset: number): Promise<number> {
    const clamped = Math.max(this.bomLength, Math.min(offset, this.fileSize));
    if (clamped >= this.fileSize) return this.fileSize;
    if (this.encoding !== "utf-8") {
      const unitStart = clamped - this.bomLength;
      return this.bomLength + (unitStart % 2 === 0 ? unitStart : unitStart + 1);
    }
    const sample = await this.readBytes(clamped, Math.min(4, this.fileSize - clamped));
    let cursor = clamped;
    for (let i = 0; i < sample.length && isUtf8Continuation(sample[i]); i++) cursor++;
    return Math.min(cursor, this.fileSize);
  }

  private async getBoundary(index: number): Promise<{ start: number; end: number }> {
    const cached = this.boundaries.get(index);
    if (cached) return cached;
    if (index < 0 || index >= this.pageCount) throw new RangeError("Page out of range");

    const contentStart = this.bomLength;
    const startTarget = index === 0
      ? contentStart
      : contentStart + index * LARGE_DOCUMENT_PAGE_BYTES;
    const endTarget = Math.min(
      this.fileSize,
      contentStart + (index + 1) * LARGE_DOCUMENT_PAGE_BYTES,
    );

    const start = index === 0 ? contentStart : await this.alignForward(startTarget);
    const end = endTarget >= this.fileSize ? this.fileSize : await this.alignForward(endTarget);
    const boundary = { start: Math.min(start, end), end: Math.max(start, end) };
    this.boundaries.set(index, boundary);
    return boundary;
  }

  async loadPage(index: number): Promise<Page> {
    if (index < 0 || index >= this.pageCount) throw new RangeError("Page out of range");
    const cached = this.pages.get(index);
    if (cached) return cached;

    const boundary = await this.getBoundary(index);
    const bytes = await this.readBytes(boundary.start, boundary.end - boundary.start);
    const text = decode(bytes, this.encoding);
    const page: Page = {
      index,
      start: boundary.start,
      end: boundary.end,
      text,
      dirty: false,
      undo: [],
      redo: [],
    };
    this.pages.set(index, page);
    this.evict();
    return page;
  }

  async getPageText(index: number): Promise<string> {
    return (await this.loadPage(index)).text;
  }

  async updatePage(index: number, text: string): Promise<void> {
    const page = await this.loadPage(index);
    if (page.text === text) return;
    page.undo.push(page.text);
    if (page.undo.length > LARGE_DOCUMENT_MAX_UNDO) page.undo.shift();
    page.redo = [];
    page.text = text;
    page.dirty = true;
    this._dirty = true;
  }

  async undoPage(index: number): Promise<string> {
    const page = await this.loadPage(index);
    const previous = page.undo.pop();
    if (previous === undefined) return page.text;
    page.redo.push(page.text);
    page.text = previous;
    page.dirty = true;
    this._dirty = true;
    return page.text;
  }

  async redoPage(index: number): Promise<string> {
    const page = await this.loadPage(index);
    const next = page.redo.pop();
    if (next === undefined) return page.text;
    page.undo.push(page.text);
    page.text = next;
    page.dirty = true;
    this._dirty = true;
    return page.text;
  }

  canUndo(index: number): boolean { return (this.pages.get(index)?.undo.length ?? 0) > 0; }
  canRedo(index: number): boolean { return (this.pages.get(index)?.redo.length ?? 0) > 0; }

  /**
   * Atomically rebuild the file in Native without ever holding the complete
   * document in JS. Untouched pages are copied from their original byte ranges;
   * edited pages are encoded individually.
   */
  async save(onProgress?: (fraction: number) => void): Promise<void> {
    if (!this._dirty) return;
    const tempRef = await nativeFileSystem.beginLargeWrite(this.path);
    if (!tempRef) throw new Error("Native transactional large-file writer is unavailable");

    let outputOffset = 0;
    try {
      // Preserve the original BOM exactly. It is part of the file format, not
      // part of the first editable page.
      if (this.bomLength > 0) {
        const bom = await this.readBytes(0, this.bomLength);
        const ok = await nativeFileSystem.writeFileChunk(tempRef, 0, bytesToBase64(bom), true);
        if (!ok) throw new Error("Unable to write document BOM");
        outputOffset = bom.length;
      }

      for (let i = 0; i < this.pageCount; i++) {
        const page = this.pages.get(i);
        let bytes: Uint8Array;
        if (page?.dirty) {
          bytes = encode(page.text, this.encoding);
        } else {
          const boundary = await this.getBoundary(i);
          bytes = await this.readBytes(boundary.start, boundary.end - boundary.start);
        }
        const ok = await nativeFileSystem.writeFileChunk(
          tempRef,
          outputOffset,
          bytesToBase64(bytes),
          outputOffset === 0,
        );
        if (!ok) throw new Error(`Unable to write document page ${i + 1}`);
        outputOffset += bytes.length;
        onProgress?.((i + 1) / this.pageCount);
      }

      if (!(await nativeFileSystem.commitLargeWrite(this.path, tempRef))) {
        throw new Error("Unable to commit the edited document");
      }

      this._fileSize = outputOffset;
      this.pages.clear();
      this.boundaries.clear();
      this._dirty = false;
    } catch (error) {
      await nativeFileSystem.abortLargeWrite(tempRef);
      throw error;
    }
  }

  discardPageChanges(index: number): void {
    const page = this.pages.get(index);
    if (!page) return;
    page.undo = [];
    page.redo = [];
    page.dirty = false;
    this._dirty = [...this.pages.values()].some(p => p.dirty);
  }

  clearCache(): void {
    for (const [index, page] of this.pages) {
      if (!page.dirty) this.pages.delete(index);
    }
  }

  private evict(): void {
    if (this.pages.size <= LARGE_DOCUMENT_MAX_CACHED_PAGES) return;
    for (const [index, page] of this.pages) {
      if (!page.dirty) {
        this.pages.delete(index);
        if (this.pages.size <= LARGE_DOCUMENT_MAX_CACHED_PAGES) break;
      }
    }
  }
}
