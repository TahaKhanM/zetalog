import { join } from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@zetalog/shared'],
  // Pin the workspace root so Turbopack does not warn when several lockfiles
  // are visible (e.g. inside a git worktree). Resolves to the monorepo root.
  turbopack: { root: join(import.meta.dirname, '..', '..') },
  webpack(config: { resolve: { extensionAlias?: Record<string, string[]> } }) {
    // @zetalog/shared is TS-ESM source whose internal imports carry `.js`
    // extensions that resolve to `.ts` files. Teach webpack that mapping.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
