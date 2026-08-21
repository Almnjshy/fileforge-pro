# Phase 27 — Legacy Path Eradication

- Android archive creation no longer falls back to JSZip. All native archive creation is routed through the Native ArchiveEngine and Native Job Protocol.
- This removes a major whole-file Base64/Blob fallback from the Android path.
- Browser-only builds retain JSZip as the Web-storage fallback.
- Native failure is surfaced explicitly instead of silently switching to a memory-heavy implementation.

## Intentionally retained
- PDF.js currently consumes a Uint8Array, so the Android PDF path still has a Base64 bridge for PDFs. Replacing this should use PDF range/stream transport in a dedicated viewer phase, not another whole-file workaround.
- Thumbnail Base64 is retained because thumbnails are bounded preview payloads.
- Secure-vault Base64 is cryptographic serialization, not file-content transport.
