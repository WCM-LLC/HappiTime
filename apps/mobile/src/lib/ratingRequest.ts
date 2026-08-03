// src/lib/ratingRequest.ts
//
// Bridges inbox taps on visit_rating rows to the VisitRatingModal mounted at
// App.tsx root (same handoff idea as pendingCheckinPrime). App.tsx registers
// a handler wrapping useVisitRating's triggerRating.
export type VisitRatingRequest = {
  venueId: string;
  venueName: string;
  visitId?: string;
  aspects?: string[];
};

type Handler = (req: VisitRatingRequest) => void;
let handler: Handler | null = null;

export function registerVisitRatingHandler(fn: Handler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) handler = null;
  };
}

export function requestVisitRating(req: VisitRatingRequest): void {
  handler?.(req);
}
