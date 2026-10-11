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
      // Baseline security headers on every route. CSP ships Report-Only first:
      // the site runs GTM/gtag inline scripts and loads Google Fonts, Fontshare,
      // Cloudinary, Supabase Storage and qrserver images, so an enforced policy
      // on day one would break them. Tighten and switch to enforcing once a
      // week of violations has been reviewed.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
              "font-src 'self' https://fonts.gstatic.com https://cdn.fontshare.com",
              "img-src 'self' data: blob: https://res.cloudinary.com https://*.supabase.co https://api.qrserver.com https://www.googletagmanager.com",
              "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://vitals.vercel-insights.com",
              "frame-src https://www.google.com https://www.googletagmanager.com",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
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
      // Short link printed on the Tacos & Tables flyer (Oct 13, 2026 Spades
      // tournament). Temporary: it will point at the next tournament page.
      { source: "/spades", destination: "/sponsored-events/tacos-and-tables/", statusCode: 302 as const },
      // HeyCatch short links: single-character paths (/a–/z, /0–/9) are
      // reserved for channel attribution. The query IS the attribution — a
      // bare redirect to / would lose it; the SDK strips the params from the
      // URL bar after landing. No real route is a single character (/i, /r and
      // /v only exist with a second segment, which this pattern cannot match).
      {
        source: "/:l([a-z0-9])",
        destination: "/?utm_source=heycatch&utm_campaign=:l",
        // Explicit 302, as the HeyCatch guide specifies (`permanent: false`
        // emits 307 here), matching the /spades rule above.
        statusCode: 302 as const,
      },
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
