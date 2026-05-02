// src/hooks/useVisitTracker.ts
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { distanceMiles } from "../utils/location";

const BACKGROUND_LOCATION_TASK = "happitime-visit-tracking";
const PROXIMITY_MILES = 0.025; // ~40 m — triggers auto check-in + starts dwell timer
const DWELL_TIME_MS = 30 * 60 * 1000; // 30 minutes → rating prompt
const NOTIFICATION_MILES = 2.5; // ~5-min drive → happy-hour proximity ping
const NOTIFICATION_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between pings per venue
const AUTO_CHECKIN_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours between auto check-ins per venue
const HH_NOTIFY_CATEGORY = "happy_hour_nearby";

const EN_SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type HappyHourWindowSlice = {
  dow: number[];
  start_time: string; // "HH:MM:SS" or "HH:MM"
  end_time: string;
};

export type VenuePoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isPremium?: boolean;
  timezone?: string;
  happyHourWindows?: HappyHourWindowSlice[];
  serverRatingPromptsEnabled?: boolean;
};

type ProximityState = {
  venueId: string;
  venueName: string;
  enteredAt: number;
} | null;

// Module-level state accessible from TaskManager background callback
let _venues: VenuePoint[] = [];
let _proximityState: ProximityState = null;
let _userId: string | null = null;
let _onVisitDetected: ((venueId: string, venueName: string, visitId?: string) => void) | null = null;
let _notifiedVenues = new Map<string, number>(); // venueId → last-notified timestamp
let _autoCheckedInVenues = new Map<string, number>(); // venueId → last auto check-in timestamp
let _notificationBlocks = new Set<string>(); // venueId
let _blocksLoadedFor: string | null = null;
let _defaultCheckinPrivacy: "private" | "friends" = "private";

/* ── Helpers ──────────────────────────────────────────────────── */

function isHappyHourActive(
  windows: HappyHourWindowSlice[],
  timezone?: string
): boolean {
  const now = new Date();
  let dow: number;
  let timeStr: string;

  if (timezone) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const wdName = parts.find((p) => p.type === "weekday")?.value ?? "";
    dow = EN_SHORT_DAYS.indexOf(wdName);
    if (dow === -1) dow = now.getDay();
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    timeStr = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  } else {
    dow = now.getDay();
    timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  return windows.some(
    (w) =>
      w.dow.map(Number).includes(dow) &&
      timeStr >= w.start_time.substring(0, 5) &&
      timeStr <= w.end_time.substring(0, 5)
  );
}

/* ── DB / notification actions ────────────────────────────────── */

async function loadNotificationBlocks(userId: string) {
  const { data } = await (supabase as any)
    .from("user_venue_notification_blocks")
    .select("venue_id")
    .eq("user_id", userId);

  if (data) {
    for (const row of data as { venue_id: string }[]) {
      _notificationBlocks.add(row.venue_id);
    }
  }
}


async function loadCheckinPrivacyPreference(userId: string) {
  const { data } = await (supabase as any)
    .from("user_preferences")
    .select("checkin_default_privacy")
    .eq("user_id", userId)
    .maybeSingle();

  const pref = data?.checkin_default_privacy;
  _defaultCheckinPrivacy = pref === "public" ? "public" : "private";
}
async function registerAutoCheckIn(userId: string, venueId: string, venueName: string) {
  const { error } = await (supabase as any)
    .from("venue_visits")
    .insert({
      user_id: userId,
      venue_id: venueId,
      entered_at: new Date().toISOString(),
      source: "auto_proximity",
      is_private: _defaultCheckinPrivacy !== "friends",
    });

  if (error) {
    console.warn("[visit-tracker] auto check-in failed:", error.message);
  } else {
    console.log("[visit-tracker] auto check-in recorded for", venueName);
  }
}

async function registerVisit(userId: string, venueId: string, venueName: string) {
  const { data, error } = await (supabase as any)
    .from("venue_visits")
    .insert({
      user_id: userId,
      venue_id: venueId,
      entered_at: new Date().toISOString(),
      source: "dwell",
      is_private: _defaultCheckinPrivacy !== "friends",
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[visit-tracker] failed to register visit:", error.message);
    return null;
  }

  return data?.id ?? null;
}

async function sendHappyHourNotification(venue: VenuePoint) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `Happy hour at ${venue.name}`,
      body: "You're nearby — swing by for happy hour deals!",
      categoryIdentifier: HH_NOTIFY_CATEGORY,
      data: { type: "happy_hour_nearby", venueId: venue.id, venueName: venue.name },
    },
    trigger: null,
  });
}

async function blockVenueNotification(userId: string, venueId: string) {
  _notificationBlocks.add(venueId);
  const { error } = await (supabase as any)
    .from("user_venue_notification_blocks")
    .upsert({ user_id: userId, venue_id: venueId });
  if (error) {
    console.warn("[visit-tracker] failed to save notification block:", error.message);
  }
}

/* ── Core location handler ────────────────────────────────────── */

