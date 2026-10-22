import type { DailyPoint } from '@/lib/super-user-metrics';

type Props = { daily: DailyPoint[]; field?: keyof Omit<DailyPoint, 'day'>; label: string };

function fmtTick(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * One series, filled area, four gridlines, the peak day annotated. Server-rendered
 * SVG — no chart library, no client JS.
 */
export function ReachChart({ daily, field = 'people_sent', label }: Props) {
  const W = 1100;
  const H = 220;
  const top = 20;
  const bottom = 200;
  const values = daily.map((d) => Number(d[field] ?? 0));
  const n = values.length;
  const rawMax = Math.max(...values, 0);
  const max = rawMax === 0 ? 3 : Math.max(3, Math.ceil(rawMax / 3) * 3);
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const area = n > 0 ? `M${pts.join(' L')} L${x(n - 1).toFixed(1)},${bottom} L0,${bottom} Z` : '';
  const peakIdx = rawMax > 0 ? values.indexOf(rawMax) : -1;
  const gridVals = [0, max / 3, (2 * max) / 3, max];
  const ticks = n > 0 ? [0, Math.floor((n - 1) / 4), Math.floor((n - 1) / 2), Math.floor((3 * (n - 1)) / 4), n - 1].filter((v, i, a) => a.indexOf(v) === i) : [];

  return (
    <figure className="m-0 flex flex-col gap-2">
      <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="block overflow-visible">
        {gridVals.map((g, i) => (
          <g key={i}>
            <line x1="0" y1={y(g)} x2={W} y2={y(g)} stroke="#E8E8E5" strokeDasharray={i === 0 ? undefined : '2 6'} />
            <text x={W} y={y(g) - 4} textAnchor="end" fontSize="11" fill="#9CA3AF" fontFamily="Inter, sans-serif">{Math.round(g)}</text>
          </g>
        ))}
        {n > 0 ? (
          <>
            <path d={area} fill="#C8965A" fillOpacity="0.12" />
            <polyline points={pts.join(' ')} fill="none" stroke="#C8965A" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : null}
        {peakIdx >= 0 ? (
          <g>
            <circle cx={x(peakIdx)} cy={y(values[peakIdx])} r="4.5" fill="#FFFFFF" stroke="#C8965A" strokeWidth="2.5" />
            <rect x={Math.min(Math.max(x(peakIdx) - 70, 0), W - 140)} y="2" width="140" height="26" rx="6" fill="#1A1A1A" />
            <text x={Math.min(Math.max(x(peakIdx), 70), W - 70)} y="19" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#F5F5F3" fontFamily="Inter, sans-serif">
              {fmtTick(daily[peakIdx].day)} · {values[peakIdx]} {values[peakIdx] === 1 ? 'person' : 'people'}
            </text>
          </g>
        ) : null}
      </svg>
      <figcaption className="flex justify-between px-0.5 text-[11px] text-muted-light">
        {ticks.map((i) => (
          <span key={i}>{fmtTick(daily[i].day)}</span>
        ))}
      </figcaption>
    </figure>
  );
}
