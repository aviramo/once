# Project task queue

User-story level tracking — features shipped, bugs found, deployment milestones. Not for micro-technical chores (those live in commit messages, code comments, or `CLAUDE.md`).

Companion to:
- `BACKWARD_COMPAT.md` — server-side shims waiting for older app versions to die out.
- `CLAUDE.md` — codebase facts, schema, architecture.

## How to use this file

- **Adding a task:** when a non-trivial piece of work is decided but not done yet, append an entry under "Open" with `Status: Open` and an `Added:` date.
- **In progress:** flip `Status` to `In progress` when you start working. Optional but useful when several things are mid-flight.
- **Completing a task:** flip `Status` to `Done (YYYY-MM-DD)` and **move the entry** to the "Done" section. Don't delete — the user wants to be able to ask "what shipped this week".
- **Granularity:** "Friends can install Once on their iPhone" — yes. "Wrap I18nManager in try/catch" — no, that goes in a commit message.
- **Order:** Open section sorted by priority (most blocking on top). Done section sorted newest-first.

## Entry template

```
### <short user-story-style title>

- **Status:** Open | In progress | Done (YYYY-MM-DD)
- **Added:** YYYY-MM-DD
- **Why:** the user value or trigger
- **Notes:** anything that helps the next session (links, file paths, blocked-by, follow-ups)
```

---

## Open

### iOS available on TestFlight (external testers can install)

