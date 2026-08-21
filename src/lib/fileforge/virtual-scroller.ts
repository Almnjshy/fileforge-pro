// FileForge Pro — Lightweight Virtual Scroller
//
// Renders only the items visible in the viewport (+ small overscan).
// Handles 10,000+ items without DOM bloat or jank.
//
// Two modes:
//   - List mode: fixed-height rows (for list, compact-list, details, content)
//   - Grid mode: fixed-height rows of N columns (for all grid views)
//
// No external dependencies. Uses a scroll listener + math.

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

interface VirtualListOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
}

interface VirtualGridOptions {
  itemCount: number;
  rowHeight: number;
  columns: number;
  overscan?: number;
}

interface VirtualResult {
  startIndex: number;
  endIndex: number;
  visibleRange: number[];
  totalHeight: number;
  offsetY: number;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const DEFAULT_OVERSCAN = 5;

/**
 * Hook for virtualizing a 1D list of fixed-height items.
 * Returns the indices to render + total height for the spacer div.
 */
export function useVirtualList({
  itemCount,
  itemHeight,
  overscan = DEFAULT_OVERSCAN,
}: VirtualListOptions): VirtualResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { startIndex, endIndex, totalHeight, offsetY } = useMemo(() => {
    if (itemCount === 0) {
      return { startIndex: 0, endIndex: 0, totalHeight: 0, offsetY: 0 };
    }
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
    const endIndex = Math.min(itemCount, startIndex + visibleCount);
    const totalHeight = itemCount * itemHeight;
    const offsetY = startIndex * itemHeight;
    return { startIndex, endIndex, totalHeight, offsetY };
  }, [itemCount, itemHeight, scrollTop, viewportHeight, overscan]);

  const visibleRange = useMemo(() => {
    const arr: number[] = [];
    for (let i = startIndex; i < endIndex; i++) arr.push(i);
    return arr;
  }, [startIndex, endIndex]);

  return { startIndex, endIndex, visibleRange, totalHeight, offsetY, onScroll, containerRef };
}

/**
 * Hook for virtualizing a 2D grid of fixed-height rows.
 * Each row contains `columns` items.
 */
export function useVirtualGrid({
  itemCount,
  rowHeight,
  columns,
  overscan = DEFAULT_OVERSCAN,
}: VirtualGridOptions): VirtualResult & { columns: number } {
  const rowCount = Math.ceil(itemCount / columns);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const { startIndex, endIndex, totalHeight, offsetY } = useMemo(() => {
    if (rowCount === 0) {
      return { startIndex: 0, endIndex: 0, totalHeight: 0, offsetY: 0 };
    }
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleRows = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const endRow = Math.min(rowCount, startRow + visibleRows);
    return {
      startIndex: startRow * columns,
      endIndex: Math.min(itemCount, endRow * columns),
      totalHeight: rowCount * rowHeight,
      offsetY: startRow * rowHeight,
    };
  }, [itemCount, rowHeight, columns, rowCount, scrollTop, viewportHeight, overscan]);

  const visibleRange = useMemo(() => {
    const arr: number[] = [];
    for (let i = startIndex; i < endIndex; i++) arr.push(i);
    return arr;
  }, [startIndex, endIndex]);

  return { startIndex, endIndex, visibleRange, totalHeight, offsetY, onScroll, containerRef, columns };
}

/**
 * Calculate the number of grid columns based on container width and min card width.
 */
export function useGridColumns(minCardWidth: number): { columns: number; containerRef: React.RefObject<HTMLDivElement | null> } {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const calc = () => {
      const width = el.clientWidth;
      setColumns(Math.max(1, Math.floor(width / minCardWidth)));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minCardWidth]);

  return { columns, containerRef };
}
