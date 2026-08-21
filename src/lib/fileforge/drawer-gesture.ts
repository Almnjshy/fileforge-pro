// FileForge Pro — Edge-swipe gesture hook for the navigation drawer.
//
// Problem being solved: the drawer previously only opened via a toolbar
// button — there was NO edge-swipe gesture at all. On Android 15, users
// expect to be able to swipe in from the screen edge (right edge in RTL,
// left edge in LTR) to open the drawer, and swipe out to close it.
//
// This hook attaches passive touch listeners to `window`:
//   - A `touchstart` near the opening edge arms the gesture.
//   - `touchmove` tracks the finger; if it crosses a threshold the drawer
//     opens (or closes if started inside the drawer).
//   - `touchend` commits or cancels.
//
// It deliberately uses `passive: true` so it NEVER blocks normal scrolling
// inside the page content — the gesture only fires when the touch starts
// within EDGE_WIDTH px of the screen edge.

"use client";

import { useEffect, useRef } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";

const EDGE_WIDTH = 24; // px from the screen edge that arms the open gesture
const OPEN_THRESHOLD = 60; // px the finger must travel to commit open
const CLOSE_THRESHOLD = 80; // px the finger must travel toward the edge to commit close

export function useDrawerGesture() {
  // We read isSidebarOpen via a selector so the effect doesn't re-bind on
  // every store change.
  const sidebarOpen = useFileForge(s => s.sidebarOpen);
  const sidebarPinned = useFileForge(s => s.sidebarPinned);
  const toggleSidebar = useFileForge(s => s.toggleSidebar);
  const lang = useI18n(s => s.lang);
  // RTL: drawer slides in from the RIGHT in Arabic, from the LEFT in English.
  const isRTL = lang === "ar";

  const sidebarOpenRef = useRef(sidebarOpen);
  // Update the ref inside an effect (NOT during render) so we don't violate
  // the react-hooks/refs rule.
  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    if (sidebarPinned) return; // no gesture needed when pinned (desktop)

    let armed: "open" | "close" | null = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let active = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Ignore touches in the top/bottom 10% (status/nav bars + toolbars)
      // so we don't compete with system gestures.
      if (t.clientY < h * 0.10 || t.clientY > h * 0.90) return;

      // Open gesture: start within EDGE_WIDTH of the opening edge
      const onOpeningEdge =
        isRTL ? t.clientX >= w - EDGE_WIDTH : t.clientX <= EDGE_WIDTH;

      // Close gesture: start anywhere inside the drawer (when it's open)
      const drawerEl = document.getElementById("ff-drawer");
      const insideDrawer = !!(drawerEl && drawerEl.contains(e.target as Node));

      if (sidebarOpenRef.current && insideDrawer) {
        armed = "close";
        startX = t.clientX;
        startY = t.clientY;
        lastX = t.clientX;
        active = true;
      } else if (!sidebarOpenRef.current && onOpeningEdge) {
        armed = "open";
        startX = t.clientX;
        startY = t.clientY;
        lastX = t.clientX;
        active = true;
      } else {
        armed = null;
        active = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || !armed) return;
      const t = e.touches[0];
      lastX = t.clientX;

      // Detect vertical vs horizontal intent — if the finger is mostly moving
      // vertically, cancel the gesture so we don't hijack scrolling.
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (dy > dx * 1.5 && dx < 20) {
        armed = null;
        active = false;
        return;
      }
      // Once we're clearly horizontal, preventDefault to stop page scroll.
      if (dx > 10 && dx > dy) {
        if (e.cancelable) e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!active || !armed) {
        armed = null;
        active = false;
        return;
      }
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;

      if (armed === "open") {
        // RTL drawer is on the right: open by swiping left.
        // LTR drawer is on the left: open by swiping right.
        const openingDirectionOk = isRTL ? dx < -OPEN_THRESHOLD : dx > OPEN_THRESHOLD;
        if (openingDirectionOk && !sidebarOpenRef.current) {
          toggleSidebar();
        }
      } else if (armed === "close") {
        // RTL drawer closes to the right; LTR drawer closes to the left.
        const closingDirectionOk = isRTL ? dx > CLOSE_THRESHOLD : dx < -CLOSE_THRESHOLD;
        if (closingDirectionOk && sidebarOpenRef.current) {
          toggleSidebar();
        }
      }
      armed = null;
      active = false;
    };

    // passive: false on touchmove so we can preventDefault when horizontal
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isRTL, sidebarPinned, toggleSidebar]);
}
