# Call Labs Partner Android App

Use Expo SDK 57 documentation before changing native integrations.
Keep this project separate from the customer mobile app.
Doctor and collection-agent APIs share https://api.calllabs.in/api/v1.
Preserve server role, approval, assignment and screen access checks.
Do not persist patient records, prescriptions, passwords, or private referral links.
Use Expo SecureStore for the session token only. Clear the session on 401.
Preserve the approved light-grey background, white cards, dark text, green actions and supplied logo.
Use real API catalog/booking data; no demo records in operational screens.
Run npm run typecheck and npm test before handoff.
Do not send real referrals or update live collection statuses during automated testing.
