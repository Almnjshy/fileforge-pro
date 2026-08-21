# Phase 30 — Production Verification Gate

## Scope
This phase does not add a new product feature. It establishes a verification gate and fixes two concrete issues found during the audit of Phase 29:

1. Native `FilePreview` now treats both local paths and `content://` references as native media references, so SAF images do not fall through to the web/mock path.
2. Removed the unused 100 MB Base64-read constant from the native facade; large native media must use streaming/range APIs instead.

## Static gate
Run:

```bash
node scripts/production-audit.mjs
```

The gate fails if a known native whole-file media fallback pattern is reintroduced.

## Required verification before production
The following cannot be truthfully marked PASS from this source bundle alone because dependencies and the Gradle wrapper JAR are not included:

- npm/bun dependency installation
- TypeScript typecheck
- ESLint
- Bun unit tests
- Next production build
- Capacitor sync
- Android `assembleDebug` / `assembleRelease`
- Android instrumentation tests
- Memory profiling on a physical Android 15 device
- SAF provider compatibility tests
- large PDF/video/archive stress tests

## Release rule
Do not label the project Production Ready until all required verification items above are executed and recorded.
