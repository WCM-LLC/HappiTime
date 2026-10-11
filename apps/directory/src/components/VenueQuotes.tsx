import { VENUE_QUOTES, type VenueQuote } from "@/lib/socialProof";

/**
 * Quoted venue testimonials. Renders NOTHING while lib/socialProof.ts is empty —
 * there is no placeholder copy, because a fake quote is worse than no quote.
 */
export function VenueQuotes({
  heading = "What venue owners say",
  max,
  tone = "light",
  className = "",
}: {
  heading?: string;
  max?: number;
  tone?: "light" | "dark";
  className?: string;
}) {
  const quotes: VenueQuote[] = max ? VENUE_QUOTES.slice(0, max) : VENUE_QUOTES;
  if (quotes.length === 0) return null;

  const card =
    tone === "dark"
      ? "border-dark-muted/30 bg-dark-surface text-dark-foreground"
      : "border-border bg-surface text-foreground shadow-md";
  const soft = tone === "dark" ? "text-dark-muted" : "text-muted";

  return (
    <section className={className} aria-label={heading}>
      <p className={`mb-4 text-sm font-bold uppercase tracking-[0.08em] ${soft}`}>{heading}</p>
      <div
        className={`grid grid-cols-1 gap-5 ${quotes.length > 1 ? "md:grid-cols-2 lg:grid-cols-3" : ""}`}
      >
        {quotes.map((q) => (
          <figure key={`${q.venue}-${q.name}`} className={`m-0 rounded-lg border p-6 text-left ${card}`}>
            <blockquote className="m-0 text-pretty text-[15.5px] leading-[1.55]">
              &ldquo;{q.quote}&rdquo;
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3 text-sm">
              {q.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.photo}
                  alt={q.name}
                  width={40}
                  height={40}
                  loading="lazy"
                  className="size-10 rounded-full object-cover"
                />
              ) : null}
              <span>
                <span className="block font-bold">{q.name}</span>
                <span className={soft}>
                  {q.role},{" "}
                  {q.venueSlug ? (
                    <a href={`/v/${q.venueSlug}/`} className="hover:underline">
                      {q.venue}
                    </a>
                  ) : (
                    q.venue
                  )}
                </span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
