# Partner Android icons

Configured on 2026-10-04. The approved light-grey UI and existing in-app `assets/logo.png` remain unchanged.

- `assets/app-icon-master.png`: new red-orange drop/white handset and green medical plus concept.
- `assets/app-icon.png`: 1024 x 1024 launcher PNG.
- `assets/adaptive-icon.png`: 1024 x 1024 adaptive foreground, with extra mask-safe padding; white Android background.
- `assets/notification-icon.png`: separate white-and-transparent 96 x 96 drop/handset symbol.

`app.json` declares the launcher, adaptive foreground and notification plugin icon. Native Android resources and the FCM/Expo default notification icon metadata are also updated for the existing native project. No Firebase credentials, worker secrets or backend contracts were changed.

If the Android folder is regenerated, Expo prebuild uses app.json to apply these icon settings. To sync only icon resources to an existing native folder without regenerating other native settings:

```powershell
node scripts/sync-android-icons.cjs
npm run typecheck
npm test
```

For a standalone physical-device testing APK, from `android`:

```powershell
.\gradlew.bat app:assembleRelease -x lint -x test --build-cache '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a'
```

Set ANDROID_HOME to the installed Android SDK and JAVA_HOME to a compatible installed JDK for your machine. Build output is `android/app/build/outputs/apk/release/app-release.apk`. The current release build uses the project's debug signing key for device testing only; do not submit it to Play Store as a production release.

Install over the previous testing app if its signing key matches. Do not uninstall unnecessarily because that removes local session state. On a real device verify launcher masks, notification permission, notification icon and authorized navigation after a notification tap. A successful APK build is not proof of live notification delivery.

References: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ and https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/.

## Verified testing build (2026-10-04)

- `releases/CallLabs-Partner-icons-2026-10-04.apk`, 41,365,665 bytes.
- Package `in.calllabs.partner`, version 0.1.0 (code 1), min Android API 24, ARM64 and ARMv7.
- Gradle assembleRelease succeeded in 5m 51s; TypeScript and all 55 tests passed.
- APK signature verification passed (v2). Compiled resources contain legacy/adaptive launcher images and all notification density variants. Both FCM and Expo default notification metadata reference the packaged notification symbol.
- SHA256: `A153DA98C99B16AD2F6365E75E4C531C8DB032AE61F143F5B5670BD8D2AC6E3B`.
- No installation, live notification send or production booking update was performed.
