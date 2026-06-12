import type { MetadataRoute } from "next";

/**
 * Robots policy.
 *
 * AI crawlers are explicitly allowed: HappiTime's growth strategy depends on
 * being cited by AI assistants (ChatGPT, Claude, Perplexity, Google AI) when
 * people ask about Kansas City happy hours. Explicit per-bot rules guarantee
 * access even if the wildcard policy changes later.
 */
const AI_CRAWLERS = [
  // OpenAI
  "GPTBot", // training
  "OAI-SearchBot", // ChatGPT search index
  "ChatGPT-User", // live user-triggered fetches
  // Anthropic
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  // Perplexity
  "PerplexityBot",
  "Perplexity-User",
  // Google AI (Gemini / AI Overviews grounding)
  "Google-Extended",
  // Apple Intelligence
  "Applebot-Extended",
  // Meta AI
  "meta-externalagent",
  // Amazon (Alexa+ / Rufus)
  "Amazonbot",
  // Common Crawl (feeds many model training sets)
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: ["/api/"],
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://happitime.biz/sitemap.xml",
  };
}
