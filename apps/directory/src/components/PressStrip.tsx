import { PRESS_MENTIONS } from "@/lib/socialProof";

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Dated "as seen in" strip. Renders NOTHING until lib/socialProof.ts has a real
 * mention in it.
 */
export function PressStrip({ className = "" }: { className?: string }) {
  if (PRESS_MENTIONS.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted ${className}`}>
      <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-muted-light">
        As seen in
      </span>
      {PRESS_MENTIONS.map((m) => (
        <a
          key={m.url}
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          title={m.title}
          className="font-semibold text-foreground hover:text-brand-dark"
        >
          {m.outlet}{" "}
          <span className="font-normal text-muted-light">
            · {DATE_FMT.format(new Date(m.date))}
          </span>
        </a>
      ))}
    </div>
  );
}
