'use client';

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react';

type LightboxProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Wraps a region of the page and opens a full-screen overlay when any <img>
 * inside it is clicked (event delegation). Covers next/image, react-markdown
 * content images, and plain <img>. Pure client component; safe to wrap around
 * server-rendered children passed via `children`.
 */
export default function ImageLightbox({ children, className }: LightboxProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [alt, setAlt] = useState('');

  const handleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest('img');
    if (!img) return;
    // Don't hijack images that are inside a link or button.
    if (target.closest('a, button')) return;
    const resolved = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src;
    if (!resolved) return;
    e.preventDefault();
    setSrc(resolved);
    setAlt((img as HTMLImageElement).alt || '');
  }, []);

  const close = useCallback(() => setSrc(null), []);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [src, close]);

  return (
    <div className={className} onClick={handleClick}>
      {children}
      {src ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Expanded image"
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
        >
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close image"
            autoFocus
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-2xl leading-none text-white hover:bg-black/80"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
