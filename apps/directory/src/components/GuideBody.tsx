"use client";

import ReactMarkdown from "react-markdown";
import { trackEvent } from "@/lib/tracking";

// Matches the venue-page URL shapes guide_venue_slugs() recognises in SQL:
//   https://happitime.biz/kc/<area>/<slug>[/]   /kc/<area>/<slug>   /v/<slug>
// Neighborhood pages (/kc/<area>/) have no slug segment and do not match.
const VENUE_HREF_RE =
  /^(?:https?:\/\/(?:www\.)?happitime\.biz)?\/(?:kc\/[a-z0-9-]+|v)\/([a-z0-9][a-z0-9-]*)\/?(?:[?#].*)?$/i;

export function venueSlugFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const m = VENUE_HREF_RE.exec(href.trim());
  return m ? m[1].toLowerCase() : null;
}

type Props = {
  body: string;
  guideId: string;
  authorId: string | null;
  slug: string;
  /** venue slug → venue id, resolved server-side for the venues this guide links */
  venueIds: Record<string, string>;
};

/**
 * Renders a guide's markdown body. Every link to a venue page fires a
 * `cta_click` with meta.cta = 'guide_venue' + the guide id, which is what
 * super_user_metrics() counts as "venue clicks" and venue_guide_stats() shows
 * venue owners as "guides sending you people". Navigation is never blocked.
 */
export function GuideBody({ body, guideId, authorId, slug, venueIds }: Props) {
  const pagePath = `/guides/${slug}/`;

  return (
    <ReactMarkdown
      components={{
        a: ({ href, children, ...rest }) => {
          const venueSlug = venueSlugFromHref(href);
          if (!venueSlug) {
            return (
              <a href={href} {...rest}>
                {children}
              </a>
            );
          }
          const venueId = venueIds[venueSlug];
          return (
            <a
              href={href}
              {...rest}
              onClick={() => {
                void trackEvent({
                  eventType: "cta_click",
                  pagePath,
                  venueId,
                  meta: {
                    cta: "guide_venue",
                    guide_id: guideId,
                    author_id: authorId,
                    venue_slug: venueSlug,
                  },
                });
              }}
            >
              {children}
            </a>
          );
        },
      }}
    >
      {body}
    </ReactMarkdown>
  );
}
