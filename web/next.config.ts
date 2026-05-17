import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Let proxy.ts (STATIC_PAGES) decide which clean paths keep a trailing
  // slash. Without this, Next would 308 /download/ -> /download before the
  // proxy runs, dropping the slash the brand link is shared with.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
