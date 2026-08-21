// FileForge Pro — Persistence layer (IndexedDB + localStorage)
"use client";
import { logger } from "./logger";

const DB_NAME = "fileforge-db";
const DB_VERSION = 2;
const STORE_FILES = "files";
const STORE_PREFS = "prefs";
const STORE_USER_FILES = "userFiles";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          db.createObjectStore(STORE_FILES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_PREFS)) {
          db.createObjectStore(STORE_PREFS);
        }
        if (!db.objectStoreNames.contains(STORE_USER_FILES)) {
          db.createObjectStore(STORE_USER_FILES, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

// ============ File content persistence (for uploaded files) ============
export async function saveFileContent(id: string, content: string): Promise<void> {
  const db = await openDB();
  if (!db) {
    try { localStorage.setItem(`ff-content-${id}`, content); } catch (e) { logger.warn("persistence", `Failed to save content for ${id} to localStorage`, e); }
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_FILES, "readwrite");
    tx.objectStore(STORE_FILES).put({ id, content });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getFileContent(id: string): Promise<string | null> {
  const db = await openDB();
  if (!db) {
    try { return localStorage.getItem(`ff-content-${id}`); } catch { return null; }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_FILES, "readonly");
    const req = tx.objectStore(STORE_FILES).get(id);
    req.onsuccess = () => resolve(req.result?.content ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function deleteFileContent(id: string): Promise<void> {
  const db = await openDB();
  if (!db) {
    try { localStorage.removeItem(`ff-content-${id}`); } catch (e) { logger.warn("persistence", `Failed to remove content for ${id} from localStorage`, e); }
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_FILES, "readwrite");
    tx.objectStore(STORE_FILES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ============ Preferences persistence ============
export async function setPref(key: string, value: any): Promise<void> {
  const db = await openDB();
  if (!db) {
    try { localStorage.setItem(`ff-pref-${key}`, JSON.stringify(value)); } catch (e) { logger.warn("persistence", `Failed to save pref ${key} to localStorage`, e); }
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PREFS, "readwrite");
    tx.objectStore(STORE_PREFS).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

// ============ Uploaded/edited user file persistence ============
// Previously the app only wrote metadata to localStorage (never the file
// content, and it was never read back on load), so uploads and edits
// appeared to "save" but vanished on refresh — the README's "real file
// upload" claim didn't hold. This stores full nodes (including content) in
// IndexedDB and rehydrates them on startup.
export interface PersistedUserFile {
  id: string;
  node: unknown; // FileNode, kept loosely typed here to avoid a circular import with filesystem.ts
}

export async function saveUserFile(id: string, node: unknown): Promise<void> {
  const db = await openDB();
  if (!db) {
    logger.warn("persistence", `IndexedDB unavailable — "${id}" will not survive a reload`);
    return;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_USER_FILES, "readwrite");
    tx.objectStore(STORE_USER_FILES).put({ id, node });
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      logger.error("persistence", `Failed to persist user file ${id}`, tx.error);
      resolve();
    };
  });
}

export async function deleteUserFile(id: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_USER_FILES, "readwrite");
    tx.objectStore(STORE_USER_FILES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function getAllUserFiles(): Promise<PersistedUserFile[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_USER_FILES, "readonly");
    const req = tx.objectStore(STORE_USER_FILES).getAll();
    req.onsuccess = () => resolve((req.result as PersistedUserFile[]) ?? []);
    req.onerror = () => {
      logger.error("persistence", "Failed to load persisted user files", req.error);
      resolve([]);
    };
  });
}

export async function getPref<T>(key: string, defaultValue: T): Promise<T> {
  const db = await openDB();
  if (!db) {
    try {
      const v = localStorage.getItem(`ff-pref-${key}`);
      return v ? JSON.parse(v) : defaultValue;
    } catch { return defaultValue; }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PREFS, "readonly");
    const req = tx.objectStore(STORE_PREFS).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? defaultValue);
    req.onerror = () => resolve(defaultValue);
  });
}
