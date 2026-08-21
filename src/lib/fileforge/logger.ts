// FileForge Pro — Minimal centralized logger
// Not a full logging framework (Winston/Pino don't belong in a client bundle) —
// just a single choke point so errors that used to vanish into empty catch{}
// blocks are at least visible in devtools/CI logs, with room to wire up a
// remote sink later if needed.
"use client";

type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, scope: string, message: string, err?: unknown) {
  if (typeof console === "undefined") return;
  const prefix = `[FileForge:${scope}]`;
  const fn = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
  if (err !== undefined) {
    fn(prefix, message, err);
  } else {
    fn(prefix, message);
  }
}

export const logger = {
  debug: (scope: string, message: string, err?: unknown) => emit("debug", scope, message, err),
  info: (scope: string, message: string, err?: unknown) => emit("info", scope, message, err),
  warn: (scope: string, message: string, err?: unknown) => emit("warn", scope, message, err),
  error: (scope: string, message: string, err?: unknown) => emit("error", scope, message, err),
};
