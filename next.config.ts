import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Run with `next dev --webpack` / `next build --webpack` (see package.json).
  // Next.js 16 defaults to Turbopack; we force webpack so asyncWebAssembly works.
  webpack(config) {
    // Required so webpack bundles the sqlite3.wasm binary loaded by
    // @sqlite.org/sqlite-wasm inside the Web Worker.
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },

  // Silence the lockfile root-detection warning (multiple lockfiles on disk).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
