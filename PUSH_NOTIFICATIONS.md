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
