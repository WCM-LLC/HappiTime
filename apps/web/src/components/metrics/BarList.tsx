type Row = { key: string; label: string; sub?: string | null; value: number; valueNote?: string | null };

type Props = { rows: Row[]; emptyText: string };

/** Ranked bars — label left, value right, copper bar proportional to the top row. */
export function BarList({ rows, emptyText }: Props) {
  if (rows.length === 0) {
    return <p className="text-body-sm text-muted">{emptyText}</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-body-sm">
            <span className="font-medium text-foreground min-w-0 truncate">
              {r.label}
              {r.sub ? <span className="text-muted font-normal"> · {r.sub}</span> : null}
            </span>
            <span className="font-semibold tabular-nums text-foreground shrink-0">
              {r.value.toLocaleString('en-US')}
              {r.valueNote ? <span className="text-muted font-normal"> · {r.valueNote}</span> : null}
            </span>
          </div>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-brand-subtle">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
