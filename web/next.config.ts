import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// The project has ONE env file, `.env` at the repo root — there is no
// web/.env.local. Next only reads .env* files sitting beside itself, so the
// root one is loaded here, before the config is handed back and long before
// anything is compiled. Node's loader leaves a variable that is already in the
// environment alone, so on Vercel (where the file is not even checked out) the
// project's own values stand untouched.
const rootEnv = path.resolve(__dirname, "../.env");
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Let proxy.ts (STATIC_PAGES) decide which clean paths keep a trailing
  // slash. Without this, Next would 308 /privacy/ -> /privacy before the
  // proxy runs, dropping the slash a shared link may carry.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
