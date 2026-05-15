// src/hooks/useUserLocation.ts
import { useEffect, useState } from "react";
import * as Location from "expo-location";

type Coords = {
  lat: number;
  lng: number;
};

type UseUserLocationOptions = {
  requestOnMount?: boolean;
};

export function useUserLocation(options: UseUserLocationOptions = {}) {
  const requestOnMount = options.requestOnMount ?? false;
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(requestOnMount);

  useEffect(() => {
    let cancelled = false;

    if (!requestOnMount) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

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
  }, [requestOnMount]);

  return { coords, error, loading };
}
