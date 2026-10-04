# Partner Android push notifications

The app uses Expo Push Service with project ID `798fa7e0-df47-4154-9208-9c35558529ec`, Android package `in.calllabs.partner`, and Firebase project `call-labs`. `google-services.json` is public client configuration, not the private service-account key. The private key was uploaded separately to Expo; never add it, worker secrets, or Expo access tokens to this app.

## Device lifecycle

After an approved partner session is validated, create Android channel `partner-updates`, request notification permission, obtain the Expo token, and POST `/partner/push/devices` with Bearer authentication and `{ "expo_push_token": "..." }`. Account shows connection status, retry, and phone settings. Foreground activation and native token changes re-register idempotently; permission denial does not block operational screens. Registration retries never log raw tokens or provider errors.

Logout clears local session/cache immediately and queues DELETE `/partner/push/devices` with the same body and previous Bearer token, after any in-flight registration. Token rotation removes the previous known token. No push tokens or notification payloads are written to device storage. If offline or the session has expired, server deregistration cannot be guaranteed: local logout still completes and reports cleanup failure. Backend receipt handling, recipient eligibility checks, and re-registration are required safeguards; do not promise immediate remote revocation while offline.

## Tap handling

Only allowlisted event types and positive integer identifiers are accepted; arbitrary URLs are ignored. Collection agents accept booking_assigned/reassigned/cancelled/rescheduled using order_id; doctors accept referral_converted using referral_id. Taps re-fetch profile, agent orders permission and current assigned records or doctor's scoped referrals. No patient record is taken from the payload or memory cache. A sheet displays current booking/payment/collection status; inaccessible or removed records show an explanation. Operational actions stay in existing screens. Foreground receipt invalidates relevant cached lists. No worker endpoint is called by the app.

## Build and release checks

Native notification dependencies require regenerating Android configuration and rebuilding/installing the APK; Metro reload alone and Expo Go cannot test Android remote push.

```powershell
npx expo prebuild --platform android --no-install
npm run typecheck
npm test
npm run android
```

For a standalone testing APK, use the existing release Gradle workflow. Signing remains the existing testing configuration; this change does not configure Play Store signing or submission.

Before delivery testing, confirm backend production deployment/migration, Expo credentials and required access token configuration, and secured external worker scheduler. The backend payload's channelId should be `partner-updates` (app config also sets this default). Worker secrets belong exclusively to backend/scheduler. Sending acceptance is not phone delivery.

Test on a Google Play-services Android phone: grant/deny permission, register/retry, assignment/referral notifications, foreground and cold-start taps, removed assignment/access, logout/account switch, disabled permission, offline logout, and token rotation. Do not create/update production bookings just to test without explicit authorization.

Automated unit tests cover payload parsing and serialized registration/deregistration races. They do not verify Android OS permissions, native delivery, or backend authorization end-to-end.

## Setup runbook and recorded progress

Recorded on 4 October 2026. This section captures the setup performed in the Firebase, Expo, Vercel, and cron-job.org consoles. It is a reference, not proof that production delivery is working. Menu labels and provider pricing may change; consult the official links below when repeating these steps.

### Recorded identifiers

| Item | Configured value |
|---|---|
| Firebase project name / ID | Call Labs / `call-labs` |
| Firebase project number | `187810801366` |
| Firebase Android app nickname | Call Labs Partner |
| Android package | `in.calllabs.partner` |
| Expo project slug | `calllabs-partner` |
| Expo organization | `calllabs-partner-india` |
| Expo project ID | `798fa7e0-df47-4154-9208-9c35558529ec` |
| API base | `https://api.calllabs.in/api/v1` |
| Notification channel | `partner-updates` |
| Scheduler job title | Call Labs Push Worker |

These identifiers are not credentials. Do not copy credential values into documentation, screenshots, Git, app config, or `EXPO_PUBLIC_*` variables.

### 1. Firebase project and Android registration

