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
  const envFiles = [".env.local", ".env"];
  const roots = [rootDir, process.cwd(), monorepoRoot, path.join(monorepoRoot, "apps", "mobile")];
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

const withAndroidMapsKey = (plugins, mapsApiKey) =>
  (plugins ?? []).map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== "react-native-maps") {
      return plugin;
    }

    return [
      "react-native-maps",
      {
        ...(plugin[1] ?? {}),
        androidGoogleMapsApiKey: mapsApiKey ?? "",
      },
    ];
  });

module.exports = ({ config }) => {
  const env = loadEnv(__dirname);
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const supabasePublishableKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const mapsProvider = env.EXPO_PUBLIC_MAPS_PROVIDER;
  const mapsApiKey = env.EXPO_PUBLIC_MAPS_API_KEY;

  return {
    ...config,
    plugins: withAndroidMapsKey(config.plugins, mapsApiKey),
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
      mapsProvider,
      mapsApiKey,
    },
  };
};
