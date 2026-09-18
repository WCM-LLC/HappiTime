/* global __dirname */
const fs = require("fs");
const path = require("path");

const parseEnvFile = (filePath) => {
  const contents = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const line = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      env[key] = value;
    }
  }

  return env;
};

const mergeEnv = (target, source) => {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string" || value.trim() === "") continue;
    if (target[key] == null || target[key] === "") {
      target[key] = value;
    }
  }
};

const loadEnv = (rootDir) => {
  const env = {};
  mergeEnv(env, process.env);

  const monorepoRoot = path.resolve(rootDir, "../..");
  const androidRoot = path.join(monorepoRoot, "apps", "android");
  const envFiles = [".env.local", ".env"];
  const roots = [rootDir, process.cwd(), monorepoRoot, androidRoot];
  const seen = new Set();

  for (const root of roots) {
    for (const file of envFiles) {
      const filePath = path.join(root, file);
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      if (fs.existsSync(filePath)) {
        mergeEnv(env, parseEnvFile(filePath));
      }
    }
  }

  return env;
};

// 2026-09-14: the `react-native-maps` config-plugin entry (and the helper that
// injected androidGoogleMapsApiKey into it) were removed. Expo SDK 54 bundles
// react-native-maps 1.20.1, which ships no config plugin, so `expo config`
// only ever resolved the entry through a stray, unlocked 1.27.2 hoisted at the
// repo root — a clean `npm ci` could not export a bundle. The Android key is
// already set the Expo-native way below (android.config.googleMaps.apiKey).
module.exports = ({ config }) => {
  const env = loadEnv(__dirname);
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabasePublishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Console origin for /api/intake/* (menu scanning). Optional — the intake
  // client falls back to the production console when unset.
  const consoleUrl = env.EXPO_PUBLIC_CONSOLE_URL;

  const mapsProvider = env.EXPO_PUBLIC_MAPS_PROVIDER;
  const mapsApiKey = env.EXPO_PUBLIC_MAPS_API_KEY;

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: mapsApiKey ?? "",
        },
      },
    },
    extra: {
      ...config.extra,
      supabaseUrl,
      supabaseAnonKey,
      supabasePublishableKey,
      consoleUrl,
      mapsProvider,
      mapsApiKey,
    },
  };
};
