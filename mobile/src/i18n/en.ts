export default {
  // Brand. The app's name, once — every screen that shows it (home's wordmark)
  // reads it from here. It is a name, so both languages carry the same word.
  'app.name': 'Once',

  // Landing


  // Auth
  'auth.signInGoogle': 'Sign in with Google',
  'auth.signInApple': 'Sign in with Apple',
  'auth.reviewCodePlaceholder': 'Review code',
  'auth.reviewSubmit': 'Enter',
  'auth.orDivider': 'or',
  'auth.emailPlaceholder': 'you@example.com',
  'auth.sendLink': 'Send a sign-in link',
  'auth.invalidEmail': 'Please enter a valid email address',
  'auth.linkSent': 'Check your inbox',
  'auth.linkSentDesc': 'We sent a sign-in link to {email}. Tap the link in the email to continue',
  'auth.linkResend': 'Send another link',
  'auth.linkError': 'Could not send the link. Please try again',
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
  // Captions over the three date boxes: the DD/MM/YYYY hint inside a box goes
  // away the moment a digit is typed, so what each box holds is said in words
  // above it and stays said.
  'ob.dateDay': 'Day',
  'ob.dateMonth': 'Month',
  'ob.dateYear': 'Year',
  'ob.minAge': 'Minimum age to register is 18',
  'ob.createAccount': 'Create account',
  'ob.createAccount_m': 'Create account',
  'ob.createAccount_f': 'Create account',
  'ob.birthConfirmTitle': 'Confirm your date of birth',
  'ob.birthConfirm': 'Your birthday is {date} and you are {age} years old',

  // Onboarding photo
  'photo.sub': 'Add 2-6 photos',
  'photo.uploadFailed': 'Photo upload failed. You cannot continue without a photo, please try again',

  // Onboarding bio. No character minimum and no required bio (user directive
  // 2026-07-31): a built profile is two photos and nothing else, so the
  // 'bio.min' string is deleted.
  'bio.placeholder': 'This is the place to talk about yourself and what you are looking for',
  'bio.submit': 'Finish',
  'bio.update': 'Update',

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
  'settings.profile': 'Edit your profile',
  'settings.buildProfile': 'Build your profile',
  'settings.account': 'Account',
  // The same state as a full sentence, for the preferences popup's leading ROW
  // (user directive 2026-07-30): a row is read as a line of text where the
  // photo's chip is read as a badge, so it says who it is about. No {m|f}
  // markers — English has no gendered adjective here, and genderize passes a
  // marker-less string straight through.
  'settings.visibilityStateVisible': "I'm visible",
  'settings.visibilityStateHidden': "I'm hidden",
  // Why the row is shut for a user who has not built a profile: he reads the
  // hidden sentence like anyone else, and this is what the tap answers with. The
  // title and the button are the app's one build-profile gate (BuildProfileGate),
  // so only the blocked door is named here.
  'settings.visibilityGateDesc': 'For people to see you, you need a profile with at least two photos. It only takes a minute',
  // The watcher count as a SENTENCE, for the pill beside that row (user
  // directive 2026-07-31, restoring what the bare number replaced the day
  // before): a row is read as a line of text, so the count finishes the line the
  // label started, in the same first person it is written in. What stays a bare
  // number is the DOCK's preferences key — a mark standing beside a 24dp glyph
  // has no room for a sentence, and the row it opens is where the sentence is.
  // Singular is its own string, as it is in Hebrew, where the verb inflects.
  'settings.watchersOne': 'Someone is watching me',
  'settings.watchersMany': '{count} people are watching me',
  // The credits row states the whole wallet as one number on its END edge
  // (user directive 2026-07-28), so there is no pool caption to translate: the
  // daily/extra split lives in the buy picker the row opens.
  'settings.credits': 'Credits',
  // Leaving a group. The only strings left from the menu's old groups sheet:
  // joining by code, the membership list and the row that opened them all live
  // in Circles now, and the sheet itself is deleted. Circles' own leave popup
  // reads these three.
  'settings.groupsLeaveTitle': 'Leave {name}?',
  'settings.groupsLeaveConfirm': 'Leave group',

  // Circles: the menu row + the full hub sheet and its sub-screens.
  'communities.menuRow': 'Circles',
  'communities.title': 'My circles',
  'communities.myFriends': 'My friends',
  'communities.myFriendsSub': 'People you personally know',
  // The one WORD, for the button on the hub's friends row: the row already
  // says what it is about, so the button only says what it does.
  'communities.invite': 'Invite',
  'communities.create': 'Create a group',
  'communities.find': 'Find or join a group',
  // Group kinds: ONE axis, three stops (2026-07-27). Replaces the old
  // public/private + approval-on/off pair everywhere it was shown.
  'communities.kindLabel': 'Group type',
  'communities.kindOpen': 'Open group',
  'communities.kindOpenSub': 'Appears in search, and joining is instant',
  'communities.kindApproved': 'Approved group',
  'communities.kindApprovedSub': 'Appears in search, and every join request needs approval',
  'communities.kindPrivate': 'Private group',
  'communities.kindPrivateSub': 'Never appears in search, you get in by link only, and every join needs approval',
  'communities.membersCount': '{count} members',
  'communities.oneMember': '1 member',
  // Row meta segments, laid out by MetaLine. One string per fact, so the menu
  // row and the hub rows count the same things in the same words.
  'communities.groupsCount': '{count} groups',
  'communities.oneGroup': '1 group',
  'communities.oneFriend': '1 friend',
  'communities.requestsCount': '{count} requests',
  'communities.oneRequest': '1 request',
  // Menu row with nothing in it yet: the row still says what it is for, in the
  // one line the counts would have used.
  'communities.rowEmpty': 'Join groups and friends',
  // Circles stay locked until the profile is built: two photos. The
  // Hebrew sentence carries a {m|f} marker on its imperative and is resolved by
  // genderize(); English has no gendered form, so it passes through unchanged.
  'communities.gateTitle': 'People through circles',
  'communities.gateDesc': 'Circles connect people who share the same interests. To get started, build a profile with at least two photos',
  'communities.managedBy': 'Managed by {name}',
  // The one popup behind the card's circle chip: every mutual friend and every
  // shared group in one list.
  'communities.sharedTitle': 'What we share',
  // The chip itself. English inflects for neither the friend nor the card's
  // subject, so the pair is the same string twice; Hebrew is why there are two
  // keys at all (see he.ts).
  'communities.friendOfM': 'Friend of {name}',
  'communities.friendOfF': 'Friend of {name}',
  // (No "you have no groups yet" line any more: a hub with no groups IS the
  // start page — the picture, what this is for, the two ways in — with the
  // friends row over it. See HubStart.)

  // The page before there is anything on it: no friends, nobody waiting, no
  // group of any kind (user directive 2026-07-30). It is not the list's empty
  // line — it is the whole screen, so it says what Circles IS and then offers
  // the only two ways to start one. See HubStart / CirclesArt.
  'communities.startTitle': 'Your circle starts here',
  'communities.startDesc': 'Every friend you add can connect you to their single friends too. Groups help you meet people who share your interests',
  // Over the PRIMARY button only (user directive 2026-07-30): inviting is the
  // one of the two whose label does not say what it is worth. "Search groups"
  // needs no line, and a second one turned the two ways forward into a
  // paragraph.
  'communities.startFind': 'Search groups',
  // The friends page before there is a single friend on it: the same drawing
  // and the same heading as the hub's, one step in — that page offers the two
  // ways to start a circle, this one owns the first of them, so all it has to
  // say is what a friend joining actually opens.
  'communities.friendsStartDesc': 'Invite friends, and when they join, new people from their circles open up to you',

  // My friends
  'communities.inviteFriend': 'Invite friends',
  // Caption under the invite button: connecting as friends pays both sides a
  // credit (server credits it on every new friend link, see friend_link_credits).
  'communities.inviteReward': 'For every friend who connects, you both get an extra credit',
  'communities.linkFriend': 'Link an existing friend',
  'communities.friendsCount': '{count} friends',
  'communities.accept': 'Accept',
  'communities.decline': 'Decline',
  'communities.noFriends': "You don't have friends here yet",
  // What a friend is FOR (user directive 2026-07-30): not the friend himself,
  // who needs no introduction and is excluded from the game outright as of
  // 20260730150000, but the people one hop past him, who carry both the x3 and
  // the "friend of Asaf" chip on their card. The line names ONLY them (user
  // directive 2026-07-30, second pass): the exclusion is a rule about who is
  // absent, and an empty page has to say what the user GETS. (Was
  // `friendsHint`, which no surface rendered and which still offered the
  // people-search flow removed 2026-07-26.)
  'communities.friendsWhy': 'Every friend opens up their circle to you: people you have not met, who reach you first with a friend in common',
  'communities.unfriendTitle': 'Remove {name} from friends?',
  'communities.unfriendDesc': 'You can link again later',
  'communities.unfriendConfirm': 'Remove',

  // Link an existing friend
  'communities.linkTitle': 'Link a friend',
  'communities.request': 'Request',
  'communities.requested': 'Sent',
  'communities.noResults': 'No results',
  'communities.linkNote': 'They get a request. Once accepted, you are linked both ways',

  // Create a group
  'communities.newGroup': 'New group',
  'communities.name': 'Name',
  'communities.namePlaceholder': 'Group name',
  'communities.createAction': 'Create group',
  'communities.nameError': 'Please use a shorter name',
  'communities.description': 'Description',
  'communities.descriptionPlaceholder': 'What the group is about',
  'communities.descUpdate': 'Update',
  // The "more details" link: managers set it in the group settings, and anyone
  // looking at the group gets one tappable line under the description.
  'communities.link': 'Link to more details',
  'communities.linkPlaceholder': 'Paste a link here',
  // The server decides whether an address is usable (it also completes a bare
  // host with https://), so this lights up under the field when it refused —
  // with the refused text still in the field to be corrected.
  'communities.linkInvalid': 'That link is not valid',
  // A save refused for any other reason (name, description).
  'communities.saveFailed': 'Not saved, try again',
  'communities.moreDetails': 'More details',

  // A group you manage
  'communities.shareInvite': 'Share invite link',
  'communities.settings': 'Group settings',
  // The settings header's one non-editing control: opens the group's own popup
  // exactly as everyone else meets it.
  'communities.preview': 'Preview',
  // Manage without playing. The caller's OWN membership flag inside one group
  // they run: while it is on, they and that group's members never meet in the
  // game. A checkbox in Group settings, under the group's kind, with the
  // sentence that explains it as its own sub-line.
  'communities.hiddenToggle': 'Hide me from the group members',
  'communities.hiddenSub': 'The people in this group will not see you in the game, and you will not see them. Your rights in the group stay exactly as before',
  'communities.hiddenShort': 'Not playing',
  'communities.deleteGroup': 'Delete group',
  'communities.deleteTitle': 'Delete {name}?',
  'communities.deleteDesc': 'The group and all its memberships are removed. This cannot be undone',
  'communities.deleteConfirm': 'Delete',
  // No confirm for taking a member out (user directive 2026-07-31): the tap
  // removes. `removeMemberTitle` / `removeMemberDesc` / `remove` are deleted with
  // that popup — the description WAS the reason it needed none ("they can join
  // again with the invite link").
  'communities.makePublic': 'Make public',
  'communities.makePrivate': 'Make private',
  'communities.approvalEnable': 'Require approval to join',
  'communities.approvalDisable': 'Stop requiring approval',
  // The queue's one name, on the roster row that unfolds it. Its page-title
  // twin (`requestsNav`) and its empty line (`noRequests`) went with the page
  // itself on 2026-07-31: the queue is a drawer inside the roster now, and a
  // drawer with nothing in it is not drawn at all.
  'communities.requestsSectionJoin': 'Join requests',
  'communities.approve': 'Approve',
  'communities.approveAll': 'Approve everyone',
  'communities.approveAllTitle': 'Approve every request?',
  'communities.approveAllDesc': 'Everyone waiting in the queue joins {name}, and each of them is notified',
  'communities.declineJoin': 'Decline',
  'communities.owner': 'Owner',
  // The role is named for the one thing it does: answer join requests (user
  // directive 2026-07-30, replacing "manager" everywhere a user reads it). An
  // OPEN group has no such role at all, because nothing there waits on an
  // answer, so the appointment is offered on approved/private groups only.
  'communities.manager': 'Approver',
  'communities.makeManager': 'Make approver',
  'communities.removeManager': 'Remove approver',
  'communities.removeFromGroup': 'Remove from group',
  'communities.transferOwner': 'Transfer ownership',
  'communities.transferOwnerTitle': 'Hand {name} the group?',
  'communities.transferOwnerDesc': 'The group becomes {name}\'s, and you stay on as an approver. This cannot be undone',
  // An open group has no approvers, so the outgoing owner keeps nothing: he is
  // a plain member of it from that moment.
  'communities.transferOwnerDescOpen': 'The group becomes {name}\'s, and you keep no rights in it. This cannot be undone',

  // A group you are in
  'communities.leave': 'Leave group',
  'communities.memberNote': 'Members rank higher for you',

  // Find or join
  'communities.findTitle': 'Join a group',
  'communities.findSearch': 'Search a group',
  // Searching the roster of a group you manage: the mark on that page's bar,
  // the field's own placeholder, and the mark that ends the search. It looks
  // over BOTH lists at once, the people waiting and the people already in.
  'communities.searchPeople': 'Search by name',
  'communities.searchClose': 'Close search',
  // The line about the PERSON, standing over a group's name on their page: who
  // they are and when they turned up here. Genderless in both languages, so a
  // row with no profile on it still reads (see memberSince / waitingSince), and
  // the name leads because everything else in that block is the group's.
  'communities.inGroupSince': '{name} in the group since {date}',
  'communities.waitingSince': '{name} waiting since {date}',
  'communities.orCode': 'or with an invite code',
  'communities.join': 'Join',
  'communities.joined': 'Joined',
  'communities.requestJoin': 'Request to join',
  'communities.pending': 'Pending approval',
  // A strip's chip, where the meta line already says the size: ONE word in the
  // corner the role chip sits in, not the sentence the popup's button says.
  // Where I stand with a group, on the hub and in search alike.
  'communities.pendingTag': 'Pending',
  'communities.declinedTag': 'Declined',
  'communities.declined': 'Request declined',
  'communities.declinedTitle': 'Your request to {name} was declined',
  'communities.declinedDesc': "Your request was not approved. You can clear this notice, and ask again in a month",
  'communities.declinedConfirm': 'Clear',
  // The pending group's own popup: what the state is, and the button that ends
  // it (the same popup a group you are in opens, with cancel instead of leave).
  'communities.pendingNote': 'Your request is waiting for the group to approve it',
  'communities.cancelJoin': 'Cancel request',
  'communities.shareMessage': 'Join {name}\n{link}',
  // Support: row in the account card. Opens the device mail composer at the
  // support inbox, with this subject prefilled.
  'settings.support': 'Support',
  'support.mailSubject': 'Once support',
  // Site: the row under support. Opens the brand site's landing page in the
  // device browser, in the language the app is running in.
  'settings.site': 'Website',
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
  // Title of the account popup (the sheet the "Details" row opens).
  'settings.myAccount': 'My Account',
  'settings.deleteAccount': 'Delete Account',
  'settings.deleteConfirmTitle': 'Delete account',
  'settings.deleteConfirmDesc': 'All data, photos, and conversations will be permanently deleted. Active invitations, chats, and connections will be cancelled. This action cannot be undone',
  'settings.deleteYes': 'Delete',
  'settings.signOut': 'Sign Out',
  'settings.signOutConfirmTitle': 'Sign out',
  'settings.signOutConfirmDesc': 'You won\'t receive notifications after signing out. If someone is watching you, they\'ll be notified',
  'settings.signOutYes': 'Sign out',
  'settings.ageRange': 'Ages',
  'settings.ageFrom': 'From',
  'settings.ageTo': 'To',
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
  'settings.locationCustomDesc': 'Pick an address',
  'settings.locationAddressPrompt': 'Type an address or city name',
  'settings.locationSearch': 'Search',
  'settings.locationNoResults': 'No address found. Try a different query',
  'settings.locationFetchingDevice': 'Getting device location...',
  'settings.locationDeviceFailedTitle': "Couldn't get location",
  'settings.locationDeviceFailedDesc': 'Allow location access in device settings and try again',
  'settings.locationPermissionTitle': 'Location permission',
  'settings.locationPermissionDesc': 'Allow location access to use the device location',
  'settings.locationOk': 'OK',
  'settings.locationCancel': 'Cancel',
  'settings.locationServicesOffTitle': 'Location services off',
  'settings.locationServicesOffDesc': 'Turn on location services on the device and try again',
  'settings.locationLockedTitle': "Location can't be changed right now",
  'settings.locationLockedDesc': "To change your location, first leave the active view or invitation. Once you finish the current interaction, you'll be able to update your location",
  'settings.duplicatePhotoTitle': 'Duplicate photo',
  'settings.duplicatePhotoBody': 'The same photo cannot be uploaded twice. Duplicate photos were removed',
  'settings.photoEditMoveUp': 'Move up',
  'settings.photoEditReplace': 'Replace photo',
  'settings.photoEditMoveDown': 'Move down',
  'settings.photoEditDelete': 'Delete',
  // The two rows of the popup the own-profile card's heading plus opens.
  // Each row is the THING, not the verb: the plus already said "add".
  'settings.addPhoto': 'Photo',
  'settings.addFamily': 'Family & kids',
  // What that plus says to a screen reader: the mark itself names nothing.
  'settings.a11y.addToProfile': 'Add to your profile',
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
  'family.scheduleWeek1Hint': "These days are kept private and never shown to other users. We only use them to surface the matches most relevant to you",
  'family.scheduleAdd': 'Add days',
  'family.scheduleRemove': 'Remove',
  'family.weekLabel': 'Week {n}',
  'family.addWeek': 'Add another week',
  'family.removeWeek': 'Remove week',
  'family.agesAdd': 'Add ages',
  'family.agesRemove': 'Remove ages',
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
  // "more" variants (lead already said "has N kids") drop the redundant "kids":
  // "has 3 kids and wants more", mirroring Hebrew "רוצה עוד". The no-kids
  // variants below keep "kids" because the lead there is "has no kids".
  'family.wantsMore': 'wants more',
  'family.doesntWantMore': "doesn't want more",
  'family.wantsKids': 'wants kids',
  'family.doesntWantKids': 'no kids wanted',
  'family.selfWantsMore': 'want more',
  'family.selfDoesntWantMore': "don't want more",
  'family.selfWantsKids': 'want kids',
  'family.selfDoesntWantKids': "don't want kids",
  // Connector gluing the kids-preference phrase to the lead ("Has 3 kids and
  // wants more") instead of a comma. Trailing space separates it from the label.
  'family.prefConnector': 'and ',
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
  // Credits picker. Since 2026-07-28 it is a plain ConfirmDialog: this title,
  // one sentence and one action button. The dead 3/10/50 packs and the
  // paragraph above them are gone.
  'credits.buy.title': 'More credits',
  // The popup's sentence. It states the two ways credits arrive, THE INVITE
  // FIRST (user directive 2026-07-31): that is the one the button under it
  // offers and the only one the user can act on. The daily refill follows as
  // the fallback it is, with its condition up front instead of in a trailing
  // parenthesis ({time} is a bare "HH:MM" from formatGrantTime). Deliberately
  // NOT the friends page's caption (communities.inviteReward) that used to be
  // reused here (user directive 2026-07-28): this popup is where someone comes
  // when the wallet is empty, so it has to answer "when do I get one anyway",
  // which that caption never said. genderize() is a no-op here (no {m|f}
  // marker). The no-hour variant covers a wallet the server hasn't stamped a
  // next-refill on yet.
  'credits.buy.desc': 'For every friend who joins through you, you both get another credit. If you have no credits, a new one is added every day at {time}',
  'credits.buy.descNoTime': 'For every friend who joins through you, you both get another credit. If you have no credits, a new one is added every day',
  // Same sheet, opened at the paywall moment (an invite/accept the user can't
  // afford). There the title names the reason it appeared instead of the thing
  // it offers. Reached from the settings credits row, it keeps the title above.
  'credits.buy.emptyTitle': "You're out of credits",
  // The popup's action button: the one active way to earn. genderize() is a
  // no-op on English (no {m|f} marker) — single form.
  'credits.invite.title': 'Invite a friend',
  // Text that rides along with the link in the OS share sheet.
  'credits.invite.shareText': 'Join me on Once',
  'settings.miles': 'mi',
  // genderize() is a no-op on English (no {m|f} marker) — single form.
  'settings.preferredGender': 'Available',
  'settings.genderM': 'For men',
  'settings.genderF': 'For women',
  'settings.genderBoth': 'For everyone',

  // Match
  // THE relative-time set, and the only one: the old standalone `match.*Ago`
  // wording is deleted, so formatAgo (lib/lastSeen.ts) is the single reader.
  'match.ago.now': 'just now',
  'match.ago.min': '1 min ago',
  'match.ago.mins': '{n} min ago',
  'match.ago.hr': '1 hr ago',
  'match.ago.hrs2': '2 hr ago',
  'match.ago.hrs': '{n} hr ago',
  'match.ago.day': '1 day ago',
  'match.ago.days2': '2 days ago',
  'match.ago.days': '{n} days ago',

  // Errors

  // Home — modes
  'home.hiddenHeaderTitle': 'Watching Me',
  'home.notifAccessRequired': 'Notification access required so you don\'t miss a signal',
  'home.locationAccessRequired': 'Location access required to see the distance',
  'home.noInternetTitle': 'No internet connection',
  'home.noInternetDesc': 'Once needs an internet connection to work. Please check your Wi-Fi or mobile data and try again',
  // English is non-gendered (single form); tg picks the same string for either is_male.
  'settings.hideConfirmTitle': 'Hide your profile?',
  'settings.hideConfirmDesc': 'All your watchers will be removed and notified',
  'settings.hideConfirmDescOne': 'Your 1 current watcher will be removed and notified',
  'settings.hideConfirmDescMany': 'Your {count} current watchers will be removed and notified',
  'settings.hideConfirmButton': 'Hide',

  // Home — match teaser
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
  'home.endedBack': 'Back to game',

  // Locked-state cards: page1 (after a terminal event) and page2 (dead invite).
  // Key shape: home.locked.<page>.<message>.{title,desc}
  // Locked page1 cards reference the other user. `tg(key, otherMale)` picks _m
  // when the other user is male, _f when female. Only the other's gender
  // matters; "you" is gender-neutral in English.
  'home.locked.page1.invite.title': 'She\'s no longer available',
  'home.locked.page1.invite.title_m': 'He\'s no longer available',
  'home.locked.page1.invite.title_f': 'She\'s no longer available',
  'home.locked.page1.invite.desc': 'She\'s already in another invitation, so you can\'t send to her right now. You can move on',
  'home.locked.page1.invite.desc_m': 'He\'s already in another invitation, so you can\'t send to him right now. You can move on',
  'home.locked.page1.invite.desc_f': 'She\'s already in another invitation, so you can\'t send to her right now. You can move on',
  'home.locked.page1.extend.title': 'Can\'t extend',
  'home.locked.page1.extend.desc': 'The invitation has already closed. You can go back and find another connection',
  'home.locked.page1.approve.title': 'The connection is no longer available',
  'home.locked.page1.approve.desc': 'Something changed before you could connect. You can move on',
  'home.locked.page1.decline.title': 'She didn\'t accept this time',
  'home.locked.page1.decline.title_m': 'He didn\'t accept this time',
  'home.locked.page1.decline.title_f': 'She didn\'t accept this time',
  'home.locked.page1.decline.desc': 'She chose not to continue right now. All good, you can move on to the next connection',
  'home.locked.page1.decline.desc_m': 'He chose not to continue right now. All good, you can move on to the next connection',
  'home.locked.page1.decline.desc_f': 'She chose not to continue right now. All good, you can move on to the next connection',
  'home.locked.page1.leave.title': 'The chat ended',
  'home.locked.page1.leave.desc': 'She left the chat. You can go back and find a new connection',
  'home.locked.page1.leave.desc_m': 'He left the chat. You can go back and find a new connection',
  'home.locked.page1.leave.desc_f': 'She left the chat. You can go back and find a new connection',
  'home.locked.page1.block.title': 'The chat ended',
  'home.locked.page1.block.desc': 'She chose to end the connection. You can move on',
  'home.locked.page1.block.desc_m': 'He chose to end the connection. You can move on',
  'home.locked.page1.block.desc_f': 'She chose to end the connection. You can move on',
  'home.locked.page1.remove.title': 'She\'s no longer available to you',
  'home.locked.page1.remove.title_m': 'He\'s no longer available to you',
  'home.locked.page1.remove.title_f': 'She\'s no longer available to you',
  'home.locked.page1.remove.desc': 'She removed you from her viewers list. You can go back and find another connection',
  'home.locked.page1.remove.desc_m': 'He removed you from his viewers list. You can go back and find another connection',
  'home.locked.page1.remove.desc_f': 'She removed you from her viewers list. You can go back and find another connection',
  'home.locked.page1.expire.title': 'She didn\'t reply in time',
  'home.locked.page1.expire.title_m': 'He didn\'t reply in time',
  'home.locked.page1.expire.title_f': 'She didn\'t reply in time',
  'home.locked.page1.expire.desc': 'Time passed without a reply. You can move on and send an invitation to someone else',
  'home.locked.page1.logout.title': 'She\'s no longer here',
  'home.locked.page1.logout.title_m': 'He\'s no longer here',
  'home.locked.page1.logout.title_f': 'She\'s no longer here',
  'home.locked.page1.logout.desc': 'She left the app or isn\'t available right now. You can move on',
  'home.locked.page1.logout.desc_m': 'He left the app or isn\'t available right now. You can move on',
  'home.locked.page1.logout.desc_f': 'She left the app or isn\'t available right now. You can move on',
  'home.locked.page1.delete.title': 'She\'s no longer here',
  'home.locked.page1.delete.title_m': 'He\'s no longer here',
  'home.locked.page1.delete.title_f': 'She\'s no longer here',
  'home.locked.page1.delete.desc': 'She left the app or isn\'t available right now. You can move on',
  'home.locked.page1.delete.desc_m': 'He left the app or isn\'t available right now. You can move on',
  'home.locked.page1.delete.desc_f': 'She left the app or isn\'t available right now. You can move on',

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
  'home.inviteConfirmDesc': 'If you send, you\'ll both be locked to this invitation and she\'ll have 10 minutes to respond to it',
  'home.inviteConfirmDesc_mm': 'If you send, you\'ll both be locked to this invitation and he\'ll have 10 minutes to respond to it',
  'home.inviteConfirmDesc_mf': 'If you send, you\'ll both be locked to this invitation and she\'ll have 10 minutes to respond to it',
  'home.inviteConfirmDesc_fm': 'If you send, you\'ll both be locked to this invitation and he\'ll have 10 minutes to respond to it',
  'home.inviteConfirmDesc_ff': 'If you send, you\'ll both be locked to this invitation and she\'ll have 10 minutes to respond to it',
  'home.inviteConfirmOk': 'Invite to chat',
  'home.inviteTimerLabel': 'Time left',
  'home.inviteTimerLabelExtended': 'Extended',
  'home.inviteExpired': 'Expired',
  // Locked page2 cards: only the inviter's gender matters in English ("you"
  // is neutral). `tgg(key, userMale, otherMale)` is used at the call site, so
  // all four _uo variants are provided; _mm/_fm match (other-male) and
  // _mf/_ff match (other-female).
  'home.locked.page2.cancel.title': 'The invitation was canceled',
  'home.locked.page2.cancel.desc': 'He canceled the invitation before you had a chance to reply. You can go back to being available for others',
  'home.locked.page2.cancel.desc_mm': 'He canceled the invitation before you had a chance to reply. You can go back to being available for others',
  'home.locked.page2.cancel.desc_mf': 'She canceled the invitation before you had a chance to reply. You can go back to being available for others',
  'home.locked.page2.cancel.desc_fm': 'He canceled the invitation before you had a chance to reply. You can go back to being available for others',
  'home.locked.page2.cancel.desc_ff': 'She canceled the invitation before you had a chance to reply. You can go back to being available for others',
  'home.locked.page2.approve.title': 'The invitation is no longer available',
  'home.locked.page2.approve.desc': 'Something changed before you could approve. You can go back to being available for others',
  'home.locked.page2.expire.title': 'The invitation closed',
  'home.locked.page2.expire.desc': 'You didn\'t answer in time, so the invitation is no longer active. You can go back to being available',
  'home.locked.page2.logout.title': 'He\'s no longer here',
  'home.locked.page2.logout.title_mm': 'He\'s no longer here',
  'home.locked.page2.logout.title_mf': 'She\'s no longer here',
  'home.locked.page2.logout.title_fm': 'He\'s no longer here',
  'home.locked.page2.logout.title_ff': 'She\'s no longer here',
  'home.locked.page2.logout.desc': 'He left the app or isn\'t available right now. You can move on',
  'home.locked.page2.logout.desc_mm': 'He left the app or isn\'t available right now. You can move on',
  'home.locked.page2.logout.desc_mf': 'She left the app or isn\'t available right now. You can move on',
  'home.locked.page2.logout.desc_fm': 'He left the app or isn\'t available right now. You can move on',
  'home.locked.page2.logout.desc_ff': 'She left the app or isn\'t available right now. You can move on',
  'home.locked.page2.delete.title': 'He\'s no longer here',
  'home.locked.page2.delete.title_mm': 'He\'s no longer here',
  'home.locked.page2.delete.title_mf': 'She\'s no longer here',
  'home.locked.page2.delete.title_fm': 'He\'s no longer here',
  'home.locked.page2.delete.title_ff': 'She\'s no longer here',
  'home.locked.page2.delete.desc': 'He left the app or isn\'t available right now. You can move on',
  'home.locked.page2.delete.desc_mm': 'He left the app or isn\'t available right now. You can move on',
  'home.locked.page2.delete.desc_mf': 'She left the app or isn\'t available right now. You can move on',
  'home.locked.page2.delete.desc_fm': 'He left the app or isn\'t available right now. You can move on',
  'home.locked.page2.delete.desc_ff': 'She left the app or isn\'t available right now. You can move on',
  'home.waitingTimerSubtext': 'They\'ll see your invitation for the next {n} minutes',
  'home.waitingTimerSubtext_m': 'He\'ll see your invitation for the next {n} minutes',
  'home.waitingTimerSubtext_f': 'She\'ll see your invitation for the next {n} minutes',
  'home.waitingTimerTitle': 'Your invitation is waiting for them',
  'home.waitingTimerTitle_m': 'Your invitation is waiting for him',
  'home.waitingTimerTitle_f': 'Your invitation is waiting for her',
  'home.waitingTimerDesc': 'Meanwhile, he won\'t receive other invitations. Your credit only comes back to you if he declines or doesn\'t respond in time',
  'home.waitingTimerDesc_mm': 'Meanwhile, he won\'t receive other invitations. Your credit only comes back to you if he declines or doesn\'t respond in time',
  'home.waitingTimerDesc_mf': 'Meanwhile, she won\'t receive other invitations. Your credit only comes back to you if she declines or doesn\'t respond in time',
  'home.waitingTimerDesc_fm': 'Meanwhile, he won\'t receive other invitations. Your credit only comes back to you if he declines or doesn\'t respond in time',
  'home.waitingTimerDesc_ff': 'Meanwhile, she won\'t receive other invitations. Your credit only comes back to you if she declines or doesn\'t respond in time',
  // The invite door's own sentence for the app's one build-profile gate. Its
  // button is `settings.buildProfile`, which is what every one of those doors
  // says: there was a second key here reading "Build my profile", so the same
  // popup asked for the same thing in two voices depending on which door it came
  // through.
  'home.buildProfileTitle': 'Build your profile first',
  'home.buildProfileDesc': 'To send an invitation you need a profile with at least two photos. It only takes a minute',
  // The browse allowance's door (lib/browseGate.ts): an account with no profile
  // watches two people and then the centre circle stops being the play button
  // and becomes this. Same popup as the invite door above, so only the sentence
  // changes — and the TITLE is also the pane's own headline, the way every
  // centre notice states its reason in that slot.
  'home.browseGateTitle': 'To keep going you need a profile',
  'home.browseGateDesc': 'Create a profile with at least two photos, and you can carry on meeting people',
  'home.cancelWaitingTitle': 'Cancel invitation?',
  'home.cancelWaitingBtn': 'Cancel invitation',
  'home.cancelWaitingDesc': 'Your invitation will be canceled now. She\'ll be available to others again, and you can keep inviting',
  'home.cancelWaitingDesc_mm': 'Your invitation will be canceled now. He\'ll be available to others again, and you can keep inviting',
  'home.cancelWaitingDesc_mf': 'Your invitation will be canceled now. She\'ll be available to others again, and you can keep inviting',
  'home.cancelWaitingDesc_fm': 'Your invitation will be canceled now. He\'ll be available to others again, and you can keep inviting',
  'home.cancelWaitingDesc_ff': 'Your invitation will be canceled now. She\'ll be available to others again, and you can keep inviting',
  'home.cancelWaitingConfirm': 'Cancel invitation',
  'home.refuseReplyTitle': 'Decline invitation?',
  'home.refuseReplyDesc': 'The invitation will be closed, and the other person will be notified',
  'home.refuseReplyConfirm': 'Decline invitation',
  'home.watchingReject': 'Skip',
  // Shown in the rotating-headline slot for the duration of the first-time
  // swipe-down tutorial, instead of that card's random skip line: while the
  // card peeks down and reveals the slot, the text names the gesture.
  'home.skipTutorialHint': 'Swipe down to skip',
  // Incoming-invite card (page2). English varies only by the inviter (he/she);
  // "you" is gender-neutral. Title: tg(key, inviterMale). Desc: tgg(key,
  // receiverMale, inviterMale) — _mm/_fm read he, _mf/_ff read she. Receiver
  // gender is irrelevant in English.
  'home.replyingTitle': 'He invited you to chat',
  'home.replyingTitle_m': 'He invited you to chat',
  'home.replyingTitle_f': 'She invited you to chat',
  'home.replyingDesc': 'Meanwhile, he can\'t send other invitations. All the focus is just on you',
  'home.replyingDesc_mm': 'Meanwhile, he can\'t send other invitations. All the focus is just on you',
  'home.replyingDesc_mf': 'Meanwhile, she can\'t send other invitations. All the focus is just on you',
  'home.replyingDesc_fm': 'Meanwhile, he can\'t send other invitations. All the focus is just on you',
  'home.replyingDesc_ff': 'Meanwhile, she can\'t send other invitations. All the focus is just on you',
  'home.replyingAccept': 'Open chat',
  'home.replyingReject': 'Decline',
  'home.chatHeader': 'One on one',
  'home.leaveTitle': 'End chat',
  'home.leaveDesc': 'The chat will be closed permanently and cannot be restored. The other side will be notified',
  'home.leaveConfirm': 'End',
  'chat.empty': 'No messages yet',
  'chat.inputPlaceholder': 'Write a message...',
  'chat.today': 'Today',
  'chat.yesterday': 'Yesterday',
  'chat.dayBeforeYesterday': 'Day before yesterday',
  'chat.block': 'Block',
  'chat.blockTitle': 'Block user',
  'chat.blockDesc': 'This user will be blocked and won\'t be able to contact you again. This action cannot be undone',
  'chat.blockConfirm': 'Block',
  'chat.endChat': 'End Chat',
  'chat.leave': 'Leave',
  // (The chat sheet's own close label went with its X on 2026-07-31 — the sheet
  // is put away by dragging its top strip. The lightbox below keeps one.)
  'chat.a11y.closeImage': 'Close image',
  'chat.report': 'Report',
  'chat.reportTitle': 'Report user',
  'chat.reportPlaceholder': "What's wrong? (optional)",
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
  'chat.reply.image': 'Photo',
  'chat.reply.audio': 'Voice message',
  'chat.reply.location': 'Location',
  'chat.reply.schedule': 'Schedule',
  'chat.reply.a11y': 'Reply',
  'chat.reply.you': 'You',
  'chat.reply.you_m': 'You',
  'chat.reply.you_f': 'You',
  'chat.msgActions.reply': 'Reply to message',
  'chat.msgActions.copy': 'Copy text',

  // Gender-aware: user gender (English has no grammatical gender, base key used as fallback)
  'home.locationUnavailableTitle': 'Location unavailable',
  // The four entries in the strip at the foot of home (HomeDock). ONE WORD each:
  // the caption names the glyph over it in a quarter of the screen's width, so
  // anything longer wraps to two lines on every phone. Circles takes the one
  // Circles string the whole app shares (communities.menuRow). The last one is
  // "More" rather than "Settings" (user directive 2026-07-30) — what it opens is
  // the wallet, the account, support and the site, which is everything else
  // rather than a preferences screen.
  'home.dock.profile': 'Profile',
  'home.dock.preferences': 'Preferences',
  'home.dock.more': 'More',
  // Accessibility labels for controls with no visible text. The menu button's two
  // labels went with the button (2026-07-30), the invite's with its X (same day:
  // the card answers with a named button, not an X), and the profile sheet's and
  // Circles' with theirs (2026-07-31: those surfaces leave by the swipe). The
  // dock's entries are labelled by their own captions.
  // Both marks the heading tile can carry that go UP to the card's own message,
  // where the buttons that answer it are: the clock of a live invitation, and the
  // X of a card that is over. One journey, so one label.
  'home.a11y.cardMessage': 'Go to the message',
  'home.locatingDesc': 'Scanning for people around you',
  'home.loadingProfile': 'Loading profile data',
  'home.noOneNearbyTitle': 'No one nearby right now',
  'settings.deleteConfirmDesc_m': 'All data, photos, and conversations will be permanently deleted. Active invitations, chats, and connections will be cancelled. This action cannot be undone',
  'settings.deleteConfirmDesc_f': 'All data, photos, and conversations will be permanently deleted. Active invitations, chats, and connections will be cancelled. This action cannot be undone',
  'settings.signOut_m': 'Sign Out from App',
  'settings.signOut_f': 'Sign Out from App',
  'settings.signOutConfirmDesc_m': 'You won\'t receive notifications after signing out. If someone is watching you, they\'ll be notified',
  'settings.signOutConfirmDesc_f': 'You won\'t receive notifications after signing out. If someone is watching you, they\'ll be notified',
  'settings.signOutYes_m': 'Sign out',
  'settings.signOutYes_f': 'Sign out',
  'chat.inputPlaceholder_m': 'Write a message...',
  'chat.inputPlaceholder_f': 'Write a message...',
  'photo.sub_m': 'Add 2-6 photos',
  'photo.sub_f': 'Add 2-6 photos',
}