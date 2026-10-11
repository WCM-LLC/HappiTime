import { useEffect } from "react";
import { reportScreen } from "../lib/heycatch";

/**
 * Reports a screen view for the gate screens App.tsx renders directly, outside
 * AppNavigator (whose NavigationContainer reports everything inside it).
 * Without this the acquisition funnel — pre-feed onboarding, sign-in,
 * onboarding, handle capture — never shows up. Renders nothing.
 */
export function ScreenView({ name }: { name: string }) {
  useEffect(() => {
    reportScreen(name);
  }, [name]);
  return null;
}
