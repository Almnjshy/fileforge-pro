// FileForge Pro — SAF (Storage Access Framework) Bridge
// Provides access to files via content:// URIs as a fallback to direct File API.

"use client";

import { isNative, getNativePlugin } from "./native-bridge";

export interface SafEntry {
  uri: string;
  name: string;
  isDirectory: boolean;
  size: number;
  lastModified: number;
  mimeType: string;
}

export interface TreeUriEntry {
  pathPrefix: string;
  uri: string;
}

class SafBridge {
  async isAvailable(): Promise<boolean> {
    if (!isNative()) return false;
    return !!getNativePlugin()?.safListDirectory;
  }

  async listDirectory(uri: string): Promise<SafEntry[]> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safListDirectory) return [];
      const result = await plugin.safListDirectory({ uri });
      return result?.entries ?? [];
    } catch (e) {
      console.warn("SAF listDirectory failed:", e);
      return [];
    }
  }

  async readText(uri: string, maxBytes = 10_000_000): Promise<string | null> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safReadText) return null;
      const result = await plugin.safReadText({ uri, maxBytes });
      return result?.content ?? null;
    } catch (e) {
      console.warn("SAF readText failed:", e);
      return null;
    }
  }

  async readBytes(uri: string, offset = 0, length = 4096): Promise<Uint8Array | null> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safReadBytes) return null;
      const result = await plugin.safReadBytes({ uri, offset, length });
      if (!result?.content) return null;
      const binary = atob(result.content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    } catch (e) {
      console.warn("SAF readBytes failed:", e);
      return null;
    }
  }

  async writeText(uri: string, content: string): Promise<boolean> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safWriteText) return false;
      const result = await plugin.safWriteText({ uri, content });
      return !!result?.success;
    } catch (e) {
      console.warn("SAF writeText failed:", e);
      return false;
    }
  }

  async createDirectory(parentUri: string, name: string): Promise<string | null> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safCreateDirectory) return null;
      const result = await plugin.safCreateDirectory({ parentUri, name });
      return result?.uri ?? null;
    } catch (e) {
      console.warn("SAF createDirectory failed:", e);
      return null;
    }
  }

  async createFile(parentUri: string, name: string, mimeType = "text/plain"): Promise<string | null> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safCreateFile) return null;
      const result = await plugin.safCreateFile({ parentUri, name, mimeType });
      return result?.uri ?? null;
    } catch (e) {
      console.warn("SAF createFile failed:", e);
      return null;
    }
  }

  async delete(uri: string): Promise<boolean> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safDelete) return false;
      const result = await plugin.safDelete({ uri });
      return !!result?.success;
    } catch (e) {
      console.warn("SAF delete failed:", e);
      return false;
    }
  }

  async rename(uri: string, newName: string): Promise<boolean> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safRename) return false;
      const result = await plugin.safRename({ uri, newName });
      return !!result?.success;
    } catch (e) {
      console.warn("SAF rename failed:", e);
      return false;
    }
  }

  async getMetadata(uri: string): Promise<SafEntry | null> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safGetMetadata) return null;
      return await plugin.safGetMetadata({ uri });
    } catch (e) {
      console.warn("SAF getMetadata failed:", e);
      return null;
    }
  }

  async saveTreeUri(uri: string, pathPrefix: string): Promise<boolean> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safSaveTreeUri) return false;
      const result = await plugin.safSaveTreeUri({ uri, pathPrefix });
      return !!result?.success;
    } catch (e) {
      console.warn("SAF saveTreeUri failed:", e);
      return false;
    }
  }

  async getTreeUris(): Promise<TreeUriEntry[]> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safGetTreeUris) return [];
      const result = await plugin.safGetTreeUris();
      return result?.treeUris ?? [];
    } catch (e) {
      console.warn("SAF getTreeUris failed:", e);
      return [];
    }
  }

  async removeTreeUri(pathPrefix: string): Promise<boolean> {
    try {
      const plugin = getNativePlugin();
      if (!plugin?.safRemoveTreeUri) return false;
      const result = await plugin.safRemoveTreeUri({ pathPrefix });
      return !!result?.success;
    } catch (e) {
      console.warn("SAF removeTreeUri failed:", e);
      return false;
    }
  }
}

export const safBridge = new SafBridge();
