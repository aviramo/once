# Once — סט בדיקות מקיף (QA Test Suite)

מסמך בדיקות ידניות מקצה לקצה לכל האפליקציה: מכל דרכי ההגעה (הורדה חופשית, referral, הזמנת חבר, הזמנה מקבוצה), דרך התחברות ו-onboarding, המשחק (page1/page2), מחזור ההזמנה המלא, הצ'אט על כל סוגי ההודעות, סיום/עזיבה/חסימה/דיווח, קרדיטים, הרשאות ושערים (gates), קרון (sweeps), והתראות push.

המסמך נגזר מקוד המקור החי: `supabase/functions/app/index.ts`, גופי ה-RPC ב-`supabase/migrations/`, `supabase/functions/ext/index.ts` (קרון), `supabase/functions/global.ts` (קטלוג push), ולקוח המובייל תחת `mobile/`.

> הערת גרסאות: שמות קבצי המיגרציה המקומיים לא תמיד תואמים להיסטוריה החיה. כל בדיקה שמסתמכת על גוף RPC צריכה להיבדק מול ה-DB החי (`pg_get_functiondef`). מסומנות במסמך כמה נקודות שבהן הקוד החי סוטה מהערות/ברירות מחדל ישנות (למשל עלות ביטול, ברירת מחדל של ארנק).

---

## 0. סביבת בדיקה והכנות

### 0.1 חשבונות בדיקה ובידוד (חובה לקרוא לפני שמתחילים)

- קיים דגל `users.is_test` (boolean, NOT NULL, default false). `others()` אוכף `other.is_test = COALESCE(me.is_test,false)` לכל קורא. כלומר **משתמש בדיקה מותאם רק למשתמשי בדיקה אחרים, ומשתמש רגיל רק לרגילים** — סימטרי, בלי דליפה. זה מאפשר להריץ בדיקות מול production בלי לחשוף בודקים למשתמשים אמיתיים ולהיפך.
- מסקנה תפעולית: **כל חשבונות הבדיקה שמשתתפים בזוג/מפגש חייבים להיות `is_test = true`**. אחרת הם לא יראו זה את זה (וגם לא יראו משתמשים אמיתיים). ודאו את הדגל לפני כל תרחיש התאמה.
- Referral/friend-link בין שני חשבונות בדיקה **כן** משלמים קרדיט (בכוונה, לצורך בדיקה במכשיר). referral/friend-link בין partitions שונים (test↔real) — הקרדיט מדולג בשקט.

### 0.2 כניסת סוקר (App Store / Play reviewer)

- Endpoint: `POST functions/v1/review-login` עם `{email:"review@once.app", code:"once-review-7Fq2"}` (ראו `supabase/functions/review-login/index.ts`).
- מחזיר OTP חד-פעמי → הלקוח משלים `verifyOtp`. החשבון מזורע כחבר מאושר בקבוצת "בדיקה" (`app_review_seed`), הוא חשבון `is_test`, בלי הרשאות אדמין.
- בלקוח: בטופס ההתחברות מקלידים את המייל `review@once.app` → נחשף שדה קוד → `signInWithReview(code)`.

### 0.3 מטריצות רוחב שיש להריץ על כל בדיקה רלוונטית

- **מגדר**: זכר/נקבה עבור המשתמש עצמו וגם עבור הצד השני. חלק גדול ממחרוזות ה-i18n הן gendered (`_m`/`_f`, וגם `_mm/_mf/_fm/_ff` לזוגות). ראו `mobile/src/i18n/he.ts`.
- **RTL / עברית**: כל המסכים בעברית RTL. יש לוודא כיווניות (hamburger בפינת START, close-X בפינת START, שם/גיל בפינת END).
- **שפה**: he (ברירת מחדל) ו-en.
- **פלטפורמה**: כרגע Android-only בהפצה (Apple לא פעיל בפועל). iOS נבדק רק אם מבקשים במפורש.
- **התראות/דחייה של push** ו-**התראות em dash**: אין em dash במחרוזות i18n (כלל פרויקט).

### 0.4 מוסכמות המסמך

- כל בדיקה: `TC-<אזור>-<מס'>`, עם **תנאי קדם**, **צעדים**, **תוצאה צפויה**.
- "פעולה" = קריאת `POST /app/<action>` → RPC `app_<action>`.
- שערי dispatcher: `requiresPresence=[find,invite,add,approve]` → 403 `unavailable` כשלא זמין; `requiresProfile=[invite,add]` → 403 `profile_incomplete` בלי פרופיל בנוי.

---

## 1. התחברות ו-Boot Routing

מקורות: `mobile/app/index.tsx`, `_layout.tsx`, `login.tsx`, `LoginForm.tsx`, `login-callback.tsx`, `authStore.ts`, `userStore.ts`, `authRedirect.ts`.

שני שערי ניתוב:
- `selectNeedsAccount` = אין profile / אין name / אין birth_date → `/onboarding` (השער הקשיח היחיד לפני `/home`).
- `selectProfileBuilt` = יש bio לא ריק → "חבר מלא" (שולט על היכולת להיראות/להזמין, לא על הניתוב).

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-AUTH-01 | התחברות Google | מהמסך הראשי → "התחברות עם Google" → בחירת חשבון | session נוצר → onAuthStateChange → ניתוב. משתמש חדש → onboarding; קיים ובנוי → home |
| TC-AUTH-02 | ביטול Google | פותחים בורר Google ומבטלים | חוזרים לטופס בלי שגיאה (`type==='cancelled'`), הכפתור לא תקוע |
| TC-AUTH-03 | Google בלי idToken | לדמות תשובה בלי idToken | נזרקת שגיאה `No idToken from Google`, מטופלת בחן |
| TC-AUTH-04 | Apple (iOS בלבד) | ב-iOS: "התחברות עם Apple" | session נוצר. ב-Android הכפתור לא מוצג (`showApple=false`) |
| TC-AUTH-05 | Apple ביטול | ביטול הדיאלוג | `ERR_REQUEST_CANCELED` נבלע, אין קריסה |
| TC-AUTH-06 | Email magic link — שליחה | הזנת מייל תקין → "שליחת קישור התחברות" | מסך אישור `auth.linkSent` עם `{email}`; אפשרות לשליחה חוזרת |
| TC-AUTH-07 | מייל לא תקין | הזנת "abc" → שליחה | הודעת `auth.invalidEmail`, לא נשלח |
| TC-AUTH-08 | חזרה מ-magic link | לחיצה על הקישור במייל → `once://login-callback#access_token=...` | `consumeMagicLinkUrl` מפענח fragment/query → setSession → ניתוב ל-home/onboarding. מסך `login-callback` הוא ספינר בלבד |
| TC-AUTH-09 | fragment לא נחשב invite | קישור magic-link שיש בו טוקן דמוי-קוד | `linkPath()` מסיר `#` לפני זיהוי invite — לא נבלע כ-invite |
| TC-AUTH-10 | כניסת סוקר | הקלדת `review@once.app` → שדה קוד → `once-review-7Fq2` | OTP → verifyOtp → נכנס כחבר קבוצת "בדיקה", `is_test` |
| TC-AUTH-11 | כניסת סוקר קוד שגוי | קוד שגוי | `review_failed` / 401 `invalid` |
| TC-AUTH-12 | טוקן פג/מבוטל ב-boot | הפעלה עם refresh token מת | fetchProfile מקבל 401/403/PGRST301 → signOut(scope:'local') → נוחתים ב-`/login`, לא בלולאת onboarding |
| TC-AUTH-13 | getSession תקוע | לחסום את הרשת בעליית האפליקציה | טיימאאוט 5 שניות → setUser(null) → `/login` |
| TC-AUTH-14 | flake רשת בטעינת פרופיל | שגיאה חולפת ב-fetch | ריטריי ×2 (backoff 400ms) ואז ממשיך; `fetched` תמיד מסתיים true |
| TC-AUTH-15 | overlay נגד ריצוד | כניסה עם עיכוב fetch | overlay בז' (`authHandoff`) מכסה את `/login` עד שהפרופיל נטען, בלי הבהוב |
| TC-AUTH-16 | sign-out מקומי בלבד | התנתקות במכשיר A | `scope:'local'` — מכשיר B נשאר מחובר; מנקה store, realtime, push, caches |
| TC-AUTH-17 | משתמש חצי-onboarded | חשבון קיים בלי bio → הפעלה | נוחת ב-`/home` (לא תקוע ב-onboarding); CTA לבניית פרופיל זמין |

---

## 2. Onboarding

מקור: `mobile/app/onboarding.tsx`. Pager אנכי בן 5 שלבים (`TOTAL_STEPS=5`). כניסה ראשונה מתחילה בשלב 1; כניסה חוזרת לבניית פרופיל (יש חשבון, אין bio) מתחילה בשלב 5 אם `images>=2` אחרת שלב 4.

