import * as React from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  /** Height in pixels (width scales proportionally from viewBox 439×148) */
  height?: number;
  /** Light variant: cream text on dark backgrounds */
  variant?: 'dark' | 'light';
  className?: string;
}

export function Logo({ height = 28, variant = 'dark', className }: LogoProps) {
  const outerColor = variant === 'light' ? '#F5F0EB' : '#1A1A1A';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 439 148"
      height={height}
      aria-label="HappiTime"
      role="img"
      className={cn('shrink-0', className)}
      style={{ width: 'auto' }}
    >
      <circle cx="260.2" cy="74.0" r="47.9" fill="#C8965A" />
      <text
        x="30"
        y="93.0"
        fontFamily="var(--font-display), 'Plus Jakarta Sans', sans-serif"
        fontWeight="800"
        fontSize="72"
        letterSpacing="-0.02em"
      >
        <tspan fill={outerColor}>Happ</tspan>
        <tspan fill="#ffffff">iTi</tspan>
        <tspan fill={outerColor}>me</tspan>
      </text>
    </svg>
  );
}

export default Logo;
