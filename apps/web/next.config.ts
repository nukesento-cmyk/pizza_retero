import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

// Single .env at the monorepo root (see .env.example).
loadDotenv({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@retero/shared", "@retero/db", "@retero/core"],
  serverExternalPackages: ["postgres"],
  typedRoutes: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
