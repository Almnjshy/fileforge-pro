# FileForge Pro — Release Keystore Setup

This guide explains how to create a release keystore for signing the APK.

## 📋 Local Development Setup

### 1. Generate Keystore

```bash
keytool -genkey -v \
  -keystore fileforge.keystore \
  -alias fileforge \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=FileForge Pro, OU=Development, O=FileForge, L=Riyadh, ST=Riyadh, C=SA"
```

### 2. Create keystore.properties

Create `android/keystore.properties` (DO NOT commit this file):

```properties
storeFile=../fileforge.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=fileforge
keyPassword=YOUR_KEY_PASSWORD
```

### 3. Build Release APK

```bash
cd android
./gradlew assembleRelease
```

The signed APK will be at:
`android/app/build/outputs/apk/release/app-release.apk`

---

## 🚀 GitHub Actions Setup (CI/CD)

### 1. Generate Keystore (if not done above)

### 2. Base64 Encode the Keystore

```bash
base64 -i fileforge.keystore | tr -d '\n'
```

Copy the output.

### 3. Add GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `ANDROID_KEYSTORE_BASE64` | The base64-encoded keystore from step 2 |
| `ANDROID_KEY_ALIAS` | `fileforge` (or your alias) |
| `ANDROID_KEY_PASSWORD` | Your key password |
| `ANDROID_STORE_PASSWORD` | Your store password |

### 4. Push to GitHub

The workflow will automatically:
1. Decode the keystore
2. Sign the release APK
3. Upload it as an artifact
4. Create a GitHub Release (on tag push)

---

## 🔒 Security Notes

- **NEVER** commit `keystore.properties` or `.keystore` files
- **NEVER** share your passwords
- Use different keystores for development and production
- Back up your keystore in a secure location (if lost, you can't update the app)

## 📝 .gitignore already includes:

```
*.keystore
!android/app/debug.keystore
```

---

## 🏷️ Creating a Release

```bash
# Tag the version
git tag v2.4.1
git push origin v2.4.1
```

This will trigger the workflow and create a GitHub Release with the signed APK.
