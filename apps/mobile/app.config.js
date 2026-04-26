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

const loadEnv = (rootDir) => {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }

  const envFiles = [".env", ".env.local"];
  const roots = [rootDir, process.cwd(), path.join(process.cwd(), "apps", "mobile")];
  const seen = new Set();

  for (const root of roots) {
    for (const file of envFiles) {
      const filePath = path.join(root, file);
      if (seen.has(filePath)) continue;
      seen.add(filePath);
      if (fs.existsSync(filePath)) {
        Object.assign(env, parseEnvFile(filePath));
      }
    }
  }

  return env;
};

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
