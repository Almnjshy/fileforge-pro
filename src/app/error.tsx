"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[FileForge:route-error]", error);
  }, [error]);

  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
        background: "#0f0f14",
        color: "#f4f4f5",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>حدث خطأ غير متوقع</h1>
      <p style={{ opacity: 0.7, fontSize: "0.875rem", maxWidth: "28rem" }}>
        نأسف على الإزعاج. يمكنك محاولة إعادة تحميل هذا الجزء من التطبيق.
      </p>
      <button
        onClick={reset}
        style={{
          background: "#f97316",
          color: "#0f0f14",
          border: "none",
          borderRadius: "0.5rem",
          padding: "0.5rem 1.25rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
