# mobile/assets — what the app binary ships

Exactly the four images `app.json` points at by relative path, and nothing else:

| File | Where the OS uses it |
|---|---|
| `icon.png` | iOS launcher / Expo app icon (`expo.icon`) |
| `adaptive-icon.png` | Android adaptive foreground (`expo.android.adaptiveIcon`) |
| `splash-icon.png` | Splash screen glyph (`expo-splash-screen`) |
| `notification-icon.png` | Android notification small icon (white on transparent) |

All four are **generated**, never hand-edited: `node scripts/build-icons.mjs` draws them
from the one "1" glyph and the tokens in `src/colors.ts`, and syncs the colours back into
`app.json`. Edit the glyph or the token, re-run, commit what changed.

Anything a store console asks for, rather than the binary, belongs in
[../store/](../store/): the 512 icon, the feature graphic, the phone screenshots and the
listing copy. Keeping them out of here also keeps them out of every EAS upload.
