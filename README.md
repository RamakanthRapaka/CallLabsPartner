# Call Labs Partner — Android

Separate Expo/React Native app for doctors and collection agents. Light-grey backgrounds, white cards, accessible dark text and green actions, with the supplied Call Labs logo. This does not replace or modify the customer app.

## Run locally

Install Node.js 22 LTS or a compatible newer version, Android Studio, an Android SDK, and a compatible JDK. Start an Android emulator or attach a USB-debugging-enabled Android phone.

```powershell
cd C:\xampp\htdocs\callabs_partner
npm install
npm run android
```

`npm run android` creates and builds the native Android project and starts Metro. Rebuild this way whenever native dependencies change; Metro refresh alone cannot add native modules. On later sessions with the installed development build, use `npm start` and press `a`.

If the SDK is not detected, set `ANDROID_HOME` to your actual Android SDK folder in the terminal before building. Native Gradle errors require the first failing Gradle task/error, not only the final BUILD FAILED line.

## Standalone phone-testing APK

The standalone test APK embeds the JavaScript and assets and needs no Metro server. It uses the live API: do not create referrals or update collections unless you intend to change real records or send configured notifications.

To regenerate an ARM64 phone build:

```powershell
cd C:\xampp\htdocs\callabs_partner\android
$env:ANDROID_HOME = "C:\Users\Lenovo\AppData\Local\Android\Sdk"
$env:NODE_ENV = "production"
.\gradlew.bat app:assembleRelease -x lint -x test --configure-on-demand --build-cache -PreactNativeArchitectures=arm64-v8a --max-workers=2
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. This variant uses the generated **debug signing key** and is for private testing only, not production distribution or Play Store upload. This APK targets ARM64 phones (Android 7.0 or newer), not x86 Android emulators or older 32-bit phones. Transfer it to the phone, open it, and allow installation from that particular file-sharing/browser app if prompted. Internet is required to sign in and load your workspace. Device testing and dependency-advisory resolution remain outstanding before production release.

## API environment

Default API: `https://api.calllabs.in/api/v1`. Optional `.env` override:

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://api.calllabs.in/api/v1
```

Do not place provider keys, Supabase service keys or other secrets in mobile environment variables. The backend owns email, SMS, OTP, storage and booking logic. No database migration is introduced by this app.

## Implemented workflows

- Existing email/password partner login, approval checks, encrypted token storage and logout. Backend token expiry applies; there is no separate refresh-token endpoint integrated.
- Forgot password via an emailed 15-minute single-use reset code; Change password under Account with current-password confirmation. Updating a password signs out prior sessions. Requires backend migration `20261003_41` and deployment of the partner password routes; old testing APKs need rebuilding.
- Doctors: searchable/status-filtered paginated patient referrals; referral details, booking/payment status and notification events; three-step patient/recommendation/review creation; one optional email; searchable category-filtered tests/packages; selected items first; prescription image upload; prescription-only lab review; explicit contact consent.
- Collection agents: permitted screens only; paginated assigned bookings and status/search filters; collection/address/payment information; call/directions; sequential collection updates with notes and confirmation; tracking timeline; route counts; existing referral-qualification dashboard.
- Account/access refresh, network errors, loading/empty states, readable date formatting (`dd-mm-yyyy`), safe-area layout and native Android back handling.

Calls currently open the standard phone dialler. Masked/click-to-call provider integration is NOT implemented. No money collection, cancellation, laboratory assignment or administrative actions are introduced. Never infer successful delivery from the API accepting a referral; review its notification events.

Patient records and referral drafts are memory-only, not persisted for offline use. The image picker temporarily copies selected uploads into the device app cache; uploaded prescriptions are stored privately by the backend. Only the access token is stored using Expo SecureStore. Permissions are also checked by applicable backend routes; client-side visibility is not a substitute for backend authorization.

## Verification and release

Navigation lazily mounts permitted tabs, then retains their screen/search/filter/scroll state during the current session. Reads use a shared, bounded, memory-only cache with 30-second freshness and in-flight request deduplication. Switching tabs or returning from background revalidates stale data without replacing populated screens with a full-page loader. Pull-to-refresh always requests fresh data. Referral creation and collection updates invalidate relevant reads; collection status is still verified directly against the API before updates. Logout, account changes and access changes discard cached data; late requests cannot repopulate a cleared cache. No persistent patient-data cache or backend pagination change is introduced.

```powershell
npm run typecheck
npm test
npx expo install --check
npx expo export --platform android
```

Before release, test approved doctor/agent accounts on a real device: login/logout/expiry, no/read/write permissions, prescription upload, SMS/email consent and delivery, prescription-only lab review, order ownership, collection updates and referral booking conversion. Production signing, a square launcher icon, Play Store privacy/data-safety declarations and distribution are separate release tasks. SMS/email referral sends require explicit submission; automatic partner push events require the deployed backend outbox and secured worker scheduler.

## Collection test details

See [COLLECTION_DETAILS.md](COLLECTION_DETAILS.md) for collection-card test names, detailed instruction display and the pending additive backend data requirement. Sample type is intentionally not displayed. Names-only assignment responses remain supported; missing collection instructions are never inferred.

## Partner push notifications

See [PUSH_NOTIFICATIONS.md](PUSH_NOTIFICATIONS.md) for the complete Firebase/Expo/Vercel setup runbook, authenticated device registration, logout cleanup, notification-tap authorization, cron-job.org scheduler configuration and manual testing, standalone APK build commands, troubleshooting, and recorded completion checklist. Private service-account keys and worker credentials must never enter this repository. Native notification code requires a rebuilt APK; it is not activated by reloading the previous APK.

Initial dependency audit reports transitive Expo/React Native advisories, including high-severity findings. Review and resolve these before production distribution. Do not run `npm audit fix --force`: its proposed Expo/React Native major downgrades are incompatible with this SDK. No production release has been prepared.
