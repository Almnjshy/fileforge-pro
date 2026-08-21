# Phase 13 Notes

Large-document editing is now a dedicated path. Files above 5 MB opened through FloatingWindow use LargeTextEditor rather than the legacy whole-document textarea editor.

The engine reads 256 KiB pages through the Native Storage boundary and writes through a temporary native target before commit. Local paths use a temporary file and replacement move; SAF uses a temporary document in the same parent and commits into the target only after the write completes.

The legacy small-file editor remains intact. This phase deliberately does not pretend a normal textarea is a scalable large-file editor.