1. Sign in at https://console.firebase.google.com/ using the company-controlled Google account. The Firebase account does not have to be the Play Console account; a Play Store developer account is not needed for APK push testing.
2. Two Call Labs projects were visible: `call-labs` and `call-labs-1b4fc`. An older project showed a 2019 messaging campaign. Leave that existing project untouched. The selected project, `call-labs`, had no apps before this registration.
3. Under Project settings > General > Your apps, add an Android app using the exact package `in.calllabs.partner` and nickname `Call Labs Partner`. SHA-1 was not needed for this push setup.
4. Download the Android configuration file. The downloaded file was named `google-services (1).json`; it was copied into this app as `google-services.json` with the package/project verified.
5. Skip the Firebase wizard's manual Gradle/SDK edits. Our Expo configuration uses `android.googleServicesFile` and the notifications plugin; prebuild generates the Google Services Gradle configuration. The generated Android project uses Groovy, not Kotlin DSL.
6. Complete the wizard, then check Project settings > Cloud Messaging: Firebase Cloud Messaging API (V1) must show Enabled. This was confirmed.

The Firebase Android config contains public client identifiers. It is not the Firebase Admin SDK service-account key and does not replace private sending credentials.

### 2. Expo account and existing project linking

1. Create/sign in to an Expo account controlled by Call Labs. Business was chosen for this commercial application; account classification and paid subscription selection are separate. Do not select a paid plan or start paid services inadvertently.
2. Create the organization with a unique slug, then create `Call Labs Partner` with slug `calllabs-partner`.
3. Do not run `create-expo-app`: our partner app already exists. Link that checkout instead:

```powershell
cd C:\xampp\htdocs\callabs_partner
npx eas-cli@latest login
npx eas-cli@latest init --id 798fa7e0-df47-4154-9208-9c35558529ec
```

Accept overwriting the old local slug `call-labs-partner` with `calllabs-partner` when prompted. This does not change `in.calllabs.partner`.

### 3. Upload FCM V1 credentials to Expo

1. In the selected Firebase project, open Project settings > Service accounts > Firebase Admin SDK.
2. Generate a new private key and save the JSON securely outside every Git repository. Do not paste its contents into chat or app code. The existing setup used the Firebase Admin SDK service account for project `call-labs`; review least-privilege service-account permissions before production release.
3. Create EAS configuration if the CLI says `eas.json could not be found`:

```powershell
cd C:\xampp\htdocs\callabs_partner
npx eas-cli@latest build:configure --platform android
npx eas-cli@latest credentials --platform android
```

`build:configure` creates local configuration; it does not start a cloud build.

4. Select production > Google Service Account > Manage your Google Service Account Key for Push Notifications (FCM V1) > Set up a Google Service Account Key.
5. At the file prompt, replace the example filename with the full path of the private-key JSON, without surrounding quotes. Do not select `google-services.json`.
6. Verify the CLI says the uploaded key is assigned to `in.calllabs.partner` for FCM V1 and shows Firebase project `call-labs`. This was confirmed.
7. Exit the menu. If arrows do not work, Ctrl+C is safe after successful upload; it does not undo saved credentials.

FCM Legacy and Play Store submission credentials can remain unassigned for push testing. Do not regenerate/delete the working key unnecessarily. Native code and a rebuilt APK are required; Expo Go cannot test Android remote push for our SDK.

### 4. Backend API contract and deployment

The backend team reported implementing device registration, transactional outbox events, Expo tickets/receipts, and DeviceNotRegistered token disabling. The user later confirmed backend changes were pushed and deployed. The partner app does not send directly to Firebase or call the worker.

| Endpoint | Caller and authentication |
|---|---|
| `POST /api/v1/partner/push/devices` | App, partner Bearer session |
| `DELETE /api/v1/partner/push/devices` | App, partner Bearer session |
| `POST /api/v1/partner/push/worker` | Scheduler only, `X-Push-Worker-Secret` |

POST/DELETE device request body:

```json
{ "expo_push_token": "ExponentPushToken[example-token]" }
```

Responses are `{ "message": "Push device registered." }` or `{ "message": "Push device deregistered." }`. Registration is idempotent, allows multiple tokens per account, and transfers a reused token to the authenticated account. The backend must derive identity from the session and accept only eligible active, approved partners.

Supported backend events: `booking_assigned`, `booking_reassigned`, `booking_cancelled`, `booking_rescheduled`, `referral_converted`. Cancellation/rescheduling wiring was reported for customer workflows; no separate admin manual cancellation/rescheduling workflow was found at implementation time.

Example collection payload:

