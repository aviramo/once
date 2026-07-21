export default {
  // Landing


  // Auth
  'auth.signInGoogle': 'התחברות עם Google',
  'auth.signInApple': 'התחברות עם Apple',
  'auth.reviewCodePlaceholder': 'קוד ביקורת',
  'auth.reviewSubmit': 'כניסה',
  'auth.tagline': 'מפגש אחד בזמן אמת',
  'auth.msg1': 'לא קטלוג. לא צ\'אטים אינסופיים.',
  'auth.msg2': 'מפגש אחד\nבזמן אמת',
  'auth.orDivider': 'או',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendLink': 'שליחת קישור התחברות',
  'auth.invalidEmail': 'נא להזין כתובת אימייל תקינה',
  'auth.linkSent': 'בדקו את האימייל',
  'auth.linkSentDesc': 'שלחנו קישור התחברות ל-{email}. לחצו על הקישור באימייל כדי להמשיך.',
  'auth.linkResend': 'שליחת קישור נוסף',
  'auth.linkError': 'לא הצלחנו לשלוח את הקישור. נסו שוב.',
  'auth.howItWorksLink': 'איך Once עובד',
  'auth.howItWorksTitle': 'איך Once עובד',
  'auth.howItWorksBody': 'Once בנויה למפגש אחד ואמיתי בכל פעם.\n\nבחר אדם אחד.\nשלח הזמנה אחת.\nפגוש בזמן אמת.\n\nלא קטלוג. לא צ\'אטים מקבילים.',
  'auth.howItWorksBtn': 'הבנתי',
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
  'ob.minAge': 'גיל מינימלי להרשמה הוא 18',
  'ob.createAccount': 'צור חשבון',
  'ob.createAccount_m': 'צור חשבון',
  'ob.createAccount_f': 'צרי חשבון',
  'ob.birthConfirm': 'יום ההולדת שלך הוא {date} ואת/ה בן/בת {age}?',
  'ob.birthConfirm_m': 'יום ההולדת שלך הוא {date} ואתה בן {age}?',
  'ob.birthConfirm_f': 'יום ההולדת שלך הוא {date} ואת בת {age}?',
  'ob.birthConfirmFix': 'תיקון',

  // Onboarding photo
  'photo.sub': 'הוסף 2-6 תמונות',
  'photo.uploadFailed': 'העלאת התמונות נכשלה. בלי תמונה אי אפשר להמשיך, נסה שוב.',

  // Onboarding bio
  'bio.placeholder': 'משפט, תחושה או רגע שמספרים עליך...',
  'bio.submit': 'המשך',
  'bio.min': 'מינימום 20 תווים',

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
  'settings.preferences': 'תפריט',
  'settings.searchPreferences': 'העדפות חיפוש',
  'settings.myInfo': 'המידע שלי',
  'settings.appSettings': 'האפליקציה',
  'settings.about': 'דרך אחרת להכיר',
  'settings.profileSubtitle': 'עריכת הפרופיל שלך',
  'settings.aboutSubtitle': 'הסיפור שמאחורי האפליקציה',


  // About page
  'about.heroTitle': 'מפגשים אמיתיים.\nממש קרוב.\nבזמן אמת.',
  'about.heroSub': 'מפגשים עם אנשים שנמצאים ממש קרובים אליכם, בזמן אמת.',
  'about.feature1.title': 'קשר של אחד על אחד',
  'about.feature1.desc': 'כשנוצר חיבור, הוא בלעדי לשניכם. אין שיחות מקבילות ואין תחרות על תשומת לב. פוגשים אדם, לא עוד אופציה.',
  'about.feature2.title': 'מהמסך למציאות',
  'about.feature2.desc': 'כשיש סנכרון בין שניכם, הקשר הופך למפגש אמיתי, כאן ועכשיו. לא עוד שיחות אינסופיות שלא מובילות לשום מקום.',
  'about.feature3.title': 'אתם שולטים',
  'about.feature3.desc': 'אתם בוחרים מתי לחפש ואת מי להזמין. קיבלתם פנייה? אתם מחליטים אם לאשר. הקצב שלכם, הבחירה שלכם.',
  'about.feature4.title': 'הסכמה הדדית תמיד',
  'about.feature4.desc': 'רק כשגם אתם וגם הצד השני מעוניינים, הקשר נוצר. אף אחד לא יפתיע אתכם ואתם לא תפתיעו אף אחד.',
  'settings.profile': 'עריכת הפרופיל',
  'settings.account': 'חשבון',
  'settings.visibilityVisible': 'גלוי',
  'settings.visibilityHidden': 'מוסתר',
  'settings.visibilityHiddenNoHearts': 'נגמרו הלבבות, צריך לבבות כדי לחזור להיות גלוי',
  'settings.credits': 'לבבות',
  // Suffix word in the hearts-row value when the user has extras, e.g.
  // "1/3 + 5 אקסטרה". Distinct word so "+ 5" doesn't read as math.
  'settings.creditsExtraSuffix': 'אקסטרה',
  // Groups: row in the account card, plus the "my groups" sheet (list + join input).
  'settings.groups': 'הקבוצות שלי',
  'settings.groupsMine': 'הקבוצות שלי',
  'settings.groupsNone': 'אין קבוצות מחוברות',
  'settings.groupsMore': 'עוד...',
  'settings.groupsEmpty': 'עוד לא הצטרפת לקבוצה.',
  'settings.groupsDisabled': 'מושבתת',
  'settings.groupsAdd': 'הוספת קבוצה',
  'settings.groupsJoinTitle': 'הצטרפות לקבוצה',
  'settings.groupsJoinHint': 'הזן את הקוד שקיבלת ממנהל הקבוצה. אפשר להיות חבר בכמה קבוצות במקביל.',
  'settings.groupsCodePlaceholder': '6 ספרות',
  'settings.groupsJoinAction': 'הצטרפות',
  'settings.groupsInviteInvalid': 'הקוד שגוי או לא פעיל',
  'settings.groupsBack': 'חזרה',
  'settings.groupsLeaveTitle': 'לעזוב את {name}?',
  'settings.groupsLeaveDesc': 'אפשר להצטרף שוב בהמשך בעזרת קוד הקבוצה.',
  'settings.groupsLeaveConfirm': 'עזיבת הקבוצה',
  // Report a bug: row in the account card + the bug-report sheet.
  'settings.bugReport': 'דיווח על תקלה',
  'bugReport.title': 'דיווח על תקלה',
  'bugReport.placeholder': 'תארו את התקלה...',
  'bugReport.attach': 'צירוף תמונה',
  'bugReport.attachChange': 'החלפת תמונה',
  'bugReport.attachRemove': 'הסרה',
  'bugReport.submit': 'שליחה',
  'bugReport.thanks': 'תודה! הדיווח נשלח.',
  'bugReport.error': 'השליחה נכשלה, נסו שוב.',
  // {when} now self-carries "היום ב-HH:MM" / "מחר ב-HH:MM" — no leading "ב-".
  'settings.creditsNext': 'מתחדש {when}',
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
  'settings.deleteAccount': 'מחיקת חשבון',
  'settings.deleteConfirmTitle': 'מחיקת חשבון',
  'settings.deleteConfirmDesc': 'כל המידע, התמונות והשיחות יימחקו לצמיתות. הזמנות פעילות, שיחות וצפיות יבוטלו. לא ניתן לבטל פעולה זו.',
  'settings.deleteYes': 'מחיקה',
  'settings.signOut': 'התנתק',
  'settings.signOutConfirmTitle': 'התנתקות',
  'settings.signOutConfirmDesc': 'לאחר ההתנתקות לא תקבל התראות. אם מישהו צופה בך כרגע, הוא יקבל התראה שהתנתקת.',
  'settings.signOutYes': 'התנתקות',
  'settings.ageRange': 'בגילאים',
  'settings.ageFrom': 'מגיל',
  'settings.ageTo': 'עד גיל',
  'settings.save': 'שמור',
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
  'settings.locationDeviceDesc': 'משתמש במיקום המכשיר',
  'settings.locationCustomDesc': 'כתובת לפי בחירה',
  'settings.locationAddressPrompt': 'הקלד כתובת או שם של עיר',
  'settings.locationSearch': 'חיפוש',
  'settings.locationSearching': 'מחפש...',
  'settings.locationNoResults': 'לא נמצאה כתובת כזאת. נסה ניסוח אחר.',
  'settings.locationFetchingDevice': 'מקבל מיקום מהמכשיר...',
  'settings.locationDeviceFailedTitle': 'לא הצלחנו לקבל מיקום',
  'settings.locationDeviceFailedDesc': 'לאפשר גישה למיקום בהגדרות המכשיר ולנסות שוב.',
  'settings.locationPermissionTitle': 'הרשאת מיקום',
  'settings.locationPermissionDesc': 'כדי להשתמש במיקום המכשיר יש לאפשר גישה למיקום.',
  'settings.locationOpenSettings': 'פתח הגדרות',
  'settings.locationOk': 'אישור',
  'settings.locationCancel': 'ביטול',
  'settings.locationServicesOffTitle': 'שירותי המיקום כבויים',
  'settings.locationServicesOffDesc': 'יש להפעיל את שירותי המיקום במכשיר ולנסות שוב.',
  'settings.locationLockedTitle': 'אי אפשר לשנות מיקום עכשיו',
  'settings.locationLockedDesc': 'כדי לשנות מיקום, צריך לצאת קודם מהצפייה או מההזמנה הפעילה.\nאחרי שתסיים את האינטראקציה הנוכחית, תוכל לעדכן את המיקום.',
  'settings.duplicatePhotoTitle': 'תמונה כפולה',
  'settings.duplicatePhotoBody': 'לא ניתן להעלות את אותה תמונה פעמיים. תמונות כפולות הוסרו.',
  'settings.photoEditMoveUp': 'הזזה למעלה',
  'settings.photoEditMoveDown': 'הזזה למטה',
  'settings.photoEditReplace': 'החלפה',
  'settings.photoEditDelete': 'מחיקה',
  'settings.photoMinTwo': 'נדרשות לפחות 2 תמונות',
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
  'family.scheduleWeek1Hint_m': 'הימים שבהם אתה עם הילדים נשמרים אצלנו ולא מוצגים לאף משתמש. אנחנו משתמשים בהם כדי להציג לך את ההתאמות הרלוונטיות ביותר.',
  'family.scheduleWeek1Hint_f': 'הימים שבהם את עם הילדים נשמרים אצלנו ולא מוצגים לאף משתמש. אנחנו משתמשים בהם כדי להציג לך את ההתאמות הרלוונטיות ביותר.',
  'family.scheduleHint': 'סמן את הימים שאתה עם הילדים',
  'family.scheduleAdd': 'הוספת ימים',
  'family.scheduleRemove': 'הסרה',
  'family.weekLabel': 'שבוע {n}',
  'family.addWeek': 'הוספת שבוע נוסף',
  'family.removeWeek': 'הסרת שבוע',
  'family.agesAdd': 'הוספת גילאים',
  'family.agesRemove': 'הסרת גילאים',
  'family.countPlaceholder': 'בחר מספר',
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
  'family.wantsMore': 'ורוצה עוד',
  'family.doesntWantMore': 'ולא רוצה עוד',
  'family.wantsKids': 'ורוצה',
  'family.doesntWantKids': 'ולא רוצה',
  'family.selfWantsMore': 'ורוצה עוד',
  'family.selfDoesntWantMore': 'ולא רוצה עוד',
  'family.selfWantsKids': 'ורוצה',
  'family.selfDoesntWantKids': 'ולא רוצה',
  'family.prefSeparator': ' ',
  'family.overlapLabel': '{pct}% חפיפה בימים פנויים',
  'family.overlapChipSuffix': ', {pct}% חפיפה',
  'family.addKid': 'הוספת ילד',
  'family.ageNotSet': 'ללא גיל',
  'family.ageFortyPlus': '40+',
  'family.summaryFreeWeekend_m': ', פנוי בסופ״ש הקרוב',
  'family.summaryFreeWeekend_f': ', פנויה בסופ״ש הקרוב',
  'family.summaryWithKidsWeekend_m': ', לא פנוי בסופ״ש הקרוב',
  'family.summaryWithKidsWeekend_f': ', לא פנויה בסופ״ש הקרוב',
  'common.gotIt': 'הבנתי',
  // Count phrase with correct singular/plural, built by starsText() in
  // lib/credits.ts. Used wherever a hearts amount is shown in prose.
  'stars.count.one': 'לב אחד',
  'stars.count.many': '{n} לבבות',
  // Hearts popup (opened from the settings hearts row). The description is
  // assembled in code from these lines (so the renew line can be dropped
  // when the next-grant time is unknown). {balance}/{extra}/{cap}/{when}
  // render bold in code. {balance} = the daily pool, {extra} = the
  // purchased pool, {cap} = daily ceiling (currently 3).
  // Hebrew gendered via genderize() inline {male|female} markers.
  'stars.popup.title': 'הלבבות שלך',
  'stars.popup.line.balance': 'יש לך {balance} בחבילה היומית, שמתמלאת ל-{cap} בכל יום.',
  // Variant for the balance=0 case — reads "your hearts ran out" instead of
  // the literal "you have 0 hearts" (user request 2026-06-01).
  'stars.popup.line.balanceEmpty': 'נגמרו לך הלבבות בחבילה היומית, שמתמלאת ל-{cap} בכל יום.',
  // {extra} expands via starsText → "5 לבבות" / "לב אחד" (carries the noun
  // already). Template must NOT repeat the noun, just append "אקסטרה".
  'stars.popup.line.extra': 'בנוסף יש לך {extra} אקסטרה.',
  // {when} carries its own "היום/מחר ב-HH:MM" — no leading "ב-" in the template.
  'stars.popup.line.renew': 'החבילה היומית תתחדש {when}.',
  // Relative next-grant day. Returned from formatNextGrant() — replaces the
  // old absolute "DD/MM HH:MM" so the user reads a relative phrase.
  'stars.grant.today': 'היום ב-{time}',
  'stars.grant.tomorrow': 'מחר ב-{time}',
  'stars.popup.buyExtra': 'קניית לבבות אקסטרה',
  // Buy-extra picker (3/10/50 options, all "Free" for now, only 3 enabled).
  'stars.buy.title': 'קניית לבבות אקסטרה',
  'stars.buy.desc': 'הלבבות שתקנה יתווספו ללבבות שיש לך כבר, ולא יתבטלו עם הזמן.',
  'stars.buy.priceFree': 'חינם',
  'stars.buy.comingSoon': 'בקרוב',
  // Shown on the active (3-hearts) option when the user already used today's
  // buy slot — the once-per-grant-day gate.
  'stars.buy.alreadyBoughtToday': 'כבר נקנה היום',
  // Shown on the active option when the wallet still has hearts. Buying
  // extras is a recovery mechanism, so the server rejects it with
  // has_credits while anything is left to spend.
  'stars.buy.hasHearts': 'יש לך עדיין לבבות',
  'settings.miles': 'מייל',
  // Gendered by the user's own sex via genderize() ({male|female} marker).
  'settings.preferredGender': '{פנוי|פנויה}',
  'settings.genderM': 'לגברים',
  'settings.genderF': 'לנשים',
  'settings.genderBoth': 'לכולם',
  'settings.kidsLabel': 'מתכנן/ת ילדים?',
  'settings.kidsYes': 'כן',
  'settings.kidsNo': 'לא',
  'settings.kidsNa': 'לא רלוונטי',

  // Match
  'match.justNow': 'מחובר עכשיו',
  'match.justNow_m': 'מחובר עכשיו',
  'match.justNow_f': 'מחוברת עכשיו',
  'match.minAgo': 'מחובר לפני דקה',
  'match.minAgo_m': 'מחובר לפני דקה',
  'match.minAgo_f': 'מחוברת לפני דקה',
  'match.minsAgo': 'מחובר לפני {n} דקות',
  'match.minsAgo_m': 'מחובר לפני {n} דקות',
  'match.minsAgo_f': 'מחוברת לפני {n} דקות',
  'match.hrAgo': 'מחובר לפני שעה',
  'match.hrAgo_m': 'מחובר לפני שעה',
  'match.hrAgo_f': 'מחוברת לפני שעה',
  'match.hrs2Ago': 'מחובר לפני שעתיים',
  'match.hrs2Ago_m': 'מחובר לפני שעתיים',
  'match.hrs2Ago_f': 'מחוברת לפני שעתיים',
  'match.hrsAgo': 'מחובר לפני {n} שעות',
  'match.hrsAgo_m': 'מחובר לפני {n} שעות',
  'match.hrsAgo_f': 'מחוברת לפני {n} שעות',
  'match.dayAgo': 'מחובר לפני יום',
  'match.dayAgo_m': 'מחובר לפני יום',
  'match.dayAgo_f': 'מחוברת לפני יום',
  'match.days2Ago': 'מחובר לפני יומיים',
  'match.days2Ago_m': 'מחובר לפני יומיים',
  'match.days2Ago_f': 'מחוברת לפני יומיים',
  'match.daysAgo': 'מחובר לפני {n} ימים',
  'match.daysAgo_m': 'מחובר לפני {n} ימים',
  'match.daysAgo_f': 'מחוברת לפני {n} ימים',
  // Relative time, genderless and without the "מחובר" prefix: the suffix of
  // the merged proximity chip (formatAgo). Standalone status keeps match.*Ago.
  'match.ago.now': 'עכשיו',
  'match.ago.min': 'לפני דקה',
  'match.ago.mins': 'לפני {n} דקות',
  'match.ago.hr': 'לפני שעה',
  'match.ago.hrs2': 'לפני שעתיים',
  'match.ago.hrs': 'לפני {n} שעות',
  'match.ago.day': 'לפני יום',
  'match.ago.days2': 'לפני יומיים',
  'match.ago.days': 'לפני {n} ימים',
  'match.connected': 'מחובר',
  'match.connected_m': 'מחובר',
  'match.connected_f': 'מחוברת',

  // Errors

  // Home — modes
  'home.hiddenHeaderTitle': 'מי רואה אותי',
  'home.notifAccessRequired_m': 'נדרשת גישה להתראות כדי שלא תפספס סימן',
  'home.notifAccessRequired_f': 'נדרשת גישה להתראות כדי שלא תפספסי סימן',
  'home.locationAccessRequired': 'נדרשת גישה למיקום כדי לראות את המרחק',
  'home.noInternetTitle': 'אין חיבור לאינטרנט',
  'home.noInternetDesc': 'Once זקוקה לחיבור אינטרנט כדי לפעול. יש לבדוק את הוויי-פיי או את חבילת הגלישה ולנסות שוב.',
  'home.noInternetButton': 'נסה שוב',
  'home.noInternetButton_m': 'נסה שוב',
  'home.noInternetButton_f': 'נסי שוב',
  // ViewersStatusCard (page2) — 5 states × gender
  // In-card trigger that opens the broadcast confirm popup. Reads as a
  // mode-switch (parallel to the go-visible label), NOT as the action verb;
  // the confirm popup's button (home.broadcastConfirmButton) keeps the
  // "broadcast me" wording.
  // Out-of-hearts auto-hide variant (balance + extra = 0): the user is hidden
  // because they have no hearts left to accept invites. The "go visible"
  // button is replaced by a buy-extra CTA (stars.popup.buyExtra label).
  'home.premiumPopup.add': 'הצג אותי לאנשים',
  'home.premiumPopup.hide': 'הסתר את הפרופיל',
  'home.premiumPopup.reveal': 'הצג את הפרופיל',
  // Gendered (אתה / את). Picked via tg(_m/_f) against the caller's is_male.
  'settings.hideConfirmTitle': 'להסתיר את הפרופיל?',
  'settings.hideConfirmDesc': 'כל הצופים בך יוסרו ויקבלו על כך התראה.',
  'settings.hideConfirmDescOne': 'הצופה שיש לך כרגע יוסר ויקבל על כך התראה.',
  'settings.hideConfirmDescMany': '{count} הצופים שיש לך כרגע יוסרו ויקבלו על כך התראה.',
  'settings.hideConfirmButton': 'הסתרה',

  // Home — match teaser
  'home.tapForMore': 'בחזרה למשחק',
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
  'home.readyToContinue': 'מוכן להמשיך?',
  'home.readyToContinue_m': 'מוכן להמשיך?',
  'home.readyToContinue_f': 'מוכנה להמשיך?',
  'home.endedBack': 'חזרה למשחק',

  // Locked-state cards: page1 (after a terminal event) and page2 (dead invite).
  // Key shape: home.locked.<page>.<message>.{title,desc}
  // Locked page1 cards reference the other user ("she/he"). `tg(key, otherMale)`
  // picks `_m` when the other user is male, `_f` when female. Texts where only
  // the other's gender matters (most of them) get full _m/_f variants.
  'home.locked.page1.invite.title': 'היא כבר לא זמינה',
  'home.locked.page1.invite.title_m': 'הוא כבר לא זמין',
  'home.locked.page1.invite.title_f': 'היא כבר לא זמינה',
  'home.locked.page1.invite.desc': 'היא כבר בהזמנה אחרת, אז אי אפשר לשלוח לה כרגע. אפשר להמשיך הלאה.',
  'home.locked.page1.invite.desc_m': 'הוא כבר בהזמנה אחרת, אז אי אפשר לשלוח לו כרגע. אפשר להמשיך הלאה.',
  'home.locked.page1.invite.desc_f': 'היא כבר בהזמנה אחרת, אז אי אפשר לשלוח לה כרגע. אפשר להמשיך הלאה.',
  'home.locked.page1.extend.title': 'אי אפשר להאריך',
  'home.locked.page1.extend.desc': 'ההזמנה כבר נסגרה. אפשר לחזור ולמצוא חיבור אחר.',
  'home.locked.page1.approve.title': 'החיבור כבר לא זמין',
  'home.locked.page1.approve.desc': 'משהו השתנה לפני שהספקתם להתחבר. אפשר להמשיך הלאה.',
  'home.locked.page1.approve.desc_m': 'משהו השתנה לפני שהספקתם להתחבר. אפשר להמשיך הלאה.',
  'home.locked.page1.approve.desc_f': 'משהו השתנה לפני שהספקתם להתחבר. אפשר להמשיך הלאה.',
  'home.locked.page1.decline.title': 'היא לא אישרה הפעם',
  'home.locked.page1.decline.title_m': 'הוא לא אישר הפעם',
  'home.locked.page1.decline.title_f': 'היא לא אישרה הפעם',
  'home.locked.page1.decline.desc': 'היא בחרה לא להמשיך כרגע. הכול טוב, אפשר לעבור לחיבור הבא.',
  'home.locked.page1.decline.desc_m': 'הוא בחר לא להמשיך כרגע. הכול טוב, אפשר לעבור לחיבור הבא.',
  'home.locked.page1.decline.desc_f': 'היא בחרה לא להמשיך כרגע. הכול טוב, אפשר לעבור לחיבור הבא.',
  'home.locked.page1.leave.title': 'השיחה הסתיימה',
  'home.locked.page1.leave.desc': 'היא יצאה מהשיחה. אפשר לחזור ולמצוא חיבור חדש.',
  'home.locked.page1.leave.desc_m': 'הוא יצא מהשיחה. אפשר לחזור ולמצוא חיבור חדש.',
  'home.locked.page1.leave.desc_f': 'היא יצאה מהשיחה. אפשר לחזור ולמצוא חיבור חדש.',
  'home.locked.page1.block.title': 'השיחה הסתיימה',
  'home.locked.page1.block.desc': 'היא בחרה לסיים את החיבור. אפשר להמשיך הלאה.',
  'home.locked.page1.block.desc_m': 'הוא בחר לסיים את החיבור. אפשר להמשיך הלאה.',
  'home.locked.page1.block.desc_f': 'היא בחרה לסיים את החיבור. אפשר להמשיך הלאה.',
  'home.locked.page1.remove.title': 'היא כבר לא זמינה לך',
  'home.locked.page1.remove.title_m': 'הוא כבר לא זמין לך',
  'home.locked.page1.remove.title_f': 'היא כבר לא זמינה לך',
  'home.locked.page1.remove.desc': 'היא הסירה אותך מרשימת הצופים שלה. אפשר לחזור ולמצוא חיבור אחר.',
  'home.locked.page1.remove.desc_m': 'הוא הסיר אותך מרשימת הצופים שלו. אפשר לחזור ולמצוא חיבור אחר.',
  'home.locked.page1.remove.desc_f': 'היא הסירה אותך מרשימת הצופים שלה. אפשר לחזור ולמצוא חיבור אחר.',
  'home.locked.page1.expire.title': 'היא לא הספיקה לענות',
  'home.locked.page1.expire.title_m': 'הוא לא הספיק לענות',
  'home.locked.page1.expire.title_f': 'היא לא הספיקה לענות',
  'home.locked.page1.expire.desc': 'הזמן עבר ללא תשובה. אפשר להמשיך ולשלוח הזמנה למישהי אחרת.',
  'home.locked.page1.expire.desc_m': 'הזמן עבר ללא תשובה. אפשר להמשיך ולשלוח הזמנה למישהו אחר.',
  'home.locked.page1.expire.desc_f': 'הזמן עבר ללא תשובה. אפשר להמשיך ולשלוח הזמנה למישהי אחרת.',
  'home.locked.page1.logout.title': 'היא כבר לא כאן',
  'home.locked.page1.logout.title_m': 'הוא כבר לא כאן',
  'home.locked.page1.logout.title_f': 'היא כבר לא כאן',
  'home.locked.page1.logout.desc': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה.',
  'home.locked.page1.logout.desc_m': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה.',
  'home.locked.page1.logout.desc_f': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה.',
  'home.locked.page1.delete.title': 'היא כבר לא כאן',
  'home.locked.page1.delete.title_m': 'הוא כבר לא כאן',
  'home.locked.page1.delete.title_f': 'היא כבר לא כאן',
  'home.locked.page1.delete.desc': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה.',
  'home.locked.page1.delete.desc_m': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה.',
  'home.locked.page1.delete.desc_f': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה.',

  // Home — watcher
  'home.notifOff': 'לא מקבל/ת התראות',

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
  'home.inviteConfirmDesc': 'אם תשלח, שניכם תנעלו להזמנה הזו ויהיו לה 10 דקות להגיב עליה.',
  'home.inviteConfirmDesc_mm': 'אם תשלח, שניכם תנעלו להזמנה הזו ויהיו לו 10 דקות להגיב עליה.',
  'home.inviteConfirmDesc_mf': 'אם תשלח, שניכם תנעלו להזמנה הזו ויהיו לה 10 דקות להגיב עליה.',
  'home.inviteConfirmDesc_fm': 'אם תשלחי, שניכם תנעלו להזמנה הזו ויהיו לו 10 דקות להגיב עליה.',
  'home.inviteConfirmDesc_ff': 'אם תשלחי, שתיכן תנעלנה להזמנה הזו ויהיו לה 10 דקות להגיב עליה.',
  'home.inviteConfirmOk': 'הזמנה לצ׳אט',
  'home.inviteTimerLabel': 'זמן שנותר',
  'home.inviteTimerLabelExtended': 'הוארך התוקף',
  'home.inviteExpired': 'פג תוקף',
  // Locked page2 cards reference both the inviter ("he/she") and the user's own
  // state ("available/answered"). `tgg(key, userMale, otherMale)` picks _uo
  // (e.g. _mf = user-male, other-female). _mm/_mf/_fm/_ff cover all variants;
  // _mm stays as the legacy default-key fallback.
  'home.locked.page2.cancel.title': 'ההזמנה בוטלה',
  'home.locked.page2.cancel.desc': 'הוא ביטל את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמין לאחרים.',
  'home.locked.page2.cancel.desc_mm': 'הוא ביטל את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמין לאחרים.',
  'home.locked.page2.cancel.desc_mf': 'היא ביטלה את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמין לאחרות.',
  'home.locked.page2.cancel.desc_fm': 'הוא ביטל את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמינה לאחרים.',
  'home.locked.page2.cancel.desc_ff': 'היא ביטלה את ההזמנה לפני שהספקת לענות. אפשר לחזור להיות זמינה לאחרות.',
  'home.locked.page2.approve.title': 'ההזמנה כבר לא זמינה',
  'home.locked.page2.approve.desc': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמין לאחרים.',
  'home.locked.page2.approve.desc_mm': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמין לאחרים.',
  'home.locked.page2.approve.desc_mf': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמין לאחרות.',
  'home.locked.page2.approve.desc_fm': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמינה לאחרים.',
  'home.locked.page2.approve.desc_ff': 'משהו השתנה לפני שהספקת לאשר. אפשר לחזור להיות זמינה לאחרות.',
  'home.locked.page2.expire.title': 'ההזמנה נסגרה',
  'home.locked.page2.expire.desc': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמין.',
  'home.locked.page2.expire.desc_mm': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמין.',
  'home.locked.page2.expire.desc_mf': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמין.',
  'home.locked.page2.expire.desc_fm': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמינה.',
  'home.locked.page2.expire.desc_ff': 'לא ענית בזמן, אז ההזמנה כבר לא פעילה. אפשר לחזור להיות זמינה.',
  'home.locked.page2.logout.title': 'הוא כבר לא כאן',
  'home.locked.page2.logout.title_mm': 'הוא כבר לא כאן',
  'home.locked.page2.logout.title_mf': 'היא כבר לא כאן',
  'home.locked.page2.logout.title_fm': 'הוא כבר לא כאן',
  'home.locked.page2.logout.title_ff': 'היא כבר לא כאן',
  'home.locked.page2.logout.desc': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.logout.desc_mm': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.logout.desc_mf': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.logout.desc_fm': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.logout.desc_ff': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.delete.title': 'הוא כבר לא כאן',
  'home.locked.page2.delete.title_mm': 'הוא כבר לא כאן',
  'home.locked.page2.delete.title_mf': 'היא כבר לא כאן',
  'home.locked.page2.delete.title_fm': 'הוא כבר לא כאן',
  'home.locked.page2.delete.title_ff': 'היא כבר לא כאן',
  'home.locked.page2.delete.desc': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.delete.desc_mm': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.delete.desc_mf': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.delete.desc_fm': 'הוא יצא מהאפליקציה או לא זמין כרגע. אפשר להמשיך הלאה.',
  'home.locked.page2.delete.desc_ff': 'היא יצאה מהאפליקציה או לא זמינה כרגע. אפשר להמשיך הלאה.',
  'home.waitingTimerSubtext': 'ההזמנה תהיה זמינה ל{n} הדקות הקרובות.',
  'home.waitingTimerTitle': 'ההזמנה שלך מחכה לו',
  'home.waitingTimerTitle_m': 'ההזמנה שלך מחכה לו',
  'home.waitingTimerTitle_f': 'ההזמנה שלך מחכה לה',
  'home.waitingTimerDesc': 'ובזמן הזה, הוא לא יקבל הזמנות אחרות. הלב שלך יחזור אליך רק אם הוא ידחה או לא יענה בזמן.',
  'home.waitingTimerDesc_mm': 'ובזמן הזה, הוא לא יקבל הזמנות אחרות. הלב שלך יחזור אליך רק אם הוא ידחה או לא יענה בזמן.',
  'home.waitingTimerDesc_mf': 'ובזמן הזה, היא לא תקבל הזמנות אחרות. הלב שלך יחזור אליך רק אם היא תדחה או לא תענה בזמן.',
  'home.waitingTimerDesc_fm': 'ובזמן הזה, הוא לא יקבל הזמנות אחרות. הלב שלך יחזור אליך רק אם הוא ידחה או לא יענה בזמן.',
  'home.waitingTimerDesc_ff': 'ובזמן הזה, היא לא תקבל הזמנות אחרות. הלב שלך יחזור אליך רק אם היא תדחה או לא תענה בזמן.',
  'home.waitingFirstInLine': 'הראשון/ה בתור',
  'home.waitingFirstInLineSubtext': 'נעדכן אותך כשתהיה תשובה.',
  'home.waitingFirstInLineSubtext_m': 'נעדכן אותך כשהוא יענה.',
  'home.waitingFirstInLineSubtext_f': 'נעדכן אותך כשהיא תענה.',
  'home.cancelWaitingTitle': 'לבטל את ההזמנה?',
  'home.cancelWaitingBtn': 'ביטול הזמנה',
  'home.cancelWaitingDesc': 'ההזמנה תבוטל מיד. היא תחזור להיות זמינה לאחרים, וגם אתה תוכל להמשיך להזמין.',
  'home.cancelWaitingDesc_mm': 'ההזמנה תבוטל מיד. הוא יחזור להיות זמין לאחרים, וגם אתה תוכל להמשיך להזמין.',
  'home.cancelWaitingDesc_mf': 'ההזמנה תבוטל מיד. היא תחזור להיות זמינה לאחרים, וגם אתה תוכל להמשיך להזמין.',
  'home.cancelWaitingDesc_fm': 'ההזמנה תבוטל מיד. הוא יחזור להיות זמין לאחרים, וגם את תוכלי להמשיך להזמין.',
  'home.cancelWaitingDesc_ff': 'ההזמנה תבוטל מיד. היא תחזור להיות זמינה לאחרים, וגם את תוכלי להמשיך להזמין.',
  'home.cancelWaitingConfirm': 'לבטל הזמנה',
  'home.refuseReplyTitle': 'לדחות את ההזמנה?',
  'home.refuseReplyDesc': 'ההזמנה תיסגר, והצד השני יקבל עדכון',
  'home.refuseReplyDesc_m': 'ההזמנה תיסגר, והצד השני יקבל עדכון',
  'home.refuseReplyDesc_f': 'ההזמנה תיסגר, והצד השני יקבל עדכון',
  'home.refuseReplyConfirm': 'לדחות את ההזמנה',
  'home.watchingAccept': 'להתמקד',
  'home.watchingAccept_m': 'להתמקד בו',
  'home.watchingAccept_f': 'להתמקד בה',
  'home.watchingReject': 'דילוג',
  'home.skipHintTitle': 'אפשר להחליק את הכרטיס למטה',
  'home.skipHintDesc': 'בפעם הבאה החליקו את הכרטיס למטה כדי לדלג במהירות לפרופיל אחר. רוצים לדלג עכשיו?',
  'home.skipHintCancel': 'הבנתי',
  'home.skipHintConfirm': 'לדלג',
  // Shown in the rotating-headline slot for the duration of the first-time
  // swipe-down tutorial, instead of that card's random skip line: while the
  // card peeks down and reveals the slot, the text names the gesture.
  'home.skipTutorialHint': 'דילוג בהחלקה למטה',
  // Incoming-invite card (page2). Title via tg(key, inviterMale) — only the
  // inviter's gender (הוא/היא + הזמין/הזמינה). Desc via tgg(key, receiverMale,
  // inviterMale) → suffix _<receiver><inviter>: receiver drives תחליטי/תחליט
  // + ואת לא מקבלת/ואתה לא מקבל, inviter drives הוא/היא מחכה. replyingTimerDesc
  // is unused dead code (no caller) kept only for parity; receiver-gendered.
  'home.replyingTimerDesc': 'הוא הזמין אותך לצ׳אט. יש לך 10 דקות לענות.',
  'home.replyingTimerDesc_m': 'הוא הזמין אותך לצ׳אט. יש לך 10 דקות לענות.',
  'home.replyingTimerDesc_f': 'הוא הזמין אותך לצ׳אט. יש לך 10 דקות לענות.',
  'home.replyingTitle': 'הוא הזמין אותך לצ׳אט',
  'home.replyingTitle_m': 'הוא הזמין אותך לצ׳אט',
  'home.replyingTitle_f': 'היא הזמינה אותך לצ׳אט',
  'home.replyingDesc': 'ובזמן הזה, הוא לא יכול לשלוח הזמנות נוספות. כל הפוקוס רק עלייך.',
  'home.replyingDesc_mm': 'ובזמן הזה, הוא לא יכול לשלוח הזמנות נוספות. כל הפוקוס רק עליך.',
  'home.replyingDesc_mf': 'ובזמן הזה, היא לא יכולה לשלוח הזמנות נוספות. כל הפוקוס רק עליך.',
  'home.replyingDesc_fm': 'ובזמן הזה, הוא לא יכול לשלוח הזמנות נוספות. כל הפוקוס רק עלייך.',
  'home.replyingDesc_ff': 'ובזמן הזה, היא לא יכולה לשלוח הזמנות נוספות. כל הפוקוס רק עלייך.',
  'home.replyingAccept': 'פתיחת צ׳אט',
  'home.replyingReject': 'לדלג',
  'home.chatHeader': 'אתם אחד על אחד',
  'home.leaveTitle': 'סיום צ\'אט',
  'home.leaveDesc': 'הצ\'אט ייסגר לצמיתות ולא ניתן יהיה לשחזר אותו. הצד השני יקבל התראה.',
  'home.leaveConfirm': 'סיום',
  'chat.empty': 'עוד אין הודעות',
  'chat.inputPlaceholder': 'כתוב הודעה...',
  'chat.today': 'היום',
  'chat.yesterday': 'אתמול',
  'chat.dayBeforeYesterday': 'שלשום',
  'chat.block': 'חסימה',
  'chat.blockTitle': 'חסימת משתמש',
  'chat.blockDesc': 'המשתמש ייחסם ולא יוכל ליצור איתך קשר שוב. לא ניתן לבטל פעולה זו.',
  'chat.blockConfirm': 'חסימה',
  'chat.endChat': 'סיום',
  'chat.leave': 'עזיבה',
  'chat.a11y.close': 'סגירת הצ\'אט',
  'chat.a11y.menu': 'אפשרויות צ\'אט',
  'chat.report': 'דיווח',
  'chat.reportTitle': 'דיווח על המשתמש',
  'chat.reportDesc': 'הדיווח יישלח לצוות שלנו לבדיקה. המשתמש ייחסם ולא תותאמו שוב. כל קשר פעיל ביניכם יסתיים.',
  'chat.reportPlaceholder': 'מה קרה? אפשר להוסיף פרטים (לא חובה)',
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
  'chat.confirmSend.send': 'שלח',
  'chat.locationLabel': 'מיקום',
  'chat.locationOpen': 'הקש לפתיחה במפות',
  'chat.scheduleTitle': 'הימים שאני פנוי (ללא ילדים)',
  'chat.scheduleTitle_m': 'הימים שאני פנוי (ללא ילדים)',
  'chat.scheduleTitle_f': 'הימים שאני פנויה (ללא ילדים)',
  'chat.retry': 'שלח שנית',

  // Push notifications
  'push.WATCHING': 'הזדמנות חדשה',
  'push.WAITING': 'ההזמנה נשלחה',
  'push.REPLYING': 'מישהו בחר אותך',
  'push.REPLYING_m': 'מישהו בחר אותך',
  'push.REPLYING_f': 'מישהי בחרה אותך',
  'push.OTHER_CANCELLED': 'ההזמנה בוטלה',

  // Gender-aware: user gender
  'home.tapForMore_m': 'בחזרה למשחק',
  'home.tapForMore_f': 'בחזרה למשחק',
  'home.locationUnavailableTitle': 'מיקום לא זמין',
  'home.locationUnavailableDesc': 'לא הצלחנו לאתר את המיקום שלך. נסה לעבור למקום עם קליטה טובה יותר ולחץ על שדר מיקום.',
  'home.locationUnavailableButton_m': 'שדר מיקום',
  'home.locationUnavailableButton_f': 'שדרי מיקום',
  'home.hiddenHeader2': 'Once',
  // Broadcast countdown, now shown as a line in the viewers info card
  // description (was the toggle's broadcast-segment timer). {time} = MM:SS.
  // Accessibility labels for the floating shell chrome (no visible text).
  'home.a11y.menu': 'פתיחת התפריט',
  'home.a11y.closeMenu': 'סגירת התפריט',
  'home.a11y.closeInvite': 'סגירת ההזמנה',
  'home.a11y.closeProfile': 'סגירת הפרופיל',
  // צ'יפ הגיל שמופיע על התמונה. מגדרי דרך tg(): בן/בת + הגיל.
  'home.ageChip_m': 'בן {age}',
  'home.ageChip_f': 'בת {age}',
  'home.locatingDesc': 'סורק אנשים בסביבתך',
  'home.loadingProfile': 'טוען נתוני פרופיל',
  'home.noOneNearbyTitle': 'אין כרגע אנשים בסביבה',
  'home.noOneNearbyDesc': 'לא מצאנו כרגע מישהו בסביבה שלך. אפשר לנסות שוב עוד מעט, או לשנות את העדפות החיפוש',
  'home.noOneNearbyDesc_m': 'לא מצאנו כרגע מישהו בסביבה שלך. אפשר לנסות שוב עוד מעט, או לשנות את העדפות החיפוש',
  'home.noOneNearbyDesc_f': 'לא מצאנו כרגע מישהו בסביבה שלך. אפשר לנסות שוב עוד מעט, או לשנות את העדפות החיפוש',
  'settings.kidsLabel_m': 'מתכנן ילדים?',
  'settings.kidsLabel_f': 'מתכננת ילדים?',
  'settings.deleteConfirmDesc_m': 'כל המידע, התמונות והשיחות יימחקו לצמיתות. הזמנות פעילות, שיחות וצפיות יבוטלו. לא ניתן לבטל פעולה זו.',
  'settings.deleteConfirmDesc_f': 'כל המידע, התמונות והשיחות יימחקו לצמיתות. הזמנות פעילות, שיחות וצפיות יבוטלו. לא ניתן לבטל פעולה זו.',
  'settings.signOut_m': 'התנתקות מהאפליקציה',
  'settings.signOut_f': 'התנתקות מהאפליקציה',
  'settings.signOutConfirmDesc_m': 'לאחר ההתנתקות לא תקבל התראות. אם מישהו צופה בך כרגע, הוא יקבל התראה שהתנתקת.',
  'settings.signOutConfirmDesc_f': 'לאחר ההתנתקות לא תקבלי התראות. אם מישהו צופה בך כרגע, הוא יקבל התראה שהתנתקת.',
  'settings.signOutYes_m': 'התנתקות',
  'settings.signOutYes_f': 'התנתקות',
  'chat.inputPlaceholder_m': 'כתוב הודעה...',
  'chat.inputPlaceholder_f': 'כתבי הודעה...',
  'photo.sub_m': 'הוסף 2-6 תמונות',
  'photo.sub_f': 'הוסיפי 2-6 תמונות',

  // Gender-aware: watcher/subject gender
  'home.notifOff_m': 'לא מקבל התראות',
  'home.notifOff_f': 'לא מקבלת התראות',
}