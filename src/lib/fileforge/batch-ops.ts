// FileForge Pro — Batch Operations with Progress + Cancel
"use client";

import { logger } from "./logger";

export interface BatchProgress {
  total: number;
  completed: number;
  current: string;
  cancelled: boolean;
}

export type ProgressCallback = (progress: BatchProgress) => void;

// Simulate async batch operation with progress
export async function runBatchOperation<T>(
  items: T[],
  operation: (item: T, index: number) => Promise<void>,
  onProgress?: ProgressCallback,
  shouldCancel?: () => boolean
): Promise<{ completed: number; cancelled: boolean }> {
  let completed = 0;
  let cancelled = false;

  const YIELD_EVERY = 50; // yield to event loop every 50 items instead of every item
  for (let i = 0; i < items.length; i++) {
    if (shouldCancel?.()) {
      cancelled = true;
      break;
    }
    const item = items[i];
    onProgress?.({
      total: items.length,
      completed,
      current: String(item),
      cancelled: false,
    });
    try {
      await operation(item, i);
      completed++;
    } catch (e) {
      logger.error("batch-ops", "Batch operation item failed", e);
    }
    // Yield periodically so the progress UI can repaint without the ~4ms
    // setTimeout clamp per item (which made 10k-item batches take 40s+).
    if (i % YIELD_EVERY === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  onProgress?.({
    total: items.length,
    completed,
    current: "",
    cancelled,
  });

  return { completed, cancelled };
}
