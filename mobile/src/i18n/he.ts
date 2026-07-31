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
  'settings.profile': 'עריכת הפרופיל',
  'settings.buildProfile': 'בניית הפרופיל',
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
  // so only the blocked door is named here.
  'settings.visibilityGateDesc': 'כדי שיראו אותך צריך פרופיל עם שתי תמונות לפחות. זה לוקח דקה',
  // The watcher count as a SENTENCE, for the pill beside that row (user
  // directive 2026-07-31, restoring what the bare number replaced the day
  // before): a row is read as a line of text, so the count finishes the line the
  // label started, in the same first person it is written in. What stays a bare
  // number is the DOCK's preferences key — a mark standing beside a 24dp glyph
  // has no room for a sentence, and the row it opens is where the sentence is.
  // Singular is its own string: Hebrew inflects the verb for a single watcher.
  'settings.watchersOne': 'מישהו אחד צופה בי',
  'settings.watchersMany': '{count} צופים בי',
  // The credits row states the whole wallet as one number on its END edge
  // (user directive 2026-07-28), so there is no pool caption to translate: the
  // daily/extra split lives in the buy picker the row opens.
  'settings.credits': 'קרדיטים',
  // Leaving a group. The only strings left from the menu's old groups sheet:
  // joining by code, the membership list and the row that opened them all live
  // in Circles now, and the sheet itself is deleted. Circles' own leave popup
  // reads these three.
  'settings.groupsLeaveTitle': 'לעזוב את {name}?',
  'settings.groupsLeaveDesc': 'אפשר להצטרף שוב בהמשך בעזרת קוד הקבוצה',
  'settings.groupsLeaveConfirm': 'עזיבת הקבוצה',

  // Circles: the menu row + the full hub sheet and its sub-screens.
  'communities.menuRow': 'מעגלים',
  'communities.title': 'המעגלים שלי',
  'communities.myFriends': 'החברים שלי',
  'communities.myFriendsSub': 'אנשים ש{אתה מכיר|את מכירה} אישית',
  // The one WORD, for the button on the hub's friends row: the row already
  // says what it is about, so the button only says what it does.
  'communities.invite': 'הזמנה',
  'communities.create': 'יצירת קבוצה',
  'communities.find': 'חיפוש והצטרפות לקבוצה',
  // Group kinds: ONE axis, three stops (2026-07-27). Replaces the old
  // public/private + approval-on/off pair everywhere it was shown.
  'communities.kindLabel': 'סוג הקבוצה',
  'communities.kindOpen': 'קבוצה פתוחה',
  'communities.kindOpenSub': 'מופיעה בחיפוש וההצטרפות אוטומטית',
  'communities.kindApproved': 'קבוצה מאושרת',
  'communities.kindApprovedSub': 'מופיעה בחיפוש וכל בקשת הצטרפות דורשת אישור',
  'communities.kindPrivate': 'קבוצה פרטית',
  'communities.kindPrivateSub': 'לא מופיעה בחיפוש, נכנסים רק דרך קישור, וכל הצטרפות דורשת אישור',
  'communities.membersCount': '{count} חברים',
  'communities.oneMember': 'חבר אחד',
  // Row meta segments, laid out by MetaLine. One string per fact, so the menu
  // row and the hub rows count the same things in the same words.
  'communities.groupsCount': '{count} קבוצות',
  'communities.oneGroup': 'קבוצה אחת',
  'communities.oneFriend': 'חבר אחד',
  'communities.requestsCount': '{count} בקשות',
  'communities.oneRequest': 'בקשה אחת',
  // Menu row with nothing in it yet: the row still says what it is for, in the
  // one line the counts would have used.
  'communities.rowEmpty': 'הצטרפות לקבוצות וחברים',
  // הכניסה למעגלים חסומה עד שהפרופיל נבנה: תמונות ותיאור. המשפט פונה אל
  // המשתמש בציווי, ולכן הוא ממוגדר במקום ({m|f}, כמו home.buildProfileTitle)
  // ונפתר ב-genderize מול המין של המשתמש עצמו.
  'communities.gateTitle': 'אנשים דרך מעגלים',
  'communities.gateDesc': 'מעגלים מחברים בין אנשים עם תחומי עניין משותפים. כדי להתחיל, צ{ור|רי} פרופיל עם שתי תמונות לפחות',
  'communities.managedBy': 'מנוהלת על ידי {name}',
  // The one popup behind the card's circle chip: every mutual friend and every
  // shared group in one list, so it says what the two of you have in common
  // without naming a kind of connection.
  'communities.sharedTitle': 'מה משותף לנו',
  // The chip itself. Inflects for the CARD SUBJECT ("היא חברה של אסף"), not for
  // the friend named in it, so the pair here is chosen by match.is_male.
  'communities.friendOfM': 'חבר של {name}',
  'communities.friendOfF': 'חברה של {name}',
  // (No "you have no groups yet" line any more: a hub with no groups IS the
  // start page — the picture, what this is for, the two ways in — with the
  // friends row over it. See HubStart.)

  // The page before there is anything on it: no friends, nobody waiting, no
  // group of any kind (user directive 2026-07-30). It is not the list's empty
  // line — it is the whole screen, so it says what Circles IS and then offers
  // the only two ways to start one. See HubStart / CirclesArt.
  'communities.startTitle': 'המעגל שלך מתחיל כאן',
  'communities.startDesc': 'כל חבר {שתוסיף|שתוסיפי} יכול לחבר אותך גם לחברים הפנויים שלו. קבוצות עוזרות לך להכיר אנשים עם תחומי עניין משותפים',
  // Over the PRIMARY button only (user directive 2026-07-30): inviting is the
  // one of the two whose label does not say what it is worth. "Search groups"
  // needs no line, and a second one turned the two ways forward into a
  // paragraph.
  'communities.startFind': 'חיפוש קבוצות',
  // The friends page before there is a single friend on it: the same drawing
  // and the same heading as the hub's, one step in — that page offers the two
  // ways to start a circle, this one owns the first of them, so all it has to
  // say is what a friend joining actually opens.
  'communities.friendsStartDesc': '{הזמן|הזמיני} חברים, וכשהם יצטרפו ייפתחו בפניך אנשים חדשים מהמעגלים שלהם',

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
  'communities.friendsWhy': 'כל חבר פותח לכם את המעגל שלו: אנשים שעוד לא הכרתם, שמגיעים אליכם ראשונים עם חבר משותף',
  'communities.unfriendTitle': 'להסיר את {name} מהחברים?',
  'communities.unfriendDesc': 'אפשר לשייך שוב בהמשך',
  'communities.unfriendConfirm': 'הסרה',

  // Link an existing friend
  'communities.linkTitle': 'שיוך חבר',
  'communities.request': 'בקשה',
  'communities.requested': 'נשלח',
  'communities.noResults': 'אין תוצאות',
  'communities.linkNote': 'הצד השני יקבל בקשה. אחרי אישור אתם מחוברים בשני הכיוונים',

  // Create a group
  'communities.newGroup': 'קבוצה חדשה',
  'communities.name': 'שם',
  'communities.namePlaceholder': 'שם הקבוצה',
  'communities.createAction': 'יצירת הקבוצה',
  'communities.nameError': 'צריך שם קצר יותר',
  'communities.description': 'תיאור',
  'communities.descriptionPlaceholder': 'על מה הקבוצה',
  'communities.descUpdate': 'עדכון',
  // קישור לפרטים נוספים: המנהלים מזינים אותו בהגדרות הקבוצה, וכל מי שרואה את
  // הקבוצה מקבל שורה אחת לחיצה מתחת לתיאור.
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

  // A group you manage
  'communities.shareInvite': 'שיתוף קישור הזמנה',
  'communities.settings': 'הגדרות הקבוצה',
  // תצוגה מקדימה: הכפתור בכותרת של הגדרות הקבוצה, שפותח את הפופאפ של הקבוצה
  // בדיוק כפי שכל אחד אחר רואה אותו.
  'communities.preview': 'תצוגה מקדימה',
  // ניהול בלי לשחק. דגל על החברות שלי בקבוצה אחת שאני מנהל: כשהוא דלוק, אני
  // והחברים בקבוצה לא נפגשים במשחק. צ'קבוקס בהגדרות הקבוצה, מתחת לסוג הקבוצה,
  // וההסבר הוא שורת המשנה שלו.
  'communities.hiddenToggle': 'להסתיר אותי מחברי הקבוצה',
  'communities.hiddenSub': 'החברים בקבוצה לא יראו אותך במשחק ו{אתה לא תראה|את לא תראי} אותם. ההרשאות שלך בקבוצה נשארות בדיוק כמו קודם',
  'communities.hiddenShort': 'לא משחק',
  'communities.deleteGroup': 'מחיקת הקבוצה',
  'communities.deleteTitle': 'למחוק את {name}?',
  'communities.deleteDesc': 'הקבוצה וכל החברויות בה יימחקו. אי אפשר לבטל',
  'communities.deleteConfirm': 'מחיקה',
  // No confirm for taking a member out (user directive 2026-07-31): the tap
  // removes. `removeMemberTitle` / `removeMemberDesc` / `remove` are deleted with
  // that popup — the description WAS the reason it needed none ("they can join
  // again with the invite link").
  'communities.makePublic': 'הפיכה לציבורית',
  'communities.makePrivate': 'הפיכה לפרטית',
  'communities.approvalEnable': 'דרישת אישור להצטרפות',
  'communities.approvalDisable': 'ביטול דרישת האישור',
  // The queue's one name, on the roster row that unfolds it. Its page-title
  // twin (`requestsNav`) and its empty line (`noRequests`) went with the page
  // itself on 2026-07-31: the queue is a drawer inside the roster now, and a
  // drawer with nothing in it is not drawn at all.
  'communities.requestsSectionJoin': 'בקשות הצטרפות',
  'communities.approve': 'אישור',
  'communities.approveAll': 'אישור כולם',
  'communities.approveAllTitle': 'לאשר את כל הבקשות?',
  'communities.approveAllDesc': 'כל מי שממתין בתור יצורף לקבוצה {name}, ויקבל על כך התראה',
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
  'communities.removeFromGroup': 'הסרה מהקבוצה',
  'communities.transferOwner': 'העברת בעלות',
  'communities.transferOwnerTitle': 'להעביר את הבעלות ל{name}?',
  'communities.transferOwnerDesc': 'הקבוצה תעבור לבעלות של {name}, ואצלך יישארו הרשאות אישור בלבד. אי אפשר לבטל',
  // An open group has no approvers, so the outgoing owner keeps nothing: he is
  // a plain member of it from that moment.
  'communities.transferOwnerDescOpen': 'הקבוצה תעבור לבעלות של {name}, ואצלך לא יישארו הרשאות בקבוצה. אי אפשר לבטל',

  // A group you are in
  'communities.leave': 'עזיבת הקבוצה',
  'communities.memberNote': 'חברי הקבוצה מופיעים אצלך בעדיפות גבוהה',

  // Find or join
  'communities.findTitle': 'הצטרפות לקבוצה',
  'communities.findSearch': 'חיפוש קבוצה',
  // Searching the roster of a group you manage: the mark on that page's bar,
  // the field's own placeholder, and the mark that ends the search. It looks
  // over BOTH lists at once, the people waiting and the people already in.
  'communities.searchPeople': 'חיפוש לפי שם',
  'communities.searchClose': 'סגירת החיפוש',
  // The line about the PERSON, standing over a group's name on their page: who
  // they are and when they turned up here. Genderless in both languages, so a
  // row with no profile on it still reads (see memberSince / waitingSince), and
  // the name leads because everything else in that block is the group's.
  'communities.inGroupSince': '{name} בקבוצה מאז {date}',
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
  // The pending group's own popup: what the state is, and the button that ends
  // it (the same popup a group you are in opens, with cancel instead of leave).
  'communities.pendingNote': 'הבקשה שלכם ממתינה לאישור של הקבוצה',
  'communities.cancelJoin': 'ביטול הבקשה',
  'communities.shareMessage': 'הצטרפו לקבוצה {name}\n{link}',

  // Support: row in the account card. Opens the device mail composer at the
  // support inbox, with this subject prefilled.
  'settings.support': 'תמיכה',
  'support.mailSubject': 'תמיכה Once',
  // Site: the row under support. Opens the brand site's landing page in the
  // device browser, in the language the app is running in.
  'settings.site': 'אתר',
  'settings.preview': 'תצוגה מקדימה',
  'settings.myProfile': 'פרופיל',
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
  'settings.locationLockedDesc': 'כדי לשנות מיקום, צריך לצאת קודם מהצפייה או מההזמנה הפעילה. אחרי {שתסיים|שתסיימי} את האינטראקציה הנוכחית, {תוכל|תוכלי} לעדכן את המיקום',
  'settings.duplicatePhotoTitle': 'תמונה כפולה',
  'settings.duplicatePhotoBody': 'לא ניתן להעלות את אותה תמונה פעמיים. תמונות כפולות הוסרו',
  'settings.photoEditMoveUp': 'הזזה למעלה',
  'settings.photoEditReplace': 'החלפת תמונה',
  'settings.photoEditMoveDown': 'הזזה למטה',
  'settings.photoEditDelete': 'מחיקה',
  // The two rows of the popup the own-profile card's heading plus opens.
  // Each row is the THING, not the verb: the plus already said "add".
  'settings.addPhoto': 'תמונה',
  'settings.addFamily': 'משפחה וילדים',
  // What that plus says to a screen reader: the mark itself names nothing.
  'settings.a11y.addToProfile': 'הוספה לפרופיל',
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
  // The invite door's own sentence for the app's one build-profile gate. Its
  // button is `settings.buildProfile`, which is what every one of those doors
  // says: there was a second key here with the identical Hebrew word, and the
  // two drifted in English alone.
  'home.buildProfileTitle': 'בנ{ה|י} קודם פרופיל',
  'home.buildProfileDesc': 'כדי לשלוח הזמנה צריך פרופיל עם שתי תמונות לפחות. זה לוקח דקה',
  // The browse allowance's door (lib/browseGate.ts): an account with no profile
  // watches two people and then the centre circle stops being the play button
  // and becomes this. Same popup as the invite door above, so only the sentence
  // changes — and the TITLE is also the pane's own headline, the way every
  // centre notice states its reason in that slot. The description is addressed
  // to the user in the imperative, so it is genderized in place ({m|f}).
  'home.browseGateTitle': 'כדי להמשיך צריך פרופיל',
  'home.browseGateDesc': 'צ{ור|רי} פרופיל עם שתי תמונות לפחות, ו{תוכל|תוכלי} להמשיך להכיר אנשים',
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
  'home.replyingDesc': 'ובזמן הזה, הוא לא יכול לשלוח הזמנות נוספות. כל הפוקוס רק עלייך',
  'home.replyingDesc_mm': 'ובזמן הזה, הוא לא יכול לשלוח הזמנות נוספות. כל הפוקוס רק עליך',
  'home.replyingDesc_mf': 'ובזמן הזה, היא לא יכולה לשלוח הזמנות נוספות. כל הפוקוס רק עליך',
  'home.replyingDesc_fm': 'ובזמן הזה, הוא לא יכול לשלוח הזמנות נוספות. כל הפוקוס רק עלייך',
  'home.replyingDesc_ff': 'ובזמן הזה, היא לא יכולה לשלוח הזמנות נוספות. כל הפוקוס רק עלייך',
  'home.replyingAccept': 'פתיחת צ׳אט',
  'home.replyingReject': 'לדלג',
  'home.chatHeader': 'אתם אחד על אחד',
  'home.leaveTitle': 'סיום צ\'אט',
  'home.leaveDesc': 'הצ\'אט ייסגר לצמיתות ולא ניתן יהיה לשחזר אותו. הצד השני יקבל התראה',
  'home.leaveConfirm': 'סיום',
  'chat.empty': 'עוד אין הודעות',
  'chat.inputPlaceholder': 'כתוב הודעה...',
  'chat.today': 'היום',
  'chat.yesterday': 'אתמול',
  'chat.dayBeforeYesterday': 'שלשום',
  'chat.block': 'חסימה',
  'chat.blockTitle': 'חסימת משתמש',
  'chat.blockDesc': 'המשתמש ייחסם ולא יוכל ליצור איתך קשר שוב. לא ניתן לבטל פעולה זו',
  'chat.blockConfirm': 'חסימה',
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
  // The X on the heading tile of a card that is over: it takes the reader to the
  // message at the top of that card, where the way back to the game is.
  'home.a11y.endedMessage': 'מעבר להודעה',
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