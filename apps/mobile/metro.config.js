const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// 2. Resolve all node_modules from both local and workspace root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Enable Symlinks (Crucial for monorepos)
config.resolver.unstable_enableSymlinks = true;

// 4. Ensure we prioritize source files
config.resolver.sourceExts = [...config.resolver.sourceExts, 'ts', 'tsx', 'cjs'];

module.exports = config;
