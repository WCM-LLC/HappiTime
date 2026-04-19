import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-rendered with ISR — pages revalidate every 15 minutes
  // so venue data stays fresh without rebuilding the whole site
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
