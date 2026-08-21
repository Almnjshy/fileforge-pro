# Phase 15 — Native Job Protocol

This phase connects the existing File Operation Center to a real Android-side job protocol.

The key rule is: **the operation ID is stable across UI, bridge, and native execution**. The Web layer receives only state/progress events; file bytes never cross the bridge for copy/move.

Implemented:
- Native operation registry.
- Progress/state/error events.
- Cancel/pause/resume/status methods.
- Local + SAF copy/move integration.
- TypeScript event multiplexer.
- Operation ID propagation from FileOperationEngine → FileRepository → native plugin.
