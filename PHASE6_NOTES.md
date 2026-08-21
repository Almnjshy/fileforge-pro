# FileForge Pro — Phase 6: Native Large Text Editor

## Completed

- Replaced the previous 5 MB refusal path with a bounded-memory large-document editor.
- Added native chunked reads/writes as the only I/O path for large documents.
- Added UTF-8, UTF-16LE and UTF-16BE BOM detection.
- Preserves the detected BOM/encoding during save instead of silently converting the file to UTF-8.
- Aligns UTF-8 page boundaries so multi-byte characters are never intentionally split between editable pages.
- Aligns UTF-16 pages to code-unit boundaries.
- Keeps only a small cache of pages in JavaScript memory.
- Added per-page undo/redo with bounded history.
- Added line numbers, cursor position, find and replace-all within the loaded page.
- Added transactional autosave using the existing native temporary-write/commit boundary.
- Save rebuilds the document sequentially in native storage; untouched pages are copied directly from their original byte ranges and edited pages are encoded individually.
- Failed saves abort the temporary target and leave the original file untouched.

## Explicit boundary

Global recursive/full-document search is intentionally part of Phase 7 (Search Engine), not implemented as a fake JavaScript scan of a 100+ MB file. The Phase 6 editor only searches the currently loaded bounded page.

## Architecture

React LargeTextEditor
    ↓
LargeDocumentEngine
    ↓
Native FileForge storage bridge
    ↓
UnifiedStorageService / transactional chunked writer
    ↓
Android filesystem or SAF

No large document is materialized as one JavaScript string.
