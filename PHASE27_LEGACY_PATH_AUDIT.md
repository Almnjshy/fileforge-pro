# Phase 27 — Legacy Path Audit

## Result
The Android compression path no longer falls back to JSZip or whole-file Base64/Blob buffering. Native Android archive creation now fails explicitly if the Native ArchiveEngine is unavailable.

## Remaining legacy transport paths
- PDF.js Android loading still uses Base64 because the current viewer consumes a complete Uint8Array. Replace this with a range/stream transport before declaring large-PDF memory behavior production-ready.
- Thumbnail responses may use Base64 because they are bounded preview payloads, not full file transport.
- Secure-vault Base64 is serialization of encrypted data, not a filesystem transport path.
- Text chunk writes use Base64 at the bridge boundary; the chunks are bounded and are not whole-file reads.

## Acceptance rule
No Android media/archive/file-operation path may silently fall back from Native streaming to whole-file Base64. Any unavailable Native capability must fail explicitly or use a deliberately designed bounded fallback.
