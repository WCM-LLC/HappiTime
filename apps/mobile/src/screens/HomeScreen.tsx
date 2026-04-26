// src/screens/HomeScreen.tsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  RefreshControl,
  Pressable,
  useWindowDimensions,
  Image,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useHappyHours, type HappyHourWindow } from "../hooks/useHappyHours";
import { useUserLocation } from "../hooks/useUserLocation";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useUserFollowedVenues } from "../hooks/useUserFollowedVenues";
import { useVenueCovers } from "../hooks/useVenueCovers";
import { getHappyHourDisplayNames } from "../utils/happyHourDisplay";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { distanceMiles } from "../utils/location";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

type CuisineMode = "tags" | "offers";

const formatTagLabel = (tag: string) =>
  tag
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatCuisineLabel = (value: string, mode: CuisineMode) => {
  if (value === "all") return "All";
  if (mode === "offers") {
    if (value === "food") return "Food";
    if (value === "drinks") return "Drinks";
    if (value === "both") return "Both";
  }
  return formatTagLabel(value);
};

const normalizeCuisine = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

const getPlaceCuisines = (window: HappyHourWindow) =>
  (window.venue?.tags ?? []).map(normalizeCuisine).filter(Boolean);

const getVenueName = (window: HappyHourWindow) => {
  const { titleText } = getHappyHourDisplayNames(window);
  return titleText;
};

const getVenueSubtitle = (window: HappyHourWindow): string | null => {
  const { subtitleText } = getHappyHourDisplayNames(window);
  return subtitleText;
};

const formatPriceTier = (tier?: number | null) =>
  typeof tier === "number" && tier > 0 ? "$".repeat(tier) : null;

const getPriceTier = (window: HappyHourWindow) => {
  const tier = window.venue?.price_tier;
  return typeof tier === "number" && tier > 0 ? tier : null;
};

type PromoTier = "featured" | "premium" | "basic" | null;

const getPromoTier = (window: HappyHourWindow): PromoTier => {
  const tier = (window.venue as any)?.promotion_tier;
  if (tier === "featured" || tier === "premium" || tier === "basic") return tier;
  return null;
};

const getPromoPriority = (window: HappyHourWindow): number => {
  return (window.venue as any)?.promotion_priority ?? 0;
};

const promoLabel: Record<string, string> = {
  featured: "Featured",
  premium: "Premium",
  basic: "Promoted",
};


