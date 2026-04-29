const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Give Metro visibility into the entire monorepo so it can
// bundle files from packages/* that are symlinked into node_modules.
config.watchFolders = [monorepoRoot];

// Look for node_modules in both the app directory and the monorepo
// root (where workspace dependencies are hoisted).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// npm workspaces use symlinks; Metro must follow them to reach
// packages/* from node_modules/@happitime/*.
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
