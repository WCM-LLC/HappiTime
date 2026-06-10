import { useCallback, useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../api/supabaseClient";
import { isNewerVersion } from "../lib/isNewerVersion";
import { storeUrl } from "../lib/storeLinks";

export type AppRelease = {
  version: string;
  changelog: string[];
  is_critical: boolean;
};

const dismissKey = (version: string) => `update_prompt_dismissed:${version}`;

/**
 * On mount (login / app-open), surfaces the latest published store release when it is
 * newer than the running build. Never throws — any failure simply yields no prompt.
 */
export function useUpdatePrompt() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const running = Constants.expoConfig?.version;
        if (!running) return;
        // Cast: generated DB types predate this RPC (migration 20260609210000).
        const { data, error } = await (supabase as any).rpc("get_latest_release", {
          p_platform: Platform.OS,
        });
        if (cancelled || error || !data) return;
        const rel = data as AppRelease;
        if (!isNewerVersion(rel.version, running)) return;
        if (!rel.is_critical) {
          const dismissed = await AsyncStorage.getItem(dismissKey(rel.version));
          if (cancelled || dismissed) return;
        }
        setRelease(rel);
        setVisible(true);
      } catch {
        // never block the app on the update check
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(async () => {
    if (release && !release.is_critical) {
      try {
        await AsyncStorage.setItem(dismissKey(release.version), "1");
      } catch {
        // ignore persistence failure
      }
    }
    setVisible(false);
  }, [release]);

  const openStore = useCallback(() => {
    void Linking.openURL(storeUrl());
  }, []);

  return { release, visible, dismiss, openStore };
}
