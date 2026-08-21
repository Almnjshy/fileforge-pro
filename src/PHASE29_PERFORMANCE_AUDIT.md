# Phase 29 — Memory & Performance Audit

## Scope
Audited the Phase 28 codebase for whole-file materialization, Base64 amplification, ArrayBuffer duplication, media lifecycle cleanup, and obvious timer/listener leaks.

## Findings

### P0 — Native media whole-file Base64 fallback
`components/fileforge/FilePreview.tsx` still had a native fallback from `getStreamUri()` to `readFileBase64()`. This could duplicate a large video/audio/image in JS memory and was directly contrary to the Native Core design.

**Action:** removed the native whole-file fallback. Native inline media now requires a streaming URI; failure is explicit and the user can use the native/external player path.

### P0 — Native download whole-file Base64
`downloadNode()` materialized native files as Base64 before creating a Blob.

**Action:** native download path no longer copies the whole file into JS. It delegates to Android's external file handling instead of creating a giant Blob.

### P1 — Hex viewer native content:// metadata path
The initial metadata branch only recognized filesystem paths beginning with `/`, while chunk reads already supported `content://`.

**Action:** initialization now treats Local and SAF references consistently and prevents accidental whole-file web fallback for native content URIs.

### P1 — PDF dead conversion helper
`PdfViewer` retained an unused whole-buffer Base64 helper after the range transport migration.

**Action:** removed the dead helper to make the no-whole-file invariant explicit.

## Intentional bounded Base64
The remaining Base64 uses were reviewed and are not equivalent to whole-file native materialization:

- PDF range responses: bounded chunks.
- Hex range responses: bounded chunks.
- Thumbnail/HEIC decode outputs: intentionally bounded preview payloads.
- Secure vault serialization: cryptographic serialization, not file preview transport.
- Small chunked text writes: bounded chunks.

## Media lifecycle
The existing media event listeners are paired with cleanup, native media surfaces are destroyed on unmount, and object URLs are revoked when created.

## Result
The Android media preview path now follows:

`Native file -> stream URI -> media element/native surface`

instead of:

`Native file -> Base64 -> JS Uint8Array -> Blob -> object URL`.

This is a materially safer memory profile for large media.
