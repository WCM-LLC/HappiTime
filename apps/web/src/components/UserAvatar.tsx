'use client';

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';

/**
 * User avatar with a resilient fallback. If the image fails to load — a dead URL,
 * a 404, or a 0-byte object that returns HTTP 200 with no bytes — it falls back
 * to the initials instead of rendering a broken-image icon. A present-but-broken
 * avatar_url is exactly what a naive `url ? <img> : <initials>` check misses.
 */
export default function UserAvatar({
  url,
  fallback,
  sizeClassName,
  textClassName,
}: {
  url: string | null | undefined;
  fallback: string;
  sizeClassName: string;
  textClassName: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!url && !failed;

  return (
    <div
      className={`${sizeClassName} rounded-full bg-brand-subtle overflow-hidden flex items-center justify-center shrink-0`}
    >
      {showImage ? (
        <img
          src={url as string}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={textClassName}>{fallback}</span>
      )}
    </div>
  );
}
