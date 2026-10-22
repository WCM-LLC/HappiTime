import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: ReactNode;
  /** Short line under the number: a delta, or in the zero state, what makes it move. */
  note?: ReactNode;
  tone?: 'up' | 'flat' | 'none';
  href?: string;
  /** Muted number — used when the value is 0 in the early state */
  dim?: boolean;
  info?: string;
};

const ArrowUp = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);

export function StatTile({ label, value, note, tone = 'none', href, dim, info }: Props) {
  const body = (
    <>
      <div className="text-caption font-semibold uppercase tracking-[0.06em] text-muted flex items-center gap-1.5">
        {label}
        {info ? (
          <span title={info} className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-strong text-[10px] font-bold text-muted cursor-help">i</span>
        ) : null}
      </div>
      <div className={`text-[2.25rem] leading-none font-bold tracking-[-0.03em] tabular-nums ${dim ? 'text-muted-light' : 'text-foreground'}`}>
        {value}
      </div>
      {note ? (
        <div className={`flex items-center gap-1.5 text-[13px] font-medium leading-snug ${tone === 'up' ? 'text-success-ink' : 'text-muted'}`}>
          {tone === 'up' ? <ArrowUp /> : null}
          <span>{note}</span>
        </div>
      ) : null}
    </>
  );
  const cls = 'flex flex-col gap-2.5 rounded-lg border border-border bg-surface px-[22px] py-5 shadow-sm min-w-0';
  return href ? (
    <Link href={href} className={`${cls} hover:shadow-md transition-shadow`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
