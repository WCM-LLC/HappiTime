// src/hooks/useVisitRating.ts
import { useCallback, useEffect, useState } from "react";
import * as Notifications from "expo-notifications";
import { supabase } from "../api/supabaseClient";

export type PendingVisit = {
  visitId?: string;
  venueId: string;
  venueName: string;
  visitedAt: string;
};

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
            visitedAt: new Date().toISOString(),
          });
        }
      }
    );

    return () => subscription.remove();
  }, []);

  const triggerRating = useCallback((venueId: string, venueName: string, visitId?: string) => {
    setPendingVisit({
      visitId,
      venueId,
      venueName,
      visitedAt: new Date().toISOString(),
    });
  }, []);

  const submitRating = useCallback(
    async (rating: number, comment?: string) => {
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
        } else {
          // Fallback: insert a new record if we don't have a visitId
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) return;
          const { error } = await supabase.from("venue_visits").insert({
            user_id: authUser.id,
            venue_id: pendingVisit.venueId,
            entered_at: pendingVisit.visitedAt,
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
