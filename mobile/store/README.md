# Once — store pack

Everything the app stores need, in one place: the Play listing copy, the graphics, the
generators that draw them, and the App Review captures under [apple-review/](apple-review/).

The Play half of this file is all assets and copy needed to fill in
**Play Console → Grow users → Main store listing**.

Default language: **Hebrew (Israel) — he-IL**. Add English (United States) — en-US — as a translation afterwards.

---

## Assets on disk

| Field in Play Console | File |
|---|---|
| App icon (512×512 PNG) | `mobile/store/once-512.png` |
| Feature graphic (1024×500 PNG) | `mobile/store/play-feature-graphic.png` |
| Phone screenshot 1 — one person at a time | `mobile/store/google/screenshot-1-one-person.png` |
| Phone screenshot 2 — sending an invitation | `mobile/store/google/screenshot-2-invite.png` |
| Phone screenshot 3 — ten minutes, the clock running | `mobile/store/google/screenshot-3-timer.png` |
| Phone screenshot 4 — an invitation that arrived | `mobile/store/google/screenshot-4-incoming.png` |
| Phone screenshot 5 — friends and shared circles | `mobile/store/google/screenshot-5-circles.png` |
| Phone screenshot 6 — the conversation it ends in | `mobile/store/google/screenshot-6-chat.png` |

The same six frames exist per store, each **drawn** at that store's size (never an
upscale of the other):

| Folder | Size | Where it goes |
|---|---|---|
| `mobile/store/google/` | 1080×1920 (9:16) | Play Console phone screenshots (accepts 320–3840 px per side) |
| `mobile/store/apple/` | 1284×2778 | App Store Connect, 6.5"/6.7" portrait |

App Store Connect accepts 1242×2688, 2688×1242, 1284×2778 or 2778×1284 for these
sizes; the portrait 1284×2778 set here is the one to upload.

Each screenshot is a Hebrew headline over a phone whose screen is a **real capture off
the running app** (user directive 2026-08-02), not a drawing of it. The captures live
in [shots/](shots/) and were taken on `emulator-5554` at 1080×2400 with the app in
Hebrew; the generator only draws the frame around them. Three of the six are a popup
standing open, because that is where the app says what it has to say — the message,
what it costs and the one thing to do about it.

The demo state behind the captures is on the **test partition** (`is_test = true`) and
was shaped so what the screens show is rich and true: the candidate stands at the
viewer's own point, so the proximity row reads "כאן ועכשיו" rather than a distance in
kilometres; she shares three circles and two mutual friends with him; her height,
smoking, kids' ages and a free weekend are all filled in; and every name and bio in the
partition is Hebrew.

---

## Hebrew listing (default — he-IL)

**App name (≤30):**
```
Once
```

**Short description (≤80):**
```
מפגש אחד בזמן אמת. בלי קטלוג. בלי צ'אטים אינסופיים.
```

**Full description (≤4000):**
```
מפגש אחד בזמן אמת.

Once היא אפליקציית הכרויות מסוג חדש: בלי קטלוג של פרופילים, בלי צ'אטים מקבילים, ובלי תחושה שאתם עוד אופציה ברשימה.

האפליקציה בנויה למפגש אחד אמיתי בכל פעם, עם אדם אחד שגם נמצא כרגע באפליקציה ובסביבה שלכם.

איך זה עובד?
• פותחים את האפליקציה ורואים אדם אחד קרוב אליכם, בזמן אמת.
• אם מתחבר לכם, שולחים הזמנה.
• אם גם הצד השני מאשר, נפתחת שיחה אישית בלעדית לשניכם.
• אם לא, ממשיכים הלאה ופוגשים מישהו חדש.

מה שונה ב-Once?
✦ קשר של אחד על אחד. כשנוצר חיבור, הוא בלעדי לשניכם. אין שיחות מקבילות, אין תחרות על תשומת לב.
✦ מהמסך למציאות. כשיש סנכרון בין שניכם, הקשר הופך למפגש אמיתי, כאן ועכשיו.
✦ אתם שולטים. אתם בוחרים מתי לחפש ואת מי להזמין. קיבלתם פנייה? אתם מחליטים אם לאשר.
✦ הסכמה הדדית תמיד. רק כשגם אתם וגם הצד השני מעוניינים, הקשר נוצר.

המאפיינים העיקריים:
• מציאת אנשים בקרבת מקום בזמן אמת
• הזמנות עם אישור הדדי בלבד
• צ'אט אישי וסגור עם הודעות טקסט, תמונות, הודעות קוליות ומיקום
• פרופיל פשוט ומכבד: תמונות, קצת עליך, ופרטים על משפחה וזמינות (אופציונלי)
• פרטיות מלאה: אין רשימות, אין דירוגים, אין דברים מאחורי הגב

Once היא דרך אחרת להכיר. שווה לנסות.
```

