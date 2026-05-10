# Once — Google Play store listing pack

All assets and copy needed to fill in **Play Console → Grow users → Main store listing**.

Default language: **Hebrew (Israel) — he-IL**. Add English (United States) — en-US — as a translation afterwards.

---

## Assets on disk

| Field in Play Console | File |
|---|---|
| App icon (512×512 PNG) | `mobile/assets/once-512.png` |
| Feature graphic (1024×500 PNG) | `store-listing/feature-graphic-he.png` |
| Phone screenshot 1 — hero / auth | `store-listing/screenshot-1-hero.png` |
| Phone screenshot 2 — home (one candidate) | `store-listing/screenshot-2-home.png` |
| Phone screenshot 3 — incoming invitation | `store-listing/screenshot-3-invitation.png` |
| Phone screenshot 4 — chat | `store-listing/screenshot-4-chat.png` |
| Phone screenshot 5 — viewers | `store-listing/screenshot-5-viewers.png` |

All screenshots are 1080×1920 (9:16). Play Console accepts 320–3840 px on each side.

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
   - App icon → upload `mobile/assets/once-512.png`.
   - Feature graphic → upload `store-listing/feature-graphic-he.png`.
   - Phone screenshots → upload all five `screenshot-*.png` files in order (1 → 5).
5. Save → Play Console requires the page to pass validation before you can submit the change for review.
6. After saving the Hebrew listing, click **Manage translations → Add your own translations**, pick *English (United States)*, and paste the English copy + reuse the same graphics.

---

## Regenerating assets

If you want to tweak copy/layout, both PowerShell scripts are checked in:

- `store-listing/make-feature-graphic.ps1` → produces `feature-graphic-he.png`
- `store-listing/make-screenshots.ps1` → produces all 5 `screenshot-*.png`

Both scripts have a UTF-8 BOM. Don't strip it — PowerShell 5.1 needs it to read Hebrew correctly.
