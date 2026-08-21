# Phase 31 — Build & Test Verification

## Findings fixed

1. The repository test suite imports `bun:test`, but CI did not install Bun. CI now provisions Bun 1.3.4 before running tests.
2. CI provisioned Gradle 8.9 but invoked `./gradlew`; the custom source tree intentionally has no `gradle-wrapper.jar`. CI now invokes the Gradle 8.9 binary installed by `gradle/actions/setup-gradle`.
3. The npm Android scripts referenced `./gradlew` after Capacitor sync. They now invoke the installed `gradle` binary.

## Verification performed in this environment

- Node.js available: v22.16.0
- npm available: 10.9.2
- Bun: not installed locally
- Gradle: not installed locally
- Android SDK: not available locally
- `gradle-wrapper.jar`: absent by design in `android-custom`
- Therefore a full dependency install, Next build, Android Gradle build, and APK verification were not falsely claimed.

## CI release gate

The GitHub Actions workflow remains the authoritative end-to-end build environment: it installs Node/Bun/dependencies, provisions Android SDK + Java 17 + Gradle 8.9, creates the Capacitor Android platform, applies the custom native sources, syncs Capacitor, and builds debug/release APKs.
