"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { VenueWithWindows } from "@/lib/queries";
import type { Neighborhood } from "@/lib/neighborhoods";

// ── Types ──────────────────────────────────────────────────────────────────────

type Filters = {
  neighborhood: string[];
  cuisine: string[];
  amenities: string[];
  drinks: string[];
};

// ── Filter options ─────────────────────────────────────────────────────────────

const CUISINE_OPTS = [
  "American", "BBQ", "Brewpub", "Cocktail Bar", "Craft Beer",
  "Mediterranean", "Mexican", "Sports Bar",
];

const AMENITY_OPTS = [
  "Dog Friendly", "Live Music", "Patio", "Private Events", "Rooftop", "Sports Bar",
];

const DRINK_OPTS = [
  "Craft Cocktails", "Local Beers", "Margaritas", "Non-Alcoholic", "Whiskey Bar", "Wine Bar",
];

// Maps display label → tag keys stored in venue.tags
const AMENITY_TO_TAGS: Record<string, string[]> = {
  "Dog Friendly": ["dog_friendly"],
  "Live Music": ["live_music"],
  "Patio": ["patio"],
  "Private Events": ["private_events"],
  "Rooftop": ["rooftop"],
  "Sports Bar": ["sports_bar_tv", "sports_bar"],
};
const DRINK_TO_TAGS: Record<string, string[]> = {
  "Craft Cocktails": ["cocktails", "craft_cocktails"],
  "Local Beers": ["local_beers", "craft_beer"],
  "Margaritas": ["margaritas"],
  "Non-Alcoholic": ["non_alcoholic", "na_options"],
  "Whiskey Bar": ["whiskey_bar"],
  "Wine Bar": ["wine_bar"],
};

// ── Map styles ─────────────────────────────────────────────────────────────────

