import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Serve the static download page at the clean URL /download. This array
  // form is applied after static/public files but before dynamic routes,
  // so /download is never swallowed by the [lang] segment.
  async rewrites() {
    return [{ source: "/download", destination: "/download/index.html" }];
  },
};

export default nextConfig;
