// Durable flag for whether the new-user pre-feed onboarding (Splash → Location →
// Vibes) has been shown. Guests have no account, so this lives in AsyncStorage
// rather than the server-side onboarding_completed_at.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const KEY = "ht_prefeed_onboarded";

export async function setPrefeedOnboarded(): Promise<void> {
  await AsyncStorage.setItem(KEY, "1");
}

/** `loading` is true until resolved; then `seen` reflects the stored flag. */
export function usePrefeedOnboarded(): {
  loading: boolean;
  seen: boolean;
  markSeen: () => Promise<void>;
} {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setSeen(v === "1"));
  }, []);
  const markSeen = async () => {
    await setPrefeedOnboarded();
    setSeen(true);
  };
  return { loading: seen === null, seen: seen === true, markSeen };
}
