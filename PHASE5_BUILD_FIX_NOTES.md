# Phase 5 Build Fix Notes

## Root causes fixed

1. `NativeStorageService` was incorrectly implementing `StorageProvider` after the provider contract had been migrated to `StorageReference`.
   - `NativeStorageService` is the low-level local filesystem engine and intentionally owns `java.io.File` operations.
   - `DirectStorageProvider` is the adapter that implements the `StorageProvider` contract and translates `StorageReference.Local` to `File`.
   - Removed the stale interface implementation/override declarations from `NativeStorageService` rather than weakening the provider contract.

2. `PendingSaf` was declared inside `NativeOperationEngine`, which is a different Kotlin package from the sealed `StorageReference` declaration.
   - Kotlin requires direct subclasses of a sealed class/interface to be declared in the same package.
   - Moved `PendingSaf` into `core.storage`, keeping `StorageReference` sealed and type-safe.
   - The operation engine now imports the internal storage reference type.

## Intent

These are architectural corrections, not compiler-only workarounds. The provider boundary remains strongly typed, SAF references remain distinct from local filesystem references, and no conversion of SAF URIs into `java.io.File` was introduced.

## Expected result

The previous `NativeOperationEngine.kt`, `NativeStorageService.kt`, and dependent `FileForgeFileAccessPlugin.kt` Kotlin compilation errors should be removed. GitHub Actions remains the authoritative Android build environment for this project.
