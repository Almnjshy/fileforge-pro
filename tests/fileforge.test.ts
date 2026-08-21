// FileForge Pro — Unit Tests for Core Modules
// Run with: bun test or npm test

import { describe, it, expect } from "bun:test";
import {
  formatBytes,
  formatDate,
  formatDateShort,
  detectKind,
  getExt,
} from "../src/lib/fileforge/filesystem";
import { SecureVault } from "../src/lib/fileforge/secure-vault";
import { runBatchOperation } from "../src/lib/fileforge/batch-ops";

// ============ File System Helpers ============
describe("File System Helpers", () => {
  describe("formatBytes", () => {
    it("formats 0 bytes", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("formats bytes", () => {
      expect(formatBytes(500)).toBe("500 B");
    });

    it("formats kilobytes", () => {
      expect(formatBytes(1024)).toBe("1 KB");
    });

    it("formats megabytes", () => {
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
    });

    it("formats gigabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
    });

    it("formats terabytes", () => {
      expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1 TB");
    });

    it("handles decimal values", () => {
      expect(formatBytes(1536)).toBe("1.5 KB");
    });
  });

  describe("formatDate", () => {
    it("formats recent time as minutes ago", () => {
      const recent = Date.now() - 5 * 60 * 1000; // 5 min ago
      const result = formatDate(recent);
      expect(result).toContain("min");
    });

    it("formats hours ago", () => {
      const recent = Date.now() - 3 * 60 * 60 * 1000; // 3 hours ago
      const result = formatDate(recent);
      expect(result).toContain("hour");
    });

    it("formats yesterday", () => {
      const recent = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      const result = formatDate(recent);
      expect(result).toBe("Yesterday");
    });
  });

  describe("formatDateShort", () => {
    it("formats today", () => {
      const now = Date.now();
      expect(formatDateShort(now)).toBe("Today");
    });

    it("formats yesterday", () => {
      const recent = Date.now() - 25 * 60 * 60 * 1000;
      expect(formatDateShort(recent)).toBe("Yesterday");
    });
  });

  describe("detectKind", () => {
    it("detects images", () => {
      expect(detectKind("photo.jpg")).toBe("image");
      expect(detectKind("photo.png")).toBe("image");
      expect(detectKind("photo.gif")).toBe("image");
    });

    it("detects videos", () => {
      expect(detectKind("movie.mp4")).toBe("video");
      expect(detectKind("movie.mkv")).toBe("video");
    });

    it("detects audio", () => {
      expect(detectKind("song.mp3")).toBe("audio");
      expect(detectKind("song.flac")).toBe("audio");
    });

    it("detects PDF", () => {
      expect(detectKind("doc.pdf")).toBe("pdf");
    });

    it("detects code", () => {
      expect(detectKind("app.js")).toBe("code");
      expect(detectKind("app.ts")).toBe("code");
      expect(detectKind("app.py")).toBe("code");
    });

    it("detects archives", () => {
      expect(detectKind("backup.zip")).toBe("archive");
      expect(detectKind("backup.rar")).toBe("archive");
    });

    it("detects APK", () => {
      expect(detectKind("app.apk")).toBe("apk");
    });

    it("detects unknown", () => {
      expect(detectKind("file.xyz")).toBe("unknown");
    });
  });

  describe("getExt", () => {
    it("extracts extension", () => {
      expect(getExt("photo.jpg")).toBe("jpg");
      expect(getExt("archive.tar.gz")).toBe("gz");
    });

    it("returns empty for no extension", () => {
      expect(getExt("README")).toBe("");
    });
  });
});

// ============ Secure Vault ============
describe("SecureVault", () => {
  it("starts without PIN", () => {
    localStorage.clear();
    expect(SecureVault.isPinSet()).toBe(false);
  });

  it("sets PIN", async () => {
    localStorage.clear();
    await SecureVault.setPin("1234");
    expect(SecureVault.isPinSet()).toBe(true);
  });

  it("verifies correct PIN", async () => {
    localStorage.clear();
    await SecureVault.setPin("1234");
    const valid = await SecureVault.verifyPin("1234");
    expect(valid).toBe(true);
  });

  it("rejects wrong PIN", async () => {
    localStorage.clear();
    await SecureVault.setPin("1234");
    const valid = await SecureVault.verifyPin("5678");
    expect(valid).toBe(false);
  });

  it("encrypts and decrypts", async () => {
    localStorage.clear();
    await SecureVault.setPin("1234");
    const data = "My secret password";
    const encrypted = await SecureVault.encrypt(data, "1234");
    expect(encrypted.encryptedData).not.toBe(data);
    const decrypted = await SecureVault.decrypt(encrypted.encryptedData, encrypted.iv, "1234");
    expect(decrypted).toBe(data);
  });

  it("adds and retrieves entries", async () => {
    localStorage.clear();
    await SecureVault.setPin("1234");
    const data = "Test secret";
    const encrypted = await SecureVault.encrypt(data, "1234");
    const id = await SecureVault.addEntry({
      name: "Test Entry",
      kind: "text",
      size: data.length,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
    });
    expect(id).toBeTruthy();
    const entries = SecureVault.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("Test Entry");
  });

  it("removes entries", async () => {
    localStorage.clear();
    await SecureVault.setPin("1234");
    const data = "Test";
    const encrypted = await SecureVault.encrypt(data, "1234");
    const id = await SecureVault.addEntry({
      name: "Test",
      kind: "text",
      size: data.length,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,
    });
    SecureVault.removeEntry(id);
    expect(SecureVault.getEntries().length).toBe(0);
  });
});

// ============ Batch Operations ============
describe("Batch Operations", () => {
  it("runs batch operation", async () => {
    const items = [1, 2, 3, 4, 5];
    const processed: number[] = [];
    const result = await runBatchOperation(
      items,
      async (item) => { processed.push(item); },
      () => {}
    );
    expect(result.completed).toBe(5);
    expect(result.cancelled).toBe(false);
    expect(processed).toEqual([1, 2, 3, 4, 5]);
  });

  it("supports cancellation", async () => {
    const items = [1, 2, 3, 4, 5];
    let cancelled = false;
    const result = await runBatchOperation(
      items,
      async (item) => {
        if (item === 3) cancelled = true;
      },
      () => {},
      () => cancelled
    );
    expect(result.cancelled).toBe(true);
    expect(result.completed).toBeLessThan(5);
  });

  it("handles errors gracefully", async () => {
    const items = [1, 2, 3];
    const result = await runBatchOperation(
      items,
      async (item) => {
        if (item === 2) throw new Error("Test error");
      },
      () => {}
    );
    expect(result.completed).toBe(2); // 1 and 3 succeed
  });
});
