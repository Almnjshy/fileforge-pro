# Large Document Engine

Phase 13 introduces `LargeDocumentEngine`, a paged UTF-8 document model. It loads a bounded working set, supports editing individual pages, and saves sequentially through native chunk writes. Local filesystem and SAF are supported through the same native storage boundary.

The existing small-file TextEditor remains unchanged until the paged editor UI is wired in a dedicated integration pass; this avoids pretending that a textarea holding the whole document is a large-file editor.
