export default {
  // Landing


  // Auth
  'auth.signInGoogle': 'Sign in with Google',
  'auth.signInApple': 'Sign in with Apple',
  'auth.reviewCodePlaceholder': 'Review code',
  'auth.reviewSubmit': 'Enter',
  'auth.tagline': 'One encounter in real time',
  'auth.msg1': 'Not a catalog. Not endless chats.',
  'auth.msg2': 'One encounter\nin real time',
  'auth.orDivider': 'or',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendLink': 'Send a sign-in link',
  'auth.invalidEmail': 'Please enter a valid email address',
  'auth.linkSent': 'Check your inbox',
  'auth.linkSentDesc': 'We sent a sign-in link to {email}. Tap the link in the email to continue.',
  'auth.linkResend': 'Send another link',
  'auth.linkError': 'Could not send the link. Please try again.',
  'auth.howItWorksLink': 'How Once works',
  'auth.howItWorksTitle': 'How Once works',
  'auth.howItWorksBody': 'Once is built for one real encounter at a time.\n\nChoose one person.\nSend one invitation.\nMeet in real time.\n\nNo catalog. No parallel chats.',
  'auth.howItWorksBtn': 'Got it',
  'auth.legalPrefix': 'By continuing, you agree to the',
  'auth.legalConnTerms': '',
  'auth.legalTerms': 'Terms',
  'auth.legalSep': ' & ',
  'auth.legalConnPrivacy': '',
  'auth.legalPrivacy': 'Privacy Policy',

  // Onboarding step 1
  'ob.whoAreYou': 'How do you identify?',
  'ob.male': 'Male',
  'ob.female': 'Female',
  'ob.nicknameStep': "What's your name?",
  'ob.next': 'Continue',

  // Onboarding step 2
  'ob.birthdate': 'Date of Birth',
  'ob.minAge': 'Minimum age to register is 18',
  'ob.createAccount': 'Create account',
  'ob.createAccount_m': 'Create account',
  'ob.createAccount_f': 'Create account',
  'ob.birthConfirm': 'Your birthday is {date} and you are {age}?',
  'ob.birthConfirmFix': 'Fix',

  // Onboarding photo
  'photo.sub': 'Add 2-6 photos',
  'photo.uploadFailed': 'Photo upload failed. You cannot continue without a photo, please try again.',

  // Onboarding bio
  'bio.placeholder': 'A sentence, a feeling, or a moment that represents you...',
  'bio.submit': 'Continue',
  'bio.min': 'Minimum 20 characters',

  // Home — distance chip text. <ab> = viewer+subject anchor (d=device,
  // h=home, w=work). dist.* carry a {d} distance placeholder; near.* are the
  // proximate (<250m) wording. Subject pronoun is gendered (_m/_f) only where
  // the phrasing references the subject; cells whose wording has no subject
  // pronoun are base-key only (dd, hd, wd, and near.hh / near.ww).
  'home.dist.dd': '{d} away',
  'home.dist.dh_m': '{d} from his home',
  'home.dist.dh_f': '{d} from her home',
  'home.dist.dw_m': '{d} from his work',
  'home.dist.dw_f': '{d} from her work',
  'home.dist.hd': '{d} from your home',
  'home.dist.hh_m': '{d} between your home and his',
  'home.dist.hh_f': '{d} between your home and hers',
  'home.dist.hw_m': 'your home is {d} from his work',
  'home.dist.hw_f': 'your home is {d} from her work',
  'home.dist.wd': '{d} from your work',
  'home.dist.wh_m': 'your work is {d} from his home',
  'home.dist.wh_f': 'your work is {d} from her home',
  'home.dist.ww_m': '{d} between your work and his',
  'home.dist.ww_f': '{d} between your work and hers',
  'home.near.dd': 'right here',
  'home.near.dh_m': 'right by his home',
  'home.near.dh_f': 'right by her home',
  'home.near.dw_m': 'right by his work',
  'home.near.dw_f': 'right by her work',
  'home.near.hd': 'right by your home',
  'home.near.hh': 'neighbors',
  'home.near.hw_m': 'he works right by your home',
  'home.near.hw_f': 'she works right by your home',
  'home.near.wd': 'right by your work',
  'home.near.wh_m': 'he lives right by your work',
  'home.near.wh_f': 'she lives right by your work',
  'home.near.ww': 'work neighbors',
  // Merged proximity chip (distance + relative last-seen in one phrase).
  // English needs no distance prefix but a comma join reads better than a
  // bare space; hereNow is the live device device override.
  'home.prox.prefix': '',
  'home.prox.join': ', ',
  'home.prox.hereNow': 'here, now',

  // Location

  // Settings
  'settings.preferences': 'Menu',
  'settings.searchPreferences': 'Search preferences',
  'settings.myInfo': 'My info',
  'settings.appSettings': 'App',
  'settings.about': 'A Different Way to Meet',
  'settings.profileSubtitle': 'Edit your profile',
  'settings.aboutSubtitle': 'Learn more about our approach',


  // About page
  'about.heroTitle': 'Real meetings.\nReally close.\nIn real time.',
  'about.heroSub': 'Meetings with people who are right next to you, in real time.',
  'about.feature1.title': 'One-on-one connection',
  'about.feature1.desc': "When a connection forms, it's exclusive to the two of you. No parallel chats, no competing for attention. You meet a person, not another option.",
  'about.feature2.title': 'From screen to reality',
  'about.feature2.desc': "When you're both in sync, the connection becomes a real meeting, here and now. No more endless chats that lead nowhere.",
  'about.feature3.title': "You're in control",
  'about.feature3.desc': 'You choose when to search and who to invite. Got an invitation? You decide whether to accept. Your pace, your choice.',
  'about.feature4.title': 'Mutual consent, always',
  'about.feature4.desc': "A connection only forms when you're both interested. No one will surprise you, and you won't surprise anyone.",
  'settings.profile': 'Edit your profile',
  'settings.account': 'Account',
  'settings.visibilityVisible': 'Visible',
  'settings.visibilityHidden': 'Hidden',
  // Watcher chip on the visibility row. The number alone says nothing, so the
  // chip carries the whole phrase.
  'settings.watchersOne': '1 person watching you',
  'settings.watchersMany': '{count} people watching you',
  'settings.credits': 'Credits',
  // Suffix word in the credits-row value when the user has extras, e.g.
  // "1/1 + 5 extra". Distinct word so "+ 5" doesn't read as math.
  'settings.creditsExtraSuffix': 'extra',
  // Groups: row in the account card, plus the "my groups" sheet (list + join input).
  'settings.groups': 'My groups',
  'settings.groupsMine': 'My groups',
  'settings.groupsNone': 'No groups joined',
  'settings.groupsMore': 'more...',
  'settings.groupsEmpty': "You haven't joined any group yet.",
  'settings.groupsDisabled': 'Disabled',
  'settings.groupsAdd': 'Add a group',
  'settings.groupsJoinTitle': 'Join a group',
  'settings.groupsJoinHint': "Enter the code you got from the group's manager. You can be a member of several groups at once.",
  'settings.groupsCodePlaceholder': '6 digits',
  'settings.groupsJoinAction': 'Join',
  'settings.groupsInviteInvalid': 'Invalid or inactive code',
  'settings.groupsBack': 'Back',
  'settings.groupsLeaveTitle': 'Leave {name}?',
  'settings.groupsLeaveDesc': 'You can join again later with the group code.',
  'settings.groupsLeaveConfirm': 'Leave group',
  // Report a bug: row in the account card + the bug-report sheet.
  'settings.bugReport': 'Report a bug',
  'bugReport.title': 'Report a bug',
  'bugReport.placeholder': 'Describe the bug...',
  'bugReport.attach': 'Attach a photo',
  'bugReport.attachChange': 'Change photo',
  'bugReport.attachRemove': 'Remove',
  'bugReport.submit': 'Send',
  'bugReport.thanks': 'Thanks! Your report was sent.',
  'bugReport.error': 'Sending failed, please try again.',
  'settings.creditsNext': 'Renews {when}',
  'settings.preview': 'Preview',
  'settings.myProfile': 'Profile',
  'settings.photo': 'My Photos',
  'settings.photoHint': 'Long press and drag to reorder',
  'settings.aboutMe': 'About Me',
  'settings.email': 'Email',
  'settings.name': 'Name',
  'settings.birthDate': 'Birth date',
  'settings.gender': 'Gender',
  'settings.male': 'Male',
  'settings.female': 'Female',
  'settings.accountDetails': 'Details',
  'settings.deleteAccount': 'Delete Account',
  'settings.deleteConfirmTitle': 'Delete account',
  'settings.deleteConfirmDesc': 'All data, photos, and conversations will be permanently deleted. Active invitations, chats, and connections will be cancelled. This action cannot be undone.',
  'settings.deleteYes': 'Delete',
  'settings.signOut': 'Sign Out',
  'settings.signOutConfirmTitle': 'Sign out',
  'settings.signOutConfirmDesc': 'You won\'t receive notifications after signing out. If someone is watching you, they\'ll be notified.',
  'settings.signOutYes': 'Sign out',
  'settings.ageRange': 'Ages',
  'settings.ageFrom': 'From',
  'settings.ageTo': 'To',
  'settings.save': 'Save',
  'settings.add': 'Add',
  'settings.range': 'Up to',
  // Distance-field LABEL when range is unlimited (value column left empty).
  'settings.rangeUnlimitedLabel': 'No distance limit',
  'settings.rangeHere': 'Right here',
  'settings.rangeUnlimited': 'Unlimited',
  'settings.km': 'km',
  'settings.meter': 'm',
  'settings.location': 'Location',
  'settings.locationDevice': 'My location',
  'settings.locationCustom': 'Custom address',
  'settings.locationHome': 'Home',
  'settings.locationWork': 'Work',
  // Location field LABEL, by the chosen anchor type (value column shows the
  // address for home/work, nothing for the device case).
  'settings.locationFromHome': 'From home',
  'settings.locationFromWork': 'From work',
  'settings.locationFromDevice': 'From my current location',
  'settings.locationDeviceDesc': "Use the device's location",
  'settings.locationCustomDesc': 'Pick an address',
  'settings.locationAddressPrompt': 'Type an address or city name',
  'settings.locationSearch': 'Search',
  'settings.locationSearching': 'Searching...',
  'settings.locationNoResults': 'No address found. Try a different query.',
  'settings.locationFetchingDevice': 'Getting device location...',
  'settings.locationDeviceFailedTitle': "Couldn't get location",
  'settings.locationDeviceFailedDesc': 'Allow location access in device settings and try again.',
  'settings.locationPermissionTitle': 'Location permission',
  'settings.locationPermissionDesc': 'Allow location access to use the device location.',
  'settings.locationOpenSettings': 'Open settings',
  'settings.locationOk': 'OK',
  'settings.locationCancel': 'Cancel',
  'settings.locationServicesOffTitle': 'Location services off',
  'settings.locationServicesOffDesc': 'Turn on location services on the device and try again.',
  'settings.locationLockedTitle': "Location can't be changed right now",
  'settings.locationLockedDesc': "To change your location, first leave the active view or invitation.\nOnce you finish the current interaction, you'll be able to update your location.",
  'settings.duplicatePhotoTitle': 'Duplicate photo',
  'settings.duplicatePhotoBody': 'The same photo cannot be uploaded twice. Duplicate photos were removed.',
  'settings.photoEditMoveUp': 'Move up',
  'settings.photoEditMoveDown': 'Move down',
  'settings.photoEditReplace': 'Replace',
  'settings.photoEditDelete': 'Delete',
  'settings.photoMinTwo': 'At least 2 photos required',
  // Add-chips on the own-profile card, under the fact chips.
  'settings.addPhoto': 'Add a photo',
  'settings.addFamily': 'Family & kids',
  'family.title': 'Family & kids',
  'family.optional': 'optional',
  'family.hasKidsQuestion': 'Do you have kids?',
  'family.hasKidsYes': 'I have kids',
  'family.hasKidsYesOne': 'I have one kid',
  'family.hasKidsYesMany': 'I have {count} kids',
  'family.hasKidsNo': 'No kids',
  'family.isForKids': 'Interested in kids',
  'family.isForKidsMore': 'Interested in more kids',
  'family.isForKidsYes': 'Yes',
  'family.isForKidsNo': 'No',
  'family.fivePlus': '5+',
  'family.agesQuestion': 'Ages',
  'family.scheduleTitle': 'Days I have my kids',
  'family.scheduleWeek1Label': 'The days the kids are with me (repeats)',
  'family.scheduleWeek1LabelPrefix': 'The days the kids are',
  'family.scheduleWeek1LabelEmphasis': 'with me',
  'family.scheduleWeek1LabelSuffix': ' (repeats)',
  'family.scheduleWeek1Hint': "These days are kept private and never shown to other users. We only use them to surface the matches most relevant to you.",
  'family.scheduleHint': 'Mark the days your kids are with you',
  'family.scheduleAdd': 'Add days',
  'family.scheduleRemove': 'Remove',
  'family.weekLabel': 'Week {n}',
  'family.addWeek': 'Add another week',
  'family.removeWeek': 'Remove week',
  'family.agesAdd': 'Add ages',
  'family.agesRemove': 'Remove ages',
  'family.countPlaceholder': 'Pick a number',
  'family.agePlaceholder': 'Select age',
  'family.kidLabel': 'Kid #{n}',
  'family.ageUnder1': 'Less than a year',
  'family.ageOne': '1 year',
  'family.ageTwo': '2 years',
  'family.ageYears': '{n} years',
  'settings.weekStartLabel': 'Week starts on',
  'settings.weekStartSunday': 'Sunday',
  'settings.weekStartMonday': 'Monday',
  'family.dayShort.0': 'S',
  'family.dayShort.1': 'M',
  'family.dayShort.2': 'T',
  'family.dayShort.3': 'W',
  'family.dayShort.4': 'T',
  'family.dayShort.5': 'F',
  'family.dayShort.6': 'S',
  'family.summaryNoKids': 'No kids',
  'family.summaryHasKids': 'Has kids',
  'family.summaryHasOneKid': 'Has one kid',
  'family.summaryHasNKids': 'Has {n} kids',
  'family.summarySelfNoKids': 'I have no kids',
  'family.summarySelfHasKids': 'I have kids',
  'family.summarySelfHasOneKid': 'I have one kid',
  'family.summarySelfHasNKids': 'I have {n} kids',
  'family.wantsMore': 'wants more kids',
  'family.doesntWantMore': 'no more kids',
  'family.wantsKids': 'wants kids',
  'family.doesntWantKids': 'no kids wanted',
  'family.selfWantsMore': 'want more kids',
  'family.selfDoesntWantMore': "don't want more",
  'family.selfWantsKids': 'want kids',
  'family.selfDoesntWantKids': "don't want kids",
  'family.overlapLabel': '{pct}% kid-free overlap',
  'family.overlapChip': '{pct}% overlap',
  'family.addKid': 'Add kid',
  'family.ageNotSet': 'No age',
  'family.ageFortyPlus': '40+',
  'family.summaryFreeWeekend': 'free weekend',
  'family.summaryWithKidsWeekend': 'busy weekend',
  'common.gotIt': 'Got it',
  // Count phrase with correct singular/plural, built by creditsText() in
  // lib/credits.ts. Used wherever a credits amount is shown in prose.
  'credits.count.one': '1 credit',
  'credits.count.many': '{n} credits',
  // Relative next-grant day. Returned from formatNextGrant() — replaces the
  // old absolute "DD/MM HH:MM" so the user reads a relative phrase.
  'credits.grant.today': 'today at {time}',
  'credits.grant.tomorrow': 'tomorrow at {time}',
  // Credits picker. Since 2026-07-22 nothing is purchasable (3/10/50 all show
  // "coming soon") and inviting a friend is the only way to earn extra, so the
  // copy talks about getting credits rather than buying them.
  'credits.buy.title': 'More credits',
  'credits.buy.desc': 'Credits you get are added on top of your daily allowance and never expire.',
  'credits.buy.priceFree': 'Free',
  'credits.buy.comingSoon': 'Coming soon',
  // Invite row: the one active way to earn. The title is the action alone;
  // the sub-line under it inside the same row carries WHEN the credit lands,
  // so the row never reads as "tap and get a credit". genderize() is a no-op
  // on English (no {m|f} marker) — single form.
  'credits.invite.title': 'Invite a friend',
  'credits.invite.joined.none': 'The credit arrives once your friend installs the app and completes a profile.',
  'credits.invite.joined.one': 'One friend joined through you.',
  'credits.invite.joined.many': '{n} friends joined through you.',
  // Text that rides along with the link in the OS share sheet.
  'credits.invite.shareText': 'Join me on Once, the one on one dating app:',
  'settings.miles': 'mi',
  // genderize() is a no-op on English (no {m|f} marker) — single form.
  'settings.preferredGender': 'Available',
  'settings.genderM': 'For men',
  'settings.genderF': 'For women',
  'settings.genderBoth': 'For everyone',
  'settings.kidsLabel': 'Planning for kids?',
  'settings.kidsYes': 'Yes',
  'settings.kidsNo': 'No',
  'settings.kidsNa': 'Not relevant',

  // Match
  'match.justNow': 'Online just now',
  'match.justNow_m': 'Online just now',
  'match.justNow_f': 'Online just now',
  'match.minAgo': 'Online 1 min ago',
  'match.minAgo_m': 'Online 1 min ago',
  'match.minAgo_f': 'Online 1 min ago',
  'match.minsAgo': 'Online {n} min ago',
  'match.minsAgo_m': 'Online {n} min ago',
  'match.minsAgo_f': 'Online {n} min ago',
  'match.hrAgo': 'Online 1 hr ago',
  'match.hrAgo_m': 'Online 1 hr ago',
  'match.hrAgo_f': 'Online 1 hr ago',
  'match.hrs2Ago': 'Online 2 hr ago',
  'match.hrs2Ago_m': 'Online 2 hr ago',
  'match.hrs2Ago_f': 'Online 2 hr ago',
  'match.hrsAgo': 'Online {n} hr ago',
  'match.hrsAgo_m': 'Online {n} hr ago',
  'match.hrsAgo_f': 'Online {n} hr ago',
  'match.dayAgo': 'Online 1 day ago',
  'match.dayAgo_m': 'Online 1 day ago',
  'match.dayAgo_f': 'Online 1 day ago',
  'match.days2Ago': 'Online 2 days ago',
  'match.days2Ago_m': 'Online 2 days ago',
  'match.days2Ago_f': 'Online 2 days ago',
  'match.daysAgo': 'Online {n} days ago',
  'match.daysAgo_m': 'Online {n} days ago',
  'match.daysAgo_f': 'Online {n} days ago',
  // Relative time without the "Online" prefix: the suffix of the merged
  // proximity chip (formatAgo). Standalone status keeps match.*Ago.
  'match.ago.now': 'just now',
  'match.ago.min': '1 min ago',
  'match.ago.mins': '{n} min ago',
  'match.ago.hr': '1 hr ago',
  'match.ago.hrs2': '2 hr ago',
  'match.ago.hrs': '{n} hr ago',
  'match.ago.day': '1 day ago',
  'match.ago.days2': '2 days ago',
  'match.ago.days': '{n} days ago',
  'match.connected': 'Connected',
  'match.connected_m': 'Connected',
  'match.connected_f': 'Connected',

  // Errors

  // Home — modes
  'home.hiddenHeaderTitle': 'Watching Me',
  'home.notifAccessRequired': 'Notification access required so you don\'t miss a signal',
  'home.locationAccessRequired': 'Location access required to see the distance',
  'home.noInternetTitle': 'No internet connection',
  'home.noInternetDesc': 'Once needs an internet connection to work. Please check your Wi-Fi or mobile data and try again.',
  'home.noInternetButton': 'Try again',
  // ViewersStatusCard (page2) — 5 states
  // In-card trigger that opens the broadcast confirm popup. Reads as a
  // mode-switch (parallel to the go-visible label), NOT as the action verb;
  // the confirm popup's button (home.broadcastConfirmButton) keeps the
  // "broadcast me" wording.
  'home.premiumPopup.add': 'Show me to people',
  'home.premiumPopup.hide': 'Hide my profile',
  'home.premiumPopup.reveal': 'Show my profile',
  // English is non-gendered (single form); tg picks the same string for either is_male.
  'settings.hideConfirmTitle': 'Hide your profile?',
  'settings.hideConfirmDesc': 'All your watchers will be removed and notified.',
  'settings.hideConfirmDescOne': 'Your 1 current watcher will be removed and notified.',
  'settings.hideConfirmDescMany': 'Your {count} current watchers will be removed and notified.',
  'settings.hideConfirmButton': 'Hide',

  // Home — match teaser
  'home.tapForMore': 'Back to the game',
  // Ready-to-find headline pool. One line is picked at random each time the
  // home pane (re)enters the ready state (see home.tsx headlineText). Stored
  // as a newline-joined block, one sentence per source line; consumed via
  // .split('\n') so adding/removing a line needs no other change.
  'home.readyHeadlines': `Less scrolling, more meeting
One person gets the space
Your time deserves presence
Connection starts with attention
Not a catalog, a living moment
Whoever is here, is really here
Less noise, more courage
One chance, open now
A real moment does not wait
Choose less, feel more
One meeting, no tabs open
Presence is the new filter
Not everyone, only who feels it
When the heart is free, something happens
One conversation can be enough
No games, with intention
Be available for something real
Love does not start with a list
Let the moment choose you
Someone sees you right now
Fewer options, more clarity
Connection needs room to breathe
Do not search, meet
Whoever is in focus gets a heart
The world moves, you are present
A small moment, a big chance
When it happens, it is now
No more quiet near misses
A meeting starts with a small decision
One person changes the evening
No romantic background noise
Being here is already something
There is magic in less
One intention, one moment
Gather courage, not matches
A good connection needs no clutter
Now is a good time
Less alone against the infinite
One look before more scrolling
Give the moment a chance
No more open windows
Someone is waiting for your attention
A clear moment inside the noise
Choosing presence over abundance
Love loves quiet
Sometimes one is a world
Without escaping to the next option
To be truly available
A bond starts when you stop
Just a moment, just the two of you`,
  // Skip-feedback headline pool. One line is picked at random when a skip
  // starts (see home.tsx skipHeadlineIdx) and shown in the headline slot
  // above the centre button for the duration of that skip. Same newline-block
  // format as home.readyHeadlines.
  'home.skipHeadlines': `Moving on
Not this time
Maybe next
Fresh moment
Next is coming
Keep looking
One more look
Letting go
Finding connection
Quietly forward
Another try
That's okay
Staying open
Maybe soon
Checking ahead
All good
Moving calmly
Not the one
Gentle search
Another possibility
Moment moves
Path is open
Keeping it light
Next awaits
Another connection
No worries
Swiping on
Staying open
Maybe there
Someone else
Flowing on
Clean choice
Moment passes
Finding spark
Staying calm
Next in line
Another chance
Not a fit
Wide open
Moving forward
No pressure
Another moment
Maybe now
Different connection
Moving ahead
Small breath
Keep checking
Heart knows
Another chance
Next may surprise`,
  // Geo-availability gate. Shown in the rotating-headline slot when the
  // server marks the user outside every active area (unavailable) or inside
  // an area that has not opened yet (notYet). While shown, the side tab is
  // removed so page2/chat is unreachable.
  // {date} is interpolated by home.tsx from availability.starts_at (the
  // area's launch time) — keep the placeholder.
  'home.geoGate.unavailable': 'Not available in your area',
  'home.geoGate.notYet': 'Opens in your area {date}',
  // Join-request gate: the user is not in any active group. The center
  // icon-button itself sends the request (no separate button label).
  'home.joinGate.requestText': 'Access by approval, tap to request to join',
  'home.joinGate.waitingText': 'Request sent, waiting for approval',
  'home.startNow': 'Start now',
  'home.readyToContinue': 'Ready to continue?',
  'home.endedBack': 'Back to game',

  // Locked-state cards: page1 (after a terminal event) and page2 (dead invite).
  // Key shape: home.locked.<page>.<message>.{title,desc}
  // Locked page1 cards reference the other user. `tg(key, otherMale)` picks _m
  // when the other user is male, _f when female. Only the other's gender
  // matters; "you" is gender-neutral in English.
  'home.locked.page1.invite.title': 'She\'s no longer available',
  'home.locked.page1.invite.title_m': 'He\'s no longer available',
  'home.locked.page1.invite.title_f': 'She\'s no longer available',
  'home.locked.page1.invite.desc': 'She\'s already in another invitation, so you can\'t send to her right now. You can move on.',
  'home.locked.page1.invite.desc_m': 'He\'s already in another invitation, so you can\'t send to him right now. You can move on.',
  'home.locked.page1.invite.desc_f': 'She\'s already in another invitation, so you can\'t send to her right now. You can move on.',
  'home.locked.page1.extend.title': 'Can\'t extend',
  'home.locked.page1.extend.desc': 'The invitation has already closed. You can go back and find another connection.',
  'home.locked.page1.approve.title': 'The connection is no longer available',
  'home.locked.page1.approve.desc': 'Something changed before you could connect. You can move on.',
  'home.locked.page1.decline.title': 'She didn\'t accept this time',
  'home.locked.page1.decline.title_m': 'He didn\'t accept this time',
  'home.locked.page1.decline.title_f': 'She didn\'t accept this time',
  'home.locked.page1.decline.desc': 'She chose not to continue right now. All good, you can move on to the next connection.',
  'home.locked.page1.decline.desc_m': 'He chose not to continue right now. All good, you can move on to the next connection.',
  'home.locked.page1.decline.desc_f': 'She chose not to continue right now. All good, you can move on to the next connection.',
  'home.locked.page1.leave.title': 'The chat ended',
  'home.locked.page1.leave.desc': 'She left the chat. You can go back and find a new connection.',
  'home.locked.page1.leave.desc_m': 'He left the chat. You can go back and find a new connection.',
  'home.locked.page1.leave.desc_f': 'She left the chat. You can go back and find a new connection.',
  'home.locked.page1.block.title': 'The chat ended',
  'home.locked.page1.block.desc': 'She chose to end the connection. You can move on.',
  'home.locked.page1.block.desc_m': 'He chose to end the connection. You can move on.',
  'home.locked.page1.block.desc_f': 'She chose to end the connection. You can move on.',
  'home.locked.page1.remove.title': 'She\'s no longer available to you',
  'home.locked.page1.remove.title_m': 'He\'s no longer available to you',
  'home.locked.page1.remove.title_f': 'She\'s no longer available to you',
  'home.locked.page1.remove.desc': 'She removed you from her viewers list. You can go back and find another connection.',
  'home.locked.page1.remove.desc_m': 'He removed you from his viewers list. You can go back and find another connection.',
  'home.locked.page1.remove.desc_f': 'She removed you from her viewers list. You can go back and find another connection.',
  'home.locked.page1.expire.title': 'She didn\'t reply in time',
  'home.locked.page1.expire.title_m': 'He didn\'t reply in time',
  'home.locked.page1.expire.title_f': 'She didn\'t reply in time',
  'home.locked.page1.expire.desc': 'Time passed without a reply. You can move on and send an invitation to someone else.',
  'home.locked.page1.logout.title': 'She\'s no longer here',
  'home.locked.page1.logout.title_m': 'He\'s no longer here',
  'home.locked.page1.logout.title_f': 'She\'s no longer here',
  'home.locked.page1.logout.desc': 'She left the app or isn\'t available right now. You can move on.',
  'home.locked.page1.logout.desc_m': 'He left the app or isn\'t available right now. You can move on.',
  'home.locked.page1.logout.desc_f': 'She left the app or isn\'t available right now. You can move on.',
  'home.locked.page1.delete.title': 'She\'s no longer here',
  'home.locked.page1.delete.title_m': 'He\'s no longer here',
  'home.locked.page1.delete.title_f': 'She\'s no longer here',
  'home.locked.page1.delete.desc': 'She left the app or isn\'t available right now. You can move on.',
  'home.locked.page1.delete.desc_m': 'He left the app or isn\'t available right now. You can move on.',
  'home.locked.page1.delete.desc_f': 'She left the app or isn\'t available right now. You can move on.',

  // Home — watcher
  'home.notifOff': 'Not receiving notifications',

  // Home — subscription toggle button

  // Home — visible confirm popup

  // Home — reveal confirm popup (HIDDEN → VISIBLE)

  // Home — invite-to-chat confirm popup. English varies only by the invitee
  // (he/she); "you" and "both" are gender-neutral. All four _uo variants are
  // provided so tgg resolves cleanly; _mm/_fm read he, _mf/_ff read she.
  'home.inviteConfirmTitle': 'Invite her to chat?',
  'home.inviteConfirmTitle_mm': 'Invite him to chat?',
  'home.inviteConfirmTitle_mf': 'Invite her to chat?',
  'home.inviteConfirmTitle_fm': 'Invite him to chat?',
  'home.inviteConfirmTitle_ff': 'Invite her to chat?',
  'home.inviteConfirmDesc': 'If you send, you\'ll both be locked to this invitation and she\'ll have 10 minutes to respond to it.',
  'home.inviteConfirmDesc_mm': 'If you send, you\'ll both be locked to this invitation and he\'ll have 10 minutes to respond to it.',
  'home.inviteConfirmDesc_mf': 'If you send, you\'ll both be locked to this invitation and she\'ll have 10 minutes to respond to it.',
  'home.inviteConfirmDesc_fm': 'If you send, you\'ll both be locked to this invitation and he\'ll have 10 minutes to respond to it.',
  'home.inviteConfirmDesc_ff': 'If you send, you\'ll both be locked to this invitation and she\'ll have 10 minutes to respond to it.',
  'home.inviteConfirmOk': 'Invite to chat',
  'home.inviteTimerLabel': 'Time left',
  'home.inviteTimerLabelExtended': 'Extended',
  'home.inviteExpired': 'Expired',
  // Locked page2 cards: only the inviter's gender matters in English ("you"
  // is neutral). `tgg(key, userMale, otherMale)` is used at the call site, so
  // all four _uo variants are provided; _mm/_fm match (other-male) and
  // _mf/_ff match (other-female).
  'home.locked.page2.cancel.title': 'The invitation was canceled',
  'home.locked.page2.cancel.desc': 'He canceled the invitation before you had a chance to reply. You can go back to being available for others.',
  'home.locked.page2.cancel.desc_mm': 'He canceled the invitation before you had a chance to reply. You can go back to being available for others.',
  'home.locked.page2.cancel.desc_mf': 'She canceled the invitation before you had a chance to reply. You can go back to being available for others.',
  'home.locked.page2.cancel.desc_fm': 'He canceled the invitation before you had a chance to reply. You can go back to being available for others.',
  'home.locked.page2.cancel.desc_ff': 'She canceled the invitation before you had a chance to reply. You can go back to being available for others.',
  'home.locked.page2.approve.title': 'The invitation is no longer available',
  'home.locked.page2.approve.desc': 'Something changed before you could approve. You can go back to being available for others.',
  'home.locked.page2.expire.title': 'The invitation closed',
  'home.locked.page2.expire.desc': 'You didn\'t answer in time, so the invitation is no longer active. You can go back to being available.',
  'home.locked.page2.logout.title': 'He\'s no longer here',
  'home.locked.page2.logout.title_mm': 'He\'s no longer here',
  'home.locked.page2.logout.title_mf': 'She\'s no longer here',
  'home.locked.page2.logout.title_fm': 'He\'s no longer here',
  'home.locked.page2.logout.title_ff': 'She\'s no longer here',
  'home.locked.page2.logout.desc': 'He left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.logout.desc_mm': 'He left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.logout.desc_mf': 'She left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.logout.desc_fm': 'He left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.logout.desc_ff': 'She left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.delete.title': 'He\'s no longer here',
  'home.locked.page2.delete.title_mm': 'He\'s no longer here',
  'home.locked.page2.delete.title_mf': 'She\'s no longer here',
  'home.locked.page2.delete.title_fm': 'He\'s no longer here',
  'home.locked.page2.delete.title_ff': 'She\'s no longer here',
  'home.locked.page2.delete.desc': 'He left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.delete.desc_mm': 'He left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.delete.desc_mf': 'She left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.delete.desc_fm': 'He left the app or isn\'t available right now. You can move on.',
  'home.locked.page2.delete.desc_ff': 'She left the app or isn\'t available right now. You can move on.',
  'home.waitingTimerSubtext': 'They\'ll see your invitation for the next {n} minutes.',
  'home.waitingTimerSubtext_m': 'He\'ll see your invitation for the next {n} minutes.',
  'home.waitingTimerSubtext_f': 'She\'ll see your invitation for the next {n} minutes.',
  'home.waitingTimerTitle': 'Your invitation is waiting for them',
  'home.waitingTimerTitle_m': 'Your invitation is waiting for him',
  'home.waitingTimerTitle_f': 'Your invitation is waiting for her',
  'home.waitingTimerDesc': 'Meanwhile, he won\'t receive other invitations. Your credit only comes back to you if he declines or doesn\'t respond in time.',
  'home.waitingTimerDesc_mm': 'Meanwhile, he won\'t receive other invitations. Your credit only comes back to you if he declines or doesn\'t respond in time.',
  'home.waitingTimerDesc_mf': 'Meanwhile, she won\'t receive other invitations. Your credit only comes back to you if she declines or doesn\'t respond in time.',
  'home.waitingTimerDesc_fm': 'Meanwhile, he won\'t receive other invitations. Your credit only comes back to you if he declines or doesn\'t respond in time.',
  'home.waitingTimerDesc_ff': 'Meanwhile, she won\'t receive other invitations. Your credit only comes back to you if she declines or doesn\'t respond in time.',
  'home.waitingFirstInLine': 'You\'re first in line',
  'home.waitingFirstInLineSubtext': 'We\'ll let you know if she responds.',
  'home.waitingFirstInLineSubtext_m': 'We\'ll let you know if he responds.',
  'home.waitingFirstInLineSubtext_f': 'We\'ll let you know if she responds.',
  'home.cancelWaitingTitle': 'Cancel invitation?',
  'home.cancelWaitingBtn': 'Cancel invitation',
  'home.cancelWaitingDesc': 'Your invitation will be canceled now. She\'ll be available to others again, and you can keep inviting.',
  'home.cancelWaitingDesc_mm': 'Your invitation will be canceled now. He\'ll be available to others again, and you can keep inviting.',
  'home.cancelWaitingDesc_mf': 'Your invitation will be canceled now. She\'ll be available to others again, and you can keep inviting.',
  'home.cancelWaitingDesc_fm': 'Your invitation will be canceled now. He\'ll be available to others again, and you can keep inviting.',
  'home.cancelWaitingDesc_ff': 'Your invitation will be canceled now. She\'ll be available to others again, and you can keep inviting.',
  'home.cancelWaitingConfirm': 'Cancel invitation',
  'home.refuseReplyTitle': 'Decline invitation?',
  'home.refuseReplyDesc': 'The invitation will be closed, and the other person will be notified',
  'home.refuseReplyConfirm': 'Decline invitation',
  'home.watchingAccept': 'Focus',
  'home.watchingAccept_m': 'Focus on him',
  'home.watchingAccept_f': 'Focus on her',
  'home.watchingReject': 'Skip',
  'home.skipHintTitle': 'Swipe the card down to skip',
  'home.skipHintDesc': 'Next time, swipe the card down to quickly skip to another profile. Want to skip now?',
  'home.skipHintCancel': 'Got it',
  'home.skipHintConfirm': 'Skip',
  // Shown in the rotating-headline slot for the duration of the first-time
  // swipe-down tutorial, instead of that card's random skip line: while the
  // card peeks down and reveals the slot, the text names the gesture.
  'home.skipTutorialHint': 'Swipe down to skip',
  // Incoming-invite card (page2). English varies only by the inviter (he/she);
  // "you" is gender-neutral. Title: tg(key, inviterMale). Desc: tgg(key,
  // receiverMale, inviterMale) — _mm/_fm read he, _mf/_ff read she. Receiver
  // gender is irrelevant in English. replyingTimerDesc is unused dead code.
  'home.replyingTimerDesc': 'He invited you to chat. You have 10 minutes to reply.',
  'home.replyingTimerDesc_m': 'He invited you to chat. You have 10 minutes to reply.',
  'home.replyingTimerDesc_f': 'She invited you to chat. You have 10 minutes to reply.',
  'home.replyingTitle': 'He invited you to chat',
  'home.replyingTitle_m': 'He invited you to chat',
  'home.replyingTitle_f': 'She invited you to chat',
  'home.replyingDesc': 'Meanwhile, he can\'t send other invitations. All the focus is just on you.',
  'home.replyingDesc_mm': 'Meanwhile, he can\'t send other invitations. All the focus is just on you.',
  'home.replyingDesc_mf': 'Meanwhile, she can\'t send other invitations. All the focus is just on you.',
  'home.replyingDesc_fm': 'Meanwhile, he can\'t send other invitations. All the focus is just on you.',
  'home.replyingDesc_ff': 'Meanwhile, she can\'t send other invitations. All the focus is just on you.',
  'home.replyingAccept': 'Open chat',
  'home.replyingReject': 'Decline',
  'home.chatHeader': 'One on one',
  'home.leaveTitle': 'End chat',
  'home.leaveDesc': 'The chat will be closed permanently and cannot be restored. The other side will be notified.',
  'home.leaveConfirm': 'End',
  'chat.empty': 'No messages yet',
  'chat.inputPlaceholder': 'Write a message...',
  'chat.today': 'Today',
  'chat.yesterday': 'Yesterday',
  'chat.dayBeforeYesterday': 'Day before yesterday',
  'chat.block': 'Block',
  'chat.blockTitle': 'Block user',
  'chat.blockDesc': 'This user will be blocked and won\'t be able to contact you again. This action cannot be undone.',
  'chat.blockConfirm': 'Block',
  'chat.endChat': 'End',
  'chat.leave': 'Leave',
  'chat.a11y.close': 'Close chat',
  'chat.a11y.menu': 'Chat options',
  'chat.report': 'Report',
  'chat.reportTitle': 'Report user',
  'chat.reportDesc': 'Your report will be sent to our team for review. This user will be blocked and you will not be matched again. Any active connection between you will end.',
  'chat.reportPlaceholder': 'What happened? You can add details (optional)',
  'chat.reportConfirm': 'Report and block',
  'chat.newMessages': 'New messages',
  'chat.attachMenu.image': 'Photo',
  'chat.attachMenu.location': 'Location',
  'chat.attachMenu.schedule': 'Schedule',
  'chat.confirmSend.location': 'Send your current location',
  'chat.confirmSend.location_m': 'Send your current location',
  'chat.confirmSend.location_f': 'Send your current location',
  'chat.confirmSend.schedule': 'Send your schedule with the kids',
  'chat.confirmSend.schedule_m': 'Send your schedule with the kids',
  'chat.confirmSend.schedule_f': 'Send your schedule with the kids',
  'chat.confirmSend.send': 'Send',
  'chat.locationLabel': 'Location',
  'chat.locationOpen': 'Tap to open in Maps',
  'chat.scheduleTitle': "Days I'm free (no kids)",
  'chat.scheduleTitle_m': "Days I'm free (no kids)",
  'chat.scheduleTitle_f': "Days I'm free (no kids)",
  'chat.retry': 'Tap to retry',

  // Push notifications
  'push.WATCHING': 'New opportunity',
  'push.WAITING': 'Invitation sent',
  'push.REPLYING': 'Someone chose you',
  'push.OTHER_CANCELLED': 'Invitation cancelled',

  // Gender-aware: user gender (English has no grammatical gender, base key used as fallback)
  'home.tapForMore_m': 'Back to the game',
  'home.tapForMore_f': 'Back to the game',
  'home.locationUnavailableTitle': 'Location unavailable',
  'home.locationUnavailableDesc': 'We couldn\'t determine your location. Try moving to a spot with better reception and tap Broadcast Location.',
  'home.locationUnavailableButton': 'Broadcast Location',
  'home.hiddenHeader2': 'Once',
  // Broadcast countdown, now shown as a line in the viewers info card
  // description (was the toggle's broadcast-segment timer). {time} = MM:SS.
  // Accessibility labels for the floating shell chrome (no visible text).
  'home.a11y.menu': 'Open menu',
  'home.a11y.closeMenu': 'Close menu',
  'home.a11y.closeInvite': 'Close invitation',
  'home.a11y.closeProfile': 'Close profile',
  // On-photo age chip. English is non-gendered (just the number); Hebrew is
  // gendered via tg() (בן/בת) — see he.ts home.ageChip_m / _f.
  'home.ageChip': '{age}',
  'home.locatingDesc': 'Scanning for people around you',
  'home.loadingProfile': 'Loading profile data',
  'home.noOneNearbyTitle': 'No one nearby right now',
  'home.noOneNearbyDesc': 'We couldn\'t find anyone nearby right now. Try again soon, or change your search preferences',
  'settings.kidsLabel_m': 'Planning for kids?',
  'settings.kidsLabel_f': 'Planning for kids?',
  'settings.deleteConfirmDesc_m': 'All data, photos, and conversations will be permanently deleted. Active invitations, chats, and connections will be cancelled. This action cannot be undone.',
  'settings.deleteConfirmDesc_f': 'All data, photos, and conversations will be permanently deleted. Active invitations, chats, and connections will be cancelled. This action cannot be undone.',
  'settings.signOut_m': 'Sign Out from App',
  'settings.signOut_f': 'Sign Out from App',
  'settings.signOutConfirmDesc_m': 'You won\'t receive notifications after signing out. If someone is watching you, they\'ll be notified.',
  'settings.signOutConfirmDesc_f': 'You won\'t receive notifications after signing out. If someone is watching you, they\'ll be notified.',
  'settings.signOutYes_m': 'Sign out',
  'settings.signOutYes_f': 'Sign out',
  'chat.inputPlaceholder_m': 'Write a message...',
  'chat.inputPlaceholder_f': 'Write a message...',
  'photo.sub_m': 'Add 2-6 photos',
  'photo.sub_f': 'Add 2-6 photos',

  // Gender-aware: watcher/subject gender
  'home.notifOff_m': 'Not receiving notifications',
  'home.notifOff_f': 'Not receiving notifications',
}