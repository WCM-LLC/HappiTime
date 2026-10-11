"use client";

import { useEffect } from "react";
import { captureFirstTouch } from "@/lib/tracking";

/** Root-layout hook that stores the session's first campaign touch. */
export function FirstTouchCapture() {
  useEffect(() => {
    captureFirstTouch();
  }, []);

  return null;
}
