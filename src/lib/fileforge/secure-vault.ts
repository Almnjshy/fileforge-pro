// FileForge Pro — Secure Vault with AES-256-GCM encryption
// Uses Web Crypto API for real encryption
"use client";

const VAULT_KEY = "fileforge-vault";
const VAULT_PIN_KEY = "fileforge-vault-pin-hash";
const VAULT_SALT_KEY = "fileforge-vault-salt";
const VAULT_ATTEMPTS_KEY = "fileforge-vault-attempts";
const VAULT_LOCK_UNTIL_KEY = "fileforge-vault-lock-until";

// Brute-force protection: after MAX_ATTEMPTS wrong PINs, lock out for an
// exponentially increasing cooldown.
const MAX_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30_000; // 30s, then 1m, 2m, 4m...

export interface VaultEntry {
  id: string;
  name: string;
  kind: string;
  size: number;
  encryptedData: string; // base64
  iv: string; // base64
  modified: number;
  sourceParent?: string;
}

// Derive a key from PIN using PBKDF2
async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class SecureVault {
  static isPinSet(): boolean {
    return !!localStorage.getItem(VAULT_PIN_KEY);
  }

  static async setPin(pin: string): Promise<void> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(pin + Array.from(salt).join("")));
    localStorage.setItem(VAULT_PIN_KEY, bufToBase64(hash));
    localStorage.setItem(VAULT_SALT_KEY, JSON.stringify(Array.from(salt)));
  }

  // Returns remaining lockout time in ms, or 0 if not locked.
  static getLockoutRemainingMs(): number {
    const until = Number(localStorage.getItem(VAULT_LOCK_UNTIL_KEY) ?? "0");
    const remaining = until - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  static getFailedAttempts(): number {
    return Number(localStorage.getItem(VAULT_ATTEMPTS_KEY) ?? "0");
  }

  private static registerFailedAttempt(): void {
    const attempts = this.getFailedAttempts() + 1;
    localStorage.setItem(VAULT_ATTEMPTS_KEY, String(attempts));
    if (attempts >= MAX_ATTEMPTS) {
      const lockoutTier = Math.min(attempts - MAX_ATTEMPTS, 5); // cap growth
      const lockoutMs = BASE_LOCKOUT_MS * Math.pow(2, lockoutTier);
      localStorage.setItem(VAULT_LOCK_UNTIL_KEY, String(Date.now() + lockoutMs));
    }
  }

  private static resetAttempts(): void {
    localStorage.removeItem(VAULT_ATTEMPTS_KEY);
    localStorage.removeItem(VAULT_LOCK_UNTIL_KEY);
  }

  static async verifyPin(pin: string): Promise<boolean> {
    const remaining = this.getLockoutRemainingMs();
    if (remaining > 0) {
      throw new Error(`VAULT_LOCKED:${remaining}`);
    }
    const storedHash = localStorage.getItem(VAULT_PIN_KEY);
    const saltJson = localStorage.getItem(VAULT_SALT_KEY);
    if (!storedHash || !saltJson) return false;
    const salt = new Uint8Array(JSON.parse(saltJson));
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(pin + Array.from(salt).join("")));
    const ok = bufToBase64(hash) === storedHash;
    if (ok) {
      this.resetAttempts();
    } else {
      this.registerFailedAttempt();
    }
    return ok;
  }

  static async encrypt(data: string, pin: string): Promise<{ encryptedData: string; iv: string }> {
    const saltJson = localStorage.getItem(VAULT_SALT_KEY);
    const salt = saltJson ? new Uint8Array(JSON.parse(saltJson)) : crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(pin, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(data)
    );
    return {
      encryptedData: bufToBase64(encrypted),
      iv: bufToBase64(iv.buffer),
    };
  }

  static async decrypt(encryptedData: string, iv: string, pin: string): Promise<string> {
    const saltJson = localStorage.getItem(VAULT_SALT_KEY);
    const salt = saltJson ? new Uint8Array(JSON.parse(saltJson)) : new Uint8Array(16);
    const key = await deriveKey(pin, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(base64ToBuf(iv)) },
      key,
      base64ToBuf(encryptedData)
    );
    return new TextDecoder().decode(decrypted);
  }

  static async decryptEntry(entry: VaultEntry, pin: string): Promise<any> {
    const raw = await this.decrypt(entry.encryptedData, entry.iv, pin);
    return JSON.parse(raw);
  }

  static async addEntry(entry: Omit<VaultEntry, "id" | "modified">): Promise<string> {
    const id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newEntry: VaultEntry = { ...entry, id, modified: Date.now() };
    const entries = this.getEntries();
    entries.push(newEntry);
    localStorage.setItem(VAULT_KEY, JSON.stringify(entries));
    return id;
  }

  static getEntries(): VaultEntry[] {
    try {
      return JSON.parse(localStorage.getItem(VAULT_KEY) ?? "[]");
    } catch {
      return [];
    }
  }

  static removeEntry(id: string): void {
    const entries = this.getEntries().filter(e => e.id !== id);
    localStorage.setItem(VAULT_KEY, JSON.stringify(entries));
  }
}
