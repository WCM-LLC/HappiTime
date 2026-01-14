import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSupabaseClient } from "@happitime/shared-api";
import Constants from "expo-constants";
import "react-native-url-polyfill/auto";

const manifestExtra = (
  Constants.manifest as { extra?: Record<string, unknown> } | undefined
)?.extra;
const manifest2Extra = (
  Constants as { manifest2?: { extra?: Record<string, unknown> } }
)?.manifest2?.extra;

const extra =
  (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ??
  manifestExtra ??
  manifest2Extra;

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  (extra?.supabaseUrl as string | undefined);

const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  (extra?.supabaseAnonKey as string | undefined) ??
  (extra?.supabasePublishableKey as string | undefined);

export const supabase = createSupabaseClient({
  supabaseUrl,
  supabaseKey,
  clientOptions: {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
});
