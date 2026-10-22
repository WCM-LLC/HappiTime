export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtPct(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined) return '—';
  return `${(ratio * 100).toFixed(1)}%`;
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', ...opts });
}

/** Delta vs the prior window. Drops are neutral, never red — creators churn on red. */
export function delta(current: number, prior: number | null | undefined): { text: string; tone: 'up' | 'flat' | 'none' } {
  if (prior === null || prior === undefined) return { text: '', tone: 'none' };
  const d = current - prior;
  if (d > 0) return { text: `+${fmtInt(d)} vs prior`, tone: 'up' };
  if (d < 0) return { text: `${fmtInt(d)} vs prior`, tone: 'flat' };
  return { text: 'same as prior', tone: 'flat' };
}

export function deltaPct(current: number, prior: number | null | undefined): { text: string; tone: 'up' | 'flat' | 'none' } {
  if (prior === null || prior === undefined) return { text: '', tone: 'none' };
  if (prior === 0) return current > 0 ? { text: 'new', tone: 'up' } : { text: '', tone: 'none' };
  const pct = ((current - prior) / prior) * 100;
  if (Math.abs(pct) < 0.5) return { text: 'same as prior', tone: 'flat' };
  return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`, tone: pct > 0 ? 'up' : 'flat' };
}
