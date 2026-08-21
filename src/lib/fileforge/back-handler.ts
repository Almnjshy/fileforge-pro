"use client";

import { App } from "@capacitor/app";
import { isNative } from "./native-bridge";
import { useEffect, useCallback, useRef } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { logger } from "./logger";

// FileForge Pro — Centralized Back Handler
// Coordinates Android back button with app navigation state.
//
// Priority:
// Dialog > Context Menu > Selection > Sidebar > Floating Window
// > Folder Navigation > Exit

// Global overlay counter.
// Components increment this on mount and decrement on unmount.
// This avoids fragile DOM scraping based on Tailwind class names.
let overlayCount = 0;

const overlayListeners = new Set<() => void>();

export function registerOverlay(): () => void {
  overlayCount += 1;

  overlayListeners.forEach((listener) => {
    listener();
  });

  return () => {
    overlayCount = Math.max(0, overlayCount - 1);

    overlayListeners.forEach((listener) => {
      listener();
    });
  };
}

export function getOverlayCount(): number {
  return overlayCount;
}

export function subscribeOverlayCount(
  listener: () => void,
): () => void {
  overlayListeners.add(listener);

  return () => {
    overlayListeners.delete(listener);
  };
}

// Dispatch an application-level event that the currently active
// overlay can use to close itself.
function closeTopOverlay(): boolean {
  if (overlayCount > 0) {
    window.dispatchEvent(
      new CustomEvent("fileforge-close-overlay"),
    );

    return true;
  }

  return false;
}

export function useBackHandler() {
  // Subscribe only to the state required by the back-button logic.
  // This keeps unrelated store changes from causing unnecessary work.
  const currentPath = useFileForge((s) => s.currentPath);
  const historyIndex = useFileForge((s) => s.historyIndex);
  const historyLen = useFileForge((s) => s.history.length);

  const activeWindowId = useFileForge(
    (s) => s.activeWindowId,
  );

  const windowsLen = useFileForge(
    (s) => s.windows.length,
  );

  const selectedIdsSize = useFileForge(
    (s) => s.selectedIds.size,
  );

  const sidebarOpen = useFileForge(
    (s) => s.sidebarOpen,
  );

  const sidebarPinned = useFileForge(
    (s) => s.sidebarPinned,
  );

  // Actions.
  const clearSelection = useFileForge(
    (s) => s.clearSelection,
  );

  const toggleSidebar = useFileForge(
    (s) => s.toggleSidebar,
  );

  const closeWindow = useFileForge(
    (s) => s.closeWindow,
  );

  const goBack = useFileForge(
    (s) => s.goBack,
  );

  // Keep the latest store state in a ref.
  //
  // This allows the Android back callback to remain stable while
  // always operating on the newest application state.
  const stateRef = useRef({
    currentPath,
    historyIndex,
    historyLen,
    activeWindowId,
    windowsLen,
    selectedIdsSize,
    sidebarOpen,
    sidebarPinned,
    clearSelection,
    toggleSidebar,
    closeWindow,
    goBack,
  });

  useEffect(() => {
    stateRef.current = {
      currentPath,
      historyIndex,
      historyLen,
      activeWindowId,
      windowsLen,
      selectedIdsSize,
      sidebarOpen,
      sidebarPinned,
      clearSelection,
      toggleSidebar,
      closeWindow,
      goBack,
    };
  }, [
    currentPath,
    historyIndex,
    historyLen,
    activeWindowId,
    windowsLen,
    selectedIdsSize,
    sidebarOpen,
    sidebarPinned,
    clearSelection,
    toggleSidebar,
    closeWindow,
    goBack,
  ]);

  const handleBack = useCallback((): boolean => {
    const state = stateRef.current;

    logger.debug(
      "back-handler",
      `back: path=${state.currentPath} ` +
        `hist=${state.historyIndex}/${state.historyLen - 1} ` +
        `win=${state.activeWindowId} ` +
        `sel=${state.selectedIdsSize} ` +
        `sidebar=${state.sidebarOpen} ` +
        `overlays=${overlayCount}`,
    );

    // Priority 1:
    // Close the highest-level application overlay.
    if (closeTopOverlay()) {
      return true;
    }

    // Priority 2:
    // Clear current file selection.
    if (state.selectedIdsSize > 0) {
      state.clearSelection();
      return true;
    }

    // Priority 3:
    // Close the mobile drawer/sidebar when it is not pinned.
    if (
      state.sidebarOpen &&
      !state.sidebarPinned
    ) {
      state.toggleSidebar();
      return true;
    }

    // Priority 4:
    // Close the currently active floating window.
    if (
      state.windowsLen > 0 &&
      state.activeWindowId
    ) {
      state.closeWindow(state.activeWindowId);
      return true;
    }

    // Priority 5:
    // Navigate backward through folder history.
    if (state.historyIndex > 0) {
      state.goBack();
      return true;
    }

    // Priority 6:
    // Nothing inside FileForge can consume the back action.
    // Returning false allows the native Android layer to exit.
    return false;
  }, []);

  // Install exactly one application-level back callback.
  useEffect(() => {
    const backButtonHandler = () => {
      const handled = handleBack();

      if (!handled) {
        try {
          if (isNative()) {
            void App.exitApp();
          }
        } catch (error) {
          logger.error(
            "back-handler",
            "Failed to exit app",
            error,
          );
        }
      }
    };

    (
      window as typeof window & {
        __fileforgeBackButton?: () => void;
      }
    ).__fileforgeBackButton = backButtonHandler;

    return () => {
      delete (
        window as typeof window & {
          __fileforgeBackButton?: () => void;
        }
      ).__fileforgeBackButton;
    };
  }, [handleBack]);

  return {
    handleBack,
  };
}