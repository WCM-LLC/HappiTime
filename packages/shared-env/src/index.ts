export type PublicSupabaseEnv = {
  url: string;
  anonKey: string;
};

export type PublicSupabaseEnvInput = {
  supabaseUrl?: string;
  supabaseKey?: string;
};

function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function getPublicSupabaseEnv(
  input?: PublicSupabaseEnvInput
): PublicSupabaseEnv {
  // Prefer framework-local public vars first to avoid cross-app collisions
  // in monorepo/dev shells where both EXPO_* and NEXT_PUBLIC_* may be present.
  const url =
    normalizeEnvValue(input?.supabaseUrl) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    normalizeEnvValue(process.env.SUPABASE_URL);

  const anonKey =
    normalizeEnvValue(input?.supabaseKey) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    normalizeEnvValue(process.env.SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    throw new Error(
      [
        "Missing Supabase public env.",
        "Set one of:",
        "- EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY (mobile)",
        "- NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (web)",
        "Optionally supported keys:",
        "- EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ].join("\n")
    );
  }

  return { url, anonKey };
}

export type MapsProvider = "google" | "mapbox";

export type PublicMapsEnv = {
  provider: MapsProvider;
  apiKey: string;
  styleId?: string;
};

export function getPublicMapsEnv(): PublicMapsEnv | null {
  const providerRaw =
    normalizeEnvValue(process.env.EXPO_PUBLIC_MAPS_PROVIDER) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_MAPS_PROVIDER);
  const apiKey =
    normalizeEnvValue(process.env.EXPO_PUBLIC_MAPS_API_KEY) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_MAPS_API_KEY);

  if (!providerRaw || !apiKey) return null;

  const provider = providerRaw.toLowerCase() === "mapbox" ? "mapbox" : "google";
  const styleId =
    normalizeEnvValue(process.env.NEXT_PUBLIC_MAPS_STYLE_ID) ?? undefined;

  return {
    provider,
    apiKey,
    ...(provider === "mapbox" && styleId ? { styleId } : {}),
  };
}
