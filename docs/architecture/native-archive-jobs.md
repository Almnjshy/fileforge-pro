# Native Archive Jobs

Archive work is a first-class native job rather than a blocking JS call.

```text
FileOperationEngine
        |
        | operationId
        v
Capacitor FileForgeFileAccess
        |
        v
Native Operation Control
        |
        v
ArchiveEngine
  |             |
Extract       Create ZIP
  |             |
chunked IO    chunked IO
  |             |
  +------ progress ------+
             |
      fileOperationProgress
```

The archive engine never sends archive bytes through JavaScript. It streams directly between Android file descriptors and the archive libraries, while JavaScript receives only operation telemetry.
