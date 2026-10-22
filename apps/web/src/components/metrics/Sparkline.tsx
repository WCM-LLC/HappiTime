type Props = {
  values: number[];
  width?: number;
  height?: number;
  label: string;
  className?: string;
};

/** A tiny line, no axes. Flat when everything is zero. */
export function Sparkline({ values, width = 112, height = 28, label, className }: Props) {
  const n = values.length;
  const max = Math.max(1, ...values);
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = n <= 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2);
    const y = height - pad - (v / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className={className}>
      <polyline points={pts.join(' ')} stroke="#C8965A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
