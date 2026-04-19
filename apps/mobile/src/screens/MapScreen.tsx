// src/screens/MapScreen.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Platform,
} from "react-native";
import MapView, { Marker, Callout, Region } from "react-native-maps";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useHappyHours, type HappyHourWindow } from "../hooks/useHappyHours";
import { useUserLocation } from "../hooks/useUserLocation";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useUserFollowedVenues } from "../hooks/useUserFollowedVenues";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { getHappyHourDisplayNames } from "../utils/happyHourDisplay";
import { formatTimeRange } from "../utils/formatters";

const formatPriceTier = (tier?: number | null) =>
  typeof tier === "number" && tier > 0 ? "$".repeat(tier) : null;

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
  const [selectedWindow, setSelectedWindow] = useState<HappyHourWindow | null>(
    null
  );

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

  // Cuisines for filter chips
  const cuisineOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of mappableWindows) {
      for (const tag of w.venue?.tags ?? []) {
        set.add(tag.replace(/[_-]+/g, " ").trim().toLowerCase());
      }
    }
    const sorted = Array.from(set).sort();
    return sorted.length > 0 ? ["all", ...sorted.slice(0, 8)] : ["all"];
  }, [mappableWindows]);

  // Apply search + cuisine filter
  const filtered = useMemo(() => {
    let list = mappableWindows;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((w) => {
        const name = (w.venue?.name ?? "").toLowerCase();
        const address = (w.venue?.address ?? "").toLowerCase();
        const neighborhood = (w.venue?.neighborhood ?? "").toLowerCase();
        return name.includes(q) || address.includes(q) || neighborhood.includes(q);
      });
    }

    if (selectedCuisine !== "all") {
      list = list.filter((w) =>
        (w.venue?.tags ?? [])
          .map((t: string) => t.replace(/[_-]+/g, " ").trim().toLowerCase())
          .includes(selectedCuisine)
      );
    }

    return list;
  }, [mappableWindows, query, selectedCuisine]);

  const handleMarkerPress = (window: HappyHourWindow) => {
    setSelectedWindow(window);
  };

  const handleCardPress = () => {
    if (!selectedWindow) return;
    navigation.navigate("HappyHourDetail", { windowId: selectedWindow.id });
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
        onPress={() => setSelectedWindow(null)}
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
            onChangeText={setQuery}
            placeholder="Search venues"
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <IconSymbol name="xmark.circle.fill" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {cuisineOptions.map((option) => {
            const selected = selectedCuisine === option;
            const label =
              option === "all"
                ? "All"
                : option
                    .split(/\s+/)
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ");
            return (
              <Pressable
                key={option}
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

      {/* Selected venue card */}
      {selectedWindow && (
        <VenueCalloutCard
          window={selectedWindow}
          isFavorite={isFollowing(
            selectedWindow.venue_id ?? selectedWindow.venue?.id ?? null
          )}
          onToggleFavorite={() => {
            const venueId =
              selectedWindow.venue_id ?? selectedWindow.venue?.id ?? null;
            if (venueId) toggleFollow(venueId);
          }}
          onPress={handleCardPress}
          width={width}
        />
      )}
    </View>
  );
};

type VenueCalloutCardProps = {
  window: HappyHourWindow;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onPress: () => void;
  width: number;
};

const VenueCalloutCard: React.FC<VenueCalloutCardProps> = ({
  window,
  isFavorite,
  onToggleFavorite,
  onPress,
  width,
}) => {
  const { titleText, subtitleText } = getHappyHourDisplayNames(window);
  const venue = window.venue;
  const priceTier = formatPriceTier(venue?.price_tier);
  const ratingRaw = venue?.rating ?? null;
  const rating = Number.isFinite(Number(ratingRaw)) ? Number(ratingRaw) : null;
  const timeText = formatTimeRange(
    (window as any).start_time ?? null,
    (window as any).end_time ?? null
  );
  const address = venue?.address ?? null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.calloutCard,
        { width: width - spacing.lg * 2 },
        pressed && styles.calloutCardPressed,
      ]}
    >
      <View style={styles.calloutHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.calloutTitle} numberOfLines={1}>
            {titleText}
          </Text>
          {subtitleText && (
            <Text style={styles.calloutSubtitle} numberOfLines={1}>
              {subtitleText}
            </Text>
          )}
        </View>
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          hitSlop={10}
          style={({ pressed }) => [
            styles.calloutHeart,
            pressed && { opacity: 0.6 },
          ]}
        >
          <IconSymbol
            name={isFavorite ? "heart.fill" : "heart"}
            size={22}
            color={isFavorite ? colors.primary : colors.textMutedLight}
          />
        </Pressable>
      </View>

      <View style={styles.calloutMeta}>
        {rating != null && (
          <View style={styles.calloutMetaItem}>
            <IconSymbol name="star.fill" size={12} color={colors.primary} />
            <Text style={styles.calloutMetaText}>{rating.toFixed(1)}</Text>
          </View>
        )}
        {priceTier && (
          <Text style={styles.calloutMetaText}>{priceTier}</Text>
        )}
        {timeText && (
          <Text style={styles.calloutMetaText}>{timeText}</Text>
        )}
      </View>

      {address && (
        <Text style={styles.calloutAddress} numberOfLines={1}>
          {address}
        </Text>
      )}

      <View style={styles.calloutFooter}>
        <Text style={styles.calloutCta}>View details</Text>
        <IconSymbol name="chevron.right" size={12} color={colors.primary} />
      </View>
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
  chipRow: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
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
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
  },
  chipTextSelected: {
    fontSize: 13,
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

  // Callout card
  calloutCard: {
    position: "absolute",
    bottom: spacing.xl + 20,
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 6,
  },
  calloutCardPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.99 }],
  },
  calloutHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.xs,
  },
  calloutTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.2,
  },
  calloutSubtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textMuted,
    marginTop: 2,
  },
  calloutHeart: {
    padding: 4,
    marginLeft: spacing.sm,
  },
  calloutMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  calloutMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  calloutMetaText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textMuted,
  },
  calloutAddress: {
    fontSize: 12,
    color: colors.textMutedLight,
    marginBottom: spacing.sm,
  },
  calloutFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  calloutCta: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary,
  },
});