- **Status:** In progress
- **Added:** 2026-05-08
- **Why:** Friends and family on iOS need to actually be able to install Once and try it.
- **Notes:** Builds 1.0.0 (2) and 1.0.0 (3) crashed on launch — root cause was missing `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in EAS production environment, not TurboModules as initially suspected. Env vars pushed via `eas env:push production` on 2026-05-09. Build 1.0.0 (5) submitted to TestFlight via `eas submit` on 2026-05-09 (required adding `submit.production.ios.ascAppId = "6765470965"` to `mobile/eas.json`). Currently being processed by Apple, then Beta Review (24-48h). External group is "Beta Testers" with `ofir.aviram@gmail.com` and `asafd7777@icloud.com`.

### Google Play store listing complete (no more "unreviewed" suffix)

- **Status:** Open
- **Added:** 2026-05-08
- **Why:** Internal testers see "com.aviramo.once (unreviewed)" instead of "Once" because the Main Store Listing is empty. Required for any track wider than Internal Testing, looks unprofessional even for friends/family.
- **Notes:** Play Console → Grow users → Main store listing. Need: app name "Once", short description (≤80 chars), full description (≤4000 chars), app icon, feature graphic 1024×500, ≥2 phone screenshots.

### Google Play App Content declarations complete (Data Safety, content rating, etc.)

- **Status:** Open
- **Added:** 2026-05-08
- **Why:** Required for any track wider than Internal Testing. 10 declarations total; only Privacy Policy URL was filled. Most relevant: Data Safety (microphone, location, photos, OAuth identity, chat content), Content Rating (IARC), Target Audience (18+, dating), App Access (provide test credentials for App Review).
- **Notes:** Play Console → App content. Walk through each declaration form. Same data-safety questions will need to be answered in App Store Connect for any future iOS App Store release (not just TestFlight).

### Profile expansion: height, smoking, hobbies

- **Status:** Open
- **Added:** 2026-05-08
- **Why:** Profiles today are name + bio + photos + family/schedule. Adding height, smoking habits, and hobbies makes Once feel like a real dating profile and gives the matching algorithm more dimensions to score on. Users on competing apps already expect these fields.
- **Notes:** Three sub-fields, all live inside `users.data` (jsonb, no migration drama). Open design questions: granularity (height in cm vs. "tall/short" buckets? smoking as boolean vs. enum `never|sometimes|regularly`? hobbies as free-text tags vs. fixed list?), which are required vs. optional in onboarding, and whether/how each affects `relevance` in the `others` RPC. Mobile work: edit forms in onboarding + profile settings, render in `MatchCard`/`WatcherCard`. Server work: extend `make_profile` to surface these in the snapshot, optionally extend `others` relevance with a compatibility multiplier (similar to `kids_preference_match`). Decide on shape together before implementing.

### `report` user feature — design + ship

- **Status:** Open
- **Added:** 2026-05-08
- **Why:** Users on a real-time dating app need a way to report inappropriate behaviour. Currently there's only `block` (which is a permanent restriction) and `leave` (which is just exit chat). No reporting path exists.
- **Notes:** Decision pending per `CLAUDE.md` → "`report` (pending decision)". Open shape questions: does it write to `restrictions`, a new `reports` table, or both? Does it auto-leave the chat / kick the watcher? Does it fire a moderation push? Available from `watching` only, `chat` only, or both?

---

## Done

### Once registered on App Store Connect, Google Play Console, and Apple Developer

- **Status:** Done (2026-05-07)
- **Added:** 2026-05-07
- **Why:** Prerequisite for any TestFlight / Play track distribution.
- **Notes:** Apple App ID `com.aviramo.once` with Sign in with Apple capability. App Store Connect app "Once" (ASC App ID 6765470965). Google Play Console app "Once" with package `com.aviramo.once`. Android Developer Verification passed using a verification APK that included the `adi-registration.properties` snippet (config plugin at `mobile/plugins/withAdiRegistration.js`).

### Initial iOS build pushed to TestFlight (build 1.0.0 (2))

- **Status:** Done (2026-05-07)
- **Added:** 2026-05-07
- **Why:** First step toward iOS testers being able to install.
- **Notes:** Built and submitted via `eas build --platform ios --profile production` + `eas submit`. ASC API key already on EAS (`[Expo] EAS Submit r37sx8E6Jw`). The build itself was later rejected by Beta Review (launch crash on iOS 26.4.2) — see the open "iOS available on TestFlight" task for the rebuild.

### Android available on Play Internal Testing (build 1.0.0 (7))

- **Status:** Done (2026-05-09)
- **Added:** 2026-05-08
- **Why:** Friends and family on Android need to actually be able to install Once and try it.
- **Notes:** AABs 1.0.0 (4) and (6) crashed on launch (missing EAS env vars — same root cause as iOS). Build (7) launches and Google Sign-In works. Two manual steps that fixed it: (1) downloaded the AAB from EAS and uploaded manually to Play Console (the `eas submit` Android path failed because the Firebase Admin SDK service account at `firebase-adminsdk-fbsvc@once-4f584.iam.gserviceaccount.com` doesn't have Google Play Developer API scopes — would need a dedicated GCP service account; deferred); (2) Google Sign-In failed initially because there was no Android OAuth 2.0 client in GCP for `com.aviramo.once` with the Play App Signing SHA-1 (`BB:A1:8A:E9:37:83:B9:F8:C0:7A:BD:DC:AC:A4:D7:83:E1:E8:D5:15`, extracted from `deployment_cert.der` via `openssl x509 -inform DER -fingerprint -sha1`). Created Android client `243101157812-buqmu87v5eoclk1jd0is4kuvov730acv.apps.googleusercontent.com` in `once-4f584` GCP project — no app code change needed (the in-code `webClientId` stays the same; the Android client just registers the package+SHA-1 so Google Sign-In can authenticate the app).

### Initial Android AAB published to Play Internal Testing (1.0.0 (4))

- **Status:** Done (2026-05-08)
- **Added:** 2026-05-07
- **Why:** First step toward Android testers being able to install.
- **Notes:** Built via `eas build --platform android --profile production`. Removed `expo-image-picker` because nothing in the codebase used it but its plugin was adding `android.permission.CAMERA` (Google Play required a privacy-policy declaration for it). RECORD_AUDIO permission stays — used by voice messages. Privacy Policy URL declared at `https://aviramo.github.io/once-app/privacy`. The published build crashes on launch on the user's device — see the open "Android available on Play Internal Testing" task for the rebuild.

### Identified the real cause of the cross-platform launch crash (env vars, not TurboModules)

- **Status:** Done (2026-05-09)
- **Added:** 2026-05-09
- **Why:** Both iOS Beta Review and Play Internal Testing builds crashed on launch. Initial hypothesis was a TurboModule under the new architecture exception path on iOS 26.4.2; we wrapped `I18nManager` and `Notifications.setNotificationHandler` in try/catch as a defensive guess.
- **Notes:** Real cause found via `adb logcat`: `[Error: supabaseUrl is required.]` followed by an expo-router `Cannot read property 'ErrorBoundary' of undefined`. The supabase client init in `mobile/src/lib/supabase.ts` reads `process.env.EXPO_PUBLIC_SUPABASE_URL` at module load. EAS production environment had no env vars (the local `mobile/.env` is git-ignored and doesn't sync to EAS). Fixed by `cp mobile/.env mobile/.env.local && eas env:push production && rm mobile/.env.local`. Defensive try/catch wrappers reverted; CLAUDE.md "Pending mobile work" rewritten to document the env-var pitfall.
