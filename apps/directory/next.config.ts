import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { HAPPY_HOUR_LANDING_PAGES } from "./src/lib/seoNeighborhoods";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  // Server-rendered with ISR — pages revalidate every 15 minutes
  // so venue data stays fresh without rebuilding the whole site
  outputFileTracingRoot: path.join(__dirname, "../../"),
  trailingSlash: true,
  // Cloudinary serves venue images with its own transforms; the custom loader
  // maps next/image widths onto Cloudinary URLs so we get responsive srcsets
  // without routing through (and paying for) Vercel image optimization.
  images: {
    loader: "custom",
    loaderFile: "./src/lib/imageLoader.ts",
  },
  // Canonicalize the legacy neighborhood URL (`/kc/[neighborhood]/`) to the
  // canonical happy-hour landing page (`/happy-hour/[slug]/`). The
  // neighborhood→canonical slug mapping is irregular (e.g. power-and-light →
  // power-light-kansas-city, overland-park → overland-park-kansas), so the
  // rules are generated from the source-of-truth data rather than a template.
  // Single-segment only: venue detail pages (`/kc/[neighborhood]/[slug]/`)
  // are already canonical and must NOT redirect.
  // Serve the Apple App Site Association as JSON (the file is extensionless and
  // iOS expects application/json). Static public/ files bypass trailingSlash.
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
  async redirects() {
    return [
      // /claim was retired (its sales-call funnel duplicated /pricing); the
      // URL was indexed, so keep a permanent redirect.
      { source: "/claim", destination: "/pricing/", statusCode: 301 as const },
      ...HAPPY_HOUR_LANDING_PAGES.map((page) => ({
        source: `/kc/${page.neighborhoodSlug}`,
        destination: page.canonicalPath,
        // Explicit 301 (not Next's `permanent: true`, which emits 308) to match
        // the canonical-URL spec for this work. Both are SEO-permanent.
        statusCode: 301,
      })),
    ];
  },
};

export default nextConfig;
