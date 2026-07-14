import type { NextConfig } from "next";

// The web talks to @stepd/server directly over CORS via NEXT_PUBLIC_API_URL
// (see src/lib/data/api.ts) — no dev proxy or env plumbing needed here.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
