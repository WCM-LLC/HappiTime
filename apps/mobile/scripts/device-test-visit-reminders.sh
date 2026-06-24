#!/usr/bin/env bash
#
# Device test for the Visit-reminders / background-location disclosure gate (1.0.6, vc25).
#
# adb cannot tap the in-app UI, so MANUAL steps are marked [TAP]. Between them,
# the adb checks verify the *effects* — most importantly that toggling in Settings
# actually starts the background foreground service (proves the cross-screen shared
# store reached App.tsx, the one thing static checks can't cover).
#
# Prereqs: a real Android device (emulators are unreliable for "Allow all the time"),
#   USB debugging on, `adb devices` shows it, and `bundletool` installed
#   (brew install bundletool) if you need to install the AAB.
#
# Run phases by hand, reading the EXPECT lines — don't just `bash` the whole file.

set -u
PKG=com.jwill7486.happitime.mobile

# --- helpers ---------------------------------------------------------------
perms() {       # current location/notification permission grant state
  adb shell dumpsys package "$PKG" | grep -iE \
    "ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION|POST_NOTIFICATIONS" \
    | sed 's/^[[:space:]]*/  /'
}
fg_service() {  # is the visit-tracking foreground service running?
  adb shell dumpsys activity services "$PKG" \
    | grep -iE "isForeground|foregroundServiceType|ServiceRecord|Location" || echo "  (no $PKG services running)"
}
notif() {       # is the "Tracking visits nearby" notification posted?
  adb shell dumpsys notification --noredact 2>/dev/null | grep -i "Tracking visits nearby" \
    || echo "  (no tracking notification)"
}

# === PHASE 0: install 1.0.6 (vc25) ========================================
# Option A — already installed via Play internal testing: skip to Phase 1.
# Option B — install the production AAB directly:
#   1. Download the artifact:
#      curl -L -o visit.aab \
#        "https://expo.dev/artifacts/eas/oI4PqP_IrIVs5WxwRlnMUaOvlKBlUe4sRq3NFMk92i8.aab"
#   2. Build an installable universal APK set and install it:
#      bundletool build-apks --bundle=visit.aab --output=visit.apks --mode=universal
#      bundletool install-apks --apks=visit.apks
#   (Local install is debug-signed; fine for the disclosure flow. The Play App
#    Links autoVerify check needs the Play-signed build, so test deep links via
#    an internal-testing install instead — see Phase 5.)
adb devices
adb shell pm list packages | grep -i happitime || echo "NOT INSTALLED — do Phase 0 Option B"

# === PHASE 1: baseline (fresh state, BEFORE opt-in) =======================
adb shell pm clear "$PKG"          # wipe data incl. the AsyncStorage consent flag
echo "--- permissions at baseline (EXPECT ACCESS_BACKGROUND_LOCATION granted=false / absent) ---"
perms
echo "--- foreground service at baseline (EXPECT none) ---"
fg_service
# In a SECOND terminal, stream logs for the whole test:
#   adb logcat -c && adb logcat | grep -iE "visit-tracker|HappiTime|Location|Permission"

# [TAP] Open the app, sign in, go to Profile / Settings.
# [TAP] Toggle "Visit reminders" ON.
#   EXPECT: the HappiTime disclosure modal ("Turn on visit reminders?" … "in the
#           background, when the app is closed…") appears FIRST — BEFORE any OS dialog.
# [TAP] Tap "Turn on reminders".
#   EXPECT: the OS location dialog. On Android 11+ background ("Allow all the time")
#           is granted via the settings screen the OS routes you to — choose Allow all the time.

# === PHASE 2: verify tracking ACTUALLY started ============================
echo "--- permissions after grant (EXPECT ACCESS_BACKGROUND_LOCATION granted=true) ---"
perms
echo "--- foreground service (KEY CHECK: EXPECT a running service / Location fg type) ---"
fg_service        # if this is empty, the Settings toggle did NOT reach App.tsx (shared-store bug)
echo "--- notification (EXPECT 'Tracking visits nearby') ---"
notif

# === PHASE 3: toggle OFF stops tracking ===================================
# [TAP] Toggle "Visit reminders" OFF.
echo "--- foreground service after toggle off (EXPECT none) ---"
fg_service
echo "--- notification after toggle off (EXPECT none) ---"
notif

# === PHASE 4: denial path resets the flag =================================
adb shell pm revoke "$PKG" android.permission.ACCESS_BACKGROUND_LOCATION 2>/dev/null
adb shell pm revoke "$PKG" android.permission.ACCESS_FINE_LOCATION 2>/dev/null
# [TAP] Toggle "Visit reminders" ON → accept the disclosure → DENY at the OS prompt.
#   EXPECT: the toggle flips back OFF and an alert
#           "Visit reminders need background location" appears.
echo "--- foreground service after denial (EXPECT none) ---"
fg_service

# === PHASE 5: App Links (deep links) — needs the Play-signed build ========
# Only meaningful on an internal-testing/production install (Play App Signing cert):
adb shell pm get-app-links "$PKG"   # EXPECT: happitime.biz -> verified

# === RESET to re-run from scratch =========================================
# adb shell pm clear "$PKG"
