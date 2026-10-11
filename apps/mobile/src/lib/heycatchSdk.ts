// The HeyCatch SDK for iOS and Android. Metro picks heycatchSdk.web.tsx for the
// Expo web target instead: on web, `@heycatch/sdk` resolves to its browser
// build, which has no HeyCatchProvider and no analytics.trackScreen, so the
// app root would fail to render. Import the SDK from here, never directly.
export { analytics, HeyCatchProvider } from "@heycatch/sdk";
export type { HeyCatchProperties } from "@heycatch/sdk";
