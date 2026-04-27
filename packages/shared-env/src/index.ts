export type PublicSupabaseEnv = {
  url: string;
  anonKey: string;
};

export type PublicSupabaseEnvInput = {
  supabaseUrl?: string;
  supabaseKey?: string;
};

/** Returns the value trimmed, or null if undefined/blank. */
function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

let hasWarnedSupabaseEnvMismatch = false;

/**
 * Resolves Supabase URL and anon key from the environment.
 * Supports EXPO_PUBLIC_*, NEXT_PUBLIC_*, and plain SUPABASE_* key names.
 * Throws with a descriptive message if either value is missing.
 */
export function getPublicSupabaseEnv(
  input?: PublicSupabaseEnvInput
): PublicSupabaseEnv {
  const nextUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const expoUrl = normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const plainUrl = normalizeEnvValue(process.env.SUPABASE_URL);

  const nextKey =
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const expoKey =
    normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    normalizeEnvValue(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const plainKey = normalizeEnvValue(process.env.SUPABASE_ANON_KEY);

  if (
    !hasWarnedSupabaseEnvMismatch &&
    nextUrl &&
    expoUrl &&
    nextUrl !== expoUrl
  ) {
    hasWarnedSupabaseEnvMismatch = true;
    console.warn(
      "[shared-env] NEXT_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_URL differ. Web apps should use NEXT_PUBLIC_* values."
    );
  }

  const url =
    normalizeEnvValue(input?.supabaseUrl) ??
    nextUrl ??
    expoUrl ??
    plainUrl;

  const anonKey =
    normalizeEnvValue(input?.supabaseKey) ??
    nextKey ??
    expoKey ??
    plainKey;

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

/**
 * Resolves the maps provider config from the environment. Returns null if maps are not configured.
 * Supports 'google' (default) and 'mapbox'. Mapbox also accepts an optional MAPS_STYLE_ID.
 */
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
