import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only. The server binds 0.0.0.0, so it is reachable as 127.0.0.1 and via
  // the LAN IP, but Next only trusts `localhost` by default and blocks
  // /_next/webpack-hmr from any other origin. That kills HMR and reload-loops
  // the page, which looks like a broken or stale build rather than a config
  // block. Listing the other origins we actually browse from avoids that.
  allowedDevOrigins: ['127.0.0.1', '192.168.137.1'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
};

export default nextConfig;
