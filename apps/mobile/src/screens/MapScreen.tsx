// src/screens/MapScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  Platform,
  Linking,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../api/supabaseClient";
import type { ItineraryMapVenue } from "../navigation/types";
import { useHappyHours, type HappyHourWindow } from "../hooks/useHappyHours";
import { useUserLocation } from "../hooks/useUserLocation";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useVenueCovers } from "../hooks/useVenueCovers";
import { SearchableOptionSheet } from "../components/SearchableOptionSheet";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { SocialIcon } from "../../components/ui/SocialIcon";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { getHappyHourDisplayNames } from "../utils/happyHourDisplay";
import { formatTimeRange } from "../utils/formatters";

const formatPriceTier = (tier?: number | null) =>
  typeof tier === "number" && tier > 0 ? "$".repeat(tier) : null;

const getPriceTier = (w: HappyHourWindow) => {
  const tier = w.venue?.price_tier;
  return typeof tier === "number" && tier > 0 ? tier : null;
};

const normalizeCuisine = (value: string) =>
  value.replace(/[_-]+/g, " ").trim().toLowerCase();

const formatTagLabel = (tag: string) =>
  tag
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const DEFAULT_REGION: Region = {
  latitude: 39.0997,
  longitude: -94.5786,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const EMPTY_ITINERARY_VENUE_IDS: string[] = [];
const EMPTY_ITINERARY_VENUES: ItineraryMapVenue[] = [];
const DIRECT_VENUE_SEARCH_LIMIT = 20;
const ITINERARY_EDGE_PADDING = {
  top: 180,
  right: 48,
  bottom: 240,
  left: 48,
};

const getWindowVenueId = (window: HappyHourWindow) =>
  window.venue?.id ?? window.venue_id ?? null;

const hasVenueCoordinates = (window: HappyHourWindow) =>
  window.venue?.lat != null && window.venue?.lng != null;

const toNullableCoordinate = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeMapVenue = (venue: ItineraryMapVenue): ItineraryMapVenue => {
  return {
    ...venue,
    lat: toNullableCoordinate(venue.lat),
    lng: toNullableCoordinate(venue.lng),
    tags: Array.isArray(venue.tags) ? venue.tags : [],
  };
};

const createVenueWindow = (venueInput: ItineraryMapVenue): HappyHourWindow => {
  const venue = normalizeMapVenue(venueInput);
  return ({
    id: `venue-${venue.id}`,
    venue_id: venue.id,
    name: venue.name,
    venue_name: venue.name,
    organization_name: venue.org_name,
    orgName: venue.org_name,
    dow: [],
    start_time: null,
    end_time: null,
    status: "published",
    offers: [],
    venue,
  }) as unknown as HappyHourWindow;
};

const getWindowSearchText = (window: HappyHourWindow) => {
  const venue = window.venue;
  return [
    venue?.name,
    window.venue_name,
    venue?.org_name,
    window.organization_name,
    window.orgName,
    venue?.address,
    venue?.neighborhood,
    venue?.city,
    venue?.state,
    (venue?.tags ?? []).join(" "),
    (venue as any)?.cuisine_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const normalizeSearchValue = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const compactSearchValue = (value: string) =>
  normalizeSearchValue(value).replace(/\s+/g, "");

const getSearchTerms = (query: string) =>
  query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

const windowMatchesSearchTerms = (window: HappyHourWindow, terms: string[]) => {
  const rawSearchText = getWindowSearchText(window);
  const normalizedSearchText = normalizeSearchValue(rawSearchText);
  const compactSearchText = compactSearchValue(rawSearchText);

  return terms.every((term) => {
    const normalizedTerm = normalizeSearchValue(term);
    const compactTerm = compactSearchValue(term);
    if (!normalizedTerm) return true;
    if (
      rawSearchText.includes(term) ||
      normalizedSearchText.includes(normalizedTerm) ||
      compactSearchText.includes(compactTerm)
    ) {
      return true;
    }
    if (normalizedTerm === "bbq") {
      return (
        normalizedSearchText.includes("bar b q") ||
        normalizedSearchText.includes("barbecue") ||
        normalizedSearchText.includes("barbeque") ||
        compactSearchText.includes("barbq")
      );
    }
    return false;
  });
};

const getVenueSearchNeedles = (query: string) => {
  const terms = getSearchTerms(query)
    .map(normalizeSearchValue)
    .filter((term) => term.length >= 2);
  const needles = terms.flatMap((term) =>
    term === "bbq" ? ["bbq", "bar-b-q", "barbeque", "barbecue", "bar"] : [term]
  );
  return Array.from(new Set(needles)).slice(0, 4);
};

const buildVenueSearchFilter = (needles: string[]) => {
  const fields = ["name", "org_name", "address", "neighborhood", "city", "slug"];
  return needles
    .flatMap((needle) =>
      fields.map((field) => `${field}.ilike.%${needle.replace(/[%*,]/g, "")}%`)
    )
    .join(",");
};

export const MapScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { data } = useHappyHours();
  const { coords } = useUserLocation();
  const { preferences } = useUserPreferences();
  const mapRef = useRef<MapView>(null);

  const [query, setQuery] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState("all");
  const [selectedPrice, setSelectedPrice] = useState<number | "all">("all");
  const [selectedWindow, setSelectedWindow] = useState<HappyHourWindow | null>(
    null
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fetchedItineraryVenues, setFetchedItineraryVenues] = useState<ItineraryMapVenue[]>([]);
  const [searchedVenues, setSearchedVenues] = useState<ItineraryMapVenue[]>([]);

  const todayIndex = new Date().getDay();
  const selectedWindowId = selectedWindow?.id;
  const itineraryVenueIds: string[] = Array.isArray(route.params?.itineraryVenueIds)
    ? route.params.itineraryVenueIds
    : EMPTY_ITINERARY_VENUE_IDS;
  const routeItineraryVenues: ItineraryMapVenue[] = Array.isArray(route.params?.itineraryVenues)
    ? route.params.itineraryVenues
    : EMPTY_ITINERARY_VENUES;
  const itineraryName = route.params?.itineraryName ?? null;
  const itineraryRequestId = route.params?.itineraryRequestId ?? 0;
  const itineraryKey = itineraryVenueIds.join("|");
  const routeItineraryVenueKey = routeItineraryVenues
    .map((venue: ItineraryMapVenue) => `${venue.id}:${venue.lat ?? ""}:${venue.lng ?? ""}`)
    .join("|");
  const itineraryVenueIdSet = useMemo(
    () => new Set(itineraryVenueIds),
    [itineraryVenueIds]
  );
  const directVenueSearchNeedles = useMemo(
    () => getVenueSearchNeedles(query),
    [query]
  );
  const directVenueSearchKey = directVenueSearchNeedles.join("|");
  const hasItineraryFilter = itineraryVenueIdSet.size > 0;
  const combinedItineraryVenues = useMemo(() => {
    const venuesById = new Map<string, ItineraryMapVenue>();
    for (const venue of routeItineraryVenues) {
      venuesById.set(venue.id, normalizeMapVenue(venue));
    }
    for (const venue of fetchedItineraryVenues) {
      venuesById.set(venue.id, normalizeMapVenue(venue));
    }
    return itineraryVenueIds
      .map((id) => venuesById.get(id))
      .filter((venue): venue is ItineraryMapVenue => venue != null);
  }, [fetchedItineraryVenues, itineraryVenueIds, routeItineraryVenues]);
  const missingCoordinateCount = hasItineraryFilter
    ? itineraryVenueIds.length -
      combinedItineraryVenues.filter((venue) => venue.lat != null && venue.lng != null).length
    : 0;

  // Center on user location or home coords or default
  const initialRegion = useMemo<Region>(() => {
    if (coords) {
      return {
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      };
    }
    if (
      preferences.home_lat != null &&
      preferences.home_lng != null
    ) {
      return {
        latitude: preferences.home_lat,
        longitude: preferences.home_lng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
    }
    return DEFAULT_REGION;
  }, [coords, preferences.home_lat, preferences.home_lng]);

  useEffect(() => {
    let mounted = true;

    if (!hasItineraryFilter) {
      setFetchedItineraryVenues([]);
      return;
    }

    setQuery("");
    setSelectedCuisine("all");
    setSelectedPrice("all");
    setSelectedWindow(null);
    setShowSuggestions(false);

    const routeVenueIds = new Set(
      routeItineraryVenues.map((venue: ItineraryMapVenue) => venue.id)
    );
    const missingVenueIds = itineraryVenueIds.filter((id) => !routeVenueIds.has(id));
    if (missingVenueIds.length === 0) {
      setFetchedItineraryVenues([]);
      return;
    }

    const loadItineraryVenues = async () => {
      const { data: venueRows, error } = await (supabase as any)
        .from("venues")
        .select(
          `
          id,
          org_id,
          name,
          org_name,
          address,
          phone,
          website,
          facebook_url,
          instagram_url,
          tiktok_url,
          neighborhood,
          city,
          state,
          zip,
          timezone,
          tags,
          cuisine_type,
          price_tier,
          app_name_preference,
          status,
          created_at,
          updated_at,
          last_confirmed_at,
          lat,
          lng,
          promotion_tier,
          promotion_priority
        `
        )
        .in("id", missingVenueIds);

      if (!mounted) return;
      if (error) {
        console.warn("[MapScreen] itinerary venue lookup failed", error);
        setFetchedItineraryVenues([]);
        return;
      }
      setFetchedItineraryVenues(venueRows ?? []);
    };

    void loadItineraryVenues();

    return () => {
      mounted = false;
    };
  }, [
    hasItineraryFilter,
    itineraryKey,
    itineraryRequestId,
    itineraryVenueIds,
    routeItineraryVenueKey,
    routeItineraryVenues,
  ]);

  useEffect(() => {
    let mounted = true;

    if (hasItineraryFilter || directVenueSearchNeedles.length === 0) {
      setSearchedVenues([]);
      return;
    }

    const loadSearchVenues = async () => {
      const filter = buildVenueSearchFilter(directVenueSearchNeedles);
      if (!filter) {
        setSearchedVenues([]);
        return;
      }

      const { data: venueRows, error } = await (supabase as any)
        .from("venues")
        .select(
          `
          id,
          name,
          org_name,
          address,
          phone,
          website,
          facebook_url,
          instagram_url,
          tiktok_url,
          neighborhood,
          city,
          state,
          zip,
          timezone,
          tags,
          cuisine_type,
          price_tier,
          app_name_preference,
          status,
          lat,
          lng,
          promotion_tier,
          promotion_priority,
          slug
        `
        )
        .or(filter)
        .limit(DIRECT_VENUE_SEARCH_LIMIT);

      if (!mounted) return;
      if (error) {
        console.warn("[MapScreen] venue search lookup failed", error);
        setSearchedVenues([]);
        return;
      }
      setSearchedVenues((venueRows ?? []).map(normalizeMapVenue));
    };

    void loadSearchVenues();

    return () => {
      mounted = false;
    };
  }, [directVenueSearchKey, directVenueSearchNeedles, hasItineraryFilter]);

  // All windows that have geocoded venues
  const mappableWindows = useMemo(() => {
    const happyHourWindows = data.filter(hasVenueCoordinates);
    if (!hasItineraryFilter) {
      if (searchedVenues.length === 0) return happyHourWindows;

      const windows = [...happyHourWindows];
      const seenVenueIds = new Set(
        happyHourWindows
          .map((window) => getWindowVenueId(window))
          .filter((id): id is string => id != null)
      );
      for (const venue of searchedVenues) {
        if (!venue.id || seenVenueIds.has(venue.id) || venue.lat == null || venue.lng == null) {
          continue;
        }
        seenVenueIds.add(venue.id);
        windows.push(createVenueWindow(venue));
      }
      return windows;
    }

    const seenVenueIds = new Set<string>();
    const itineraryWindows: HappyHourWindow[] = [];

    for (const window of happyHourWindows) {
      const venueId = getWindowVenueId(window);
      if (!venueId || !itineraryVenueIdSet.has(venueId) || seenVenueIds.has(venueId)) {
        continue;
      }
      seenVenueIds.add(venueId);
      itineraryWindows.push(window);
    }

    for (const venue of combinedItineraryVenues) {
      if (
        !venue?.id ||
        seenVenueIds.has(venue.id) ||
        venue.lat == null ||
        venue.lng == null
      ) {
        continue;
      }
      seenVenueIds.add(venue.id);
      itineraryWindows.push(createVenueWindow(venue));
    }

    return itineraryWindows.sort((a, b) => {
      const aIndex = itineraryVenueIds.indexOf(getWindowVenueId(a) ?? "");
      const bIndex = itineraryVenueIds.indexOf(getWindowVenueId(b) ?? "");
      return aIndex - bIndex;
    });
  }, [
    combinedItineraryVenues,
    data,
    hasItineraryFilter,
    itineraryVenueIdSet,
    itineraryVenueIds,
    searchedVenues,
  ]);

  // Cuisines for filter chips (dynamically from venue data)
  const cuisineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of mappableWindows) {
      for (const tag of w.venue?.tags ?? []) {
        set.add(normalizeCuisine(tag));
      }
    }
    const sorted = Array.from(set).sort();
    return sorted.length > 0 ? ["all", ...sorted] : ["all"];
  }, [mappableWindows]);

  // Price filter options (dynamically from venue data)
  const priceOptions = useMemo(() => {
    const tiers = new Set<number>();
    for (const w of mappableWindows) {
      const tier = getPriceTier(w);
      if (typeof tier === "number" && tier > 0) {
        tiers.add(tier);
      }
    }
    return ["all" as const, ...Array.from(tiers).sort((a, b) => a - b)];
  }, [mappableWindows]);
  const priceFilterOptions = useMemo(
    () => priceOptions.map((option) => String(option)),
    [priceOptions]
  );

  // Apply search + cuisine + price filter
  const filtered = useMemo(() => {
    let list = mappableWindows;

    if (query.trim()) {
      const terms = getSearchTerms(query);
      list = list.filter((w) => windowMatchesSearchTerms(w, terms));
    }

    if (selectedCuisine !== "all") {
      list = list.filter((w) =>
        (w.venue?.tags ?? [])
          .map((t: string) => normalizeCuisine(t))
          .includes(selectedCuisine)
      );
    }

    if (selectedPrice !== "all") {
      list = list.filter((w) => getPriceTier(w) === selectedPrice);
    }

    return list;
  }, [mappableWindows, query, selectedCuisine, selectedPrice]);

  const itineraryCoordinates = useMemo(() => {
    if (!hasItineraryFilter) return [];
    return filtered
      .map((window) => {
        const lat = window.venue?.lat;
        const lng = window.venue?.lng;
        if (lat == null || lng == null) return null;
        return { latitude: lat, longitude: lng };
      })
      .filter((coord): coord is { latitude: number; longitude: number } => coord != null);
  }, [filtered, hasItineraryFilter]);
  const itineraryCoordinateKey = itineraryCoordinates
    .map((coord) => `${coord.latitude},${coord.longitude}`)
    .join("|");

  useEffect(() => {
    if (!selectedWindowId) return;
    if (!filtered.some((window) => window.id === selectedWindowId)) {
      setSelectedWindow(null);
    }
  }, [filtered, selectedWindowId]);

  useEffect(() => {
    if (!hasItineraryFilter || itineraryCoordinates.length === 0) return;

    const timeout = setTimeout(() => {
      if (!mapRef.current) return;
      if (itineraryCoordinates.length === 1) {
        const coordinate = itineraryCoordinates[0];
        mapRef.current.animateToRegion(
          {
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            latitudeDelta: 0.025,
            longitudeDelta: 0.025,
          },
          400
        );
        return;
      }
      mapRef.current.fitToCoordinates(itineraryCoordinates, {
        edgePadding: ITINERARY_EDGE_PADDING,
        animated: true,
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [hasItineraryFilter, itineraryCoordinateKey, itineraryCoordinates]);

  // Venue IDs for cover images
  const filteredVenueIds = useMemo(
    () => filtered.map((w) => w.venue?.id).filter((id): id is string => !!id),
    [filtered]
  );
  const coverUrls = useVenueCovers(filteredVenueIds);

  // Suggestive search: top 5 matching venue names
  const suggestions = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) return [];
    const terms = getSearchTerms(query);
    const seen = new Set<string>();
    const results: { window: HappyHourWindow; name: string }[] = [];
    for (const w of mappableWindows) {
      const name = w.venue?.name ?? "";
      const key = getWindowVenueId(w) ?? name.toLowerCase();
      if (!windowMatchesSearchTerms(w, terms)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ window: w, name });
      if (results.length >= 5) break;
    }
    return results;
  }, [query, mappableWindows]);

  const handleSuggestionPress = useCallback(
    (suggestion: { window: HappyHourWindow; name: string }) => {
      const w = suggestion.window;
      setQuery(suggestion.name);
      setShowSuggestions(false);
      setSelectedWindow(w);
      const lat = w.venue?.lat;
      const lng = w.venue?.lng;
      if (lat != null && lng != null && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          },
          400
        );
      }
    },
    []
  );

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    setShowSuggestions(true);
  }, []);

  const handleMarkerPress = (window: HappyHourWindow) => {
    setSelectedWindow(window);
  };

  const handleCardPress = () => {
    if (!selectedWindow) return;
    const venueId = selectedWindow.venue_id ?? selectedWindow.venue?.id;
    if (venueId) {
      navigation.navigate("VenuePreview", { venueId });
    } else {
      navigation.navigate("HappyHourDetail", { windowId: selectedWindow.id });
    }
  };

  const handleDismissCard = () => {
    setSelectedWindow(null);
  };

  const handleRecenter = () => {
    if (!coords || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: 0.06,
        longitudeDelta: 0.06,
      },
      400
    );
  };

  const handleViewItineraries = () => {
    navigation.navigate("Favorites", { tab: "lists" });
  };

  const handleClearItinerary = () => {
    navigation.setParams({
      itineraryVenueIds: undefined,
      itineraryVenues: undefined,
      itineraryName: undefined,
      itineraryRequestId: undefined,
    });
  };

  const isToday = (window: HappyHourWindow) => {
    if (!Array.isArray(window.dow)) return false;
    return window.dow.map(Number).includes(todayIndex);
  };

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={(e) => {
          if (e.nativeEvent.action !== "marker-press") {
            setSelectedWindow(null);
            setShowSuggestions(false);
          }
        }}
      >
        {filtered.map((window) => {
          const lat = window.venue?.lat!;
          const lng = window.venue?.lng!;
          const active = isToday(window);

          return (
            <Marker
              key={window.id}
              identifier={window.id}
              coordinate={{ latitude: lat, longitude: lng }}
              pinColor={active ? colors.primary : colors.textMutedLight}
              onPress={(event) => {
                event.stopPropagation();
                handleMarkerPress(window);
              }}
            />
          );
        })}
      </MapView>

      {/* Search overlay */}
      <View style={styles.searchOverlay}>
        <View style={styles.searchBar}>
          <IconSymbol name="magnifyingglass" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={handleQueryChange}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Search venues"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => {
                setQuery("");
                setShowSuggestions(false);
              }}
              hitSlop={8}
            >
              <IconSymbol name="xmark.circle.fill" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Suggestive search dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {suggestions.map((item, index) => (
              <Pressable
                key={`${item.window.id}-${index}`}
                onPress={() => handleSuggestionPress(item)}
                style={({ pressed }) => [
                  styles.suggestionRow,
                  pressed && { backgroundColor: colors.cream },
                  index < suggestions.length - 1 && styles.suggestionBorder,
                ]}
              >
                <IconSymbol name="magnifyingglass" size={12} color={colors.textMutedLight} />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={styles.filterRail}>
          <SearchableOptionSheet
            label="Price"
            value={String(selectedPrice)}
            options={priceFilterOptions}
            onChange={(option) =>
              setSelectedPrice(option === "all" ? "all" : Number(option))
            }
            formatOptionLabel={(option) =>
              option === "all" ? "All" : formatPriceTier(Number(option)) ?? "All"
            }
            searchPlaceholder="Search prices"
            style={styles.filterRailControl}
          />
          <SearchableOptionSheet
            label="Cuisine"
            value={selectedCuisine}
            options={cuisineOptions}
            onChange={setSelectedCuisine}
            formatOptionLabel={(option) => option === "all" ? "All" : formatTagLabel(option)}
            searchPlaceholder="Search cuisines"
            style={styles.filterRailControl}
          />
          <Pressable
            onPress={handleViewItineraries}
            style={({ pressed }) => [
              styles.itineraryFilterButton,
              pressed && { opacity: 0.78 },
            ]}
          >
            <Text style={styles.itineraryFilterLabel} numberOfLines={1}>
              View
            </Text>
            <Text style={styles.itineraryFilterText} numberOfLines={1}>
              Itineraries
            </Text>
          </Pressable>
        </View>

        {hasItineraryFilter ? (
          <View style={styles.itineraryBanner}>
            <Text style={styles.itineraryBannerText} numberOfLines={1}>
              {missingCoordinateCount > 0
                ? `${missingCoordinateCount} venue${missingCoordinateCount === 1 ? "" : "s"} need coordinates`
                : `${itineraryName ?? "Itinerary"} on map`}
            </Text>
            <Pressable onPress={handleClearItinerary} hitSlop={8}>
              <Text style={styles.itineraryBannerClear}>Clear</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.resultCount}>
          {filtered.length} venue{filtered.length === 1 ? "" : "s"}
        </Text>
      </View>

      {/* Recenter button */}
      {coords && (
        <Pressable
          onPress={handleRecenter}
          style={({ pressed }) => [
            styles.recenterButton,
            pressed && styles.recenterButtonPressed,
          ]}
        >
          <IconSymbol name="location.fill" size={18} color={colors.primary} />
        </Pressable>
      )}

      {/* Selected venue — MiniVenueCard */}
      {selectedWindow && (
        <MiniVenueCard
          window={selectedWindow}
          coverUrl={selectedWindow.venue?.id ? coverUrls[selectedWindow.venue.id] ?? null : null}
          todayIndex={todayIndex}
          onPress={handleCardPress}
          onDismiss={handleDismissCard}
        />
      )}
    </View>
  );
};

/* ─────────────────────────── MiniVenueCard ─────────────────────────── */

type MiniVenueCardProps = {
  window: HappyHourWindow;
  coverUrl: string | null;
  todayIndex: number;
  onPress: () => void;
  onDismiss: () => void;
};

const MiniVenueCard: React.FC<MiniVenueCardProps> = ({
  window,
  coverUrl,
  todayIndex,
  onPress,
  onDismiss,
}) => {
  const { titleText } = getHappyHourDisplayNames(window);
  const venue = window.venue as any;
  const priceTier = formatPriceTier(venue?.price_tier);
  const ratingRaw = venue?.rating ?? null;
  const rating = Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;
  const timeText = formatTimeRange(
    (window as any).start_time ?? null,
    (window as any).end_time ?? null
  );
  const cuisine = (venue as any)?.cuisine_type ?? null;
  const activeToday = Array.isArray(window.dow) && window.dow.map(Number).includes(todayIndex);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.miniCard,
        pressed && { opacity: 0.95, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={styles.miniCardContent}>
        {/* Cover image */}
        <View style={styles.miniCardImage}>
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={styles.miniCardImageInner}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.miniCardImagePlaceholder}>
              <IconSymbol name="mappin.circle.fill" size={28} color={colors.brandLight} />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.miniCardInfo}>
          <View style={styles.miniCardTopRow}>
            <Text style={styles.miniCardName} numberOfLines={1}>
              {titleText}
            </Text>
            {activeToday && (
              <View style={styles.miniCardTodayBadge}>
                <Text style={styles.miniCardTodayText}>Today</Text>
              </View>
            )}
          </View>

          {cuisine && (
            <Text style={styles.miniCardCuisine} numberOfLines={1}>
              {cuisine.replace(/[_-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
          )}

          <View style={styles.miniCardMetaRow}>
            {rating != null && (
              <View style={styles.miniCardRating}>
                <IconSymbol name="star.fill" size={11} color={colors.primary} />
                <Text style={styles.miniCardRatingText}>{rating.toFixed(1)}</Text>
              </View>
            )}
            {priceTier && (
              <Text style={styles.miniCardPriceText}>{priceTier}</Text>
            )}
          </View>

          {timeText ? (
            <Text style={styles.miniCardTimeText}>{timeText}</Text>
          ) : null}

          {/* Contact / social icon strip */}
          {(venue?.phone || venue?.website || venue?.facebook_url || venue?.instagram_url || venue?.tiktok_url) && (
            <View style={styles.miniCardLinkRow}>
              {venue?.phone && (
                <Pressable
                  hitSlop={6}
                  onPress={(e) => { e.stopPropagation(); Linking.openURL(`tel:${venue.phone}`).catch(() => {}); }}
                  style={({ pressed }) => [styles.miniCardLinkBtn, pressed && { opacity: 0.6 }]}
                >
                  <IconSymbol name="phone" size={13} color={colors.primary} />
                </Pressable>
              )}
              {venue?.website && (
                <Pressable
                  hitSlop={6}
                  onPress={(e) => { e.stopPropagation(); Linking.openURL(venue.website).catch(() => {}); }}
                  style={({ pressed }) => [styles.miniCardLinkBtn, pressed && { opacity: 0.6 }]}
                >
                  <IconSymbol name="globe" size={13} color={colors.primary} />
                </Pressable>
              )}
              {venue?.facebook_url && (
                <Pressable
                  hitSlop={6}
                  onPress={(e) => { e.stopPropagation(); Linking.openURL(venue.facebook_url).catch(() => {}); }}
                  style={({ pressed }) => [styles.miniCardLinkBtn, pressed && { opacity: 0.6 }]}
                >
                  <SocialIcon platform="facebook" size={13} color={colors.primary} />
                </Pressable>
              )}
              {venue?.instagram_url && (
                <Pressable
                  hitSlop={6}
                  onPress={(e) => { e.stopPropagation(); Linking.openURL(venue.instagram_url).catch(() => {}); }}
                  style={({ pressed }) => [styles.miniCardLinkBtn, pressed && { opacity: 0.6 }]}
                >
                  <SocialIcon platform="instagram" size={13} color={colors.primary} />
                </Pressable>
              )}
              {venue?.tiktok_url && (
                <Pressable
                  hitSlop={6}
                  onPress={(e) => { e.stopPropagation(); Linking.openURL(venue.tiktok_url).catch(() => {}); }}
                  style={({ pressed }) => [styles.miniCardLinkBtn, pressed && { opacity: 0.6 }]}
                >
                  <SocialIcon platform="tiktok" size={13} color={colors.primary} />
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Right arrow */}
        <View style={styles.miniCardArrow}>
          <IconSymbol name="chevron.right" size={14} color={colors.textMutedLight} />
        </View>
      </View>

      {/* Dismiss X */}
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        hitSlop={10}
        style={({ pressed }) => [
          styles.miniCardDismiss,
          pressed && { opacity: 0.6 },
        ]}
      >
        <IconSymbol name="xmark.circle.fill" size={18} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    flex: 1,
  },

  // Search overlay
  searchOverlay: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: spacing.lg,
    right: spacing.lg,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },

  // Suggestions dropdown
  suggestionsContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 5,
    overflow: "hidden",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  suggestionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
  },

  filterRail: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
    zIndex: 30,
  },
  filterRailControl: {
    flex: 1,
  },
  itineraryFilterButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.dark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: "center",
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  itineraryFilterLabel: {
    color: colors.darkMuted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  itineraryFilterText: {
    color: colors.pillActiveText,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  itineraryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderRadius: 14,
    backgroundColor: colors.brandSubtle,
    borderWidth: 1,
    borderColor: colors.brandLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  itineraryBannerText: {
    flex: 1,
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: "800",
  },
  itineraryBannerClear: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  resultCount: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: spacing.xs,
  },

  // Recenter
  recenterButton: {
    position: "absolute",
    right: spacing.lg,
    bottom: 180,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  recenterButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },

  // MiniVenueCard
  miniCard: {
    position: "absolute",
    bottom: 100,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  miniCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  miniCardImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.brandSubtle,
    marginRight: spacing.md,
    flexShrink: 0,
  },
  miniCardImageInner: {
    width: 80,
    height: 80,
  },
  miniCardImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  miniCardInfo: {
    flex: 1,
    justifyContent: "center",
  },
  miniCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: 2,
  },
  miniCardName: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
    letterSpacing: -0.2,
  },
  miniCardTodayBadge: {
    backgroundColor: colors.success,
    borderRadius: 999,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
  },
  miniCardTodayText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  miniCardCuisine: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "500",
    marginBottom: 2,
  },
  miniCardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 2,
  },
  miniCardRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  miniCardRatingText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.brandDark,
  },
  miniCardPriceText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  miniCardTimeText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.primary,
  },
  miniCardLinkRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 5,
  },
  miniCardLinkBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  miniCardArrow: {
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  miniCardDismiss: {
    position: "absolute",
    top: -spacing.xs,
    right: -spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadowSoft,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
});