export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const { data, loading, error, refreshing, refresh } = useHappyHours();
  const { coords, error: locationError } = useUserLocation();
  const { preferences, savePreferences } = useUserPreferences();
  const { isFollowing, toggleFollow, savingVenueId } = useUserFollowedVenues();
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState("all");
  const [selectedPrice, setSelectedPrice] = useState<number | "all">("all");
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [cityDraft, setCityDraft] = useState("");

  // GPS coords with fallback to saved home location for sorting/centering
  const effectiveCoords = React.useMemo(() => {
    if (coords) return coords;
    if (preferences.home_lat != null && preferences.home_lng != null) {
      return { lat: preferences.home_lat, lng: preferences.home_lng };
    }
    return null;
  }, [coords, preferences.home_lat, preferences.home_lng]);

  // Apply preference defaults once loaded
  React.useEffect(() => {
    if (preferences.price_tier_min != null) {
      setSelectedPrice(preferences.price_tier_min);
    }
  }, [preferences.price_tier_min]);

  const todayIndex = new Date().getDay();

  const getDowValues = (window: HappyHourWindow) => {
    if (!Array.isArray(window.dow)) return [];
    return window.dow
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  };

  const todaysPlaces = useMemo(() => {
    return data.filter((window) => getDowValues(window).includes(todayIndex));
  }, [data, todayIndex]);

  const withDistance = useMemo(() => {
    return todaysPlaces
      .map((window) => {
        if (typeof window.distance === "number") return window;
        const venueLat = window.venue?.lat ?? null;
        const venueLng = window.venue?.lng ?? null;
        // Venues with no coordinates always sort to the end
        if (venueLat == null || venueLng == null) {
          return { ...window, distance: null };
        }
        if (!effectiveCoords) {
          return { ...window, distance: null };
        }
        return {
          ...window,
          distance: distanceMiles(effectiveCoords.lat, effectiveCoords.lng, venueLat, venueLng)
        };
      })
      .sort((a, b) => {
        // Promoted venues sort first, by priority descending
        const aPrio = getPromoPriority(a);
        const bPrio = getPromoPriority(b);
        if (aPrio !== bPrio) return bPrio - aPrio;
        // Then by distance
        if (a.distance == null && b.distance == null) return 0;
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      });
  }, [todaysPlaces, effectiveCoords]);

  const cuisineMeta = useMemo(() => {
    const cuisineSet = new Set<string>();

    for (const place of todaysPlaces) {
      for (const cuisine of getPlaceCuisines(place)) {
        cuisineSet.add(cuisine);
      }
    }

    const cuisines = Array.from(cuisineSet).sort((a, b) => a.localeCompare(b));
    return {
      mode: "tags" as CuisineMode,
      options: cuisines.length > 0 ? ["all", ...cuisines.slice(0, 8)] : ["all"]
    };
  }, [todaysPlaces]);

  const priceOptions = useMemo(() => {
    const tiers = new Set<number>();
    for (const place of todaysPlaces) {
      const tier = getPriceTier(place);
      if (typeof tier === "number" && tier > 0) {
        tiers.add(tier);
      }
    }
    return ["all", ...Array.from(tiers).sort((a, b) => a - b)];
  }, [todaysPlaces]);

  const filtered = useMemo(() => {
    let list = withDistance;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((place) => {
        const name = (
          place.venue?.name ??
          place.venue_name ??
          ""
        ).toLowerCase();
        const orgName = (
          place.orgName ??
          place.organization_name ??
          place.venue?.org_name ??
          ""
        ).toLowerCase();
        const neighborhood = (place.venue?.neighborhood ?? "").toLowerCase();
        const address = (place.venue?.address ?? "").toLowerCase();
        const tags = (place.venue?.tags ?? []).join(" ").toLowerCase();
        const cuisine = ((place.venue as any)?.cuisine_type ?? "").toLowerCase();
        return (
          name.includes(q) ||
          orgName.includes(q) ||
          neighborhood.includes(q) ||
          address.includes(q) ||
          tags.includes(q) ||
          cuisine.includes(q)
        );
      });
    }

    if (selectedCuisine !== "all") {
      list = list.filter((place) =>
        getPlaceCuisines(place).includes(selectedCuisine)
      );
    }

    if (selectedPrice !== "all") {
      list = list.filter(
        (place) => getPriceTier(place) === selectedPrice
      );
    }

    return list;
  }, [withDistance, query, selectedCuisine, selectedPrice]);

  const filteredVenueIds = useMemo(
    () => filtered.map((p) => p.venue?.id).filter((id): id is string => !!id),
    [filtered]
  );
  const venueCovers = useVenueCovers(filteredVenueIds);

  const cityForMap = useMemo(() => {
    const cityPlace = todaysPlaces.find((place) => place.venue?.city);
    const city = cityPlace?.venue?.city;
    const state = cityPlace?.venue?.state;
    if (city) return `${city}${state ? `, ${state}` : ""}`;
    return null;
  }, [todaysPlaces]);

  const cityLabel = useMemo(() => {
    if (cityForMap) return cityForMap;
    if (preferences.home_city) {
      return preferences.home_state
        ? `${preferences.home_city}, ${preferences.home_state}`
        : preferences.home_city;
    }
    return coords ? "Nearby" : "Set your city";
  }, [cityForMap, coords, preferences.home_city, preferences.home_state]);

  const summaryText = useMemo(() => {
    const parts: string[] = ["Today"];
    const priceLabel =
      selectedPrice === "all" ? null : formatPriceTier(selectedPrice);
    const cuisineLabel =
      selectedCuisine === "all"
        ? null
        : formatCuisineLabel(selectedCuisine, cuisineMeta.mode);
    if (priceLabel) parts.push(priceLabel);
    if (cuisineLabel) parts.push(cuisineLabel);
    if (query.trim()) parts.push(`"${query.trim()}"`);
    return parts.join(" · ");
  }, [selectedPrice, selectedCuisine, cuisineMeta.mode, query]);


  const openCityPicker = () => {
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Set your city",
        "Enter city, state (e.g. Kansas City, MO)",
        (input) => {
          if (!input?.trim()) return;
          const [city, ...rest] = input.split(",").map((s) => s.trim());
          const state = rest[0] ?? null;
          void savePreferences({ home_city: city, home_state: state });
        },
        "plain-text",
        preferences.home_city
          ? `${preferences.home_city}${preferences.home_state ? `, ${preferences.home_state}` : ""}`
          : ""
      );
    } else {
      setCityDraft(
        preferences.home_city
          ? `${preferences.home_city}${preferences.home_state ? `, ${preferences.home_state}` : ""}`
          : ""
      );
      setCityPickerVisible(true);
    }
  };

  const cardWidth = Math.min(width - spacing.lg * 2, 300);

  if (loading && !refreshing && data.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.pageTitle}>Discover</Text>
        <Text style={styles.pageSubtitle}>
          Loading nearby happy hours for you...
        </Text>
        <LoadingSpinner />
      </View>
    );
  }

  if (error && data.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState message={error.message} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Discover</Text>
          <Text style={styles.pageSubtitle}>
            Find happy hours happening today.
          </Text>

          <Pressable
            onPress={openCityPicker}
            style={({ pressed }) => [styles.searchSummary, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.searchIcon}>
              <View style={styles.searchIconCircle} />
              <View style={styles.searchIconHandle} />
            </View>
            <View style={styles.searchText}>
              <Text style={styles.cityText}>{cityLabel}</Text>
              <Text style={styles.summaryText} numberOfLines={1}>
                {summaryText}
              </Text>
            </View>
            <View style={styles.editButton}>
              <View style={styles.editIcon} />
            </View>
          </Pressable>

          <View style={styles.queryRow}>
            <IconSymbol name="magnifyingglass" size={14} color={colors.textMutedLight} style={styles.searchInputIcon} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search bars &amp; restaurants"
              placeholderTextColor={colors.textMutedLight}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.filterLabel}>Cuisine</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {cuisineMeta.options.map((option) => (
              <FilterChip
                key={`cuisine-${option}`}
                label={formatCuisineLabel(option, cuisineMeta.mode)}
                selected={selectedCuisine === option}
                onPress={() => setSelectedCuisine(option)}
              />
            ))}
          </ScrollView>

          <Text style={styles.filterLabel}>Price</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {priceOptions.map((option) => {
              const label =
                option === "all" ? "All" : formatPriceTier(option as number);
              return (
                <FilterChip
                  key={`price-${option}`}
                  label={label ?? "All"}
                  selected={selectedPrice === option}
                  onPress={() => setSelectedPrice(option as number | "all")}
                />
              );
            })}
          </ScrollView>

          {locationError && (
            <Text style={styles.locationHint}>
              We could not access your location, so results may not be sorted by
              distance.
            </Text>
          )}
          {!locationError && !coords && (
            <Text style={styles.locationHint}>
              Getting your location to sort nearby happy hours...
            </Text>
          )}
        </View>

        <View style={styles.mapSection}>
          <View style={styles.mapContainer}>
            <MapView
              style={styles.mapView}
              initialRegion={{
                latitude: effectiveCoords?.lat ?? 39.0997,
                longitude: effectiveCoords?.lng ?? -94.5786,
                latitudeDelta: coords ? 0.06 : 0.1,
                longitudeDelta: coords ? 0.06 : 0.1,
              }}
              showsUserLocation
              showsMyLocationButton={false}
              scrollEnabled={true}
              zoomEnabled={true}
              pitchEnabled={false}
              rotateEnabled={false}
            >
              {filtered.slice(0, 10).map((place) => {
                const lat = place.venue?.lat;
                const lng = place.venue?.lng;
                if (lat == null || lng == null) return null;
                const { titleText } = getHappyHourDisplayNames(place);
                return (
                  <Marker
                    key={place.id}
                    coordinate={{ latitude: lat, longitude: lng }}
                    pinColor={colors.primary}
                    title={titleText}
                  />
                );
              })}
            </MapView>
          </View>
        </View>

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </Text>
          <Text style={styles.resultsSortLabel}>Sorted by distance</Text>
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            title="No matches yet"
            message="Try another cuisine or price tier."
          />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
          >
            {filtered.map((item) => {
              const venueId = item.venue_id ?? item.venue?.id ?? null;
              return (
                <VenueCard
                  key={item.id}
                  place={item}
                  width={cardWidth}
                  coverUrl={item.venue?.id ? venueCovers[item.venue.id] ?? null : null}
                  isFavorite={isFollowing(venueId)}
                  savingFavorite={savingVenueId === venueId}
                  onToggleFavorite={() => venueId ? toggleFollow(venueId) : undefined}
                  onSelect={() =>
                    navigation.navigate("HappyHourDetail", { windowId: item.id })
                  }
                />
              );
            })}
          </ScrollView>
        )}
      </ScrollView>

      {/* Android city picker — iOS uses Alert.prompt above */}
      <Modal
        visible={cityPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCityPickerVisible(false)}
      >
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Set your city</Text>
            <Text style={styles.modalHint}>e.g. Kansas City, MO</Text>
            <TextInput
              value={cityDraft}
              onChangeText={setCityDraft}
              placeholder="City, State"
              placeholderTextColor={colors.textMuted}
              style={styles.modalInput}
              autoFocus
              autoCapitalize="words"
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setCityPickerVisible(false)}
                style={styles.modalButtonSecondary}
              >
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const trimmed = cityDraft.trim();
                  if (trimmed) {
                    const [city, ...rest] = trimmed.split(",").map((s) => s.trim());
                    void savePreferences({ home_city: city, home_state: rest[0] ?? null });
                  }
                  setCityPickerVisible(false);
                }}
                style={styles.modalButtonPrimary}
              >
                <Text style={styles.modalButtonPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

const FilterChip: React.FC<ChipProps> = ({ label, selected, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.chip,
      selected && styles.chipSelected,
      pressed && styles.chipPressed
    ]}
  >
    <Text style={selected ? styles.chipTextSelected : styles.chipTextUnselected}>
      {label}
    </Text>
  </Pressable>
);