function handleLocationUpdate(locations: Location.LocationObject[]) {
  if (_venues.length === 0 || !_userId) return;

  const latest = locations[locations.length - 1];
  if (!latest) return;

  const { latitude, longitude } = latest.coords;
  const now = Date.now();

  // ── Happy-hour proximity notification (2.5-mile ring, premium venues) ──
  for (const venue of _venues) {
    if (!venue.isPremium || !venue.happyHourWindows?.length) continue;
    const dist = distanceMiles(latitude, longitude, venue.lat, venue.lng);
    if (dist > NOTIFICATION_MILES) continue;
    if (_notificationBlocks.has(venue.id)) continue;
    const lastNotified = _notifiedVenues.get(venue.id) ?? 0;
    if (now - lastNotified < NOTIFICATION_COOLDOWN_MS) continue;
    if (!isHappyHourActive(venue.happyHourWindows, venue.timezone)) continue;

    _notifiedVenues.set(venue.id, now);
    void sendHappyHourNotification(venue);
  }

  // ── Proximity check-in + dwell tracking (0.025-mile ring) ──
  let nearestVenue: VenuePoint | null = null;
  let nearestDist = Infinity;

  for (const venue of _venues) {
    const dist = distanceMiles(latitude, longitude, venue.lat, venue.lng);
    if (dist <= PROXIMITY_MILES && dist < nearestDist) {
      nearestDist = dist;
      nearestVenue = venue;
    }
  }

  if (nearestVenue) {
    if (_proximityState && _proximityState.venueId === nearestVenue.id) {
      // Still near the same venue — check dwell time for rating prompt
      const elapsed = now - _proximityState.enteredAt;
      if (elapsed >= DWELL_TIME_MS) {
        const { venueId, venueName } = _proximityState;
        _proximityState = null;
        const visitIdPromise = registerVisit(_userId!, venueId, venueName);
        if (_onVisitDetected && !nearestVenue.serverRatingPromptsEnabled) {
          void visitIdPromise.then((visitId) => _onVisitDetected?.(venueId, venueName, visitId ?? undefined));
        }
      }
    } else {
      // Entered range of a new venue — start dwell timer + fire immediate auto check-in
      _proximityState = {
        venueId: nearestVenue.id,
        venueName: nearestVenue.name,
        enteredAt: now,
      };

      const lastCheckedIn = _autoCheckedInVenues.get(nearestVenue.id) ?? 0;
      if (now - lastCheckedIn >= AUTO_CHECKIN_COOLDOWN_MS) {
        _autoCheckedInVenues.set(nearestVenue.id, now);
        void registerAutoCheckIn(_userId!, nearestVenue.id, nearestVenue.name);
      }
    }
  } else {
    _proximityState = null;
  }
}

// Register the background task (must be called at module level)
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn("[visit-tracker] background task error:", error.message);
    return;
  }
  const { locations } = data as { locations: Location.LocationObject[] };
  if (locations) {
    handleLocationUpdate(locations);
  }
});

/* ── Hook ─────────────────────────────────────────────────────── */

export function useVisitTracker(venues: VenuePoint[]) {
  const { user } = useCurrentUser();
  const [isTracking, setIsTracking] = useState(false);
  const onVisitDetectedRef = useRef<((venueId: string, venueName: string, visitId?: string) => void) | null>(null);

  useEffect(() => {
    _venues = venues;
  }, [venues]);

  useEffect(() => {
    _defaultCheckinPrivacy = "private";
    const userId = user?.id;
    if (!userId) return;
    void (async () => {
      const { data } = await (supabase as any)
        .from("user_preferences")
        .select("default_checkin_privacy")
        .eq("user_id", userId)
        .maybeSingle();
      _defaultCheckinPrivacy = data?.default_checkin_privacy === "friends" ? "friends" : "private";
    })();
  }, [user?.id]);

  useEffect(() => {
    const newId = user?.id ?? null;
    _userId = newId;
    if (!newId) {
      _blocksLoadedFor = null;
      _notificationBlocks.clear();
    } else if (newId !== _blocksLoadedFor) {
      _blocksLoadedFor = newId;
      _notificationBlocks.clear();
      void loadNotificationBlocks(newId);
    }
  }, [user?.id]);

  useEffect(() => {
    _onVisitDetected = onVisitDetectedRef.current;
  });

  // Notification category for "Stop notifying me" action button
  useEffect(() => {
    void Notifications.setNotificationCategoryAsync(HH_NOTIFY_CATEGORY, [
      {
        identifier: "block_venue",
        buttonTitle: "Stop notifying me",
        options: { isDestructive: false, isAuthenticationRequired: false },
      },
    ]);
  }, []);

  // Handle block action from notification
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (
        response.notification.request.content.categoryIdentifier === HH_NOTIFY_CATEGORY &&
        response.actionIdentifier === "block_venue"
      ) {
        const venueId = response.notification.request.content.data?.venueId as string | undefined;
        if (venueId && _userId) {
          void blockVenueNotification(_userId, venueId);
        }
      }
    });
    return () => sub.remove();
  }, []);

  const startTracking = useCallback(async () => {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      console.warn("[visit-tracker] foreground location permission denied");
      return;
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted") {
      console.warn("[visit-tracker] background location permission denied");
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (!isRegistered) {
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 60_000,
        distanceInterval: 20,
        deferredUpdatesInterval: 60_000,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: "HappiTime",
          notificationBody: "Tracking visits nearby",
          notificationColor: "#C8965A",
        },
      });
    }

    setIsTracking(true);
  }, []);

  const stopTracking = useCallback(async () => {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
    _proximityState = null;
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      // Background task persists — don't stop on unmount
    };
  }, []);

  return {
    startTracking,
    stopTracking,
    isTracking,
    setOnVisitDetected: (cb: (venueId: string, venueName: string, visitId?: string) => void) => {
      onVisitDetectedRef.current = cb;
      _onVisitDetected = cb;
    },
  };
}