const MAP_STYLES = [
  { featureType: "all", elementType: "geometry", stylers: [{ saturation: -25 }, { lightness: 5 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c4d8ea" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#f8f3ee" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#ede8e0" }] },
  { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#ede9e3" }] },
  { featureType: "landscape.natural", elementType: "geometry.fill", stylers: [{ color: "#e4e0d8" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d4e8d0" }, { visibility: "on" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#6b6b6b" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const p = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return m === 0 ? `${hr} ${p}` : `${hr}:${String(m).padStart(2, "0")} ${p}`;
}

function isActiveToday(venue: VenueWithWindows, dow: number): boolean {
  return venue.happy_hour_windows.some((w) => w.dow.includes(dow));
}

function getActiveWindow(venue: VenueWithWindows, dow: number) {
  return venue.happy_hour_windows.find((w) => w.dow.includes(dow)) ?? null;
}

function isOpenNow(venue: VenueWithWindows, now: Date): boolean {
  const dow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return venue.happy_hour_windows.some((w) => {
    if (!w.dow.includes(dow)) return false;
    const [sh, sm] = w.start_time.split(":").map(Number);
    const [eh, em] = w.end_time.split(":").map(Number);
    return nowMin >= sh * 60 + sm && nowMin <= eh * 60 + em;
  });
}

// ── Google Maps loader ─────────────────────────────────────────────────────────

let gmLoaded = false;
const gmCallbacks: Array<() => void> = [];

declare global {
  interface Window {
    __gmReady?: () => void;
  }
}

function useGoogleMaps(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (gmLoaded) {
      setReady(true);
      return;
    }
    const apiKey = process.env.NEXT_PUBLIC_MAPS_API_KEY;
    if (!apiKey) return;

    gmCallbacks.push(() => setReady(true));
    if (document.getElementById("ht-gm-script")) return;

    window.__gmReady = () => {
      gmLoaded = true;
      gmCallbacks.forEach((f) => f());
      gmCallbacks.length = 0;
    };

    const s = document.createElement("script");
    s.id = "ht-gm-script";
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=__gmReady`;
    document.head.appendChild(s);
  }, []);

  return ready;
}

function pinIcon(selected: boolean, active: boolean) {
  const gm = (window as any).google.maps;
  const sz = selected ? 34 : 26;
  const r = selected ? 14 : 10;
  const cr = selected ? 5 : 3.5;
  const fill = selected ? "%23A67842" : "%23C8965A";
  const ring = active
    ? `<circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2"/>`
    : "";
  const outer = selected
    ? `<circle cx="${sz / 2}" cy="${sz / 2}" r="${r + 4}" fill="%23C8965A" opacity=".18"/>`
    : "";
  return {
    url: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}">${outer}<circle cx="${sz / 2}" cy="${sz / 2}" r="${r}" fill="${fill}"/>${ring}<circle cx="${sz / 2}" cy="${sz / 2}" r="${cr}" fill="white"/></svg>`,
    scaledSize: new gm.Size(sz, sz),
    anchor: new gm.Point(sz / 2, sz / 2),
  };
}

// ── MapView ────────────────────────────────────────────────────────────────────

type MapViewProps = {
  filteredVenues: VenueWithWindows[];
  allVenues: VenueWithWindows[];
  selectedId: string | null;
  todayDow: number;
  onSelectPin: (venue: VenueWithWindows) => void;
};

function MapView({ filteredVenues, allVenues, selectedId, todayDow, onSelectPin }: MapViewProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Record<string, any>>({});
  const cbRef = useRef(onSelectPin);
  const gmReady = useGoogleMaps();

  useEffect(() => { cbRef.current = onSelectPin; }, [onSelectPin]);

  useEffect(() => {
    if (!gmReady || !divRef.current || mapRef.current) return;
    const gm = (window as any).google.maps;
    const map = new gm.Map(divRef.current, {
      center: { lat: 39.085, lng: -94.583 },
      zoom: 13,
      styles: MAP_STYLES,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControlOptions: { position: gm.ControlPosition.RIGHT_BOTTOM },
    });
    mapRef.current = map;

    allVenues.forEach((v) => {
      if (v.lat == null || v.lng == null) return;
      const marker = new gm.Marker({
        position: { lat: v.lat, lng: v.lng },
        map,
        icon: pinIcon(false, isActiveToday(v, todayDow)),
        title: v.name,
        zIndex: 1,
      });
      marker.addListener("click", () => cbRef.current(v));
      markersRef.current[v.id] = marker;
    });
  }, [gmReady]);

  useEffect(() => {
    if (!mapRef.current) return;
    const visSet = new Set(filteredVenues.map((v) => v.id));
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      marker.setVisible(visSet.has(id));
      const v = allVenues.find((x) => x.id === id);
      marker.setIcon(pinIcon(id === selectedId, v ? isActiveToday(v, todayDow) : false));
      marker.setZIndex(id === selectedId ? 100 : 1);
    });
  }, [filteredVenues, selectedId]);

  if (!gmReady) {
    const noKey = !process.env.NEXT_PUBLIC_MAPS_API_KEY;
    return (
      <div className="w-full h-full bg-[#D4D9E6] flex items-center justify-center">
        <span className="text-sm text-[#8892A0]">
          {noKey ? "Map unavailable — add NEXT_PUBLIC_MAPS_API_KEY" : "Loading map…"}
        </span>
      </div>
    );
  }

  return <div ref={divRef} className="w-full h-full" />;
}

// ── MapPopup ───────────────────────────────────────────────────────────────────

type MapPopupProps = {
  venue: VenueWithWindows;
  todayDow: number;
  venueHref: string;
  isMobile: boolean;
  onClose: () => void;
};

function MapPopup({ venue, todayDow, venueHref, isMobile, onClose }: MapPopupProps) {
  const active = isActiveToday(venue, todayDow);
  const win = getActiveWindow(venue, todayDow);
  const firstItem = win?.menu_items[0];

  const containerStyle: React.CSSProperties = isMobile
    ? {
        position: "absolute", bottom: 0, left: 0, right: 0,
        borderRadius: "16px 16px 0 0", padding: "18px 16px 24px", zIndex: 20,
      }
    : {
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
        borderRadius: 14, width: 280, padding: "0 0 14px", zIndex: 20,
      };

  return (
    <div
      style={{
        ...containerStyle,
        background: "#FFFFFF",
        border: "1px solid #E8E5E0",
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        overflow: "hidden",
      }}
    >
      {isMobile && (
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#E8E5E0", margin: "0 auto 14px" }} />
      )}

      {/* Desktop-only hero strip */}
      {!isMobile && (
        <div style={{ height: 90, background: "#F5EDE3", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 60%)" }} />
          <button
            onClick={onClose}
            style={{ position: "absolute", top: 7, right: 7, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.3)", border: "none", cursor: "pointer", color: "#fff", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ×
          </button>
          <div style={{ position: "absolute", bottom: 7, left: 10, fontSize: 14, fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
            {venue.name}
          </div>
        </div>
      )}

      <div style={{ padding: isMobile ? 0 : "10px 14px 0" }}>
        {isMobile && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", marginBottom: 2 }}>{venue.name}</div>
              <div style={{ fontSize: 11, color: "#6B6B6B" }}>{venue.address}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 20, lineHeight: 1, marginLeft: 8 }}>×</button>
          </div>
        )}

        {!isMobile && (
          <div style={{ fontSize: 11, color: "#6B6B6B", marginBottom: 8 }}>{venue.address}</div>
        )}

        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          {active ? (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#2D7A4F", background: "#ECFDF5", borderRadius: 999, padding: "2px 9px", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#2D7A4F" }} />
              Active today
            </span>
          ) : (
            <span style={{ fontSize: 11, color: "#9CA3AF", background: "#F5F5F3", borderRadius: 999, padding: "2px 9px" }}>
              Not today
            </span>
          )}
          {venue.rating != null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#C8965A" }}>★ {venue.rating.toFixed(1)}</span>
          )}
          {venue.price_tier != null && (
            <span style={{ fontSize: 12, color: "#6B6B6B" }}>{"$".repeat(venue.price_tier)}</span>
          )}
        </div>

        {win && (
          <div style={{ fontSize: 12, color: "#6B6B6B", marginBottom: 8 }}>
            <span style={{ fontWeight: 600, color: "#1A1A1A" }}>{fmtTime(win.start_time)}–{fmtTime(win.end_time)}</span>
            {firstItem && ` · ${firstItem.name}${firstItem.price != null ? ` $${firstItem.price}` : ""}`}
          </div>
        )}

        {venue.tags.length > 0 && (
          <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
            {venue.tags.slice(0, 3).map((tag) => (
              <span key={tag} style={{ fontSize: 10, color: "#8B6535", background: "#F5EDE3", borderRadius: 999, padding: "2px 7px", fontWeight: 500 }}>
                {tag.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        <a
          href={venueHref}
          style={{ display: "block", width: "100%", background: "#C8965A", color: "#fff", border: "none", borderRadius: 9, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "center", textDecoration: "none" }}
        >
          View Details →
        </a>
      </div>
    </div>
  );
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

type FilterBarProps = {
  filters: Filters;
  setFilters: (fn: (prev: Filters) => Filters) => void;
  openNow: boolean;
  setOpenNow: (fn: (prev: boolean) => boolean) => void;
  search: string;
  setSearch: (s: string) => void;
  count: number;
  neighborhoodNames: string[];
};

function FilterBar({ filters, setFilters, openNow, setOpenNow, search, setSearch, count, neighborhoodNames }: FilterBarProps) {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenCat(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const totalActive =
    Object.values(filters).flat().length + (openNow ? 1 : 0);

  const filterOpts: Record<string, string[]> = {
    neighborhood: neighborhoodNames,
    cuisine: CUISINE_OPTS,
    amenities: AMENITY_OPTS,
    drinks: DRINK_OPTS,
  };

  const cats: [keyof Filters, string][] = [
    ["neighborhood", "Neighborhood"],
    ["cuisine", "Cuisine"],
    ["amenities", "Amenities"],
    ["drinks", "Drinks"],
  ];

  function toggleFilter(cat: keyof Filters, val: string) {
    setFilters((p) => ({
      ...p,
      [cat]: p[cat].includes(val) ? p[cat].filter((v) => v !== val) : [...p[cat], val],
    }));
  }

  function clearAll() {
    setFilters(() => ({ neighborhood: [], cuisine: [], amenities: [], drinks: [] }));
    setOpenNow(() => false);
    setSearch("");
  }

  return (
    <div ref={ref} className="relative z-20 border-b border-border bg-surface flex-shrink-0">
      {/* Search row */}
      <div className="px-3.5 py-2 border-b border-border">
        <div className="flex items-center gap-2 bg-background rounded-[10px] border border-border px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B9B9B" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-3.5-3.5" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search venues, neighborhoods…"
            className="flex-1 border-none outline-none bg-transparent text-sm text-foreground placeholder:text-muted-light font-sans"
          />
          {search && (
            <button onClick={() => setSearch("")} className="bg-none border-none cursor-pointer text-muted-light text-base leading-none p-0">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Filter chips row */}
      <div
        className="flex items-center gap-1.5 px-3.5 py-2 overflow-x-auto"
        style={{ scrollbarWidth: "none" } as React.CSSProperties}
      >
        {cats.map(([cat, label]) => {
          const n = filters[cat].length;
          const isOpen = openCat === cat;
          return (
            <button
              key={cat}
              onClick={() => setOpenCat(isOpen ? null : cat)}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap transition-all duration-150"
              style={{
                border: `1px solid ${n > 0 ? "#C8965A" : "#E8E5E0"}`,
                background: n > 0 ? "#F5EDE3" : "#FFFFFF",
                color: n > 0 ? "#8B6535" : "#1A1A1A",
              }}
            >
              {label}
              {n > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold" style={{ background: "#C8965A" }}>
                  {n}
                </span>
              )}
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points={isOpen ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
              </svg>
            </button>
          );
        })}

        {/* Open Now chip */}
        <button
          onClick={() => setOpenNow((v) => !v)}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer whitespace-nowrap transition-all duration-150"
          style={{
            border: `1px solid ${openNow ? "#2D7A4F" : "#E8E5E0"}`,
            background: openNow ? "#ECFDF5" : "#FFFFFF",
            color: openNow ? "#2D7A4F" : "#1A1A1A",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: openNow ? "#2D7A4F" : "#9B9B9B" }} />
          Open Now
        </button>

        <div className="flex-1 min-w-2" />
        <span className="text-xs text-muted whitespace-nowrap flex-shrink-0 font-medium hidden sm:inline">
          {count} venue{count !== 1 ? "s" : ""}
        </span>
        {totalActive > 0 && (
          <button onClick={clearAll} className="flex-shrink-0 text-xs font-semibold text-brand bg-transparent border-none cursor-pointer whitespace-nowrap">
            Clear all
          </button>
        )}
      </div>

      {/* Dropdown panel */}
      {openCat && (
        <div className="absolute top-full left-3.5 bg-surface rounded-xl border border-border shadow-lg p-3.5 min-w-[220px] z-30">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-xs font-bold text-foreground">
              {cats.find((c) => c[0] === openCat)?.[1]}
            </span>
            {filters[openCat as keyof Filters].length > 0 && (
              <button
                onClick={() => setFilters((p) => ({ ...p, [openCat]: [] }))}
                className="text-[11px] text-brand bg-transparent border-none cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {filterOpts[openCat].map((opt) => {
              const on = filters[openCat as keyof Filters].includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => toggleFilter(openCat as keyof Filters, opt)}
                  className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all duration-150"
                  style={{
                    border: `1px solid ${on ? "#C8965A" : "#E8E5E0"}`,
                    background: on ? "#1A1A1A" : "#FFFFFF",
                    color: on ? "#FFFFFF" : "#1A1A1A",
                  }}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── VenueRow ──────────────────────────────────────────────────────────────────

type VenueRowProps = {
  venue: VenueWithWindows;
  selected: boolean;
  todayDow: number;
  neighborhoodName: string;
  venueHref: string;
  onSelect: (venue: VenueWithWindows) => void;
  onHover?: (id: string | null) => void;
};

function VenueRow({ venue, selected, todayDow, neighborhoodName, venueHref, onSelect, onHover }: VenueRowProps) {
  const active = isActiveToday(venue, todayDow);
  const win = getActiveWindow(venue, todayDow);
  const firstItem = win?.menu_items[0];

  const amenityTags = venue.tags.filter((t) =>
    Object.values(AMENITY_TO_TAGS).flat().includes(t)
  );
  const drinkTags = venue.tags.filter((t) =>
    Object.values(DRINK_TO_TAGS).flat().includes(t)
  );

  return (
    <button
      onClick={() => onSelect(venue)}
      onMouseEnter={() => onHover?.(venue.id)}
      onMouseLeave={() => onHover?.(null)}
      className="w-full text-left cursor-pointer block"
      style={{
        background: selected ? "#F5EDE3" : "#FFFFFF",
        borderLeft: `3px solid ${selected ? "#C8965A" : "transparent"}`,
        borderRight: "none",
        borderTop: "none",
        borderBottom: "1px solid #E8E5E0",
        padding: "11px 14px 11px 13px",
        fontFamily: "Inter, sans-serif",
        transition: "background 150ms",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="text-[13px] font-bold overflow-hidden text-ellipsis whitespace-nowrap"
              style={{ color: selected ? "#8B6535" : "#1A1A1A" }}
            >
              {venue.name}
            </span>
            {active && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#2D7A4F" }} />}
          </div>

          <div className="text-[11px] text-muted mb-0.5">
            {neighborhoodName}
            {venue.price_tier != null && ` · ${"$".repeat(venue.price_tier)}`}
            {venue.rating != null && ` · ★ ${venue.rating.toFixed(1)}`}
          </div>

          {win ? (
            <div className="text-[11px] text-muted">
              {fmtTime(win.start_time)}–{fmtTime(win.end_time)}
              {firstItem && (
                <> · <span style={{ color: "#8B6535", fontWeight: 500 }}>{firstItem.name}{firstItem.price != null ? ` $${firstItem.price}` : ""}</span></>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-muted-light">No special today</div>
          )}

          {(amenityTags.length > 0 || drinkTags.length > 0) && (
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {amenityTags.slice(0, 2).map((t) => (
                <span key={t} className="text-[10px] text-muted rounded bg-[#EFECE8] px-1" style={{ padding: "1px 5px" }}>
                  {t.replace(/_/g, " ")}
                </span>
              ))}
              {drinkTags.slice(0, 1).map((t) => (
                <span key={t} className="text-[10px] rounded" style={{ color: "#8B6535", background: "#F5EDE3", padding: "1px 5px" }}>
                  {t.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── KCMapPage ─────────────────────────────────────────────────────────────────

type KCMapPageProps = {
  venues: VenueWithWindows[];
  neighborhoods: Neighborhood[];
  bestNeighborhoodSlugMap: Record<string, string>;
};

export function KCMapPage({ venues, neighborhoods, bestNeighborhoodSlugMap }: KCMapPageProps) {
  const now = new Date();
  const todayDow = now.getDay();

  const [filters, setFilters] = useState<Filters>({
    neighborhood: [], cuisine: [], amenities: [], drinks: [],
  });
  const [openNow, setOpenNow] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  const [isMobile, setIsMobile] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const neighborhoodNames = neighborhoods.map((n) => n.name);

  function getNeighborhoodName(venueId: string): string {
    const slug = bestNeighborhoodSlugMap[venueId];
    return neighborhoods.find((n) => n.slug === slug)?.name ?? "Kansas City";
  }

  function getVenueHref(venue: VenueWithWindows): string {
    const slug = bestNeighborhoodSlugMap[venue.id] ?? "kansas-city";
    return `/kc/${slug}/${venue.slug}/`;
  }

  const filteredVenues = venues.filter((v) => {
    if (
      filters.neighborhood.length &&
      !filters.neighborhood.includes(getNeighborhoodName(v.id))
    ) return false;

    if (filters.cuisine.length) {
      const ct = (v.cuisine_type ?? "").toLowerCase();
      if (!filters.cuisine.some((c) => ct.includes(c.toLowerCase()))) return false;
    }

    if (filters.amenities.length) {
      const hasAll = filters.amenities.every((label) => {
        const keys = AMENITY_TO_TAGS[label] ?? [];
        return v.tags.some((t) => keys.includes(t));
      });
      if (!hasAll) return false;
    }

    if (filters.drinks.length) {
      const hasAny = filters.drinks.some((label) => {
        const keys = DRINK_TO_TAGS[label] ?? [];
        return v.tags.some((t) => keys.includes(t));
      });
      if (!hasAny) return false;
    }

    if (openNow && !isOpenNow(v, now)) return false;

    if (search) {
      const q = search.toLowerCase();
      const hoodName = getNeighborhoodName(v.id).toLowerCase();
      if (
        !v.name.toLowerCase().includes(q) &&
        !v.address.toLowerCase().includes(q) &&
        !hoodName.includes(q)
      ) return false;
    }

    return true;
  });

  const selectedVenue = filteredVenues.find((v) => v.id === selectedId) ?? null;

  const handlePin = useCallback(
    (venue: VenueWithWindows) => {
      setSelectedId((id) => (id === venue.id ? null : venue.id));
    },
    []
  );

  function copyLink() {
    const p = new URLSearchParams();
    if (filters.neighborhood.length) p.set("n", filters.neighborhood.join(","));
    if (filters.cuisine.length) p.set("c", filters.cuisine.join(","));
    if (filters.amenities.length) p.set("a", filters.amenities.join(","));
    if (filters.drinks.length) p.set("d", filters.drinks.join(","));
    if (search) p.set("q", search);
    if (openNow) p.set("open", "1");
    const url = `https://happitime.biz/kc/${p.toString() ? "?" + p.toString() : ""}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const listPanel = (
    <div
      className="overflow-y-auto bg-background"
      style={{
        width: isMobile ? "100%" : 332,
        flexShrink: 0,
        borderRight: isMobile ? "none" : "1px solid #E8E5E0",
      }}
    >
      {!isMobile && (
        <div className="px-3.5 py-2 border-b border-border bg-background">
          <span className="text-xs text-muted font-medium">
            {filteredVenues.length} venue{filteredVenues.length !== 1 ? "s" : ""} found
          </span>
        </div>
      )}
      {filteredVenues.length === 0 ? (
        <div className="p-8 text-center text-muted text-sm">
          No matches — try adjusting your filters.
        </div>
      ) : (
        filteredVenues.map((v) => (
          <VenueRow
            key={v.id}
            venue={v}
            selected={selectedId === v.id}
            todayDow={todayDow}
            neighborhoodName={getNeighborhoodName(v.id)}
            venueHref={getVenueHref(v)}
            onSelect={handlePin}
            onHover={isMobile ? undefined : (id) => { /* hover highlight handled by selectedId */ }}
          />
        ))
      )}
    </div>
  );

  const mapPanel = (
    <div className="flex-1 relative overflow-hidden" style={{ background: "#D4D9E6", minHeight: isMobile ? "100%" : 0 }}>
      <MapView
        filteredVenues={filteredVenues}
        allVenues={venues}
        selectedId={selectedId}
        todayDow={todayDow}
        onSelectPin={handlePin}
      />

      {selectedVenue && (
        <MapPopup
          venue={selectedVenue}
          todayDow={todayDow}
          venueHref={getVenueHref(selectedVenue)}
          isMobile={isMobile}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Map controls */}
      <div
        className="absolute flex flex-col gap-1.5"
        style={{ bottom: isMobile ? 80 : 16, left: 12, position: "absolute" }}
      >
        <button
          onClick={copyLink}
          title="Copy shareable link"
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200"
          style={{
            background: copied ? "#ECFDF5" : "rgba(255,255,255,0.94)",
            border: `1px solid ${copied ? "#2D7A4F" : "#E8E5E0"}`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            cursor: "pointer",
          }}
        >
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2D7A4F" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          )}
        </button>
        {copied && (
          <div
            className="absolute text-white text-[11px] font-semibold whitespace-nowrap rounded-md pointer-events-none"
            style={{ left: 44, bottom: 0, background: "#1A1A1A", padding: "5px 9px" }}
          >
            Link copied!
          </div>
        )}
      </div>

      {/* Desktop legend */}
      {!isMobile && (
        <div
          className="absolute top-3 right-3 rounded-lg text-[11px] text-muted border border-border leading-loose"
          style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)", padding: "8px 12px" }}
        >
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12">
              <circle cx="6" cy="6" r="5" fill="#C8965A" />
              <circle cx="6" cy="6" r="2.5" fill="#fff" />
            </svg>
            Venue
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#2D7A4F" }} />
            Active today
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="flex flex-col overflow-hidden font-sans"
      style={{ height: "calc(100dvh - 65px)" }}
    >
      {/* Desktop title bar */}
      {!isMobile && (
        <div className="px-4 py-2.5 bg-background border-b border-border flex-shrink-0">
          <h1 className="text-lg font-extrabold text-foreground tracking-tight">
            Happy Hours in <span className="text-brand">Kansas City</span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {venues.length} venues across {neighborhoods.length} neighborhoods
          </p>
        </div>
      )}

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        openNow={openNow}
        setOpenNow={setOpenNow}
        search={search}
        setSearch={setSearch}
        count={filteredVenues.length}
        neighborhoodNames={neighborhoodNames}
      />

      {/* Mobile tab switcher */}
      {isMobile && (
        <div className="flex border-b border-border bg-surface flex-shrink-0">
          {(["list", "map"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className="flex-1 py-2.5 bg-transparent border-none cursor-pointer text-sm font-medium capitalize"
              style={{
                borderBottom: `2px solid ${mobileTab === tab ? "#C8965A" : "transparent"}`,
                color: mobileTab === tab ? "#1A1A1A" : "#6B6B6B",
                fontWeight: mobileTab === tab ? 700 : 500,
              }}
            >
              {tab === "list" ? `List (${filteredVenues.length})` : "Map"}
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      {isMobile ? (
        <div className="flex-1 overflow-hidden relative">
          {mobileTab === "list" ? listPanel : mapPanel}
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {listPanel}
          {mapPanel}
        </div>
      )}
    </div>
  );
}