| ID | שלב/תרחיש | צעדים | תוצאה צפויה |
|----|-----------|--------|--------------|
| TC-OB-01 | שלב 1 מגדר | בחירת גבר/אישה | בחירה מתקדמת אוטומטית לשלב 2; חובה לבחור |
| TC-OB-02 | שלב 2 שם | הקלדת שם | תקין רק אם `trim().length>=2`, `maxLength=30` |
| TC-OB-03 | שלב 3 תאריך לידה — סדר | בדיקת סדר שדות | he: dd,mm,yyyy · en: mm,dd,yyyy; clamp חי לכל שדה |
| TC-OB-04 | שלב 3 גיל מינימלי | הזנת גיל <18 | `dateValid=false`; הודעה "גיל מינימלי להרשמה הוא 18". תקין: 18<=גיל<=120 |
| TC-OB-05 | אישור תאריך לידה | לחיצה על "צור חשבון" | ConfirmDialog מציג את התאריך במילים ("13 באוקטובר") + גיל מודגש; אישור → `app/account` |
| TC-OB-06 | יצירת חשבון (שרת) | אישור שלב 3 | `User.insert`: `is_for_male=!is_male`, טווחי גיל דיפולטיביים לפי מגדר, `range=NULL`, `relations=default`; trigger `users_fill_referral_code` מזריע `referral_code` 7 תווים |
| TC-OB-07 | דילוג לפרופיל | אחרי שלב 3 | נוחתים ב-`/home`, אפשר לגלוש; תמונות/bio לא נכפים כאן |
| TC-OB-08 | שלב 4 תמונות | הוספת תמונות | חובה `>= MIN_PHOTOS=2`, עד `MAX_PHOTOS=6`; העלאה נדחית ל-flush בשלב 5 (`deferUpload`) |
| TC-OB-09 | שלב 5 bio | הקלדת תיאור | חובה `>= BIO_MIN=20`, עד `BIO_MAX=150`; שמירה מריצה `flush()` של תמונות ואז `app/profile {bio}` |
| TC-OB-10 | כשל העלאת תמונות | להכשיל את ה-flush | חזרה לשלב 4 (`failToPhotoStep`); "העלאת התמונות נכשלה. בלי תמונה אי אפשר להמשיך" |
| TC-OB-11 | פרופיל בלי תמונה | flush מסתיים אך `images<1` | חזרה לשלב 4 |
| TC-OB-12 | referral qualify בשמירת פרופיל | סיום שלב 5 | `app_referral_qualify` נורה fire-and-forget (זיכוי המזמין אם המשתמש חצה סף תמונה) |
| TC-OB-13 | חזרה בין שלבים | pan-down / back | חזרה מותרת בשלבים 2/3/5; שלבים 1 ו-4 אין back; close-X (שלבים 4/5) יוצא ל-home |
| TC-OB-14 | נירמול bio | bio עם שורות ריקות | `normalizeBio` מכווץ רצף שורות לאחת |
| TC-OB-15 | אין שלבי משפחה/מיקום/התראות ב-onboarding | לעבור את כל 5 השלבים | משפחה נערכת בהגדרות; הרשאות מיקום/התראות נדרשות ב-home. אין שלב ייעודי ל-onboarding |

---

## 3. דרכי הגעה / רכישה (Entry Paths)

מקורות: `referral.ts`, `communities.ts`, `links.ts`, `+native-intent.tsx`, `web/src/proxy.ts`, `web/public/*`, מיגרציות referral/friend/group.

קבועי פרמטרים חייבים להיות מסונכרנים בין `proxy.ts`/`invite.js`/`store.js`/`referral.ts`: `ref` (referral), `f` (friend flag), `grp` (group). `PLAY_STORE_URL=…?id=com.aviramo.once`, `BRAND_SITE=https://once-lake.vercel.app`.

### 3.A הורדה חופשית / אורגנית

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-ENTRY-A01 | התקנה אורגנית | התקנה ללא referrer → פתיחה → התחברות → onboarding → home | `claimInstallReferral()` (אחרי `app/start`) מקבל `utm_medium=organic`/null → כותב `referralClaimed='done'`, לא שואל שוב |
| TC-ENTRY-A02 | `app/start` ראשוני | אחרי מתן הרשאות | נשלח `app/start {location?, push_token?, notif_perm, os, lang}`; re-seed של page2 מ-`locked/logout`; recompute availability; auto-`app_find` אם idle+available |
| TC-ENTRY-A03 | seed viewer | פרופיל בנוי, זמין, 0 צופים | `app_seed_viewer` מזריע צופה יחיד; משתמש שלא-בנוי לעולם לא מזורע צופה |
| TC-ENTRY-A04 | Expo Go / sideload | אין מודול native ל-InstallReferrer | no-op בחן, `referralClaimed='done'` |

### 3.B Referral (Play Install Referrer, `/i/<CODE>`)

מזהה = ה-`referral_code` של המזמין. שיתוף מ-שורת ההזמנה (`credits.invite.shareText` + URL). Web: Android → redirect ל-Play עם `referrer=ref=<CODE>`; אחר → `download.html`.

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-ENTRY-B01 | referral תקין (Android) | פתיחת `/i/<CODE>` באנדרואיד → Play → התקנה → פתיחה | `parseReferralCode` (uppercase, `[A-Z0-9]{4,16}`) → `app/referral {code, source:'play_referrer'}` |
| TC-ENTRY-B02 | attach ראשוני | קריאת `app_referral_attach` | מוסיף שורת `referrals(inviter,invitee,code,source)`; `unique(invitee_id)` = מזמין אחד לתמיד |
| TC-ENTRY-B03 | כבר נדרש | לקרוא referral שוב (re-install) | `outcome:'already'` (idempotent, לא שגיאה) |
| TC-ENTRY-B04 | קוד לא קיים | קוד שגוי | `error 'bad_code'` (שקט, לא מוצג למשתמש) |
| TC-ENTRY-B05 | self-referral | פתיחת הקוד של עצמך | `error 'self_referral'` |
| TC-ENTRY-B06 | מאוחר מדי | חשבון בן >14 יום | `error 'too_late'`; המונה עדיין מתקדם עד `MAX_ATTEMPTS=3` |
| TC-ENTRY-B07 | תשלום (qualify) | ה-invitee משלים פרופיל (name+birth_date+>=1 image) | `_referral_settle` → `credited`; +1 ל-`credits.extra` של המזמין; push `referral` |
| TC-ENTRY-B08 | invitee לא משלים | נשאר בלי תמונה | `incomplete`, אין תשלום |
| TC-ENTRY-B09 | תקרה יומית | מזמין שעבר 10 זיכויים ביום | `capped` (מזוהה אך לא מזוכה, ינסה שוב) — `_referral_daily_cap()=10` סביב 20:00 Asia/Jerusalem |
| TC-ENTRY-B10 | test↔real | מזמין ו-invitee ב-partitions שונים | דילוג שקט (`skipped`) |
| TC-ENTRY-B11 | attribution שקוף | לעבור onboarding אחרי referral | אין שדה קוד בשום מקום ב-onboarding; ה-invitee לא רואה כלום |
| TC-ENTRY-B12 | דסקטופ/iPhone `/i/` | פתיחה שלא באנדרואיד | rewrite ל-download; התקנה לא-מיוחסת (מנגנון referrer הוא Android-only) |

### 3.C הזמנת חבר (`/f/<CODE>`, friend-link)

מזהה = אותו `referral_code`. path שונה כדי להבדיל מ-credit-referral.

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-ENTRY-C01 | deep link (מותקן) | פתיחת `once://f/<CODE>` | `parseFriendInviteCode` → `linkFriendByCode` → `app/friend_link {code}`; home פותח Communities בתצוגת חברים |
| TC-ENTRY-C02 | fallback התקנה טרייה | `/f/` בלי אפליקציה → download → Play | `store.js` אורז `referrer=ref=<CODE>&f=1`; בהפעלה: **קודם** friend-link ואז `app/referral` (זיכוי) |
| TC-ENTRY-C03 | קישור חדש | `app_friend_link_by_code` | מוסיף `friend_links(a=LEAST,b=GREATEST,via='referral')` ON CONFLICT DO NOTHING; `status:'linked'` |
| TC-ENTRY-C04 | כבר חברים | לקשר שוב | `status:'already'`, אין זיכוי חוזר |
| TC-ENTRY-C05 | הקישור של עצמך | לפתוח `/f/<my_code>` | `status:'self'` (no-op מוצלח), נוחת נקי ברשימת חברים |
| TC-ENTRY-C06 | זיכוי דו-צדדי | חיבור חדש בין A ל-B | +1 ל-`credits.extra` של **שני הצדדים**, פעם אחת לכל זוג לתמיד (`friend_credits` PK), **בלי תקרה יומית** |
| TC-ENTRY-C07 | ניקוי בקשות תלויות | חיבור עם friend_request פתוח | הבקשות בשני הכיוונים מנוקות; push `friend_link` למזמין רק בקישור חדש |
| TC-ENTRY-C08 | i18n תגמול | הודעת "על כל חבר שמתחבר, שניכם מקבלים קרדיט נוסף" | מוצג בשורת ההזמנה |