type VenueCardProps = {
  place: HappyHourWindow;
  width: number;
  coverUrl?: string | null;
  isFavorite?: boolean;
  savingFavorite?: boolean;
  onToggleFavorite?: () => void;
  onSelect?: () => void;
};

const VenueCard: React.FC<VenueCardProps> = ({
  place,
  width,
  coverUrl,
  isFavorite,
  savingFavorite,
  onToggleFavorite,
  onSelect,
}) => {
  const name = getVenueName(place);
  const locationLabel = getVenueSubtitle(place);
  const priceTier = formatPriceTier(getPriceTier(place));
  const promoTier = getPromoTier(place);
  const isPromoted = promoTier != null;

  const ratingRaw = place.venue?.rating ?? null;
  const reviewCountRaw = place.venue?.review_count ?? null;

  const ratingValue = Number(ratingRaw);
  const reviewCountValue = Number(reviewCountRaw);
  const rating = Number.isFinite(ratingValue) ? ratingValue : null;
  const reviewCount = Number.isFinite(reviewCountValue)
    ? Math.round(reviewCountValue)
    : null;

  const distance = typeof place.distance === "number" ? place.distance : null;
  const distanceText =
    distance == null
      ? null
      : distance < 0.1
        ? "nearby"
        : `${distance.toFixed(1)} mi`;

  return (
    <Pressable
      onPress={onSelect}
      disabled={!onSelect}
      style={({ pressed }) => [
        styles.card,
        { width },
        isPromoted && (
          promoTier === "featured" ? styles.cardPromoFeatured
          : promoTier === "premium" ? styles.cardPromoPremium
          : styles.cardPromoBasic
        ),
        pressed && styles.cardPressed
      ]}
    >
      <View style={styles.cardHero}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : null}
        {isPromoted && (
          <View style={[
            styles.cardPromoBadge,
            promoTier === "featured" ? styles.cardPromoBadgeFeatured
            : promoTier === "premium" ? styles.cardPromoBadgePremium
            : styles.cardPromoBadgeBasic
          ]}>
            <Text style={styles.cardPromoBadgeText}>{promoLabel[promoTier]}</Text>
          </View>
        )}
        {priceTier && (
          <View style={styles.cardPriceBadge}>
            <Text style={styles.cardPriceBadgeText}>{priceTier}</Text>
          </View>
        )}
        <View style={styles.cardHeroDots}>
          <View style={[styles.cardHeroDot, styles.cardHeroDotActive]} />
          <View style={styles.cardHeroDot} />
          <View style={styles.cardHeroDot} />
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {name}
        </Text>
        {locationLabel ? (
          <Text style={styles.cardLocationLabel} numberOfLines={1}>
            {locationLabel}
          </Text>
        ) : null}
        <View style={styles.cardMetaRow}>
          {rating != null && (
            <View style={styles.cardRatingPill}>
              <IconSymbol name="star.fill" size={11} color={colors.brandDark} />
              <Text style={styles.cardRatingText}>{rating.toFixed(1)}</Text>
              {reviewCount != null && (
                <Text style={styles.cardRatingCount}>({reviewCount})</Text>
              )}
            </View>
          )}
          {distanceText && (
            <Text style={styles.cardMetaText}>{distanceText}</Text>
          )}
        </View>
        {place.venue?.tags && place.venue.tags.length > 0 && (
          <View style={styles.cardTagsRow}>
            {place.venue.tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.cardTag}>
                <Text style={styles.cardTagText}>{formatTagLabel(tag)}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={styles.cardFooterRow}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onToggleFavorite?.();
            }}
            disabled={savingFavorite}
            hitSlop={8}
            style={({ pressed }) => [
              styles.heartButton,
              pressed && styles.heartButtonPressed,
            ]}
          >
            <IconSymbol
              name={isFavorite ? "heart.fill" : "heart"}
              size={22}
              color={isFavorite ? colors.primary : colors.textMutedLight}
            />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
};

