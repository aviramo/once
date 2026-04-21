#!/usr/bin/env bash
# Regenerate app icons from the SVG source, then build and run on Android.
# Usage (from the mobile/ directory):
#   bash run-android.sh
set -e
cd "$(dirname "$0")"

echo "==> Generating icons from SVG..."
node scripts/generate-icons.mjs

echo "==> Building and running on Android..."
npx expo run:android
