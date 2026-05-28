import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  // Server-rendered with ISR — pages revalidate every 15 minutes
  // so venue data stays fresh without rebuilding the whole site
  outputFileTracingRoot: path.join(__dirname, "../../"),
  trailingSlash: true,
};

export default nextConfig;
