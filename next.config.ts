import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Embedded Postgres for local dev ships its own WASM; keep it out of the bundler.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
