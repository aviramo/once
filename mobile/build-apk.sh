#!/usr/bin/env bash
# Build a debug APK with the latest icon and install it on the connected device.
# Usage (from the mobile/ directory):
#   bash build-apk.sh
set -e
cd "$(dirname "$0")"

echo "==> Generating icons from SVG..."
node scripts/generate-icons.mjs

echo "==> Syncing app.json into the native Android project..."
npx expo prebuild --platform android --no-install

echo "==> Building debug APK..."
cd android
./gradlew assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "==> Done! APK is at:"
echo "    $(pwd)/$APK"
echo ""
echo "To install on a connected device:"
echo "    adb install -r $APK"
