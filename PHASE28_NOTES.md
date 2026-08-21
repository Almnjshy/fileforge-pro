# FileForge Pro — Phase 28

## Native PDF Range Pipeline

The Android PDF viewer no longer loads a native PDF as one giant Base64 payload.

### Flow

`Local/SAF reference -> Native storageReadRange -> bounded Base64 chunk -> PDFDataRangeTransport -> pdf.js`

Each bridge request is capped at 1 MiB. pdf.js decides which byte ranges are needed.

### SAF

`UnifiedStorageService.readChunk()` now prefers a seekable `ParcelFileDescriptor` for SAF providers and falls back to a sequential stream only for providers that do not support seeking.

### Web

Browser/non-native preview keeps the existing in-memory data path because it has no native storage boundary.

### Safety

No native PDF is passed through `readFileBase64()` in the PDF viewer. The Base64 payload exists only for individual bounded bridge chunks.
