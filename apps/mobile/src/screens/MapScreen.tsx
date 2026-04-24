// src/screens/MapScreen.tsx
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  useWindowDimensions,
  Platform,
  FlatList,
} from "react-native";
import MapView, { Marker, Callout, Region } from "react-native-maps";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useHappyHours, type HappyHourWindow } from "../hooks/useHappyHours";
import { useUserLocation } from "../hooks/useUserLocation";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useUserFollowedVenues } from "../hooks/useUserFollowedVenues";
import { useVenueCovers } from "../hooks/useVenueCovers";
import { IconSymbol } from "../../components/ui/icon-symbol";
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

export const MapScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data, loading } = useHappyHours();
  const { coords } = useUserLocation();
  const { preferences } = useUserPreferences();
  const { isFollowing, toggleFollow } = useUserFollowedVenues();
  const mapRef = useRef<MapView>(null);
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState("all");
  const [selectedPrice, setSelectedPrice] = useState<number | "all">("all");
  const [selectedWindow, setSelectedWindow] = useState<HappyHourWindow | null>(
    null
  );
  const [showSuggestions, setShowSuggestions] = useState(false);

  const todayIndex = new Date().getDay();

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

  // All windows that have geocoded venues
  const mappableWindows = useMemo(() => {
    return data.filter((w) => {
      const lat = w.venue?.lat;
      const lng = w.venue?.lng;
      return lat != null && lng != null;
    });
  }, [data]);

  // Cuisines for filter chips (dynamically from venue data)
  const cuisineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of mappableWindows) {
      for (const tag of w.venue?.tags ?? []) {
        set.add(normalizeCuisine(tag));
      }
    }
    const sorted = Array.from(set).sort();
    return sorted.length > 0 ? ["all", ...sorted.slice(0, 8)] : ["all"];
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

  // Apply search + cuisine + price filter
  const filtered = useMemo(() => {
    let list = mappableWindows;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((w) => {
        const name = (w.venue?.name ?? "").toLowerCase();
        const address = (w.venue?.address ?? "").toLowerCase();
        const neighborhood = (w.venue?.neighborhood ?? "").toLowerCase();
        const tags = (w.venue?.tags ?? []).join(" ").toLowerCase();
        return name.includes(q) || address.includes(q) || neighborhood.includes(q) || tags.includes(q);
      });
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

  // Venue IDs for cover images
  const filteredVenueIds = useMemo(
    () => filtered.map((w) => w.venue?.id).filter((id): id is string => !!id),
    [filtered]
  );
  const coverUrls = useVenueCovers(filteredVenueIds);

  // Suggestive search: top 5 matching venue names
  const suggestions = useMemo(() => {
    if (!query.trim() || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    const seen = new Set<string>();
    const results: { window: HappyHourWindow; name: string }[] = [];
    for (const w of mappableWindows) {
      const name = w.venue?.name ?? "";
      const key = name.toLowerCase();
      if (!key.includes(q)) continue;
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
        onPress={() => {
          setSelectedWindow(null);
          setShowSuggestions(false);
        }}
      >
        {filtered.map((window) => {
          const lat = window.venue?.lat!;
          const lng = window.venue?.lng!;
          const { titleText } = getHappyHourDisplayNames(window);
          const active = isToday(window);

          return (
            <Marker
              key={window.id}
              coordinate={{ latitude: lat, longitude: lng }}
              pinColor={active ? colors.primary : colors.textMutedLight}
              title={titleText}
              onPress={() => handleMarkerPress(window)}
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

        {/* Price filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {priceOptions.map((option) => {
            const selected = selectedPrice === option;
            const label = option === "all" ? "All" : formatPriceTier(option as number) ?? "All";
            return (
              <Pressable
                key={`price-${option}`}
                onPress={() => setSelectedPrice(option as number | "all")}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={selected ? styles.chipTextSelected : styles.chipText}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Cuisine filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {cuisineOptions.map((option) => {
            const selected = selectedCuisine === option;
            const label = option === "all" ? "All" : formatTagLabel(option);
            return (
              <Pressable
                key={`cuisine-${option}`}
                onPress={() => setSelectedCuisine(option)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text
                  style={selected ? styles.chipTextSelected : styles.chipText}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

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
  const venue = window.venue;
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

  chipRow: {
    paddingTop: spacing.xs,
    paddingBottom: 2,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowSoft,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 2,
    elevation: 2,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
  },
  chipTextSelected: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
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
