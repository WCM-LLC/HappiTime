// src/hooks/useUserLocation.ts
import { useEffect, useState } from "react";
import * as Location from "expo-location";

type Coords = {
  lat: number;
  lng: number;
};

export function useUserLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== "granted") {
          if (!cancelled) {
            setError("Location permission not granted.");
          }
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });

        if (!cancelled) {
          setCoords({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Unable to determine location.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { coords, error, loading };
}