```json
{ "event_type": "booking_assigned", "booking_id": 123, "order_id": 123 }
```

Example doctor payload:

```json
{ "event_type": "referral_converted", "referral_id": 456, "booking_id": 123, "order_id": 123 }
```

Events are intended to be written with the booking transaction, deduplicated, and rolled back with failed transactions. No Expo request belongs inside the booking mutation. The worker should recheck authorization before sending, use bounded processing/retries, and check receipts later. Verify these backend guarantees and its automated tests independently; app tests do not establish them.

Before testing on production, verify migration state against the actual production database from the backend checkout, not merely a local database:

```powershell
py -m alembic current
# Apply only after checking the target database and reviewing the migration:
py -m alembic upgrade head
```

The backend's migration head can change. Do not hard-code the previously reported revision as current, switch DATABASE_URL blindly, or print database credentials.

### 5. Vercel backend environment variables

Open the backend API project in Vercel > Settings > Environment Variables. These values belong to Production (and separately to any intentionally configured test environment), not the admin/customer frontend projects or the Android app.

| Variable | How to obtain it | Where it is used |
|---|---|---|
| `PUSH_WORKER_SECRET` | Generate a cryptographically random secret locally | Backend environment and scheduler's matching request header |
| `EXPO_PUSH_ACCESS_TOKEN` | Create an access token in the Expo account with access to this project | Backend's authenticated requests to Expo, when enhanced push security is enabled |

Generate a worker secret in your own PowerShell terminal:

```powershell
py -c "import secrets; print(secrets.token_hex(32))"
```

Copy the resulting value privately into Vercel under `PUSH_WORKER_SECRET`. Do not save the value in this guide. Redeploy after saving environment changes. The user confirmed the worker secret was added and the backend redeployed.

For enhanced Expo push security, create a token at https://expo.dev/settings/access-tokens using the account that can access the Call Labs project, give it a descriptive name such as Call Labs Backend Push, and save it privately as `EXPO_PUSH_ACCESS_TOKEN`. Coordinate deployment of the configured token with enabling enhanced push security in the Expo dashboard. Once enabled, requests without a valid token are rejected. Without enhanced push security, this variable is optional; its configuration was not confirmed during this session.

An Expo access token is neither the Firebase JSON key nor a phone's Expo push token. Treat it like a password; prefer appropriately limited service identity/access where supported. Admin settings may expose notification switches or health status, but should not return these secrets to the browser.

### 6. External scheduler: cron-job.org

An external scheduler is required because the backend does not run an in-process worker loop on Vercel. The selected service was cron-job.org, whose published setup supported free every-minute requests with custom headers and POST at the time of setup. Third-party scheduling requires trusting that service with the dedicated worker secret; never provide it Firebase, Expo, or database credentials.

1. Sign in to https://console.cron-job.org/ and open Cronjobs > Create cronjob.
2. Configure the following:

| Setting | Value |
|---|---|
| Title | Call Labs Push Worker |
| URL | `https://api.calllabs.in/api/v1/partner/push/worker` |
| Schedule | Every 1 minute |
| Time zone | UTC is fine for an every-minute interval |
| Enable job | Off until configuration and live-send readiness are checked |
| Save responses in job history | Off |
| Requires HTTP authentication | Off; username/password empty |
| Header key | `X-Push-Worker-Secret` |
| Header value | The exact worker secret saved in Vercel |
| Request method | POST |
| Request body | Empty |
| Timeout | 30 seconds |
| Treat HTTP 3xx redirects as success | Off |
| Schedule expires | Disabled unless intentionally time-limited |

3. Click Create. The job was created successfully and shown as Inactive.
4. To test, click Edit on the job row, then Test Run near the bottom. The selected-row menu contains bulk actions, not the manual test button.
5. Review current settings first: the test uses unsaved settings too. Start Test Run only when ready for real queued messages to be sent. Even an inactive job can process the real queue through a manual test.

Recorded manual worker response:

```json
{ "processed": 0, "receipts_checked": 0 }
```

This confirms a worker response with no items processed or receipts checked in that run. It does not verify phone delivery, completed production migrations, event enqueueing, or future scheduled executions. The numeric HTTP status was not included in the shared result; confirm HTTP 200 and expected counters before declaring the HTTP check successful.

