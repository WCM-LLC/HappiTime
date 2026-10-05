"use client";

import { useEffect, useRef } from "react";
import { MARKUP } from "./markup";
// Plain JS on purpose: it is the same script the approved design was tested with.
import { initRsvp } from "./rsvp-init";

export function BrunchRsvp({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) initRsvp(ref.current);
  }, []);

  return (
    <div
      ref={ref}
      className={`slb ${className}`}
      dangerouslySetInnerHTML={{ __html: MARKUP }}
    />
  );
}
