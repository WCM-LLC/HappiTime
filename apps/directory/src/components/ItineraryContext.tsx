"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

type ItineraryItem = {
  venueId: string;
  venueName: string;
  venueSlug: string;
  neighborhoodSlug: string;
  addedAt: string;
};

type ItineraryContextValue = {
  items: ItineraryItem[];
  add: (item: Omit<ItineraryItem, "addedAt">) => void;
  remove: (venueId: string) => void;
  has: (venueId: string) => boolean;
  clear: () => void;
  count: number;
};

const STORAGE_KEY = "happitime_itinerary";

const ItineraryContext = createContext<ItineraryContextValue>({
  items: [],
  add: () => {},
  remove: () => {},
  has: () => false,
  clear: () => {},
  count: 0,
});

export function ItineraryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items, loaded]);

  const add = useCallback(
    (item: Omit<ItineraryItem, "addedAt">) => {
      setItems((prev) => {
        if (prev.some((i) => i.venueId === item.venueId)) return prev;
        return [...prev, { ...item, addedAt: new Date().toISOString() }];
      });
    },
    []
  );

  const remove = useCallback((venueId: string) => {
    setItems((prev) => prev.filter((i) => i.venueId !== venueId));
  }, []);

  const has = useCallback(
    (venueId: string) => items.some((i) => i.venueId === venueId),
    [items]
  );

  const clear = useCallback(() => setItems([]), []);

  return (
    <ItineraryContext.Provider
      value={{ items, add, remove, has, clear, count: items.length }}
    >
      {children}
    </ItineraryContext.Provider>
  );
}

export function useItinerary() {
  return useContext(ItineraryContext);
}
