import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// The HappiTime wordmark — copper letterforms with the white "iTi" on the copper
// disc. Source asset: /public/brand/happitime-wordmark.png (974×304, transparent),
// supplied by J on 2026-10-22 and canonical across web, directory, and the design
// system bundle. The earlier SVG <text> wordmark (dark "Happ…me") is retired.
//
// The mark is copper on transparent, so it reads on both light and dark surfaces;
// `variant` is kept for API compatibility with existing callers and currently
// renders the same asset.

const WORDMARK_W = 974;
const WORDMARK_H = 304;

interface LogoProps {
  /** Rendered height in pixels; width scales from the 974×304 asset. */
  height?: number;
  /** Kept for call-site compatibility; both variants render the copper mark. */
  variant?: 'dark' | 'light';
  className?: string;
}

export function Logo({ height = 28, variant: _variant = 'dark', className }: LogoProps) {
  const width = Math.round((height * WORDMARK_W) / WORDMARK_H);
  return (
    <Image
      src="/brand/happitime-wordmark.png"
      alt="HappiTime"
      width={width}
      height={height}
      priority
      className={cn('shrink-0 select-none', className)}
      style={{ height, width: 'auto' }}
    />
  );
}

export default Logo;
