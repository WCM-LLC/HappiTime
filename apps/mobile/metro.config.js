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

// tsconfig.json paths point to TypeScript source files (e.g. packages/shared-api/src/index.ts),
// and those files use NodeNext .js extensions in their imports ("./client.js" → client.ts).
// Metro doesn't substitute .js → .ts by default, so we do it here: try the import as-is
// first (handles pre-built dist/*.js files), then fall back to .ts.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith(".js")) {
    try {
      return context.resolveRequest(context, moduleName, platform);
    } catch {
      return context.resolveRequest(
        context,
        moduleName.replace(/\.js$/, ".ts"),
        platform
      );
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