---

## English listing (en-US — add as translation)

**App name (≤30):**
```
Once
```

**Short description (≤80):**
```
One real meeting, in real time. No catalog. No endless chats.
```

**Full description (≤4000):**
```
One real meeting, in real time.

Once is a different kind of dating app: no catalog of profiles, no parallel chats, and no feeling that you're just another option on someone's list.

It's built for one real meeting at a time, with one person who's actually nearby and on the app right now.

How it works:
• Open the app and see one person close to you, in real time.
• If you're interested, send an invitation.
• If they accept, a private chat opens, just for the two of you.
• If not, move on and discover someone new.

What makes Once different:
✦ One-on-one connection. When a connection forms, it's exclusive to the two of you. No parallel chats, no competition for attention.
✦ From screen to real life. When both sides sync up, the connection turns into a real meeting, here and now.
✦ You're in control. You choose when to search and who to invite. Got an invitation? You decide whether to accept.
✦ Always mutual consent. A connection only forms when both sides are interested.

Key features:
• Find nearby people in real time
• Invitation flow with mutual approval only
• Private one-on-one chat with text, photos, voice messages, and location
• Simple, respectful profile: photos, a short bio, and optional family/availability info
• Full privacy: no lists, no ratings, no behind-the-back behavior

Once is a different way to meet. Worth trying.
```

---

## Upload steps

1. Open Play Console → app **Once** → left nav: **Grow users → Main store listing**.
2. Set **Default language** to *Hebrew (Israel) — he-IL*.
3. Paste the Hebrew **App name**, **Short description**, **Full description** from the section above.
4. **Graphics:**
   - App icon → upload `mobile/store/once-512.png`.
   - Feature graphic → upload `mobile/store/play-feature-graphic.png`.
   - Phone screenshots → upload all four `google/screenshot-*.png` files in order (1 → 4).
5. Save → Play Console requires the page to pass validation before you can submit the change for review.
6. After saving the Hebrew listing, click **Manage translations → Add your own translations**, pick *English (United States)*, and paste the English copy + reuse the same graphics.

---

## Regenerating assets

Both generators are checked in:

- `node mobile/store/make-screenshots.mjs` → produces all 6 `screenshot-*.png` in
  **both** `google/` (1080×1920) and `apple/` (1284×2778) from the captures in
  `shots/`. The frame is authored in a 1080-wide design space: the headline block and
  margins scale with the frame width, and the phone takes the height that is left,
  keeping the CAPTURE's own aspect so no pixel of the screen is cropped or stretched.
  Adding a store size is one entry in `TARGETS` at the top of that file.
  Renders HTML/CSS through headless Chrome (so Hebrew shaping and RTL are the
  browser's job), embedding the app's Noto Sans Hebrew faces from
  `mobile/node_modules/@expo-google-fonts`. Headline copy and which capture each frame
  takes live at the top of that file.

  **When the app's screens change, re-capture** — the frame is the only thing this
  script draws. The screen comes out ~1040px wide at App Store size and ~690px at Play
  size, so a 1080-wide capture is downscaled into both; a higher device resolution is
  welcome, a lower one is not.
- `node mobile/scripts/build-feature-graphic.mjs` → writes both
  `play-feature-graphic.svg` and `.png` here: the feature graphic, purple on white,
  matching the app icon and these screenshots. The landing page draws the same
  picture from its own elements in `web/public/art.js`; the two are separate files,
  so a change to one is not a change to the other.

---

## Apple App Review

Not to be confused with [apple/](apple/), which is the four **listing** screenshots at
App Store size. [apple-review/](apple-review/) holds the demo-video captures for App Review, plus its own
README describing each frame and the demo state applied to the live DB. Those are real
captures from the running app on the owner's account, so they carry family photos and are
deliberately **left untracked by git** — do not `git add` that folder.