6. When satisfied with configuration and ready for automatic sends, save the form and enable the every-minute job. Check execution history for successful scheduled runs. Enabling was advised but not confirmed in the conversation.
7. Enable failure alerts. Keep worker execution below the scheduler timeout, prevent overlapping work with appropriate backend claiming/locking, and keep responses limited to non-sensitive counters. Do not work around timeouts with unbounded serverless background processing.

If the secret is rotated, update Vercel, redeploy, and update the scheduler header together. Never put the secret in a URL/query string. Keep it hidden in screenshots and support messages.

### 7. Rebuild the standalone updated APK

On the machine containing the latest partner source and Android tooling, ensure the committed changes are present. The existing checked-out app already has the Firebase configuration and EAS link; do not repeat account/key creation just to rebuild.

```powershell
cd C:\xampp\htdocs\callabs_partner
npm install
npm run typecheck
npm test
npx expo prebuild --platform android --no-install

$env:ANDROID_HOME = "C:\Users\Lenovo\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot"
$env:NODE_ENV = "production"

cd android
.\gradlew.bat app:assembleRelease -x lint -x test --configure-on-demand --build-cache -PreactNativeArchitectures=arm64-v8a --max-workers=2
```

These SDK/JDK paths were verified on this laptop; adjust them to actual installed paths on another machine. Prebuild generates native files; review/preserve intentional native customizations before regenerating. A clean native-folder deletion is not part of these instructions. Do not use `npm audit fix --force` to solve unrelated dependency warnings.

Wait for BUILD SUCCESSFUL, then find:

```text
C:\xampp\htdocs\callabs_partner\android\app\build\outputs\apk\release\app-release.apk
```

Transfer this newly generated file, not a stale APK from the releases folder, to the phone and install it. The standalone release-variant test APK embeds JavaScript/assets and does not require Metro or the laptop. It targets ARM64 Android 7.0+ devices; the build command is not for x86 emulators or older 32-bit phones.

The current release variant uses the generated debug signing key and is for private testing only. Do not upload it to Play Store or describe it as production-signed. A regenerated/different key may cause an existing-app signature conflict; investigate the key mismatch before uninstalling. Uninstalling removes local app/session data. A development APK from `assembleDebug` is not the standalone APK described above.

### 8. Phone and end-to-end verification

1. Use a supported Android phone with Google Play services and internet access.
2. Install the rebuilt APK, sign in as the approved doctor or collection agent, and allow notifications.
3. Open Account and confirm Notifications enabled on this device. If not, use Retry notifications and phone notification settings. Registration requires the deployed device API and the correct Firebase config.
4. Confirm the scheduler is enabled and its history shows successful calls.
5. With explicit authorization, create a controlled assignment/referral conversion through the normal workflow. This changes real records and can send real notifications; use a dedicated test environment/account where available. Do not submit duplicate bookings to diagnose delivery.
6. Verify foreground receipt, background display, cold-start tap, and current authorized status display. Test revoked assignment/access, logout, account switching, permission denial, and reconnection.
7. Review backend outbox/ticket/receipt results without logging device tokens or patient data. Expo acceptance and worker HTTP 200 are not proof that a phone displayed the notification.

### Troubleshooting

| Symptom | What to check |
|---|---|
| `eas.json could not be found` | Run `eas build:configure --platform android` in the existing app checkout |
| FCM Legacy / Play submissions says None | Expected for this push setup; check FCM V1 instead |
| Credentials menu arrows fail | Ctrl+C exits safely after confirmed upload |
| Native module missing / old app still running | Regenerate and rebuild native Android app; a Metro refresh cannot install native dependencies |
| Registration not connected | Permission, internet, Expo project ID, deployed device routes, valid approved partner session, Firebase config |
| Worker HTTP 401/403 | Matching header/secret and redeployment; also check Vercel protection/firewall rather than assuming only a bad secret |
| Worker HTTP 404/405 | Correct production deployment, `/api/v1/partner/push/worker`, POST, and no redirect |
| Worker HTTP 500 | Backend logs, production migration/schema, configuration, and provider errors with secrets redacted |
| Worker times out | Bound batches/provider timeouts and inspect backend logs; do not assume no notifications were sent |
| Zero processing counters | No items were handled in that run; inspect device registration, eligibility, event enqueueing, and outbox state |
| Sent ticket but no display | Inspect receipts, FCM credentials, token validity, OS permission/channel, device restrictions and connectivity |
| `DeviceNotRegistered` | Backend must deactivate the matching token; app should register current token after valid login |
| `UNAUTHORIZED` from Expo | Enhanced push security requires a valid authorized Expo access token |
| Scheduled runs missing | Job enabled/saved, correct schedule, job history, failure alerts, provider auto-disable or availability |
| APK installation conflict | Signing key/version mismatch; do not uninstall blindly |

