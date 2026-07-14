import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/:path*", destination: "/api/proxy/api/:path*" },
      ],
    };
  },
};

export default nextConfig;