type EmptyStateProps = {
  title: string;
  message: string;
};

const EmptyState: React.FC<EmptyStateProps> = ({ title, message }) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyText}>{message}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    paddingTop: spacing.xxl + spacing.lg,
    paddingBottom: spacing.xl
  },
  header: {
    paddingHorizontal: spacing.lg
  },
  pageTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  pageSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.lg
  },
  searchSummary: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: colors.shadowSoft,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm
  },
  searchIconCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.textMuted
  },
  searchIconHandle: {
    position: "absolute",
    width: 7,
    height: 2,
    backgroundColor: colors.textMuted,
    right: -1,
    bottom: 0,
    transform: [{ rotate: "45deg" }]
  },
  searchText: {
    flex: 1
  },
  cityText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600"
  },
  summaryText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  editButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  editIcon: {
    width: 14,
    height: 14,
    borderWidth: 2,
    borderColor: colors.textMuted,
    borderRadius: 3
  },
  queryRow: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  searchInputIcon: {
    flexShrink: 0
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    paddingVertical: 0
  },
  filterLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  filterRow: {
    paddingBottom: spacing.sm,
    paddingRight: spacing.lg
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    marginRight: spacing.sm
  },
  chipSelected: {
    backgroundColor: colors.pillActiveBg,
    borderColor: colors.pillActiveBg
  },
  chipPressed: {
    opacity: 0.8
  },
  chipTextSelected: {
    color: colors.pillActiveText,
    fontSize: 13,
    fontWeight: "600"
  },
  chipTextUnselected: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "500"
  },
  locationHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs
  },
  mapSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md
  },
  mapContainer: {
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  mapView: {
    flex: 1,
  },
  resultsHeader: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  resultsTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700"
  },
  resultsSortLabel: {
    color: colors.textMuted,
    fontSize: 12
  },
  carouselContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginRight: spacing.md,
    overflow: "hidden",
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardPromoFeatured: {
    borderColor: colors.promoFeaturedBorder,
    borderWidth: 1.5,
    backgroundColor: colors.promoFeaturedBg,
  },
  cardPromoPremium: {
    borderColor: colors.promoPremiumBorder,
    borderWidth: 1.5,
    backgroundColor: colors.promoPremiumBg,
  },
  cardPromoBasic: {
    borderColor: colors.promoBasicBorder,
    borderWidth: 1.5,
    backgroundColor: colors.promoBasicBg,
  },
  cardPromoBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  cardPromoBadgeFeatured: {
    backgroundColor: colors.promoFeaturedBadge,
  },
  cardPromoBadgePremium: {
    backgroundColor: colors.promoPremiumBadge,
  },
  cardPromoBadgeBasic: {
    backgroundColor: colors.promoBasicBadge,
  },
  cardPromoBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  cardHero: {
    height: 150,
    backgroundColor: colors.brandSubtle,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: spacing.sm,
    position: "relative"
  },
  cardPriceBadge: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3
  },
  cardPriceBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700"
  },
  cardHeroDots: {
    flexDirection: "row"
  },
  cardHeroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    opacity: 0.6,
    marginRight: 6
  },
  cardHeroDotActive: {
    backgroundColor: colors.text,
    opacity: 1
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.xs
  },
  cardLocationLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
    marginBottom: spacing.xs
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  cardRatingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.brandSubtle,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3
  },
  cardRatingText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: "700"
  },
  cardRatingCount: {
    color: colors.brandDark,
    fontSize: 11,
    opacity: 0.7
  },
  cardMetaText: {
    color: colors.textMuted,
    fontSize: 12
  },
  cardTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm
  },
  cardTag: {
    backgroundColor: colors.brandSubtle,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2
  },
  cardTagText: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: "600"
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end"
  },
  heartButton: {
    padding: 4,
  },
  heartButtonPressed: {
    opacity: 0.6,
    transform: [{ scale: 1.15 }],
  },
  emptyState: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: "center"
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.xs
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: spacing.lg,
    width: "100%"
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs
  },
  modalHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md
  },
  modalInput: {
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    marginBottom: spacing.md
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm
  },
  modalButtonSecondary: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border
  },
  modalButtonSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500"
  },
  modalButtonPrimary: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  modalButtonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700"
  }
});





