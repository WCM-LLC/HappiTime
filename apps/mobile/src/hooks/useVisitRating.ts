// src/hooks/useVisitRating.ts
import { useCallback, useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import { supabase } from "../api/supabaseClient";

export type PendingVisit = {
  visitId?: string;
  venueId: string;
  venueName: string;
  enteredAt: string;
  aspects?: string[];
  source?: "server" | "client";
};

export function buildFallbackVisitInsert(
  userId: string,
  pendingVisit: PendingVisit,
  rating: number,
  comment?: string
) {
  return {
    user_id: userId,
    venue_id: pendingVisit.venueId,
    entered_at: pendingVisit.enteredAt,
    rating,
    comment: comment?.trim() || null,
  };
}

/**
 * Manages the post-visit rating flow — sets pendingVisit from either a notification tap
 * or a programmatic trigger, then submits or updates the venue_visits row on confirmation.
 * Falls back to inserting a new row when no visitId is available.
 */
export function useVisitRating() {
  const [pendingVisit, setPendingVisit] = useState<PendingVisit | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Listen for notification taps with visit_rating data
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.type === "visit_rating") {
          setPendingVisit({
            visitId: data.visitId as string | undefined,
            venueId: data.venueId as string,
            venueName: data.venueName as string,
            enteredAt: new Date().toISOString(),
            aspects: Array.isArray(data.aspects) ? (data.aspects as string[]) : [],
            source: "server",
          });
        }
      }
    );

    return () => subscription.remove();
  }, []);

  const triggerRating = useCallback((venueId: string, venueName: string, visitId?: string, aspects: string[] = [], source: "server" | "client" = "client") => {
    setPendingVisit({
      visitId,
      venueId,
      venueName,
      enteredAt: new Date().toISOString(),
      aspects,
      source,
    });
  }, []);

  const submitRating = useCallback(
    async (rating: number, comment?: string, aspects: string[] = []) => {
      if (!pendingVisit) return;
      setSubmitting(true);

      try {
        if (pendingVisit.visitId) {
          // Update existing visit record
          const { error } = await supabase
            .from("venue_visits")
            .update({ rating, comment: comment?.trim() || null })
            .eq("id", pendingVisit.visitId);

          if (error) {
            console.warn("[visit-rating] failed to update:", error.message);
          }
          if (aspects.length > 0) {
            await (supabase as any).from("visit_rating_aspects").upsert(
              aspects.map((aspect) => ({ visit_id: pendingVisit.visitId, aspect_key: aspect })),
              { onConflict: "visit_id,aspect_key" }
            );
          }
        } else {
          // Fallback: insert a new record if we don't have a visitId
          const { data: auth } = await supabase.auth.getUser();
          if (!auth.user) return;
          const { error } = await supabase.from("venue_visits").insert({
            user_id: auth.user.id,
            venue_id: pendingVisit.venueId,
            entered_at: pendingVisit.enteredAt,
            rating,
            comment: comment?.trim() || null,
          });

          if (error) {
            console.warn("[visit-rating] failed to insert:", error.message);
          }
        }
      } finally {
        setSubmitting(false);
        setPendingVisit(null);
      }
    },
    [pendingVisit]
  );

  const dismissRating = useCallback(() => {
    setPendingVisit(null);
  }, []);

  return {
    pendingVisit,
    triggerRating,
    submitRating,
    dismissRating,
    submitting,
  };
}