### 3.D הזמנה מקבוצה (`/g/<TOKEN>`, קודי 6 ספרות, שער אישור)

שני צורות קוד: token עמום ב-deep link `/g/<TOKEN>` (6 ספרות); `invite_code` מאוחסן (6 ספרות או slug) לחיפוש-הצטרפות. ה-RPC מקבל כל קוד עד 64 תווים.

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-ENTRY-D01 | deep link מותקן | `once://g/<TOKEN>` | `redeemInvite` → `app/redeem_invite {code}`; home פותח את הhub |
| TC-ENTRY-D02 | התקנה טרייה | `/g/` → download → Play (`grp=<TOKEN>`) | `parseGroupToken` (`^\d{6}$`) → redeem; **לא נבלע** — כשל משאיר `referralClaimed` ריק לניסיון חוזר |
| TC-ENTRY-D03 | הצטרפות פתוחה | קוד קבוצה ללא אישור | `user_groups` נוצר; recompute availability; `join_status:'joined'` |
| TC-ENTRY-D04 | הצטרפות עם אישור | קבוצה `requires_approval`, לא staff | `group_join_requests` (ON CONFLICT DO NOTHING); `'pending'`; push `group_join` לכל owner+managers; **אין שינוי חברות עד אישור** |
| TC-ENTRY-D05 | כבר חבר | redeem לקבוצה שאני בה | `'already'` |
| TC-ENTRY-D06 | staff bypass | owner/manager redeem לקבוצה שלו הגייטד | מצטרף ישירות (`joined`) |
| TC-ENTRY-D07 | קוד לא תקין | קוד ריק / >64 / לא קיים | `no_code` (dispatcher) / `invite_invalid`; בנתיב deep-link — נבלע בשקט |
| TC-ENTRY-D08 | UI Pending | אחרי הצטרפות ממתינה | ה-hub מציג שורת "ממתין לאישור"; פתיחתה → confirm ביטול |
| TC-ENTRY-D09 | push deep-link | הקשה על התראת `group_join`/`group_approved` | פותח את הקבוצה ב-hub לפי `group_id` |

