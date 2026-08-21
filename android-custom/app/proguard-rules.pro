# Keep Capacitor classes (reflection-based plugin loading)
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class *
-keepclassmembers class * {
    @com.getcapacitor.annotation.PluginMethod <methods>;
}
-keep class android.webkit.** { *; }
-dontwarn android.webkit.**

# Keep our app's plugin and service classes (referenced via reflection)
-keep class pro.fileforge.app.** { *; }

# === Archive engine keep rules ===
# Apache Commons Compress — SPI loaders (archivers + compressors discovered via reflection)
-keep class org.apache.commons.compress.compressors.** { *; }
-keep class org.apache.commons.compress.archivers.** { *; }
-keep class org.apache.commons.compress.parallel.** { *; }
-keep class org.apache.commons.compress.utils.** { *; }
# ServiceLoader files (META-INF/services) — R8 sometimes drops them
-keep class META-INF.services.** { *; }

# JunRAR — uses reflection internally for some headers
-keep class com.github.junrar.** { *; }
-keep class de.innosync.** { *; }

# XZ / LZMA
-keep class org.tukaani.xz.** { *; }

# === SLF4J ===
# Without this, R8 strips the StaticLoggerBinder and the release build fails
# with "Missing class org.slf4j.impl.StaticLoggerBinder".
-keep class org.slf4j.** { *; }
-keep class org.slf4j.impl.** { *; }
-dontwarn org.slf4j.impl.StaticLoggerBinder
-dontwarn org.slf4j.impl.StaticMDCBinder
-dontwarn org.slf4j.impl.StaticMarkerBinder
# Suppress the "no SLF4J providers found" warning noise
-dontwarn org.slf4j.event.**

# === Optional compressors not on the classpath ===
# commons-compress supports Zstd (com.github.luben.zstd) and Brotli
# (org.brotli.dec) optionally — we don't ship those libraries because the
# file manager doesn't handle .zst / .br files. R8 fails the release build
# when it finds references to those classes but can't resolve them.
# `-dontwarn` tells R8 to ignore the missing classes; the code paths that
# reference them simply can't be reached at runtime.
-dontwarn com.github.luben.zstd.**
-dontwarn org.brotli.dec.**
-dontwarn org.brotli.enc.**

# Preserve generic type info (needed by JSObject/JSArray reflection)
-keepattributes Signature, RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations, AnnotationDefault

# Kotlin metadata — needed for reflection on Kotlin classes
-keep class kotlin.Metadata { *; }
-keepattributes *Annotation*
