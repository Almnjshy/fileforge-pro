import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "pro.fileforge.app",
  appName: "FileForge Pro",
  webDir: "out",
  backgroundColor: "#0f0f14",
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0f0f14",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#f97316",
      splashFullScreen: false,
      splashImmersive: false,
    },
    Filesystem: {
      androidIsEncryption: true,
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
