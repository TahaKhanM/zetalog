import { join } from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@zetalog/shared'],
  // Pin the workspace root so Turbopack does not warn when several lockfiles
  // are visible (e.g. inside a git worktree). Resolves to the monorepo root.
  turbopack: { root: join(import.meta.dirname, '..', '..') },
};

export default nextConfig;