### 3.E ניתוב deep-link (cold vs warm)

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-ENTRY-E01 | invite כ-data ולא יעד | `+native-intent redirectSystemPath` מקבל invite URL | מחזיר null — לא מנווט; cold-start עולה בשורש, קישור תוך-session לא מזיז מסך (שומר צ'אט/גלילה) |
| TC-ENTRY-E02 | sink יחיד | כל URL נכנס | `_layout.tsx` listener מריץ `consumeMagicLinkUrl` וגם `stashInviteUrl` |
| TC-ENTRY-E03 | סדר cold | טוקן ב-cold start | redeem מסתיים לפני mount של home → תוצאה מוחזקת (`heldOutcome`) ומועברת כש-`watchInvites` נרשם |
| TC-ENTRY-E04 | single-flight | שני invites במהירות | `flushPendingInvite` single-flight (`inFlight`), מנסה שוב כשאין session |
| TC-ENTRY-E05 | fallback +not-found | כשל native-intent | invite URL מקפיץ ל-boot, home נטען מחדש, invite עדיין redeemed |
| TC-ENTRY-E06 | פרוק group/friend | קישור מעורפל | `stashInviteUrl` מנסה group token קודם, אחרת friend code |

---

## 4. קהילות וחברים

מקורות: `CommunitiesPage.tsx`, `communities.ts`, מיגרציות communities/friends. פעולות: `create_group`, `owned_groups`, `group_members`, `remove_member`, `set_manager`, `update_group`, `delete_group`, `search_groups`, `group_requests`, `respond_join`, `my_groups`, `leave_group`, `cancel_join`, `my_friends`, `search_people`, `friend_request`, `friend_respond`, `unfriend`, `shared_groups`.

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-COMM-01 | יצירת קבוצה | Communities → "יצירת קבוצה" → שם + פומבי/פרטי + תיאור + דרישת אישור | `app_create_group`; שם ריק/>60 → `bad_name`; תיאור >300 → `bad_description`; מזריע `invite_code` 6 ספרות; היוצר → owner+manager |
| TC-COMM-02 | פרטית מול פומבית | יצירת פרטית | לא מופיעה בחיפוש; משתפים קישור ידנית. פומבית ניתנת לחיפוש |
| TC-COMM-03 | שיתוף קישור הזמנה | קבוצה פומבית → "שיתוף קישור הזמנה" | `Share.share` עם `communities.shareMessage`; לפרטית אין קוד לשיתוף |
| TC-COMM-04 | עדכון קבוצה | הגדרות → שם/פומביות/תיאור/דרישת אישור | `app_update_group`; `no_group_id`/`not_manager`/`bad_name`/`bad_description`; מפתח `description` בגוף = "לקבוע" (מחרוזת או null לניקוי) |
| TC-COMM-05 | מחיקת קבוצה | "מחיקת הקבוצה" → confirm | `app_delete_group`; מוחק את הקבוצה וכל החברויות, לא הפיך |
| TC-COMM-06 | רשימת חברים | פתיחת קבוצה שאני מנהל | `app_group_members`; owner/manager מסומנים |
| TC-COMM-07 | הסרת חבר | "הסרה מהקבוצה" | `app_remove_member`; trigger cascade מנקה גם group_managers grant |
| TC-COMM-08 | מינוי/הסרת מנהל | "מינוי כמנהל"/"הסרת ניהול" | `app_set_manager {make}` |
| TC-COMM-09 | בקשות הצטרפות (staff) | קבוצה עם אישור → סעיף בקשות | `app_group_requests`; `not_manager` guard |
| TC-COMM-10 | אישור/דחיית בקשה | אישור → הצטרפות + push; דחייה → שקט | `app_respond_join {accept}`; אישור → `user_groups`, recompute availability, push `group_approved`; שניהם מוחקים את השורה |
| TC-COMM-11 | ביטול בקשה | מבקש מבטל | `app_cancel_join`; idempotent, שקט |
| TC-COMM-12 | עזיבת קבוצה | "עזיבת הקבוצה" | `app_leave_group`; idempotent (עזיבת קבוצה שלא בה = no-op מוצלח) |
| TC-COMM-13 | הקבוצות שלי | פתיחת "הקבוצות שלי" | `app_my_groups` מחזיר רשימה מעודכנת |
| TC-COMM-14 | חיפוש קבוצות | חיפוש טקסט | `app_search_groups`; רק קבוצות פומביות; מסודר לפי גודל; אופטימי בהצטרפות, rollback על `invite_invalid` |
| TC-COMM-15 | החברים שלי | Communities → "החברים שלי" | `app_my_friends`; בקשות + חברים |
| TC-COMM-16 | חיפוש אנשים | "שיוך חבר קיים" → חיפוש שם | `app_search_people`; מצבי request/requested/alreadyFriend |
| TC-COMM-17 | בקשת חברות | שליחת בקשה | `app_friend_request`; push `friend_request` ליעד |
| TC-COMM-18 | מענה לבקשה | אישור/דחייה | `app_friend_respond {accept}`; אישור → push `friend_accept` למבקש |
| TC-COMM-19 | הסרת חבר | "הסרה" → confirm | `app_unfriend` |
| TC-COMM-20 | קבוצות משותפות | פתיחת צ'יפ קבוצה בכרטיס | `app_shared_groups {user_id}` — כל הקבוצות שהזוג חבר בהן, עם owner + ספירת חברים |
| TC-COMM-21 | boost רלוונטיות חברים | חבר של המשתמש בבריכת המועמדים | חברים נראים בעדיפות גבוהה, עם סימון "חבר משותף" |

---

## 5. מסך הבית — מצבים והרשאות (Gates)

מקור: `home.tsx`. `centerNotice` הוא מקור אמת יחיד; עדיפות: **isPermMode → geoGated**. כשיש notice חוסם ואינו `waiting`/`chat` — הכרטיס מוסר וה-notice תופס מרכז.

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-GATE-01 | אין התראות | `notifPerm!=='granted'` | פעמון + "נדרשת גישה להתראות"; הקשה → בקשת notif ואז מיקום; דחייה → הגדרות OS; polling כל 3ש' (`app/notif`) |
| TC-GATE-02 | אין מיקום | `locPerm!=='granted'` ולא custom | MapPin + "נדרשת גישה למיקום"; הקשה → בקשה/הפעלת שירותים/הגדרות; polling כל 2ש'; אובדן הרשאה → `app/location {location:null}` (יציאה מהבריכה) |
| TC-GATE-03 | כשל GPS | `locFailed` | MapPin + "מיקום לא זמין"; הקשה → `handleLocRetry` (`app/location`) |
| TC-GATE-04 | אין אינטרנט | `netReachable===false` | WifiOff + "אין חיבור לאינטרנט"; הקשה → retry; polling 3ש' |
| TC-GATE-05 | geo-gate push | token מת, notif granted | פעמון + "נדרשת גישה להתראות" → `handlePermissionRequest` |
| TC-GATE-06 | geo-gate not_yet | אזור מתוזמן | "נפתח באזורך {date}" (DD/MM HH:MM מ-`starts_at`); avatar עצמי; טיימר מקומי משחרר כש-`starts_at` עובר |
| TC-GATE-07 | geo-gate unavailable | מחוץ לאזור | "האפליקציה לא זמינה באזורך"; הקשה → תצוגת פרופיל |
| TC-GATE-08 | תפריט לעולם לא gated | במצב gated כלשהו | hamburger + settings נגישים תמיד (המשתמש חייב להגיע להגדרות מיקום) |
| TC-GATE-09 | gate חוסם find/invite | קריאת `app/find`/`invite`/`add`/`approve` כ-gated | 403 `unavailable` (השרת סוגר את הלולאה גם ללקוחות ישנים) |
| TC-GATE-10 | פעולות teardown לא-gated | `clear1/clear2/decline/cancel/leave/block/free2/lock2/pause/logout/ignore` כ-gated | מותרות (חייבים לצאת ממצב תקוע) |
| TC-GATE-11 | build-profile gate | ניסיון invite בלי bio/תמונה | 403 `profile_incomplete`; ב-UI: popup "בנה קודם פרופיל" → `/onboarding` |
| TC-GATE-12 | startup lifecycle | הרשאות ניתנות | `app/start` בעליה; `app/focus` ב-foreground (throttle 30ש'); `app/location` רציף (watch + interval 60ש') |
| TC-GATE-13 | מיקום מותאם | משתמש `location_custom` | עוקף GPS לגמרי |

---

## 6. המשחק — page1/page2 (מציאה, דילוג, צפייה, viewers)

מצבי page1: `free`, `watching`, `waiting`, `chat`, `locked`. מצבי page2: `free`, `pending`, `chat`(לא בשימוש כמנוחה), `locked`(עם/בלי message).

> QA flag — ברירת מחדל ארנק: `defaultRelations` ב-JS מציין `balance:3`, אך `_credits_default()` ב-SQL משתמש בתקרה **1**. הארנק בפועל = 1. לוודא מול ה-DB החי.

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-GAME-01 | Play / מציאה | לחיצה על כפתור Play במרכז | `app/find` (self-transition, נאמן מיד); radar rings; `page1.state='watching'` עם profile, `expires_at=now()+1h` |
| TC-GAME-02 | אין מועמד | find בלי מועמדים | `page1={free}`; "אין כרגע אנשים בסביבה" |
| TC-GAME-03 | דילוג (skip) | pull-to-skip (החלקה מטה על הכרטיס) או כפתור | `app/ignore` — מוסיף restriction `ignore` (יום), ואז `app_find` מחדש; הכרטיס הבא נכנס דרך Realtime עם preload תמונות |
| TC-GAME-04 | pause תוך skip | לחיצה על PAUSE במרכז תוך דילוג | `app/pause` משורשר אחרי find/ignore; page1 נגמר `locked` |
| TC-GAME-05 | לב = הזמנה | מצב watching → לחיצה על הלב | פותח popup הזמנה (`ReplyingInviteCard` בלי דחייה); ראו TC-INV |
| TC-GAME-06 | tutorial החלקה | פעם ראשונה | "דילוג בהחלקה למטה" בחריץ הכותרת |
| TC-GAME-07 | watchdog חיפוש | להפיל Realtime אחרי find | `API_TIMEOUT_MS + SLACK` מכבה radar ומרענן; לא תקוע לנצח |
| TC-GAME-08 | לחיצה ראשונה בזמן boot | Play לפני ש-`app/start` הושלם | הלחיצה מתורגרת (spinner) ורצה כש-`findReady` |
| TC-GAME-09 | תפוגת watching מקומית | להשהות אפליקציה מעבר לשעה ואז foreground | `useLapsed` מתייחס לכרטיס פג-תוקף כאין-כרטיס; מציג Play |
| TC-GAME-10 | seed viewer | פרופיל בנוי זמין עם 0 צופים | מקבל צופה יחיד; ספירת צופים אינה תקועה ב-0 |
| TC-GAME-11 | re-seed on skip | לדלג ולשחרר את מי שצפיתי בו | `app_seed_viewer(skipReleased)` נורה; push `candidate` לצופה החדש עם המשוחרר כ-actor. ה-restriction של ignore מונע re-seed חזרה של המדלג |
| TC-GAME-12 | relevance ספירת צופים | מועמד עם פחות צופים | `relevance_watchers=(5-viewers)/5` — דירוג גבוה יותר (פיזור תשומת לב) |
| TC-GAME-13 | אין viewer UI ב-home | סקירת מסך הבית | אין ספירת/רשימת צופים, אין נראות/broadcast, אין ספירת קרדיטים — הכל בהגדרות בלבד |
| TC-GAME-14 | תצוגת פרופיל עצמי | תפריט → "פרופיל" | אותו MatchCard עם עורך bio inline; אין affordance דיווח |
| TC-GAME-15 | סינון partition | משתמש בדיקה מול משתמש רגיל | לעולם לא נראים זה לזה במועמדים (partition טוטלי סימטרי) |
| TC-GAME-16 | סינון kids | העדפת ילדים שונה (`isForKids` בוליאני שונה) | hard-exclude מהבריכה |
| TC-GAME-17 | broadcast (add) | `app/add` (משודר, אם קיים UI) | טעון presence+profile; guards: `in_chat`, `page2_has_profile`, `rate_limited` (30ד'), `no_credits`; מחייב 1; מזריע 2 מועמדים; push `candidate`. חלון 30ד' → approve חינם + boost ×2. (הערה: אין call site פעיל ב-home הנוכחי) |

---

## 7. מחזור ההזמנה המלא (Invite Lifecycle)

זה הליבה: שליחה → waiting/pending → קבלה/דחייה/ביטול/תפוגה/הארכה.

מקורות UI: `InviteTimerCard` (יוצא), `ReplyingInviteCard` (נכנס), `EventMessageCard` (פג/מת), `StatusTimer` (countdown). מקור שרת: `app_invite/approve/decline/cancel/expire_self/extend`.

### 7.1 שליחה וקבלה

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-INV-01 | שליחת הזמנה | מצב watching → לב → אישור "הזמנה לצ׳אט" | `app/invite` (חינם, `_credits_cost('invite')=0`); שולח page1→`waiting` (10ד' `expires_at`); היעד `free`→`pending`; push `invite-in` |
| TC-INV-02 | popup אישור הזמנה | לחיצת לב | ConfirmDialog gendered (`home.inviteConfirmTitle/Desc` לפי מגדר שולח+מקבל): "אם תשלח, שניכם תנעלו... 10 דקות להגיב" |
| TC-INV-03 | invite בלי פרופיל | לב עם פרופיל לא בנוי | ה-popup נסגר ופותח gate "בנה קודם פרופיל" (משורשר דרך `onClosed`) |
| TC-INV-04 | kick צופים אחרים | שליחת הזמנה ליעד עם צופים נוספים | הצופים האחרים מודחים (`kick-invitee`) |
| TC-INV-05 | כרטיס יוצא | אחרי שליחה | `InviteTimerCard`: כותרת + countdown חי + כפתור "ביטול הזמנה". אין כפתור פעולה נוסף |
| TC-INV-06 | כרטיס נכנס | ליעד ההזמנה | OverlaySheet נגזר עם `ReplyingInviteCard`: כותרת "הוא/היא הזמין/ה אותך לצ׳אט", countdown, כפתורי דחייה + קבלה (badge קרדיט=1) |
| TC-INV-07 | קבלה (paywall) | "פתיחת צ׳אט" | `app/approve`; עלות 1 (0 אם broadcast ב-30ד' האחרונות); שני הצדדים → `chat`; push `match` |
| TC-INV-08 | קבלה בלי קרדיט | approve עם `balance+extra < 1` | הכפתור פותח BuyExtraPopup (`onUnaffordable`), לא שולח |
| TC-INV-09 | הזמנה הדדית | שני משתמשים שולחים invite זה לזה בו-זמנית | שניהם → `chat`, כל הצדדים השלישיים מודחים (`kick-match`); push `match` לשניהם |
| TC-INV-10 | invite fail | היעד כבר לא `_page2_open` | שולח page1→`locked+message='invite'`; push `invite-fail` (מצב success, לא error). ב-home: כרטיס "היא כבר לא זמינה" |

### 7.2 דחייה / ביטול

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-INV-11 | דחייה | מקבל → "לדלג"/דחייה → confirm | `app/decline`; מקבל page2→`free` (חוזר להיות זמין); מזמין page1→`locked+'decline'`; restriction `decline` (7 יום); push `declined` |
| TC-INV-12 | pull-to-decline | החלקה מטה על sheet ההזמנה | `commit:'confirm'` — פותח confirm דחייה וקופץ חזרה (אי אפשר לדחות בטעות) |
| TC-INV-13 | ביטול ע"י שולח | מזמין → "ביטול הזמנה" → confirm | `app/cancel`; מזמין page1→`locked`; יעד page2→`locked+'cancel'`; restriction `cancel` (יום); push `cancelled-in` |
| TC-INV-14 | ביטול פג-תוקף | cancel כש-`expires_at<=now()` | מנותב ל-`_expire_invite_pair` (נחיתת תפוגה, בלי restriction cancel) |
| TC-INV-15 | QA: עלות ביטול | לבדוק מול DB חי | `_credits_clear_hold(invite=0)` כרגע no-op — **ביטול לא מחייב לב** (סותר הערת מיגרציה ישנה "cancel costs 1") |

### 7.3 תפוגה

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-INV-16 | תפוגה עם אפליקציה פתוחה | להשאיר הזמנה עד 00:00 | הלקוח יורה `app/focus` (`app_expire_self`) ברגע 00:00; מצב אמיתי חוזר דרך Realtime |
| TC-INV-17 | תפוגה שני הכיוונים | `_expire_invite_pair` | מזמין waiting→`locked+'expire'` (push `expired-out`); מקבל pending→`locked+'expire'` (פרופיל נשמר, push `expired-in`); notify רק לצד שהשתנה |
| TC-INV-18 | תפוגה עם אפליקציה סגורה | לא לפתוח אחרי 00:00 | `app_expire_sweep` (כל דקה) סוגר; שני passes (waiting אז pending) |
| TC-INV-19 | אין restriction בתפוגה | אחרי תפוגה | לא נכתב restriction — אפשר להזמין שוב מיד (מוגבל רק בעלות הלב) |
| TC-INV-20 | כרטיס תפוגה | UI אחרי תפוגה | `EventMessageCard` עם שעון קפוא 00:00 (page1 `missed`/`fail`), כפתור יחיד → `app/clear1`; page2 → `app/free2` |
| TC-INV-21 | idempotency | expire_self ו-sweep יחד | שניהם קוראים `_expire_invite_pair`, re-check תחת lock, no-op כפול |

### 7.4 הארכה

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-INV-22 | הארכה תקינה | `app/extend {minutes}` (מ-{10,30,60,120,240,480,1440}) | `expires_at += minutes`, `extended=true` בשני הצדדים; push `extended` |
| TC-INV-23 | הארכה כפולה | extend פעמיים | השנייה no-op (הארכה אחת בלבד) |
| TC-INV-24 | הארכה מאוחרת | extend כש-`expires_at<=now()` | page1→`locked+message='extend'` ("אי אפשר להאריך") |
| TC-INV-25 | minutes לא חוקי | ערך לא ב-set / לא finite | `bad_minutes` (400) |
| TC-INV-26 | סימון "הוארך" | אחרי הארכה | תווית "הוארך התוקף" בכרטיס |

### 7.5 lapse handling בלקוח

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-INV-27 | שעון מכשיר מהיר | להקדים את שעון המכשיר | ב-00:00 הלקוח יורה focus פעם אחת; השרת re-check תחת lock — שעון מהיר לא הורג הזמנה חיה |

---

## 8. קרדיטים וכלכלה

`relations.credits = { balance, extra, held?, granted_on, next_grant_at, bought_on?, unpaid_at? }`.

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-CRED-01 | תקרה יומית | לבדוק `_credits_cap()` | =1. `app_credits_grant` (קרון) ממלא `balance` ל-1 כל 20:00 Asia/Jerusalem, שומר `extra`, מנקה `unpaid_at` |
| TC-CRED-02 | עלויות | `_credits_cost` | approve=1, broadcast=1, invite=0 (חינם) |
| TC-CRED-03 | סדר חיוב | חיוב | `balance` קודם, אז `extra`; affordability = `balance+extra` |
| TC-CRED-04 | החזר | refund | משחזר balance עד תקרה, עודף → `extra` (לא אובד), מקטין `held`, מנקה `unpaid_at` |
| TC-CRED-05 | unpaid_at = paywall | approve על הזמנה חיה שנדחתה רק בגלל ארנק ריק (held=0) | `unpaid_at` נחתם → יוצא מבריכות `others()` עד מימון; push `approve-fail` |
| TC-CRED-06 | חזרה לבריכה | לממן ארנק (grant/buy_extra/refund) | `unpaid_at` מנוקה → חוזר לבריכה |
| TC-CRED-07 | zero-credit נשאר גלוי | משתמש עם 0 קרדיט | עדיין discoverable (כדי שהזמנה תגיע וכפתור הקבלה יהיה רגע התשלום); יוצא רק אחרי `unpaid_at` |
| TC-CRED-08 | buy_extra | `app/buy_extra {count}` מ-{3,10,50} | מוסיף ל-`credits.extra`, מנקה `unpaid_at`; count אחר → `bad_count`; אין תקרה/throttle |
| TC-CRED-09 | UI paywall | קבלה/הזמנה בלי מספיק | `BuyExtraPopup` נפתח (`outOfCredits`); "נגמרו לך הקרדיטים" |
| TC-CRED-10 | אפשרויות רכישה | פתיחת הפופאפ | 3/10/50 — כולן `enabled:false` עם "בקרוב" (מאז 2026-07-22). הרווח היחיד = הזמנת חבר |
| TC-CRED-11 | badge עלות | כפתורי קבלה/הזמנה | `CreditCost` (מטבע × N); ביטול = 0 (בלי badge). המטבע ≠ לב |
| TC-CRED-12 | broadcast = approve חינם | לשדר (add) ואז לקבל תוך 30ד' | approve בעלות 0 |
| TC-CRED-13 | מונה חברים שהצטרפו | referral/friend-link credited | `relations.referral.joined` מתעדכן חי דרך Realtime; "N חברים הצטרפו דרכך" |
| TC-CRED-14 | grant יום הבא | הצגת "מתחדש {when}" | `formatNextGrant`: "היום ב-HH:MM"/"מחר ב-HH:MM" מ-`next_grant_at` (בהגדרות) |

---

## 9. צ'אט — שיחה מלאה

מקורות: `chat.tsx`, `realtime.ts`, `useChatHasUnread.ts`. שליחה = `POST /app/chat {chat:{...}}`. הצ'אט הוא OverlaySheet עם `topInset=0`, `floatingHeader`, `dragFrom="header"`, `keepMounted`.

### 9.1 פתיחה וטעינה

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-CHAT-01 | פתיחה בהתאמה | approve/mutual invite → `state='chat'` | `enteringChat` פותח overlay 'chat' אוטומטית |
| TC-CHAT-02 | cold start לצ'אט | פתיחה מהתראת `chat`/`match` או `state==='chat'` | הצ'אט נפתח מיד בעליה |
| TC-CHAT-03 | פתיחה חוזרת | כפתור פעולה צף במצב chat (`ChatIcon`) | `openOverlay('chat')`; badge = `chatHasUnread` |
| TC-CHAT-04 | keepMounted | סגירת הצ'אט (החלקה) | ChatPage מוחנה מחוץ למסך (היסטוריה/realtime/presence/caches חיים); torn down רק כש-`state` יוצא מ-chat |
| TC-CHAT-05 | החלפת שותף | `key={match.user_id}` | remount נקי בהחלפת שותף |
| TC-CHAT-06 | היסטוריה ראשונית | פתיחה | `PAGE_SIZE=100`, desc→reversed; `hasMore` אם 100 מדויק |
| TC-CHAT-07 | טעינת ישן יותר | גלילה למעלה (onEndReached 0.3) | `loadMore` (`lt(oldestLoadedAt)`) |
| TC-CHAT-08 | cache | פתיחה חוזרת אופליין | AsyncStorage per-conversation (debounce 800ms), מסנן `_pending/_failed` ו-cross-conversation; נטען מיד |
| TC-CHAT-09 | סטטוס בר תחת ה-OS | לבדוק פריסה | רשימת ההודעות מתחילה מקצה המסך העליון, גוללת מתחת ל-status bar וה-X הצף |

### 9.2 סוגי הודעות ושליחה (optimistic לכל סוג)

| ID | סוג | צעדים | תוצאה צפויה |
|----|-----|--------|--------------|
| TC-CHAT-10 | טקסט | הקלדה → שליחה | trim; חסום אם ריק/שולח; bubble אופטימי `_pending`; `app/chat {text}`; ריק → `no_content` |
| TC-CHAT-11 | תמונה | paperclip → תמונה | ImagePicker → resize 1200px JPEG q0.75 → upload ל-`chat-images` (upsert:false) → `app/chat {image_key}`; המפתח חייב `<me>/` prefix אחרת `invalid_image_key` (403) |
| TC-CHAT-12 | קול/voice | Mic → הקלטה → שליחה | upload ל-`chat-audio` `.m4a`; `audio_bars` (60 דליים 0..1), `audio_duration_ms`; overlay הקלטה (cancel/waveform/timer/stop→preview) |
| TC-CHAT-13 | מיקום | paperclip → מיקום → "שלח" | foreground perm; bubble ספינר; `watchPositionAsync` עד דיוק 5מ' או timeout 15ש'; כשל GPS → הסרת הספינר (אין שליחה) |
| TC-CHAT-14 | לוז משפחה | paperclip → לוז → "שלח" | רק אם `family.hasKids && יום מסומן`; `{anchor, weeks}`; ללא ילדים → `schedule_not_allowed` (403) |
| TC-CHAT-15 | reply/ציטוט | swipe-to-reply על bubble | `Gesture.Pan` נפרד (`REPLY_TRIGGER_PX=56`, RTL-mirror); `reply_to {user_id,created_at,kind,preview<=140}`; author חייב להיות אחד משני המשתתפים |
| TC-CHAT-16 | retry שליחה | הכשלת שליחה → "שלח שנית" | bubble ב-0.6 opacity + triangle; re-upload `upsert:true` |
| TC-CHAT-17 | ולידציית audio_bars | לשלוח bars לא באורך 60 / מחוץ 0..1 | נדחה (null), לא נשמר |
| TC-CHAT-18 | created_at לקוח | שליחה עם created_at | מקובל רק אם ISO תוך ±5 דק' מ-now; אחרת default. משמש dedup |

### 9.3 Realtime, polling, dedup, קריאה

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-CHAT-19 | קבלה בזמן אמת | השותף שולח | channel `chat:${me}:${other}` filter `other_id=eq.me` INSERT; guard `user_id===other`; entrance animation; scroll לתחתית |
| TC-CHAT-20 | dedup | שליחה כפולה מהירה / send→background→foreground | דילוג אם קיים `user_id+created_at` זהה (races optimistic+polling) |
| TC-CHAT-21 | polling fallback | להפיל Realtime | `fetchMissed` כל 30ש' + ב-AppState active; `gt(created_at,lastMsgTime)`; reconcile pending לפי תוכן |
| TC-CHAT-22 | typing | הקלדה | 3 נקודות (ListHeader); broadcast `typing`, auto-clear 3ש' |
| TC-CHAT-23 | סימוני קריאה | פתיחה/קריאה | presence `chat-presence:${room}` + טבלת `chat_reads` (monotonic clamp); ✓ pending(שעון)/sent(בודד)/read(כפול), רק על הודעות שלי |
| TC-CHAT-24 | badge בית | הודעה חדשה בזמן שהצ'אט סגור | `useChatHasUnread` עצמאי מ-mount; unread ⇔ הודעת שותף חדשה מ-`chat_reads.last_read_at`; מנוקה כש-chatOpen |
| TC-CHAT-25 | פעימת התראה | 0→>0 בזמן צ'אט סגור | `chatUnreadAlerting` pulse, מתנקה אחרי `PULSE.timeoutMs` |
| TC-CHAT-26 | "הודעות חדשות" | קו הפרדה | ב-`firstNewIdx` (ממופה בפתיחה, מחזיק בזמן קריאה) |
| TC-CHAT-27 | הפרדת ימים | היום/אתמול/שלשום/יום | קווי הפרדה נכונים |
| TC-CHAT-28 | שעון עקום | הודעות עם שעון סוטה | `displayTimes` — כל bubble min(raw, שכן חדש יותר) |

### 9.4 מדיה ותצוגה

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-CHAT-29 | נגן audio | play על voice | lazy player; single-active (עוצר אחרים); **auto-play** הבא אם audio (tick 90ms); seek waveform; toggle אוזנייה בזמן נגינה |
| TC-CHAT-30 | תמונה lightbox | הקשה על תמונה | Modal מלא; pinch/double-tap עד zoom 4/2.5; swipe-down סגירה; X צף |
| TC-CHAT-31 | מיקום bubble | הקשה | פתיחת מפות (`maps://` iOS / `geo:` Android / Google fallback) |
| TC-CHAT-32 | לוז bubble | הצגה | רינדור דרך `weekStart`/locale של המקבל; **הופך** אחסון להדגשת ימים פנויים (ללא ילדים); כותרת "הימים שאני פנוי" |
| TC-CHAT-33 | ציטוט highlight | הקשה על ציטוט | scroll למקור (`viewPosition 0.5`) + הבזק `PRIMARY_BG`; re-tap דרך nonce |
| TC-CHAT-34 | bubbles | שליחה/קבלה | שלי = purple ימין; שלו = `GREEN_WASH` שמאל; grouped (tail radius לאחרון בקבוצה); שם השותף רוכב על bubbles |
| TC-CHAT-35 | ריק | צ'אט חדש | "עוד אין הודעות" |

### 9.5 composer

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-CHAT-36 | input גדל | הקלדת מספר שורות | min 44, max 10 שורות |
| TC-CHAT-37 | attach bar | paperclip | סרגל נשלף (תמונה/מיקום/לוז[אם canSendSchedule]/close); border → PRIMARY |
| TC-CHAT-38 | confirm strip | מיקום/לוז | strip "שלח?" inline; המקלדת נשארת פתוחה |
| TC-CHAT-39 | mic/send | ריק מול טקסט | Mic כשריק, Send כשיש טקסט |
| TC-CHAT-40 | keyboard avoidance | פוקוס על input | padding תחתון per-screen (`kbHeight`), בלי lift גלובלי |

---

## 10. סיום צ'אט / עזיבה / חסימה / דיווח

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-END-01 | צ'יפ End Chat | מצב chat → צ'יפ ליד שם/גיל בפינת END של הכרטיס | `setChatMenuOpen(true)` (לא בכותרת ה-sheet) |
| TC-END-02 | תפריט צ'אט | פתיחת התפריט | BottomSheet: "עזיבה" (primary) + "חסימה" (secondary) |
| TC-END-03 | עזיבה | "עזיבה" → confirm "סיום צ'אט" | `app/leave`; שני הצדדים→discoverable (page2 free); שותף page1→`locked+'leave'`; restriction `leave` (14 יום); push `left` |
| TC-END-04 | חסימה | "חסימה" → confirm | `app/block`; כמו leave אך restriction `block` **קבוע**; השותף רואה סיום רגיל (`left`, לא "נחסם") |
| TC-END-05 | דיווח מצ'אט | flag בתחתית התמונה האחרונה → confirm "דיווח וחסימה" | `app/report {user_id, reason:'profile', note?}`; context='chat'; teardown כמו block + block קבוע + שורת moderation |
| TC-END-06 | דיווח מכל כרטיס | flag על watching/waiting/chat/ended וגם page2 invite/dead | teardown לפי surface: chat→block, waiting→cancel, pending→decline, watching→drop שקט, unknown→record+block |
| TC-END-07 | ניקוי בסיום | state יוצא מ-chat | `leavingChat`: Keyboard.dismiss, `chatUnread=0`, הסרת 'chat' מהstack; sheet יוצא מהעץ |
| TC-END-08 | דיווח errors | user_id null/self | `bad_target`; dispatcher `no_user_id` |
| TC-END-09 | כרטיס נעול אצל הצד השני | לאחר leave/block/decline/cancel/expire/remove | `home.locked.page1.<message>` עם טקסט gendered לפי מגדר הצד השני (title/desc `_m`/`_f`) |

---

## 11. הגדרות / פרופיל / משפחה / מיקום / חשבון

מקור: `settings.tsx`. פעולות: `age/range/preferred_gender`, `profile`, `location/location_custom`, `lock2/free2`, `logout`, `delete`, `bug_report`, `set_tier` (deprecated no-op).

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-SET-01 | העדפות חיפוש | טווח גיל/מרחק/מגדר מבוקש | `app/age`/`range`/`preferred_gender`; auto-find אם idle+available |
| TC-SET-02 | טווח ללא הגבלה | range unlimited | תווית "ללא הגבלת מרחק", עמודת ערך ריקה |
| TC-SET-03 | מגדר מבוקש | לגברים/לנשים/לכולם | `settings.preferredGender` gendered לפי מגדר עצמי |
| TC-SET-04 | עריכת פרופיל | תמונות/bio/משפחה | `app/profile` (subset של images/bio/family; null מנקה); לפחות 2 תמונות |
| TC-SET-05 | סדר תמונות | לחיצה ארוכה + גרירה | סדר משתנה; מינימום 2 (`photoMinTwo`) |
| TC-SET-06 | תמונה כפולה | העלאת אותה תמונה פעמיים | "תמונה כפולה" — הוסרו |
| TC-SET-07 | משפחה וילדים | יש/אין ילדים, גילאים, לוז | נשמר ב-`family` (כולל `isForKids`); לוז משפיע על relevance ולא מוצג למשתמשים |
| TC-SET-08 | מיקום מכשיר/מותאם | בחירת מקור מיקום | device (GPS) / custom (כתובת) / בית / עבודה; `location_type`/`location_label` |
| TC-SET-09 | מיקום נעול | ניסיון שינוי מיקום תוך watching/invite פעיל | "אי אפשר לשנות מיקום עכשיו" — לצאת קודם מהאינטראקציה |
| TC-SET-10 | הסתרה (lock2) | "הסתר את הפרופיל" → confirm | `app/lock2`; כל הצופים מודחים (`removed`, restriction `remove`); page2→`locked` בלי message (לא discoverable); מנקה `last_add_at` |
| TC-SET-11 | חשיפה (free2) | "הצג את הפרופיל" | `app/free2`; page2 locked→free (שומר profiles) |
| TC-SET-12 | קרדיטים בהגדרות | שורת קרדיטים | "1/1 + N אקסטרה"; "מתחדש היום/מחר ב-HH:MM" |
| TC-SET-13 | הקבוצות שלי | שורת קבוצות + sheet | list + הזנת קוד 6 ספרות; "מושבתת" אם רלוונטי; עזיבה |
| TC-SET-14 | דיווח תקלה | "דיווח על תקלה" → טקסט + תמונה אופציונלית | `app/bug_report` (insert בלבד, לא נוגע ב-state/credits); "תודה! הדיווח נשלח" |
| TC-SET-15 | התנתקות | "התנתק" → confirm | `app/logout`; `push_token=null`, `location=null`, `app_logout_cleanup`; page2→`locked+message='logout'`; מכשיר זה בלבד |
| TC-SET-16 | re-login אחרי logout | כניסה חוזרת | `app/start` הופך `locked/logout`→`{free,profiles:[]}` (הסתרות מפורשות נשארות) |
| TC-SET-17 | מחיקת חשבון | "מחיקת חשבון" → confirm | `app/delete` → `app_delete_cleanup` + `user.delete`; כל מידע/תמונות/שיחות נמחקים; הזמנות/צפיות מבוטלות; לא הפיך |
| TC-SET-18 | set_tier deprecated | לקוח ישן קורא `app/set_tier` | no-op מוצלח (free/pro), אחרת `bad_tier` |
| TC-SET-19 | תחילת שבוע | ראשון/שני | משפיע על תצוגת הלוז |

---

## 12. התראות Push

מקורות: `global.ts` (`PUSH_TITLE`/`PUSH_BODY`), `firePush` ב-`app/index.ts` (פעולות) ו-`ext/index.ts` (קרון), `notifications.ts` (tap). כותרת = שם ה-actor (fallback "Once"); גוף = טקסט המצב. gendering לפי `is_male` של ה-**actor**. `{group}` מוחלף ב-`group_name`. תמיד fire-and-forget מאחורי `waitUntil`.

### 12.1 קטלוג ומקורות

| ID | קוד | מתי נשלח | נמען | הערות |
|----|-----|----------|------|--------|
| TC-PUSH-01 | `invite-in` | `app_invite` | מוזמן | "הזמנה לצ'אט" |
| TC-PUSH-02 | `candidate` (_m/_f) | seed_viewer / find/add seed | צופה שזה עתה זורע | gendering לפי המשתמש הזרוע (ה-actor), לא הנמען |
| TC-PUSH-03 | `match` | invite/approve (התאמה) | שני הצדדים | "אתם אחד על אחד" |
| TC-PUSH-04 | `extended` | `app_extend` | הצד המוזמן | "ההזמנה הוארכה" |
| TC-PUSH-05 | `chat` | `/app/chat` | שותף הצ'אט | "התקבלה הודעה" |
| TC-PUSH-06 | `declined` | decline (+report/pause/logout) | מזמין | "ההזמנה נדחתה" |
| TC-PUSH-07 | `expired-out` | expire (self/sweep/cancel-פג) | מזמין (actor=מוזמן) | body שונה בין self (`PUSH_TITLE`: "פג תוקף ההזמנה") ל-sweep (`PUSH_BODY`: "ההזמנה פגה") |
| TC-PUSH-08 | `expired-in` | כנ"ל | מוזמן (actor=מזמין) | כנ"ל; sweep משתמש ב-collapseId `code:actor`, self ב-`actor_id` |
| TC-PUSH-09 | `cancelled-in` | cancel/pause/report/logout | מוזמן | "ההזמנה בוטלה" |
| TC-PUSH-10 | `removed` (_m/_f title) | remove/lock2/pause | צופה שהוסר | "הוסרת מרשימת הצופים" |
| TC-PUSH-11 | `left` (_m/_f title) | leave/block/report/logout | שותף/צופים | "הצ'אט הסתיים" |
| TC-PUSH-12 | `invite-fail` | invite (race) | self | הלולאה מדלגת `n.user_id===caller` — לא נמסר כ-push רגיל |
| TC-PUSH-13 | `approve-fail` | approve (race/ארנק) | self | כנ"ל |
| TC-PUSH-14 | `area-open`/`area-closed` | `app_area_resync` (קרון) | משתמשי האזור | actor absent → כותרת "Once" |
| TC-PUSH-15 | `referral` (_m/_f) | attach/qualify/sweep | מזמין (actor=חבר) | "הצטרף/ה דרך ההזמנה שלך, קיבלת קרדיט" |
| TC-PUSH-16 | `friend_request` | `app_friend_request` | יעד | deep-link Communities→friends |
| TC-PUSH-17 | `friend_accept` | friend_respond | מבקש | "בקשת החברות אושרה" |
| TC-PUSH-18 | `friend_link` (_m/_f) | friend_link_by_code | מזמין | deep-link friends |
| TC-PUSH-19 | `group_join` (_m/_f) | redeem/respond בקבוצה גייטד | staff (owner+managers) | "ביקש/ה להצטרף לקבוצה {group}"; deep-link לקבוצה |
| TC-PUSH-20 | `group_approved` | respond_join (accept) | מבקש | "בקשתך להצטרף... אושרה"; deep-link |
| TC-PUSH-21 | `kick-match`/`kick-invitee` | invite/approve (הדחה) | הצד המודח | **QA GAP**: אין טקסט בקטלוג → גוף "Once". לאשר התנהגות רצויה |

### 12.2 ניתוב הקשה, gating, טוקן מת

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-PUSH-22 | tap chat/match | הקשה על התראה | פותח overlay צ'אט (אלא אם `overlaysGated`) |
| TC-PUSH-23 | tap group | `group_join`/`group_approved` | פותח Communities עם `group_id` (התפריט לעולם לא gated) |
| TC-PUSH-24 | tap friend | `friend_request`/`friend_accept`/`friend_link` | פותח Communities→friends |
| TC-PUSH-25 | tap page2 codes | `invite-in`/`extended`/`expired-in`/`cancelled-in` | אין שינוי overlay (home כבר מציג את הכרטיס) |
| TC-PUSH-26 | tap page1 codes | `declined`/`expired-out`/`removed`/`left` | `setOverlays([])` → home חשוף |
| TC-PUSH-27 | cold-start tap | הקשה כשהאפליקציה סגורה | `getInitialNotificationType/GroupId` מנתב בעליה |
| TC-PUSH-28 | DeviceNotRegistered | Expo מחזיר token מת | `app_push_dead`: מנקה token, `push.dead=true`, recompute availability; יוצא מכל בריכה |
| TC-PUSH-29 | push_blocked | `location NOT NULL` + (`perm='denied'` או `dead=true`) | חסום. `undetermined`/token חסר — **לא** חסום |
| TC-PUSH-30 | collapseId | התראות חוזרות | group codes → `group_id`; אחר → `actor_id` (app) / `code:actor_id` (ext) |
| TC-PUSH-31 | grant שקט | top-up ב-20:00 | **אין** push על חידוש הקרדיט היומי |

---

## 13. קרון / Sweeps

מקור: `ext/index.ts`. הקרון קורא HTTP ל-`/ext` (חובה `Authorization: Bearer <ANON_KEY>`, אחרת 401), שמריץ RPC ומפזר push.

| ID | route | תזמון | RPC | תוצאה צפויה |
|----|-------|-------|-----|--------------|
| TC-CRON-01 | `/ext/cron` | כל דקה | `app_expire_sweep` → `app_area_resync` → `app_credits_grant` → `app_referral_sweep` | ראו פירוט למטה |
| TC-CRON-02 | `/ext/watch` | שעתי | `app_expire_watch_sweep` | ראו TC-CRON-06 |
| TC-CRON-03 | `/ext/resync` | on-demand (admin) | `app_area_resync` | recompute geo, push `area-open`/`area-closed` |

| ID | תרחיש | צעדים | תוצאה צפויה |
|----|--------|--------|--------------|
| TC-CRON-04 | expire sweep | הזמנה תלויה עם אפליקציה סגורה | pass1 (waiting) + pass2 (pending יתום) → `_expire_invite_pair`; push `expired-out`/`expired-in`; `{processed,notify}` |
| TC-CRON-05 | credits grant | הראשון אחרי 20:00 Asia/Jerusalem | ממלא balance ל-1, שומר extra, מנקה unpaid_at; **שקט, בלי push**; רוב ה-ticks 0 שורות |
| TC-CRON-06 | watch expire | watching >1h שלא נוגע | `_expire_watch_one`: page1 watching→`locked` (בלי message, בלי auto-find), מסיר צופה-רפאים; **אין push**, אין re-seed; cap 2000/tick, `capped` אם הגיע לתקרה |
| TC-CRON-07 | referral sweep | referral תלוי שהנתיב העצל פספס | scan `credited_at IS NULL AND created_at>now()-30d`, oldest-first, LIMIT 200 → `_referral_settle`; push `referral` לכל credited |
| TC-CRON-08 | area resync | אזור נפתח/נסגר | recompute availability; push `area-open`/`area-closed`; open apps מתעדכנים דרך Realtime |
| TC-CRON-09 | snapshots | לא קרון — fire-and-forget אחרי כמעט כל `/app/*` | `app_refresh_snapshots`: מרענן distance/last_seen בכל relations של counterparts; מדלג ל-delete |
| TC-CRON-10 | lazy vs sweep | להשוות נתיב עצל לרשת ביטחון | invitation: `app_expire_self` (open) מול `app_expire_sweep` (סגור) — שניהם `_expire_invite_pair`, idempotent |
| TC-CRON-11 | presence window | משתמש שלא פתח >24ש' | `others()` מסנן `last_seen > now()-interval '1 day'` (`_presence_ttl`); נעלם מבריכות `only_available` (נבדל מ-push_blocked) |
| TC-CRON-12 | auth /ext | קריאה בלי Bearer | 401 unauthorized |
| TC-CRON-13 | orphan launch sweep | `app_area_launch_sweep` | **QA**: לא נקרא מ-`handleCron` (הוחלף ב-`app_area_resync`?). לאמת מול `cron.job` החי |

---

## 14. מצבי מרוץ, backward-compat, קצוות

| ID | תרחיש | תוצאה צפויה |
|----|--------|--------------|
| TC-EDGE-01 | הזמנה הדדית בו-זמנית | שניהם→chat, כל הצדדים השלישיים מודחים (`kick-match`) |
| TC-EDGE-02 | approve על הזמנה שפגה מול approve עם ארנק ריק | שניהם `approve-fail`; רק broke טהור חותם `unpaid_at`; broadcast הופך approve לחינם |
| TC-EDGE-03 | extend ב-00:00 / extend כפול | locked+'extend' / no-op שני |
| TC-EDGE-04 | cancel אחרי 00:00 | מנותב לתפוגה, בלי restriction, אפשר להזמין שוב מיד |
| TC-EDGE-05 | locked+message נשאר discoverable | מוזמן שפג/בוטל עדיין בבריכה (`_page2_open`); רק lock2/post-approve מסתיר |
| TC-EDGE-06 | dedup bubble | שליחה כפולה/רקע-קדמה — אין כפילות |
| TC-EDGE-07 | retry re-upload | `upsert:true` בהעלאה חוזרת |
| TC-EDGE-08 | double-Modal | invite popup → build-profile/buy-extra משורשר דרך `onClosed`, לא שני Modal בו-זמנית |
| TC-EDGE-09 | gate מפעיל תוך צ'אט | הצ'אט נסגר בכפייה; התפריט נשאר נגיש |
| TC-EDGE-10 | not_yet auto-lift | ה-gate משתחרר מקומית ב-`starts_at` |
| TC-EDGE-11 | BACKWARD_COMPAT | לפני שינוי שרת | לסרוק `BACKWARD_COMPAT.md`, להסיר entries שרצפת הגרסה שלהם מתחת להפצה חיה; שינוי breaking נבנה Expand→Migrate→Contract |
| TC-EDGE-12 | לוג לכל בקשה | כל בקשת edge | בדיוק שורת `log` אחת נכתבת, לכל תוצאה (חסר = באג) |
| TC-EDGE-13 | source tag | `find/ignore/pause/resume` | `invoke:self` (page1 נאמן מיד); שאר הקריאות `invoke` (defer ל-Realtime) |
| TC-EDGE-14 | resync ב-foreground/reconnect | Supabase לא משחזר אירועים שהוחמצו | full row fetch (resync) |

---

## 15. מטריצות רוחב (להריץ לרוחב כל תרחיש רלוונטי)

| ID | ממד | מה לבדוק |
|----|-----|----------|
| TC-MTX-01 | מגדר עצמי (m/f) | כל מחרוזת gendered `_m`/`_f`; כפתורי CTA ("צור/צרי חשבון", "הזמן/הזמיני") |
| TC-MTX-02 | מגדר צד שני | כרטיסי locked page1/page2, replying/waiting (`_mm/_mf/_fm/_ff`) |
| TC-MTX-03 | RTL | hamburger/close-X בפינת START; שם+גיל בפינת END; report בתחתית התמונה האחרונה |
| TC-MTX-04 | שפה he/en | סדר תאריך (dd/mm מול mm/dd); תרגומים; אין em dash |
| TC-MTX-05 | פלטפורמה | Android (הפצה); iOS רק אם מבקשים; Apple sign-in רדום |
| TC-MTX-06 | partition | is_test מול real לא מתערבבים בשום בריכה |
| TC-MTX-07 | offline/online | cache, resync, polling fallback, badges מתעדכנים במעבר |

---

## נספח א' — מפת פעולה → endpoint (יעד לבדיקות אוטומטיות/assertions)

| אינטראקציה | endpoint | source tag |
|-------------|----------|------------|
| Play / מציאה | `app/find` | invoke:self |
| דילוג | `app/ignore` | invoke:self |
| pause | `app/pause` | invoke:self |
| הזמנה | `app/invite` | invoke |
| ביטול הזמנה | `app/cancel` | invoke |
| קבלה | `app/approve` | invoke |
| דחייה | `app/decline` | invoke |
| הארכה | `app/extend {minutes}` | invoke |
| ניקוי page1 | `app/clear1` | invoke |
| ניקוי page2 מת | `app/free2` | invoke |
| הודעת צ'אט | `app/chat` | invoke |
| עזיבה | `app/leave` | invoke |
| חסימה | `app/block` | invoke |
| דיווח | `app/report {user_id,reason,note}` | invoke |
| קניית קרדיט | `app/buy_extra {count}` | invoke |
| startup/foreground/location | `app/start`/`focus`/`location` | invoke |
| שינוי הרשאת התראות | `app/notif` | invoke |
| lapse הזמנה (00:00) | `app/focus` (`app_expire_self`) | invoke |
| referral | `app/referral {code,source}` | invoke |
| קישור חבר | `app/friend_link {code}` | invoke |
| קוד קבוצה | `app/redeem_invite {code}` | invoke |
| הסתרה/חשיפה | `app/lock2`/`app/free2` | invoke |
| התנתקות/מחיקה | `app/logout`/`app/delete` | invoke |

מדיה בצ'אט פוגעת ישירות ב-Storage (`chat-images`, `chat-audio`); סימוני קריאה בטבלת `chat_reads`; realtime של הודעות בטבלאות `chat`/`chat_reads` (לא דרך `/app/*`).

## נספח ב' — טבלת שגיאות/תוצאות מרכזיות

| פעולה → RPC | מחרוזות שגיאה / outcome |
|-------------|--------------------------|
| `app/account` | `invalid_birth_date`, `age` (<18) |
| `app/profile` | `empty_payload` |
| `app/referral` | `no_code`, `bad_code`, `self_referral`, `too_late`; outcome `already\|credited\|capped\|incomplete\|skipped` |
| `app/friend_link` | `no_code`, `bad_code`; status `self\|linked\|already` |
| `app/redeem_invite` | `no_code`, `invite_invalid`; join_status `joined\|pending\|already` |
| `app/respond_join` | `no_request_id`, `no_request`, `not_manager` |
| `app/create_group`/`update_group` | `bad_name`, `bad_description`, `no_group_id`, `not_manager` |
| `app/find` | `not_found` |
| `app/invite` | `not_found`, `not_watching`, `no_target` |
| `app/approve` | `not_found`, `no_incoming` |
| `app/decline` | `not_found`, `no_incoming` |
| `app/cancel` | `not_found`, `no_target`, `not_waiting` |
| `app/leave`/`block` | `not_found`, `not_in_chat` |
| `app/extend` | `bad_minutes` |
| `app/remove` | `no_user_id` |
| `app/report` | `not_found`, `bad_target`, `no_user_id` |
| `app/chat` | `no_content`, `invalid_image_key`, `invalid_audio_key`, `schedule_not_allowed`, `no_partner` |
| `app/buy_extra` | `bad_count` |
| שערי dispatcher | `unavailable` (403), `profile_incomplete` (403) |
| api.ts transport | 401 → sign-out מקומי + null; אחרת זורק גוף |

---

*המסמך משקף את מצב הקוד ב-2026-07-26. יש לאמת גופי RPC מול ה-DB החי (`pg_get_functiondef`) לפני הרצת בדיקות תלויות-שרת, ולסנכרן עם `BACKWARD_COMPAT.md`.*
