// src/hooks/useVisitTracker.ts
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { supabase } from "../api/supabaseClient";
import { useCurrentUser } from "./useCurrentUser";
import { distanceMiles } from "../utils/location";

const BACKGROUND_LOCATION_TASK = "happitime-visit-tracking";
const PROXIMITY_MILES = 0.025; // ~40 meters
const DWELL_TIME_MS = 30 * 60 * 1000; // 30 minutes

export type VenuePoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

type ProximityState = {
  venueId: string;
  venueName: string;
  enteredAt: number; // Date.now()
} | null;

// Module-level state so the TaskManager callback can access it
let _venues: VenuePoint[] = [];
let _proximityState: ProximityState = null;
let _userId: string | null = null;
let _onVisitDetected: ((venueId: string, venueName: string) => void) | null = null;

async function registerVisit(userId: string, venueId: string, venueName: string) {
  const { data, error } = await supabase
    .from("venue_visits")
    .insert({
      user_id: userId,
      venue_id: venueId,
      visited_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[visit-tracker] failed to register visit:", error.message);
    return null;
  }

  // Send local notification
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Did you visit " + venueName + "?",
      body: "Rate your experience!",
      data: { type: "visit_rating", venueId, venueName, visitId: data?.id },
    },
    trigger: null, // send immediately
  });

  return data?.id ?? null;
}

function handleLocationUpdate(locations: Location.LocationObject[]) {
  if (_venues.length === 0 || !_userId) return;

  const latest = locations[locations.length - 1];
  if (!latest) return;

  const { latitude, longitude } = latest.coords;

  // Find nearest venue within range
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
      // Still near the same venue — check dwell time
      const elapsed = Date.now() - _proximityState.enteredAt;
      if (elapsed >= DWELL_TIME_MS) {
        // Visit detected!
        const venueId = _proximityState.venueId;
        const venueName = _proximityState.venueName;
        _proximityState = null; // reset so we don't fire again
        void registerVisit(_userId!, venueId, venueName);
        if (_onVisitDetected) _onVisitDetected(venueId, venueName);
      }
    } else {
      // Entered range of a new venue
      _proximityState = {
        venueId: nearestVenue.id,
        venueName: nearestVenue.name,
        enteredAt: Date.now(),
      };
    }
  } else {
    // Left range — reset
    _proximityState = null;
  }
}

// Register the background task
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

export function useVisitTracker(venues: VenuePoint[]) {
  const { user } = useCurrentUser();
  const [isTracking, setIsTracking] = useState(false);
  const onVisitDetectedRef = useRef<((venueId: string, venueName: string) => void) | null>(null);

  // Keep module-level state synced
  useEffect(() => {
    _venues = venues;
  }, [venues]);

  useEffect(() => {
    _userId = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    _onVisitDetected = onVisitDetectedRef.current;
  });

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
        timeInterval: 60_000, // check every 60 seconds
        distanceInterval: 20, // or every 20 meters
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't stop tracking on unmount — it should persist in background
    };
  }, []);

  return {
    startTracking,
    stopTracking,
    isTracking,
    setOnVisitDetected: (cb: (venueId: string, venueName: string) => void) => {
      onVisitDetectedRef.current = cb;
      _onVisitDetected = cb;
    },
  };
}
