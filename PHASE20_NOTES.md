# Phase 20 — Archive Job Persistence

## Goal
Make archive extraction and compression participate fully in the persistent Native Operation Journal.

## Changes
- `archiveExtractAll` now creates a journal record before work starts.
- `archiveCreate` now creates a journal record before work starts.
- Progress checkpoints update the existing operation control and native progress events.
- Cancellation/failure is persisted instead of leaving a running journal entry.
- Successful archive jobs are removed from the journal atomically with the completion transition.
- Archive jobs are explicitly marked `resumable=false`: recovery is honest and will report interruption rather than pretending a byte-level resume exists.

## Safety
This phase does not claim true archive resume. ZIP/RAR/7Z/TAR resume requires format-specific checkpointing and atomic extraction manifests. The journal now provides reliable crash detection and recovery UX groundwork.