### Completion checklist as last reported

- [x] Firebase `call-labs` Android registration and FCM V1 enabled.
- [x] Expo project linked and FCM V1 private credentials assigned.
- [x] Partner app notification integration implemented; TypeScript, 23 app unit tests, Android bundle, Expo dependency checks, and native debug build passed during implementation.
- [x] User reported app changes committed and backend pushed/deployed.
- [x] User reported PUSH_WORKER_SECRET added to Vercel and backend redeployed.
- [x] Scheduler job created inactive and manual worker response observed with zero processing counters.
- [ ] Independently confirm current backend tests and production database migration state.
- [ ] Confirm whether enhanced Expo push security/access token is configured.
- [ ] Confirm scheduler enabled and successful automatic runs.
- [ ] Confirm updated standalone APK built and installed.
- [ ] Verify a real authorized test notification reaches the phone and tap authorization works.

### Assignment actions (2026-10-04)

Assignment alerts now open Collections and its existing assignment detail sheet, rather than a read-only order summary. Both `booking_assigned` and `booking_reassigned` require numeric positive `assignment_id` and `order_id` in their data payload. These are different identifiers; the app never substitutes an order ID for an assignment ID.

```json
{"event_type":"booking_assigned","assignment_id":7,"order_id":51}
```

The app rechecks approved, active partner identity and collection access, then loads the authenticated assignment queue and matches BOTH identifiers. Missing/reassigned records show an unavailable message. Foreground receipt refreshes cached lists without automatically changing screens; tapping the notification opens details. The existing response listener handles open/background taps; the last-response lookup handles a normal closed-app launch after session restoration. OS force-stop can prevent notification delivery until the app is reopened.

Accept and Reject are offered only for `assigned` assignments with write/manage access and non-terminal orders. Acceptance precedes Start journey. Reject opens an optional reason field and requires a confirmation dialog. Requests use the existing bearer-token client:

- `POST /admin/collection-agent/assignments/{assignment_id}/accept`
- `POST /admin/collection-agent/assignments/{assignment_id}/reject`

Paths are relative to `https://api.calllabs.in/api/v1`. Empty notes send `{}`; populated notes send `{"notes":"trimmed text"}`. The app does not assume an action response schema or add a new detail GET contract: it reloads the existing authenticated assignment list to obtain current detail/status. Successful rejection may remove the record from that list; the sheet shows rejection acknowledgement and disables further actions. Closing returns to the refreshed list.

401 uses the existing session-expiry logout. 403 shows access feedback; 404 shows unavailability. 409 reloads the assignment and shows conflict feedback without retrying the write. Network failures keep the detail screen and entered notes, disable writes until Refresh assignment details succeeds, and never automatically repeat a POST with an uncertain outcome.

Validation: `npm run typecheck` and mocked `npm test` cover notification routing, cold-start/listener deduplication, confirmation, notes, non-pending actions, authenticated API paths and conflict handling. No backend code or production records were changed. Build/install an updated APK and verify notification taps on a real phone in foreground, background and normal closed-app states; mocked tests are not proof of device delivery.

### Reference links

- Firebase Android registration: https://firebase.google.com/docs/android/setup
- Expo SDK 57 notifications: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- Expo FCM V1 credentials: https://docs.expo.dev/push-notifications/fcm-credentials/
- Expo sending/receipts/security: https://docs.expo.dev/push-notifications/sending-notifications/
- Expo access tokens: https://docs.expo.dev/accounts/programmatic-access/
- Vercel environment variables: https://vercel.com/docs/environment-variables
- cron-job.org request options and limits: https://cron-job.org/en/faq/
