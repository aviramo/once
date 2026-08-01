export default {
  // Brand. The app's name, once — every screen that shows it (home's wordmark)
  // reads it from here. It is a name, so both languages carry the same word.
  'app.name': 'Once',

  // Landing


  // Auth
  'auth.signInGoogle': 'התחברות עם Google',
  'auth.signInApple': 'התחברות עם Apple',
  'auth.reviewCodePlaceholder': 'קוד ביקורת',
  'auth.reviewSubmit': 'כניסה',
  'auth.orDivider': 'או',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendLink': 'שליחת קישור התחברות',
  'auth.invalidEmail': 'נא להזין כתובת אימייל תקינה',
  'auth.linkSent': 'בדקו את האימייל',
  'auth.linkSentDesc': 'שלחנו קישור התחברות ל-{email}. לחצו על הקישור באימייל כדי להמשיך',
  'auth.linkResend': 'שליחת קישור נוסף',
  'auth.linkError': 'לא הצלחנו לשלוח את הקישור. נסו שוב',
  'auth.legalPrefix': 'בהמשך, אתה/את מסכים/ה',
  'auth.legalConnTerms': 'ל',
  'auth.legalTerms': 'תנאי השימוש',
  'auth.legalSep': ' ',
  'auth.legalConnPrivacy': 'ו',
  'auth.legalPrivacy': 'מדיניות הפרטיות',

  // Onboarding step 1
  'ob.whoAreYou': 'איך את/ה מזדהה?',
  'ob.male': 'גבר',
  'ob.female': 'אישה',
  'ob.nicknameStep': 'איך קוראים לך?',
  'ob.next': 'המשך',

  // Onboarding step 2
  'ob.birthdate': 'תאריך לידה',
  // Captions over the three date boxes: the DD/MM/YYYY hint inside a box goes
  // away the moment a digit is typed, so what each box holds is said in words
  // above it and stays said.
  'ob.dateDay': 'יום',
  'ob.dateMonth': 'חודש',
  'ob.dateYear': 'שנה',
  'ob.minAge': 'גיל מינימלי להרשמה הוא 18',
  'ob.createAccount': 'צור חשבון',
  'ob.createAccount_m': 'צור חשבון',
  'ob.createAccount_f': 'צרי חשבון',
  'ob.birthConfirmTitle': 'אימות תאריך הלידה',
  'ob.birthConfirm': 'יום ההולדת שלך הוא {date} ואת/ה בן/בת {age}',
  'ob.birthConfirm_m': 'יום ההולדת שלך הוא {date} ואתה בן {age}',
  'ob.birthConfirm_f': 'יום ההולדת שלך הוא {date} ואת בת {age}',

  // Onboarding photo
  'photo.sub': 'הוסף 2-6 תמונות',
  // הפועל פונה אל המשתמש, והמין שלו כבר ידוע בשלב הזה של האונבורדינג (הוא נבחר
  // במסך הראשון), ולכן {m|f} ב-genderize.
  'photo.uploadFailed': 'העלאת התמונות נכשלה. בלי תמונה אי אפשר להמשיך, {נסה|נסי} שוב',

  // Onboarding bio. אין מינימום תווים ואין ביו חובה (הוראת משתמש 31.7.2026):
  // פרופיל בנוי הוא שתי תמונות וזהו, ולכן המחרוזת 'bio.min' נמחקה. הפועל פונה
  // אל המשתמש והמין שלו ידוע (נבחר במסך הראשון של האונבורדינג), ולכן genderize.
  'bio.placeholder': 'זה המקום לספר על עצמך ועל מה ש{אתה מחפש|את מחפשת}',
  'bio.submit': 'סיום',
  'bio.update': 'עדכון',

  // Home — distance chip text. <ab> = viewer+subject anchor (d=device,
  // h=home, w=work). dist.* carry a {d} distance placeholder; near.* are the
  // proximate (<250m) wording. Subject pronoun is gendered (_m/_f) only where
  // the phrasing references the subject; cells whose wording has no subject
  // pronoun are base-key only (dd, hd, wd, and near.hh / near.ww).
  'home.dist.dd': '{d} ממך',
  'home.dist.dh_m': '{d} מהבית שלו',
  'home.dist.dh_f': '{d} מהבית שלה',
  'home.dist.dw_m': '{d} מהעבודה שלו',
  'home.dist.dw_f': '{d} מהעבודה שלה',
  'home.dist.hd': '{d} מהבית שלך',
  'home.dist.hh_m': '{d} בין הבית שלך לשלו',
  'home.dist.hh_f': '{d} בין הבית שלך לשלה',
  'home.dist.hw_m': '{d} הבית שלך מהעבודה שלו',
  'home.dist.hw_f': '{d} הבית שלך מהעבודה שלה',
  'home.dist.wd': '{d} מהעבודה שלך',
  'home.dist.wh_m': '{d} העבודה שלך מהבית שלו',
  'home.dist.wh_f': '{d} העבודה שלך מהבית שלה',
  'home.dist.ww_m': '{d} בין העבודה שלך ושלו',
  'home.dist.ww_f': '{d} בין העבודה שלך ושלה',
  'home.near.dd': 'ממש כאן',
  'home.near.dh_m': 'ממש ליד הבית שלו',
  'home.near.dh_f': 'ממש ליד הבית שלה',
  'home.near.dw_m': 'ממש ליד העבודה שלו',
  'home.near.dw_f': 'ממש ליד העבודה שלה',
  'home.near.hd': 'ממש ליד הבית שלך',
  'home.near.hh': 'שכנים',
  'home.near.hw_m': 'הוא עובד ליד הבית שלך',
  'home.near.hw_f': 'היא עובדת ליד הבית שלך',
  'home.near.wd': 'ליד העבודה שלך',
  'home.near.wh_m': 'גר ליד העבודה שלך',
  'home.near.wh_f': 'גרה ליד העבודה שלך',
  'home.near.ww': 'שכנים בעבודה',
  // Merged proximity chip (distance + relative last-seen in one phrase).
  // prefix rides only on the non-near distance part; join sits between the
  // distance and time parts; hereNow is the live device device override.
  'home.prox.prefix': 'במרחק ',
  'home.prox.join': ' ',
  'home.prox.hereNow': 'כאן ועכשיו',

  // Location

  // Settings
  // THE TASK IS TWO PHOTOS, SO THE BUTTON SAYS PHOTOS (user directive
  // 2026-08-01). It read 'בניית הפרופיל' on all three of the app's shut doors,
  // which sounds like a form to fill in; what is actually being asked for is two
  // pictures, and the number is what says how short the job is. The KEY keeps
  // its name (a build-profile gate is still what this is, in code), exactly as
  // `group` survives as an identifier for a מעגל.
  'settings.buildProfile': 'בחירת תמונות',
  'settings.account': 'חשבון',
  // The same state as a full sentence, for the preferences popup's leading ROW
  // (user directive 2026-07-30). A row is read as a line of text where the
  // photo's chip is read as a badge, so it says who it is about; the {m|f}
  // markers are resolved by `genderize` against the user's own sex.
  'settings.visibilityStateVisible': 'אני {גלוי|גלויה}',
  'settings.visibilityStateHidden': 'אני {מוסתר|מוסתרת}',
  // Why the row is shut for a user who has not built a profile: he reads the
  // hidden sentence like anyone else, and this is what the tap answers with. The
  // title and the button are the app's one build-profile gate (BuildProfileGate),
  // so only the blocked door is named here. It names the PHOTOS rather than "a
  // profile with at least two photos" (user directive 2026-08-01) — same
  // sentence, without the word that made two pictures sound like a project, and
  // without counting them (see home.buildProfileTitle).
  'settings.visibilityGateDesc': 'כדי שיראו אותך נדרשות תמונות שלך',
  // The watcher count as a SENTENCE, for the pill beside that row (user
  // directive 2026-07-31, restoring what the bare number replaced the day
  // before): a row is read as a line of text, so the count finishes the line the
  // label started, in the same first person it is written in. What stays a bare
  // number is the DOCK's preferences key — a mark standing beside a 24dp glyph
  // has no room for a sentence, and the row it opens is where the sentence is.
  // Singular is its own string: Hebrew inflects the verb for a single watcher.
  // And ZERO is its own string too (user directive 2026-08-01): the pill stands
  // beside a visible row at every count, so "nobody" is said in words rather
  // than by an empty lane, which read as a count that had failed to load.
  'settings.watchersNone': 'אף אחד לא צופה בי',
  'settings.watchersOne': 'מישהו אחד צופה בי',
  'settings.watchersMany': '{count} צופים בי',
  // The credits row states the whole wallet as one number on its END edge
  // (user directive 2026-07-28), so there is no pool caption to translate: the
  // daily/extra split lives in the buy picker the row opens.
  'settings.credits': 'קרדיטים',
  // The DEPOSIT, on a second pill beside that number (user directive
  // 2026-08-01): a credit that left the wallet when I sent an invitation and
  // comes back if the invitation dies without a chat. The dock's key says it as
  // a bare "+1" because a mark beside a 24dp glyph has no room for a word; here
  // there is a line of text, so the pill names itself — the same rule the
  // watcher pill above follows. No inflection either way, so one string.
  'settings.creditsHeld': '{count} בפיקדון',
  // Leaving a group. The only strings left from the menu's old groups sheet:
  // joining by code, the membership list and the row that opened them all live
  // in Circles now, and the sheet itself is deleted. Circles' own leave popup
  // reads these three.
  'settings.groupsLeaveTitle': 'לעזוב את {name}?',
  'settings.groupsLeaveConfirm': 'עזיבת המעגל',

  // Circles: the dock key + the full hub sheet and its sub-screens.
  // THE PRODUCT WORD IS "מעגל" / "circle" WHEREVER A USER READS IT (user
  // directive 2026-08-01). "קבוצה" is gone from the copy in both languages: the
  // site had said מעגלים for weeks and the app was the last surface saying both,
  // with the hub titled "המעגלים שלי" over a page of קבוצות. `group` survives as
  // an IDENTIFIER only — the groups/user_groups tables, the group_* push codes,
  // the /g/ invite link, the component props — so a key still named `newGroup` /
  // `removeFromGroup` is correct and only its VALUE moved.
  // מעגל is masculine where קבוצה was feminine, so every adjective, verb and
  // pronoun agreeing with it turned with the noun: מנוהלת→מנוהל, מופיעה→מופיע,
  // תעבור→יעבור, בה→בו. Those are the strings that do not carry the word at all
  // and would otherwise have been missed.
  'communities.menuRow': 'מעגלים',
  'communities.title': 'המעגלים שלי',
  'communities.myFriends': 'החברים שלי',
  'communities.myFriendsSub': 'אנשים ש{אתה מכיר|את מכירה} אישית',
  // The one WORD, for the button on the hub's friends row: the row already
  // says what it is about, so the button only says what it does.
  'communities.invite': 'הזמנה',
  'communities.create': 'יצירת מעגל',
  'communities.find': 'חיפוש והצטרפות למעגל',
  // Circle kinds: ONE axis, three stops (2026-07-27). Replaces the old
  // public/private + approval-on/off pair everywhere it was shown.
  // TWO of the three name the JOINING rather than the circle (user directive
  // 2026-08-01): "מעגל מאושר" reads first as a HAPPY circle, מאושר being the
  // everyday word for it — which the feminine "קבוצה מאושרת" got away with and
  // the masculine does not. So the axis is stated as the thing it decides, who
  // may come in; private stays a fact about the circle itself, because that is
  // the one stop where the circle's own visibility is what changes.
  'communities.kindLabel': 'סוג המעגל',
  'communities.kindOpen': 'הצטרפות פתוחה',
  'communities.kindOpenSub': 'מופיע בחיפוש וההצטרפות אוטומטית',
  'communities.kindApproved': 'הצטרפות באישור',
  'communities.kindApprovedSub': 'מופיע בחיפוש וכל בקשת הצטרפות דורשת אישור',
  'communities.kindPrivate': 'מעגל פרטי',
  'communities.kindPrivateSub': 'לא מופיע בחיפוש, נכנסים רק דרך קישור, וכל הצטרפות דורשת אישור',
  'communities.membersCount': '{count} חברים',
  'communities.oneMember': 'חבר אחד',
  // Row meta segments, laid out by MetaLine. One string per fact, so every list
  // counting the same thing counts it in the same words. (`groupsCount` /
  // `oneGroup` and the `groupLabel` helper that read them are deleted with the
  // dock's old menu row, 2026-08-01: nothing has counted circles since that row
  // went, and `rowEmpty` — the row's own empty line — goes with them.)
  'communities.oneFriend': 'חבר אחד',
  'communities.requestsCount': '{count} בקשות',
  'communities.oneRequest': 'בקשה אחת',
  // הכניסה למעגלים חסומה עד ששתי התמונות קיימות. המשפט מדבר על התמונות ולא על
  // "פרופיל" (הנחיית משתמש 1.8.2026), וכיוון שהוא כבר לא בציווי הוא גם חסר
  // מגדר: אין בו {m|f} ואין צורך ב-genderize בצד הקורא.
  'communities.gateTitle': 'אנשים דרך מעגלים',
  'communities.gateDesc': 'מעגלים מחברים בין אנשים עם תחומי עניין משותפים. כדי להצטרף נדרשות תמונות שלך',
  'communities.managedBy': 'מנוהל על ידי {name}',
  // The one popup behind the card's circle chip: every mutual friend and every
  // shared group in one list, so it says what the two of you have in common
  // without naming a kind of connection.
  'communities.sharedTitle': 'מה משותף לנו',
  // The chip itself. Inflects for the CARD SUBJECT ("היא חברה של אסף"), not for
  // the friend named in it, so the pair here is chosen by match.is_male.
  'communities.friendOfM': 'חבר של {name}',
  'communities.friendOfF': 'חברה של {name}',
  // (No "you have no circles yet" line any more: a hub with nothing in it IS
  // the start page — the picture, what this is for, the two ways in — with the
  // friends row over it. See HubStart.)

  // The page before there is anything on it: no friends, nobody waiting, no
  // circle of any kind (user directive 2026-07-30). It is not the list's empty
  // line — it is the whole screen, so it says what Circles IS and then offers
  // the only two ways to start one. See HubStart / CirclesArt.
  // NOTHING HERE SAYS "מעגל" IN THE ABSTRACT any more (user directive
  // 2026-08-01). Once a circle is a THING in the app, "המעגל שלך" stops reading
  // as somebody's social circle and starts reading as an object on this very
  // screen — worst of all in this pair, where the title said it the one way and
  // the line under it the other. So the title COUNTS them, and the sentence
  // about what a friend brings names the PEOPLE.
  'communities.startTitle': 'כאן מתחילים המעגלים שלך',
  'communities.startDesc': 'כל חבר {שתוסיף|שתוסיפי} יכול לחבר אותך לחברים הפנויים שלו, ומעגל משותף פותח אנשים עם תחומי עניין דומים',
  // Over the PRIMARY button only (user directive 2026-07-30): inviting is the
  // one of the two whose label does not say what it is worth. "חיפוש מעגלים"
  // needs no line, and a second one turned the two ways forward into a
  // paragraph.
  'communities.startFind': 'חיפוש מעגלים',
  // The friends page before there is a single friend on it: the same drawing
  // and the same heading as the hub's, one step in — that page offers the two
  // ways to start a circle, this one owns the first of them, so all it has to
  // say is what a friend joining actually opens.
  'communities.friendsStartDesc': '{הזמן|הזמיני} חברים, וכשהם יצטרפו ייפתחו בפניך אנשים חדשים שהם מכירים',

  // My friends
  'communities.inviteFriend': 'הזמנת חברים',
  // Caption under the invite button: connecting as friends pays both sides a
  // credit (server credits it on every new friend link, see friend_link_credits).
  'communities.inviteReward': 'על כל חבר שמתחבר, שניכם מקבלים קרדיט נוסף',
  'communities.linkFriend': 'שיוך חבר קיים',
  'communities.friendsCount': '{count} חברים',
  'communities.accept': 'אישור',
  'communities.decline': 'דחייה',
  'communities.noFriends': 'עוד אין לך חברים כאן',
  // What a friend is FOR (user directive 2026-07-30): not the friend himself,
  // who needs no introduction and is excluded from the game outright as of
  // 20260730150000, but the people one hop past him, who carry both the x3 and
  // the "friend of Asaf" chip on their card. The line names ONLY them (user
  // directive 2026-07-30, second pass): the exclusion is a rule about who is
  // absent, and an empty page has to say what the user GETS. (Was
  // `friendsHint`, which no surface rendered and which still offered the
  // people-search flow removed 2026-07-26.)
  'communities.friendsWhy': 'כל חבר פותח לכם את האנשים שלו: כאלה שעוד לא הכרתם, שמגיעים אליכם ראשונים עם חבר משותף',
  'communities.unfriendTitle': 'להסיר את {name} מהחברים?',
  'communities.unfriendDesc': 'אפשר לשייך שוב בהמשך',
  'communities.unfriendConfirm': 'הסרה',

  // Link an existing friend
  'communities.linkTitle': 'שיוך חבר',
  'communities.request': 'בקשה',
  'communities.requested': 'נשלח',
  'communities.noResults': 'אין תוצאות',
  'communities.linkNote': 'הצד השני יקבל בקשה. אחרי אישור אתם מחוברים בשני הכיוונים',

  // Create a circle
  'communities.newGroup': 'מעגל חדש',
  'communities.name': 'שם',
  'communities.namePlaceholder': 'שם המעגל',
  'communities.createAction': 'יצירת המעגל',
  'communities.nameError': 'נדרש שם קצר יותר',
  'communities.description': 'תיאור',
  'communities.descriptionPlaceholder': 'על מה המעגל',
  'communities.descUpdate': 'עדכון',
  // קישור לפרטים נוספים: המנהלים מזינים אותו בהגדרות המעגל, וכל מי שרואה את
  // המעגל מקבל שורה אחת לחיצה מתחת לתיאור.
  'communities.link': 'קישור לפרטים נוספים',
  // הפועל מדבר אל המשתמש עצמו, ולכן הוא ממוגדר במקום (genderize) ולא נכתב
  // בשתי הצורות.
  'communities.linkPlaceholder': '{הדבק|הדביקי} לכאן קישור',
  // השרת הוא זה שמחליט אם הכתובת תקינה (הוא גם משלים https:// לכתובת חשופה),
  // ולכן ההודעה הזו נדלקת מתחת לשדה כשהוא סירב, והטקסט שנדחה נשאר בשדה לתיקון.
  'communities.linkInvalid': 'הקישור לא תקין',
  // סירוב כללי של שמירה (שם, תיאור): לא נשמר, אפשר לנסות שוב.
  'communities.saveFailed': 'לא נשמר, נסו שוב',
  'communities.moreDetails': 'לפרטים נוספים',

  // A circle you manage
  'communities.shareInvite': 'שיתוף קישור הזמנה',
  'communities.settings': 'הגדרות המעגל',
  // תצוגה מקדימה: הכפתור בכותרת של הגדרות המעגל, שפותח את הפופאפ של המעגל
  // בדיוק כפי שכל אחד אחר רואה אותו.
  'communities.preview': 'תצוגה מקדימה',
  // ניהול בלי לשחק. דגל על החברות שלי במעגל אחד שאני מנהל: כשהוא דלוק, אני
  // והחברים במעגל לא נפגשים במשחק. צ'קבוקס בהגדרות המעגל, מתחת לסוג המעגל,
  // וההסבר הוא שורת המשנה שלו.
  'communities.hiddenToggle': 'להסתיר אותי מחברי המעגל',
  'communities.hiddenSub': 'החברים במעגל לא יראו אותך במשחק ו{אתה לא תראה|את לא תראי} אותם. ההרשאות שלך במעגל נשארות בדיוק כמו קודם',
  'communities.hiddenShort': 'לא משחק',
  'communities.deleteGroup': 'מחיקת המעגל',
  'communities.deleteTitle': 'למחוק את {name}?',
  'communities.deleteDesc': 'המעגל וכל החברויות בו יימחקו. אי אפשר לבטל',
  'communities.deleteConfirm': 'מחיקה',
  // No confirm for taking a member out (user directive 2026-07-31): the tap
  // removes. `removeMemberTitle` / `removeMemberDesc` / `remove` are deleted with
  // that popup — the description WAS the reason it needed none ("they can join
  // again with the invite link"). `makePublic` / `makePrivate` / `approvalEnable`
  // / `approvalDisable` are deleted too (2026-08-01): they are the two-axis pair
  // the kind picker replaced on 2026-07-27, nothing has rendered them since, and
  // "הפיכה לציבורית" had no masculine form worth writing.
  // The queue's one name, on the roster row that unfolds it. Its page-title
  // twin (`requestsNav`) and its empty line (`noRequests`) went with the page
  // itself on 2026-07-31: the queue is a drawer inside the roster now, and a
  // drawer with nothing in it is not drawn at all.
  'communities.requestsSectionJoin': 'בקשות הצטרפות',
  'communities.approve': 'אישור',
  'communities.approveAll': 'אישור כולם',
  'communities.approveAllTitle': 'לאשר את כל הבקשות?',
  'communities.approveAllDesc': 'כל מי שממתין בתור יצורף למעגל {name}, ויקבל על כך התראה',
  'communities.declineJoin': 'דחייה',
  'communities.owner': 'בעלים',
  // The role is named for the one thing it does: answer join requests (user
  // directive 2026-07-30, replacing "manager" everywhere a user reads it). An
  // OPEN group has no such role at all, because nothing there waits on an
  // answer, so the appointment is offered on approved/private groups only.
  // The chip names a PERSON's role, so it inflects with whoever it is stuck to:
  // my own sex on the hub row (the group I approve for), the member's on a
  // roster row. Both call sites genderize with their own subject.
  'communities.manager': '{מאשר|מאשרת}',
  'communities.makeManager': 'מינוי כמאשר',
  'communities.removeManager': 'ביטול המינוי',
  'communities.removeFromGroup': 'הסרה מהמעגל',
  'communities.transferOwner': 'העברת בעלות',
  'communities.transferOwnerTitle': 'להעביר את הבעלות ל{name}?',
  'communities.transferOwnerDesc': 'המעגל יעבור לבעלות של {name}, ואצלך יישארו הרשאות אישור בלבד. אי אפשר לבטל',
  // An open circle has no approvers, so the outgoing owner keeps nothing: he is
  // a plain member of it from that moment.
  'communities.transferOwnerDescOpen': 'המעגל יעבור לבעלות של {name}, ואצלך לא יישארו הרשאות במעגל. אי אפשר לבטל',

  // A circle you are in
  'communities.leave': 'עזיבת המעגל',
  'communities.memberNote': 'חברי המעגל מופיעים אצלך בעדיפות גבוהה',

  // Find or join
  'communities.findTitle': 'הצטרפות למעגל',
  'communities.findSearch': 'חיפוש מעגל',
  // Searching the roster of a circle you manage: the mark on that page's bar,
  // the field's own placeholder, and the mark that ends the search. It looks
  // over BOTH lists at once, the people waiting and the people already in.
  'communities.searchPeople': 'חיפוש לפי שם',
  'communities.searchClose': 'סגירת החיפוש',
  // The line about the PERSON, standing over a circle's name on their page: who
  // they are and when they turned up here. Genderless in both languages, so a
  // row with no profile on it still reads (see memberSince / waitingSince), and
  // the name leads because everything else in that block is the circle's.
  'communities.inGroupSince': '{name} במעגל מאז {date}',
  // "בתור מאז", not "ממתין מאז": the sentence must stay genderless for real (a
  // row cached with no profile carries no is_male to inflect with), and the
  // participle was the one word in the pair that was not.
  'communities.waitingSince': '{name} בתור מאז {date}',
  'communities.orCode': 'או בקוד הזמנה',
  'communities.join': 'הצטרפות',
  // The chip says what I AM to this group, so it takes my own sex.
  'communities.joined': '{חבר|חברה}',
  'communities.requestJoin': 'בקשת הצטרפות',
  'communities.pending': 'ממתין לאישור',
  // A strip's chip, where the meta line already says the size: ONE word in the
  // corner the role chip sits in, not the sentence the popup's button says.
  // Where I stand with a group, on the hub and in search alike.
  'communities.pendingTag': 'בהמתנה',
  'communities.declinedTag': 'נדחתה',
  'communities.declined': 'הבקשה נדחתה',
  'communities.declinedTitle': 'הבקשה ל{name} נדחתה',
  'communities.declinedDesc': 'הבקשה שלכם לא אושרה. אפשר להסיר את ההודעה, ולנסות שוב בעוד חודש',
  'communities.declinedConfirm': 'הסרת ההודעה',
  // The pending circle's own popup: what the state is, and the button that ends
  // it (the same popup a circle you are in opens, with cancel instead of leave).
  // The sentence names no approver (user directive 2026-08-01): "לאישור של
  // המעגל" makes the circle the thing that decides, which a קבוצה could pass for
  // and a מעגל cannot, and naming the managers instead says more than the person
  // waiting needs. What is waiting is the approval, full stop.
  'communities.pendingNote': 'הבקשה שלכם ממתינה לאישור',
  'communities.cancelJoin': 'ביטול הבקשה',
  // Goes out to WhatsApp, i.e. to people who have never opened the app (user
  // directive 2026-08-01): "הצטרפו למעגל X" reads as a cult to someone with no
  // idea what a circle is here, so the message names the circle and the app and
  // leaves the term inside.
  'communities.shareMessage': 'הצטרפו אל {name} באפליקציית Once\n{link}',

  // Support: row in the account card. Opens the device mail composer at the
  // support inbox, with this subject prefilled.
  'settings.support': 'תמיכה',
  'support.mailSubject': 'תמיכה Once',
  // Site: the row under support. Opens the brand site's landing page in the
  // device browser, in the language the app is running in.
  'settings.site': 'אתר',
  'settings.preview': 'תצוגה מקדימה',
  'settings.photo': 'התמונות שלי',
  'settings.photoHint': 'לחיצה ארוכה וגרירה לשינוי סדר',
  'settings.aboutMe': 'קצת עלי',
  'settings.email': 'אימייל',
  'settings.name': 'שם',
  'settings.birthDate': 'תאריך לידה',
  'settings.gender': 'מגדר',
  'settings.male': 'גבר',
  'settings.female': 'אישה',
  'settings.accountDetails': 'פרטים',
  // Title of the account popup (the sheet the "Details" row opens).
  'settings.myAccount': 'החשבון שלי',
  'settings.deleteAccount': 'מחיקת חשבון',
  'settings.deleteConfirmTitle': 'מחיקת חשבון',
  'settings.deleteConfirmDesc': 'כל המידע, התמונות והשיחות יימחקו לצמיתות. הזמנות פעילות, שיחות וצפיות יבוטלו. לא ניתן לבטל פעולה זו',
  'settings.deleteYes': 'מחיקה',
  'settings.signOut': 'התנתק',
  'settings.signOutConfirmTitle': 'התנתקות',
  'settings.signOutConfirmDesc': 'לאחר ההתנתקות לא תקבל התראות. אם מישהו צופה בך כרגע, הוא יקבל התראה שהתנתקת',
  'settings.signOutYes': 'התנתקות',
  'settings.ageRange': 'בגילאים',
  'settings.ageFrom': 'מגיל',
  'settings.ageTo': 'עד גיל',
  'settings.add': 'הוספה',
  'settings.range': 'עד',
  // Distance-field LABEL when range is unlimited (then the value column is
  // left empty — the label says it all).
  'settings.rangeUnlimitedLabel': 'ללא הגבלת מרחק',
  'settings.rangeHere': 'ממש כאן',
  'settings.rangeUnlimited': 'ללא הגבלה',
  'settings.km': 'ק"מ',
  'settings.meter': "מ'",
  'settings.location': 'מיקום',
  'settings.locationDevice': 'מיקום שלי',
  'settings.locationCustom': 'כתובת מותאמת',
  'settings.locationHome': 'בית',
  'settings.locationWork': 'עבודה',
  // Location field LABEL, by the chosen anchor type (the value column shows
  // the address for home/work, nothing for the device case).
  'settings.locationFromHome': 'מהבית',
  'settings.locationFromWork': 'מהמשרד',
  'settings.locationFromDevice': 'מהמיקום הנוכחי שלי',
  'settings.locationCustomDesc': 'כתובת לפי בחירה',
  'settings.locationAddressPrompt': '{הקלד|הקלידי} כתובת או שם של עיר',
  'settings.locationSearch': 'חיפוש',
  'settings.locationNoResults': 'לא נמצאה כתובת כזאת. {נסה|נסי} ניסוח אחר',
  'settings.locationFetchingDevice': 'מקבל מיקום מהמכשיר...',
  'settings.locationDeviceFailedTitle': 'לא הצלחנו לקבל מיקום',
  'settings.locationDeviceFailedDesc': 'לאפשר גישה למיקום בהגדרות המכשיר ולנסות שוב',
  'settings.locationPermissionTitle': 'הרשאת מיקום',
  'settings.locationPermissionDesc': 'כדי להשתמש במיקום המכשיר יש לאפשר גישה למיקום',
  'settings.locationOk': 'אישור',
  'settings.locationCancel': 'ביטול',
  'settings.locationServicesOffTitle': 'שירותי המיקום כבויים',
  'settings.locationServicesOffDesc': 'יש להפעיל את שירותי המיקום במכשיר ולנסות שוב',
  'settings.locationLockedTitle': 'אי אפשר לשנות מיקום עכשיו',
  'settings.locationLockedDesc': 'כדי לשנות מיקום, נדרש לצאת קודם מהצפייה או מההזמנה הפעילה. אחרי {שתסיים|שתסיימי} את האינטראקציה הנוכחית, {תוכל|תוכלי} לעדכן את המיקום',
  'settings.duplicatePhotoTitle': 'תמונה כפולה',
  'settings.duplicatePhotoBody': 'לא ניתן להעלות את אותה תמונה פעמיים. תמונות כפולות הוסרו',
  'settings.photoEditMoveUp': 'הזזה למעלה',
  'settings.photoEditReplace': 'החלפת תמונה',
  'settings.photoEditMoveDown': 'הזזה למטה',
  'settings.photoEditDelete': 'מחיקה',
  // Each now stands where the thing it adds actually is: the photo in the
  // PHOTO's own menu, the family entry as the empty chip in the fact set's
  // place on the first photo (user directive 2026-08-01). The photo row is a
  // VERB — there is no longer a plus above it saying "add".
  'settings.addPhoto': 'הוספת תמונה',
  // The empty fact chip is NOT a verb: it names the FACT that is missing
  // (user directive 2026-08-02), the way a placeholder names the field it
  // stands in. "הוספת משפחה וילדים" described the act of filling a form; what
  // the reader of this card wants to know is where I stand on kids, which is
  // what the filled chip says too ("יש לי 2 ילדים ולא רוצה עוד").
  'settings.addFamily': 'התייחסות לילדים',
  // The one row of the first-open photo tutorial: the photo menu itself, saying
  // what opens it.
  'settings.photoMenuHint': 'לפעולות נוספות על תמונות יש ללחוץ על התמונה',
  'family.title': 'משפחה וילדים',
  'family.optional': 'אופציונאלי',
  'family.hasKidsQuestion': 'יש לך ילדים?',
  'family.hasKidsYes': 'יש לי ילדים',
  'family.hasKidsYesOne': 'יש לי ילד אחד',
  'family.hasKidsYesMany': 'יש לי {count} ילדים',
  'family.hasKidsNo': 'אין לי ילדים',
  'family.isForKids_m': 'מעוניין בילדים',
  'family.isForKids_f': 'מעוניינת בילדים',
  'family.isForKidsMore_m': 'מעוניין בעוד ילדים',
  'family.isForKidsMore_f': 'מעוניינת בעוד ילדים',
  'family.isForKidsYes': 'כן',
  'family.isForKidsNo': 'לא',
  'family.fivePlus': '5+',
  'family.agesQuestion': 'גילאי הילדים',
  'family.scheduleTitle': 'ימים שאני עם הילדים',
  'family.scheduleWeek1Label': 'הימים שבהם הילדים איתי (יש חזרתיות)',
  'family.scheduleWeek1LabelPrefix': 'הימים שבהם הילדים',
  'family.scheduleWeek1LabelEmphasis': 'איתי',
  'family.scheduleWeek1LabelSuffix': ' (יש חזרתיות)',
  'family.scheduleWeek1Hint_m': 'הימים שבהם אתה עם הילדים נשמרים אצלנו ולא מוצגים לאף משתמש. אנחנו משתמשים בהם כדי להציג לך את ההתאמות הרלוונטיות ביותר',
  'family.scheduleWeek1Hint_f': 'הימים שבהם את עם הילדים נשמרים אצלנו ולא מוצגים לאף משתמש. אנחנו משתמשים בהם כדי להציג לך את ההתאמות הרלוונטיות ביותר',
  'family.scheduleAdd': 'הוספת ימים',
  'family.scheduleRemove': 'הסרה',
  'family.weekLabel': 'שבוע {n}',
  'family.addWeek': 'הוספת שבוע נוסף',
  'family.removeWeek': 'הסרת שבוע',
  'family.agesAdd': 'הוספת גילאים',
  'family.agesRemove': 'הסרת גילאים',
  'family.agePlaceholder': 'בחירת גיל',
  'family.kidLabel': 'ילד {n}',
  'family.ageUnder1': 'פחות משנה',
  'family.ageOne': 'שנה',
  'family.ageTwo': 'שנתיים',
  'family.ageYears': '{n} שנים',
  'settings.weekStartLabel': 'תחילת שבוע',
  'settings.weekStartSunday': 'יום ראשון',
  'settings.weekStartMonday': 'יום שני',
  'family.dayShort.0': 'א',
  'family.dayShort.1': 'ב',
  'family.dayShort.2': 'ג',
  'family.dayShort.3': 'ד',
  'family.dayShort.4': 'ה',
  'family.dayShort.5': 'ו',
  'family.dayShort.6': 'ש',
  'family.summaryNoKids': 'אין לי ילדים',
  'family.summaryHasKids': 'יש לי ילדים',
  'family.summaryHasOneKid': 'יש לי ילד אחד',
  'family.summaryHasNKids': 'יש לי {n} ילדים',
  'family.summarySelfNoKids': 'אין לי ילדים',
  'family.summarySelfHasKids': 'יש לי ילדים',
  'family.summarySelfHasOneKid': 'יש לי ילד אחד',
  'family.summarySelfHasNKids': 'יש לי {n} ילדים',
  'family.wantsMore': 'רוצה עוד',
  'family.doesntWantMore': 'לא רוצה עוד',
  'family.wantsKids': 'רוצה ילדים',
  'family.doesntWantKids': 'לא רוצה ילדים',
  'family.selfWantsMore': 'רוצה עוד',
  'family.selfDoesntWantMore': 'לא רוצה עוד',
  'family.selfWantsKids': 'רוצה ילדים',
  'family.selfDoesntWantKids': 'לא רוצה ילדים',
  // Vav connector gluing the kids-preference phrase to the lead ("יש לי 3
  // ילדים ורוצה עוד") instead of a comma. Attaches directly to the word.
  'family.prefConnector': 'ו',
  'family.overlapLabel': '{pct}% חפיפה בימים פנויים',
  'family.overlapChip': '{pct}% חפיפה',
  'family.addKid': 'הוספת ילד',
  'family.ageNotSet': 'ללא גיל',
  'family.ageFortyPlus': '40+',
  'family.summaryFreeWeekend_m': 'פנוי בסופ״ש הקרוב',
  'family.summaryFreeWeekend_f': 'פנויה בסופ״ש הקרוב',
  'family.summaryWithKidsWeekend_m': 'לא פנוי בסופ״ש הקרוב',
  'family.summaryWithKidsWeekend_f': 'לא פנויה בסופ״ש הקרוב',
  'common.gotIt': 'הבנתי',
  // Count phrase with correct singular/plural, built by creditsText() in
  // lib/credits.ts. Used wherever a credits amount is shown in prose.
  'credits.count.one': 'קרדיט אחד',
  'credits.count.many': '{n} קרדיטים',
  // Credits picker. Since 2026-07-28 it is a plain ConfirmDialog: this title,
  // one sentence and one action button. The dead 3/10/50 packs and the
  // paragraph above them are gone.
  'credits.buy.title': 'עוד קרדיטים',
  // The popup's sentence. It states the two ways credits arrive, THE INVITE
  // FIRST (user directive 2026-07-31): that is the one the button under it
  // offers and the only one the user can act on, so the sentence and the action
  // read as one thing. The daily refill follows as the fallback it actually is,
  // and states its own condition up front ("if you have no credits") rather
  // than in a parenthesis at the end ({time} is a bare "HH:MM" from
  // formatGrantTime). Deliberately NOT the friends page's caption
  // (communities.inviteReward) that used to be reused here (user directive
  // 2026-07-28): this popup is where someone comes when the wallet is empty, so
  // it has to answer "when do I get one anyway", which that caption never said.
  // The verb addressing the user is gendered by the inline {male|female}
  // marker, so the call site must genderize(). The no-hour variant covers a
  // wallet the server hasn't stamped a next-refill on yet.
  'credits.buy.desc': 'על כל חבר שמצטרף דרכך, שניכם מקבלים קרדיט נוסף. אם אין לך קרדיטים, בכל יום בשעה {time} {תקבל|תקבלי} קרדיט חדש',
  'credits.buy.descNoTime': 'על כל חבר שמצטרף דרכך, שניכם מקבלים קרדיט נוסף. אם אין לך קרדיטים, בכל יום {תקבל|תקבלי} קרדיט חדש',
  // Same sheet, opened at the paywall moment (an invite/accept the user can't
  // afford). There the title names the reason it appeared instead of the thing
  // it offers. Reached from the settings credits row, it keeps the title above.
  'credits.buy.emptyTitle': 'נגמרו לך הקרדיטים',
  // The popup's action button: the one active way to earn. The verb is gendered
  // by the user's own sex via the inline {male|female} marker, so the call site
  // must use genderize() — tg() only resolves whole-string _m/_f keys and
  // would print the marker as-is. The friend stays ungendered ("חבר" covers
  // any friend you'd invite).
  'credits.invite.title': '{הזמן|הזמיני} חבר',
  // Text that rides along with the link in the OS share sheet. Plural, like the
  // group's own share message: the READER is whoever the link is sent to, and
  // their sex is the one thing this sentence can never know.
  'credits.invite.shareText': 'הצטרפו אליי ל Once',
  'settings.miles': 'מייל',
  // Gendered by the user's own sex via genderize() ({male|female} marker).
  'settings.preferredGender': '{פנוי|פנויה}',
  'settings.genderM': 'לגברים',
  'settings.genderF': 'לנשים',
  'settings.genderBoth': 'לכולם',

  // Match
  // Relative time, genderless and without the "מחובר" prefix: the suffix of the
  // merged proximity chip (formatAgo), and the only set there is — the old
  // standalone match.*Ago wording is deleted.
  'match.ago.now': 'עכשיו',
  'match.ago.min': 'לפני דקה',
  'match.ago.mins': 'לפני {n} דקות',
  'match.ago.hr': 'לפני שעה',
  'match.ago.hrs2': 'לפני שעתיים',
  'match.ago.hrs': 'לפני {n} שעות',
  'match.ago.day': 'לפני יום',
  'match.ago.days2': 'לפני יומיים',
  'match.ago.days': 'לפני {n} ימים',

  // Errors

  // Home — modes
  'home.hiddenHeaderTitle': 'מי רואה אותי',
  'home.notifAccessRequired_m': 'נדרשת גישה להתראות כדי שלא תפספס סימן',
  'home.notifAccessRequired_f': 'נדרשת גישה להתראות כדי שלא תפספסי סימן',
  'home.locationAccessRequired': 'נדרשת גישה למיקום כדי לראות את המרחק',
  'home.noInternetTitle': 'אין חיבור לאינטרנט',
  'home.noInternetDesc': 'Once זקוקה לחיבור אינטרנט כדי לפעול. יש לבדוק את הוויי-פיי או את חבילת הגלישה ולנסות שוב',
  // Gendered (אתה / את). Picked via tg(_m/_f) against the caller's is_male.
  'settings.hideConfirmTitle': 'להסתיר את הפרופיל?',
  'settings.hideConfirmDesc': 'כל הצופים בך יוסרו ויקבלו על כך התראה',
  'settings.hideConfirmDescOne': 'הצופה שיש לך כרגע יוסר ויקבל על כך התראה',
  'settings.hideConfirmDescMany': '{count} הצופים שיש לך כרגע יוסרו ויקבלו על כך התראה',
  'settings.hideConfirmButton': 'הסתרה',

  // Home — match teaser
  // Ready-to-find headline pool. One line is picked at random each time the
  // home pane (re)enters the ready state (see home.tsx headlineText). Stored
  // as a newline-joined block, one sentence per source line; consumed via
  // .split('\n') so adding/removing a line needs no other change.
  'home.readyHeadlines': `פחות גלילה, יותר פגישה
אדם אחד מקבל מקום
הזמן שלך שווה נוכחות
חיבור מתחיל בקשב
לא קטלוג, רגע חי
מי שכאן, כאן באמת
פחות רעש, יותר אומץ
הזדמנות אחת פתוחה עכשיו
רגע אמיתי לא מחכה
בוחרים פחות, מרגישים יותר
מפגש אחד בלי מסכים פתוחים
נוכחות משנה את כל התמונה
לא כולם, רק אחד עכשיו
כשהלב פנוי, משהו קורה
שיחה אחת יכולה להספיק
בלי משחקים, עם כוונה
להיות {זמין|זמינה} למשהו אמיתי
אהבה לא מתחילה ברשימה
{תן|תני} לרגע לבחור אותך
מישהו רואה אותך עכשיו
פחות אפשרויות, יותר בהירות
חיבור צריך מקום לנשום
לא לחפש, להיפגש
מי שבפוקוס, מקבל מקום
העולם זז, {אתה|את} {נוכח|נוכחת}
כשזה קורה, זה עכשיו
לא עוד החמצות שקטות
פגישה מתחילה בהחלטה קטנה
מישהו אחד משנה את הערב
בלי רעשי רקע רומנטיים
להיות כאן זה כבר משהו
יש קסם בפחות
כוונה אחת, רגע אחד
לאסוף אומץ, לא התאמות
חיבור טוב לא צריך עומס
עכשיו הוא זמן טוב
פחות לבד מול אינסוף
מבט אחד לפני עוד גלילה
לתת סיכוי לרגע
לא עוד חלונות פתוחים
מישהו מחכה לקשב שלך
רגע ברור בתוך הבלגן
לבחור נוכחות על פני שפע
אהבה אוהבת שקט
לפעמים אחד זה עולם
בלי לברוח לאפשרות הבאה
להיות {פנוי|פנויה} באמת
קשר מתחיל כשעוצרים
רק רגע, רק אתם
מפגש טוב מתחיל בשקט
משהו אמיתי מתחיל כאן
{תן|תני} למישהו מקום
הערב יכול להשתנות עכשיו
כל מה שצריך הוא רגע
מישהו חדש מחכה מעבר ללחיצה
פחות להשוות, יותר להרגיש
רגע אחד יכול להפתיע
אין צורך לדעת מראש
מספיק לבחור להיות כאן
אולי החיבור הבא קרוב
לפעמים צריך רק לעצור
מפגש מתחיל כשנותנים מקום
מישהו יכול להרגיש נכון
הלב מזהה בלי רשימות
חיבור קורה כשנשארים
יש מקום למשהו חדש
{פתח|פתחי} דלת לרגע
לא כל רגע צריך הסבר
לפעמים פשוט לוחצים ונפגשים
מישהו יכול לשנות כיוון
עכשיו אפשר לפגוש באמת
פחות לחשוב, יותר להיות
{תן|תני} לערב להפתיע
החיבור הבא מתחיל כאן
משהו חדש יכול להתחיל
לא צריך למהר הלאה
אדם אחד, תשומת לב מלאה
אפשרות אחת, נוכחות שלמה
אולי זה הרגע לעצור
להיות פתוחים למה שיגיע
הרגע הבא יכול להספיק
לפעמים הקסם מתחיל בלחיצה
כל פגישה מתחילה בסקרנות
מישהו מחכה שתופיע
יש מישהו שכדאי לפגוש
{בחר|בחרי} רגע אחד אמיתי
לא עוד מסך, מפגש
לתת מקום למה שמגיע
אולי מישהו מחפש בדיוק אותך
עכשיו אפשר להתחיל מחדש
מפגש אחד שווה ניסיון
מישהו אחד, בלי הסחות
הלב פתוח כשעוצרים
להתחיל קטן, להרגיש גדול
רגע אחד מחוץ לאינסוף
פחות אפשרויות, יותר סיכוי
{היה|היי} כאן באמת
כל חיבור מתחיל באפשרות
לפעמים הבא הוא הנכון
ללחוץ ולראות מה קורה`,
  // Skip-feedback headline pool. One line is picked at random when a skip
  // starts (see home.tsx skipHeadlineIdx) and shown in the headline slot
  // above the centre button for the duration of that skip. Same newline-block
  // format as home.readyHeadlines.
  'home.skipHeadlines': `ממשיכים הלאה
לא הפעם
אולי הבא
זה בסדר
הכול טוב
עוד אפשרות
הבא מסקרן
ממשיכים בנחת
משחררים בעדינות
נשארים פתוחים
הבא יפתיע
עוד מבט
בלי לחץ
ממשיכים ברוגע
אולי בהמשך
הדרך פתוחה
עוד הזדמנות
קדימה בשקט
הבא בדרך
לא עכשיו
ממשיכים בקלילות
עוד מישהו
אולי שם
הכול פתוח
ממשיכים לבדוק
הרגע הבא
בחירה טובה
עוד סיכוי
ממשיכים בזרימה
אולי בקרוב
הבא מחכה
עוברים ברכות
עוד כיוון
נשארים סקרנים
ממשיכים קדימה
משהו אחר
אולי אחר כך
עוד פנים
ממשיכים בעדינות
לא מרגיש נכון
פותחים לחדש
עוד חיבור
ממשיכים לבחור
אולי הפעם
הבא עשוי להתאים
עוד רגע
ממשיכים לגלות
בחירה נקייה
הבא יכול להפתיע
משחררים וממשיכים
עוד פתח
אולי זה הבא
ממשיכים פתוחים
הבא אולי יתאים
לא כרגע
עוד מפגש
הדרך ממשיכה
ממשיכים בסקרנות
אולי עוד מעט
הבא ירגיש אחרת
עוברים הלאה
עוד ניסיון
ממשיכים קליל
הלב נשאר פתוח
אולי מישהו אחר
הבא יכול להתאים
עוד בחירה
ממשיכים בשקט
לא מתאים עכשיו
הכול אפשרי
עוד רגע חדש
ממשיכים רגוע
אולי חיבור אחר
הבא מרגיש קרוב
עוד דלת
פותחים אפשרות
ממשיכים עם הלב
לא הפעם הזו
הבא כבר מגיע
עוד משהו
ממשיכים אל החדש
אולי בפעם אחרת
הכול עדיין פתוח
הבא יכול להיות
עוד אדם
ממשיכים בקצב
לא חייב להתאים
אולי עוד אחד
הבא עשוי להפתיע
עוד הזדמנות בדרך
ממשיכים למה שנכון
לא צריך בכוח
אולי הרגע הבא
הבא מביא אפשרות
עוד מקום לחדש
ממשיכים בלי לחץ
הבחירה ממשיכה
אולי שם ירגיש
הבא פותח דלת
ממשיכים לאפשרות הבאה`,
  // Geo-availability gate. Shown in the rotating-headline slot when the
  // server marks the user outside every active area (unavailable) or inside
  // an area that has not opened yet (notYet). While shown, the side tab is
  // removed so page2/chat is unreachable.
  // {date} is interpolated by home.tsx from availability.starts_at (the
  // area's launch time) — keep the placeholder.
  'home.geoGate.unavailable': 'האפליקציה לא זמינה באזורך',
  'home.geoGate.notYet': 'נפתח באזורך {date}',
  // Join-request gate: the user is not in any active group. The center
  // icon-button itself sends the request (no separate button label).
  'home.joinGate.requestText': 'הגישה באישור, בקשו להצטרף',
  'home.joinGate.waitingText': 'הבקשה נשלחה, ממתינים לאישור',
  'home.startNow': 'להתחיל עכשיו',
  // WHERE THE CLOCK WAS, once it has run out (user directive 2026-08-01). A card
  // that is over has no deadline left, and an empty slot beside the name read as
  // a clock that had failed rather than one that had finished.
  'home.cardEnded': 'הסתיים',
  'home.endedBack': 'חזרה למשחק',

  // Locked-state cards: page1 (after a terminal event) and page2 (dead invite).
  // Key shape: home.locked.<page>.<message>.{title,desc}
  // Locked page1 cards reference the other user ("she/he"). `tg(key, otherMale)`
  // picks `_m` when the other user is male, `_f` when female. Texts where only
  // the other's gender matters (most of them) get full _m/_f variants.
  'home.locked.page1.invite.title': 'היא כבר לא זמינה',
  'home.locked.page1.invite.title_m': 'הוא כבר לא זמין',
  'home.locked.page1.invite.title_f': 'היא כבר לא זמינה',
  'home.locked.page1.invite.desc': 'היא כבר בהזמנה אחרת, אז אי אפשר לשלוח לה כרגע. אפשר להמשיך הלאה',
  'home.locked.page1.invite.desc_m': 'הוא כבר בהזמנה אחרת, אז אי אפשר לשלוח לו כרגע. אפשר להמשיך הלאה',
  'home.locked.page1.invite.desc_f': 'היא כבר בהזמנה אחרת, אז אי אפשר לשלוח לה כרגע. אפשר להמשיך הלאה',
  'home.locked.page1.extend.title': 'אי אפשר להאריך',
  'home.locked.page1.extend.desc': 'ההזמנה כבר נסגרה. אפשר לחזור ולמצוא חיבור אחר',
  'home.locked.page1.approve.title': 'החיבור כבר לא זמין',
  'home.locked.page1.approve.desc': 'משהו השתנה לפני שהספקתם להתחבר. אפשר להמשיך הלאה',
  'home.locked.page1.approve.desc_m': 'משהו השתנה לפני שהספקתם להתחבר. אפשר להמשיך הלאה',
  'home.locked.page1.approve.desc_f': 'משהו השתנה לפני שהספקתם להתחבר. אפשר להמשיך הלאה',
  'home.locked.page1.decline.title': 'היא לא אישרה הפעם',
  'home.locked.page1.decline.title_m': 'הוא לא אישר הפעם',
  'home.locked.page1.decline.title_f': 'היא לא אישרה הפעם',
  'home.locked.page1.decline.desc': 'היא בחרה לא להמשיך כרגע. הכול טוב, אפשר לעבור לחיבור הבא',
  'home.locked.page1.decline.desc_m': 'הוא בחר לא להמשיך כרגע. הכול טוב, אפשר לעבור לחיבור הבא',
  'home.locked.page1.decline.desc_f': 'היא בחרה לא להמשיך כרגע. הכול טוב, אפשר לעבור לחיבור הבא',
  'home.locked.page1.leave.title': 'השיחה הסתיימה',
  'home.locked.page1.leave.desc': 'היא יצאה מהשיחה. אפשר לחזור ולמצוא חיבור חדש',
  'home.locked.page1.leave.desc_m': 'הוא יצא מהשיחה. אפשר לחזור ולמצוא חיבור חדש',
  'home.locked.page1.leave.desc_f': 'היא יצאה מהשיחה. אפשר לחזור ולמצוא חיבור חדש',
  'home.locked.page1.block.title': 'השיחה הסתיימה',
  'home.locked.page1.block.desc': 'היא בחרה לסיים את החיבור. אפשר להמשיך הלאה',
  'home.locked.page1.block.desc_m': 'הוא בחר לסיים את החיבור. אפשר להמשיך הלאה',
  'home.locked.page1.block.desc_f': 'היא בחרה לסיים את החיבור. אפשר להמשיך הלאה',
  'home.locked.page1.remove.title': 'היא כבר לא זמינה לך',
  'home.locked.page1.remove.title_m': 'הוא כבר לא זמין לך',
  'home.locked.page1.remove.title_f': 'היא כבר לא זמינה לך',
  'home.locked.page1.remove.desc': 'היא הסירה אותך מרשימת הצופים שלה. אפשר לחזור ולמצוא חיבור אחר',
  'home.locked.page1.remove.desc_m': 'הוא הסיר אותך מרשימת הצופים שלו. אפשר לחזור ולמצוא חיבור אחר',
  'home.locked.page1.remove.desc_f': 'היא הסירה אותך מרשימת הצופים שלה. אפשר לחזור ולמצוא חיבור אחר',
  'home.locked.page1.expire.title': 'היא לא הספיקה לענות',
  'home.locked.page1.expire.title_m': 'הוא לא הספיק לענות',
  'home.locked.page1.expire.title_f': 'היא לא הספיקה לענות',
  'home.locked.page1.expire.desc': 'הזמן עבר ללא תשובה. אפשר להמשיך ולשלוח הזמנה למישהי אחרת',
  'home.locked.page1.expire.desc_m': 'הזמן עבר ללא תשובה. אפשר להמשיך ולשלוח הזמנה למישהו אחר',
  'home.locked.page1.expire.desc_f': 'הזמן עבר ללא תשובה. אפשר להמשיך ולשלוח הזמנה למישהי אחרת',
  'home.locked.page1.logout.title': 'היא כבר לא כאן',
  'home.locked.page1.logout.title_m': 'הוא כבר לא כאן',
  'home.locked.page1.logout.title_f': 'היא כבר לא כאן',
  'home.locked.page1.logout.desc': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה',
  'home.locked.page1.logout.desc_m': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה',
  'home.locked.page1.logout.desc_f': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה',
  'home.locked.page1.delete.title': 'היא כבר לא כאן',
  'home.locked.page1.delete.title_m': 'הוא כבר לא כאן',
  'home.locked.page1.delete.title_f': 'היא כבר לא כאן',
  'home.locked.page1.delete.desc': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה',
  'home.locked.page1.delete.desc_m': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה',
  'home.locked.page1.delete.desc_f': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה',

  // Home — subscription toggle button

  // Home — visible confirm popup

  // Home — reveal confirm popup (HIDDEN → VISIBLE)

  // Home — invite-to-chat confirm popup. tgg(key, senderMale, inviteeMale):
  // suffix _<sender><invitee>. Title varies only by invitee (אותה/אותו);
  // desc varies by sender (אתה/את + שולח/שולחת), by invitee (היא/הוא +
  // מקבלת/מקבל + לה/לו), and "שתיכן" only when both are female.
  'home.inviteConfirmTitle': 'להזמין אותה לצ׳אט?',
  'home.inviteConfirmTitle_mm': 'להזמין אותו לצ׳אט?',
  'home.inviteConfirmTitle_mf': 'להזמין אותה לצ׳אט?',
  'home.inviteConfirmTitle_fm': 'להזמין אותו לצ׳אט?',
  'home.inviteConfirmTitle_ff': 'להזמין אותה לצ׳אט?',
  'home.inviteConfirmDesc': 'אם תשלח, שניכם תנעלו להזמנה הזו ויהיו לה 10 דקות להגיב עליה',
  'home.inviteConfirmDesc_mm': 'אם תשלח, שניכם תנעלו להזמנה הזו ויהיו לו 10 דקות להגיב עליה',
  'home.inviteConfirmDesc_mf': 'אם תשלח, שניכם תנעלו להזמנה הזו ויהיו לה 10 דקות להגיב עליה',
  'home.inviteConfirmDesc_fm': 'אם תשלחי, שניכם תנעלו להזמנה הזו ויהיו לו 10 דקות להגיב עליה',
  'home.inviteConfirmDesc_ff': 'אם תשלחי, שתיכן תנעלנה להזמנה הזו ויהיו לה 10 דקות להגיב עליה',
  'home.inviteConfirmOk': 'הזמנה לצ׳אט',
  'home.inviteTimerLabel': 'זמן שנותר',
  'home.inviteTimerLabelExtended': 'הוארך התוקף',
  'home.inviteExpired': 'פג תוקף',
  // Locked page2 cards reference both the inviter ("he/she") and the user's own
  // state ("available/answered"). `tgg(key, userMale, otherMale)` picks _uo
  // (e.g. _mf = user-male, other-female). _mm/_mf/_fm/_ff cover all variants;
  // _mm stays as the legacy default-key fallback.
  'home.locked.page2.cancel.title': 'ההזמנה בוטלה',
  'home.locked.page2.cancel.desc': 'הוא ביטל את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמין לאחרים',
  'home.locked.page2.cancel.desc_mm': 'הוא ביטל את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמין לאחרים',
  'home.locked.page2.cancel.desc_mf': 'היא ביטלה את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמין לאחרות',
  'home.locked.page2.cancel.desc_fm': 'הוא ביטל את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמינה לאחרים',
  'home.locked.page2.cancel.desc_ff': 'היא ביטלה את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמינה לאחרות',
  'home.locked.page2.approve.title': 'ההזמנה כבר לא זמינה',
  'home.locked.page2.approve.desc': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמין לאחרים',
  'home.locked.page2.approve.desc_mm': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמין לאחרים',
  'home.locked.page2.approve.desc_mf': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמין לאחרות',
  'home.locked.page2.approve.desc_fm': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמינה לאחרים',
  'home.locked.page2.approve.desc_ff': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמינה לאחרות',
  'home.locked.page2.expire.title': 'ההזמנה נסגרה',
  'home.locked.page2.expire.desc': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמין',
  'home.locked.page2.expire.desc_mm': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמין',
  'home.locked.page2.expire.desc_mf': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמין',
  'home.locked.page2.expire.desc_fm': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמינה',
  'home.locked.page2.expire.desc_ff': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמינה',
  'home.locked.page2.logout.title': 'הוא כבר לא כאן',
  'home.locked.page2.logout.title_mm': 'הוא כבר לא כאן',
  'home.locked.page2.logout.title_mf': 'היא כבר לא כאן',
  'home.locked.page2.logout.title_fm': 'הוא כבר לא כאן',
  'home.locked.page2.logout.title_ff': 'היא כבר לא כאן',
  'home.locked.page2.logout.desc': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.logout.desc_mm': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.logout.desc_mf': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.logout.desc_fm': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.logout.desc_ff': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.delete.title': 'הוא כבר לא כאן',
  'home.locked.page2.delete.title_mm': 'הוא כבר לא כאן',
  'home.locked.page2.delete.title_mf': 'היא כבר לא כאן',
  'home.locked.page2.delete.title_fm': 'הוא כבר לא כאן',
  'home.locked.page2.delete.title_ff': 'היא כבר לא כאן',
  'home.locked.page2.delete.desc': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.delete.desc_mm': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.delete.desc_mf': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.delete.desc_fm': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה',
  'home.locked.page2.delete.desc_ff': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה',
  'home.waitingTimerSubtext': 'ההזמנה תהיה זמינה ל{n} הדקות הקרובות',
  'home.waitingTimerTitle': 'ההזמנה שלך מחכה לו',
  'home.waitingTimerTitle_m': 'ההזמנה שלך מחכה לו',
  'home.waitingTimerTitle_f': 'ההזמנה שלך מחכה לה',
  'home.waitingTimerDesc': 'ובזמן הזה, הוא לא יקבל הזמנות אחרות. הקרדיט שלך יחזור אליך רק אם הוא ידחה או לא יענה בזמן',
  'home.waitingTimerDesc_mm': 'ובזמן הזה, הוא לא יקבל הזמנות אחרות. הקרדיט שלך יחזור אליך רק אם הוא ידחה או לא יענה בזמן',
  'home.waitingTimerDesc_mf': 'ובזמן הזה, היא לא תקבל הזמנות אחרות. הקרדיט שלך יחזור אליך רק אם היא תדחה או לא תענה בזמן',
  'home.waitingTimerDesc_fm': 'ובזמן הזה, הוא לא יקבל הזמנות אחרות. הקרדיט שלך יחזור אליך רק אם הוא ידחה או לא יענה בזמן',
  'home.waitingTimerDesc_ff': 'ובזמן הזה, היא לא תקבל הזמנות אחרות. הקרדיט שלך יחזור אליך רק אם היא תדחה או לא תענה בזמן',
  // The TITLE of the app's one build-profile gate, shared by two of its three
  // doors (the invite prompt and the preferences' visibility row), and the
  // invite door's own sentence under it. Its button is `settings.buildProfile`,
  // which is what every one of those doors says: there was a second key here
  // with the identical Hebrew word, and the two drifted in English alone.
  // BOTH NAME THE PHOTOS, NOT "A PROFILE" (user directive 2026-08-01), and they
  // do not COUNT them either: "two" is a requirement to satisfy where "photos"
  // is a thing to go and do, and the photo step says the number itself
  // (`photo.sub`, "הוסף 2-6 תמונות") the moment the user is standing in front of
  // it. Naming the photos also takes the imperative out of the title, so it is
  // genderless and neither host genderizes it.
  'home.buildProfileTitle': 'נדרשות תמונות שלך',
  'home.buildProfileDesc': 'כדי לשלוח הזמנה נדרשות תמונות שלך',
  // The browse allowance (lib/browseGate.ts): an account with no profile watches
  // two people and then the centre circle stops being the play button and says
  // this — the pane's own headline, the way every centre notice states its
  // reason in that slot. It is the WHOLE of what that gate says: the circle goes
  // straight to the photo step now, so there is no popup and no sentence under a
  // title any more (the `home.browseGateDesc` that was here is deleted). It
  // names the PHOTOS rather than "a profile" (user directive 2026-08-01) — that
  // is the whole of what is missing, and it is what the camera in the circle
  // under it opens.
  'home.browseGateTitle': 'כדי להמשיך נדרשות תמונות פרופיל',
  'home.cancelWaitingTitle': 'לבטל את ההזמנה?',
  'home.cancelWaitingBtn': 'ביטול הזמנה',
  'home.cancelWaitingDesc': 'ההזמנה תבוטל מיד. היא תחזור להיות זמינה לאחרים, וגם אתה תוכל להמשיך להזמין',
  'home.cancelWaitingDesc_mm': 'ההזמנה תבוטל מיד. הוא יחזור להיות זמין לאחרים, וגם אתה תוכל להמשיך להזמין',
  'home.cancelWaitingDesc_mf': 'ההזמנה תבוטל מיד. היא תחזור להיות זמינה לאחרים, וגם אתה תוכל להמשיך להזמין',
  'home.cancelWaitingDesc_fm': 'ההזמנה תבוטל מיד. הוא יחזור להיות זמין לאחרים, וגם את תוכלי להמשיך להזמין',
  'home.cancelWaitingDesc_ff': 'ההזמנה תבוטל מיד. היא תחזור להיות זמינה לאחרים, וגם את תוכלי להמשיך להזמין',
  'home.cancelWaitingConfirm': 'לבטל הזמנה',
  'home.refuseReplyTitle': 'לדחות את ההזמנה?',
  'home.refuseReplyDesc': 'ההזמנה תיסגר, והצד השני יקבל עדכון',
  'home.refuseReplyDesc_m': 'ההזמנה תיסגר, והצד השני יקבל עדכון',
  'home.refuseReplyDesc_f': 'ההזמנה תיסגר, והצד השני יקבל עדכון',
  'home.refuseReplyConfirm': 'לדחות את ההזמנה',
  'home.watchingReject': 'דילוג',
  // Shown in the rotating-headline slot for the duration of the first-time
  // swipe-down tutorial, instead of that card's random skip line: while the
  // card peeks down and reveals the slot, the text names the gesture.
  'home.skipTutorialHint': 'דילוג בהחלקה למטה',
  // Incoming-invite card (page2). Title via tg(key, inviterMale) — only the
  // inviter's gender (הוא/היא + הזמין/הזמינה). Desc via tgg(key, receiverMale,
  // inviterMale) → suffix _<receiver><inviter>: receiver drives תחליטי/תחליט
  // + ואת לא מקבלת/ואתה לא מקבל, inviter drives הוא/היא מחכה.
  'home.replyingTitle': 'הוא הזמין אותך לצ׳אט',
  'home.replyingTitle_m': 'הוא הזמין אותך לצ׳אט',
  'home.replyingTitle_f': 'היא הזמינה אותך לצ׳אט',
  // The popup that ANSWERS an arriving invitation (user directive 2026-08-01). It
  // speaks the send prompt's language — the fact, one sentence about what the
  // press does, and the purple button carrying the credit gem — but it does not
  // ASK whether to approve: the user opened it by reaching for the chat, so what
  // it owes him is what approving DOES and what it COSTS, said once. It replaced
  // a sentence about the other side being locked to him, which is true and is
  // not what he is deciding.
  //
  // No gendered variants: nothing in it refers to either person.
  'home.replyingDesc': 'אישור ההזמנה פותח ביניכם צ׳אט, ועולה קרדיט אחד',
  'home.replyingAccept': 'אישור הזמנה',
  'home.replyingReject': 'לדלג',
  'home.chatHeader': 'אתם אחד על אחד',
  // The one popup ending a chat: its title, its sentence and its two answers,
  // which are chat.leave (the purple) and chat.block. There is no separate
  // confirm behind either of them any more (user directive 2026-08-02), so the
  // confirm labels that named the same two actions a second time — and the
  // block's own title and paragraph — are deleted.
  'home.leaveTitle': 'סיום צ\'אט',
  'home.leaveDesc': 'הצ\'אט ייסגר לצמיתות ולא ניתן יהיה לשחזר אותו. הצד השני יקבל התראה',
  'chat.empty': 'עוד אין הודעות',
  'chat.inputPlaceholder': 'כתוב הודעה...',
  'chat.today': 'היום',
  'chat.yesterday': 'אתמול',
  'chat.dayBeforeYesterday': 'שלשום',
  'chat.block': 'חסימה',
  'chat.endChat': 'סיום צ\'אט',
  'chat.leave': 'עזיבה',
  // (The chat sheet's own close label went with its X on 2026-07-31 — the sheet
  // is put away by dragging its top strip. The lightbox below keeps one.)
  'chat.a11y.closeImage': 'סגירת התמונה',
  'chat.report': 'דיווח',
  'chat.reportTitle': 'דיווח על המשתמש',
  'chat.reportPlaceholder': 'מה לא בסדר? (אופציונאלי)',
  'chat.reportConfirm': 'דיווח וחסימה',
  'chat.newMessages': 'הודעות חדשות',
  'chat.attachMenu.image': 'תמונה',
  'chat.attachMenu.location': 'מיקום',
  'chat.attachMenu.schedule': 'לוז',
  'chat.confirmSend.location': 'שליחת המיקום הנוכחי שלך',
  'chat.confirmSend.location_m': 'שליחת המיקום הנוכחי שלך',
  'chat.confirmSend.location_f': 'שליחת המיקום הנוכחי שלך',
  'chat.confirmSend.schedule': 'שליחת לוח הזמנים עם הילדים',
  'chat.confirmSend.schedule_m': 'שליחת לוח הזמנים עם הילדים',
  'chat.confirmSend.schedule_f': 'שליחת לוח הזמנים עם הילדים',
  'chat.confirmSend.send': '{שלח|שלחי}',
  'chat.locationLabel': 'מיקום',
  'chat.locationOpen': 'הקש לפתיחה במפות',
  'chat.scheduleTitle': 'הימים שאני פנוי (ללא ילדים)',
  'chat.scheduleTitle_m': 'הימים שאני פנוי (ללא ילדים)',
  'chat.scheduleTitle_f': 'הימים שאני פנויה (ללא ילדים)',
  'chat.retry': '{שלח|שלחי} שנית',
  'chat.reply.image': 'תמונה',
  'chat.reply.audio': 'הודעה קולית',
  'chat.reply.location': 'מיקום',
  'chat.reply.schedule': 'לוז',
  'chat.reply.a11y': 'תגובה להודעה',
  'chat.reply.you': 'את',
  'chat.reply.you_m': 'אתה',
  'chat.reply.you_f': 'את',
  'chat.msgActions.reply': 'תגובה להודעה',
  'chat.msgActions.copy': 'העתקת הטקסט',

  // Gender-aware: user gender
  'home.locationUnavailableTitle': 'מיקום לא זמין',
  // The four entries in the strip at the foot of home (HomeDock). ONE WORD each:
  // the caption names the glyph over it in a quarter of the screen's width, so
  // anything longer wraps to two lines on every phone. Circles takes the one
  // Circles string the whole app shares (communities.menuRow). The last one is
  // "More" rather than "Settings" (user directive 2026-07-30) — what it opens is
  // the wallet, the account, support and the site, which is everything else
  // rather than a preferences screen.
  'home.dock.profile': 'פרופיל',
  'home.dock.preferences': 'העדפות',
  'home.dock.more': 'עוד',
  // Accessibility labels for controls with no visible text. The menu button's two
  // labels went with the button (2026-07-30), the invite's with its X (same day:
  // the card answers with a named button, not an X), and the profile sheet's and
  // Circles' with theirs (2026-07-31: those surfaces leave by the swipe). The
  // dock's entries are labelled by their own captions.
  // Both marks the heading tile can carry that go UP to the card's own message,
  // where the buttons that answer it are: the clock of a live invitation, and the
  // X of a card that is over. One journey, so one label.
  'home.a11y.cardMessage': 'מעבר להודעה',
  'home.locatingDesc': 'סורק אנשים בסביבתך',
  'home.loadingProfile': 'טוען נתוני פרופיל',
  'home.noOneNearbyTitle': 'אין כרגע אנשים בסביבה',
  'settings.deleteConfirmDesc_m': 'כל המידע, התמונות והשיחות יימחקו לצמיתות. הזמנות פעילות, שיחות וצפיות יבוטלו. לא ניתן לבטל פעולה זו',
  'settings.deleteConfirmDesc_f': 'כל המידע, התמונות והשיחות יימחקו לצמיתות. הזמנות פעילות, שיחות וצפיות יבוטלו. לא ניתן לבטל פעולה זו',
  'settings.signOut_m': 'התנתקות מהאפליקציה',
  'settings.signOut_f': 'התנתקות מהאפליקציה',
  'settings.signOutConfirmDesc_m': 'לאחר ההתנתקות לא תקבל התראות. אם מישהו צופה בך כרגע, הוא יקבל התראה שהתנתקת',
  'settings.signOutConfirmDesc_f': 'לאחר ההתנתקות לא תקבלי התראות. אם מישהו צופה בך כרגע, הוא יקבל התראה שהתנתקת',
  'settings.signOutYes_m': 'התנתקות',
  'settings.signOutYes_f': 'התנתקות',
  'chat.inputPlaceholder_m': 'כתוב הודעה...',
  'chat.inputPlaceholder_f': 'כתבי הודעה...',
  'photo.sub_m': 'הוסף 2-6 תמונות',
  'photo.sub_f': 'הוסיפי 2-6 תמונות',
}