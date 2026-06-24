import { Platform } from "react-native";

// Canonical store URLs. iOS id 6757933269 matches eas.json ascAppId + the directory app
// (InviteScreen historically used a stale id 6744873669 — do not copy that).
// Android package com.jwill7486.happitime.mobile matches app.json package/bundleIdentifier
// and the directory's .well-known/assetlinks.json — confirmed against the live Play Store
// listing 2026-06-24 (was the stale placeholder com.happitime).
export const APP_STORE_URL = "https://apps.apple.com/us/app/happitime/id6757933269";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.jwill7486.happitime.mobile";

export function storeUrl(): string {
  return Platform.OS === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
}
