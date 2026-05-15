// src/screens/HomeScreen.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  FlatList,
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
import type { ViewToken } from "react-native";
import MapView, { Marker } from "react-native-maps";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useHappyHours, type HappyHourWindow } from "../hooks/useHappyHours";
import { useUserLocation } from "../hooks/useUserLocation";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useUserFollowedVenues } from "../hooks/useUserFollowedVenues";
import { useVenueCovers, useVenueMediaGalleries } from "../hooks/useVenueCovers";
import { getHappyHourDisplayNames } from "../utils/happyHourDisplay";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { SearchableOptionSheet } from "../components/SearchableOptionSheet";
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

const getVenueId = (window: HappyHourWindow) =>
  window.venue_id ?? window.venue?.id ?? null;

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
  const { preferences, savePreferences } = useUserPreferences();
  const { coords, error: locationError } = useUserLocation({
    requestOnMount: preferences.location_enabled,
  });
  const { isFollowing, toggleFollow, savingVenueId } = useUserFollowedVenues();
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState("all");
  const [selectedPrice, setSelectedPrice] = useState<number | "all">("all");
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [cityDraft, setCityDraft] = useState("");
  const [venueCarouselScrollEnabled, setVenueCarouselScrollEnabled] = useState(true);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);

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

  const mapRef = useRef<MapView>(null);

  // Deduplicate windows by venue — keep one window per venue for the listing
  const dedupedByVenue = useMemo(() => {
    const seen = new Set<string>();
    return data.filter((window) => {
      const venueId = window.venue?.id ?? window.venue_id;
      if (!venueId || seen.has(venueId)) return false;
      seen.add(venueId);
      return true;
    });
  }, [data]);

  const withDistance = useMemo(() => {
    return dedupedByVenue
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
  }, [dedupedByVenue, effectiveCoords]);

  const cuisineMeta = useMemo(() => {
    const cuisineSet = new Set<string>();

    for (const place of dedupedByVenue) {
      for (const cuisine of getPlaceCuisines(place)) {
        cuisineSet.add(cuisine);
      }
    }

    const cuisines = Array.from(cuisineSet).sort((a, b) => a.localeCompare(b));
    return {
      mode: "tags" as CuisineMode,
      options: cuisines.length > 0 ? ["all", ...cuisines] : ["all"]
    };
  }, [dedupedByVenue]);

  const priceOptions = useMemo(() => {
    const tiers = new Set<number>();
    for (const place of dedupedByVenue) {
      const tier = getPriceTier(place);
      if (typeof tier === "number" && tier > 0) {
        tiers.add(tier);
      }
    }
    return ["all", ...Array.from(tiers).sort((a, b) => a - b)];
  }, [dedupedByVenue]);
  const priceFilterOptions = useMemo(
    () => priceOptions.map((option) => String(option)),
    [priceOptions]
  );

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
    () => filtered.map(getVenueId).filter((id): id is string => !!id),
    [filtered]
  );
  const filteredVenueIdsKey = useMemo(
    () => filteredVenueIds.join(","),
    [filteredVenueIds]
  );
  const [activeGalleryVenueIds, setActiveGalleryVenueIds] = useState<string[]>([]);

  React.useEffect(() => {
    setActiveGalleryVenueIds(filteredVenueIds.slice(0, 6));
  }, [filteredVenueIds, filteredVenueIdsKey]);

  const galleryVenueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of filteredVenueIds.slice(0, 6)) ids.add(id);
    for (const id of activeGalleryVenueIds) ids.add(id);
    return Array.from(ids).slice(0, 12);
  }, [activeGalleryVenueIds, filteredVenueIds]);

  const venueCovers = useVenueCovers(filteredVenueIds);
  const venueGalleries = useVenueMediaGalleries(galleryVenueIds, 4);
  const venueViewabilityConfig = useRef({
    itemVisiblePercentThreshold: 35,
  });
  const onVenueViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const visibleIds = viewableItems
        .map(({ item }) => getVenueId(item as HappyHourWindow))
        .filter((id): id is string => Boolean(id));

      if (visibleIds.length === 0) return;

      setActiveGalleryVenueIds((current) => {
        const next = Array.from(new Set([...visibleIds, ...current])).slice(0, 12);
        if (
          next.length === current.length &&
          next.every((id, index) => id === current[index])
        ) {
          return current;
        }
        return next;
      });
    }
  );

  const cityForMap = useMemo(() => {
    const cityPlace = dedupedByVenue.find((place) => place.venue?.city);
    const city = cityPlace?.venue?.city;
    const state = cityPlace?.venue?.state;
    if (city) return `${city}${state ? `, ${state}` : ""}`;
    return null;
  }, [dedupedByVenue]);

  const cityLabel = useMemo(() => {
    if (cityForMap) return cityForMap;
    if (preferences.home_city) {
      return preferences.home_state
        ? `${preferences.home_city}, ${preferences.home_state}`
        : preferences.home_city;
    }
    return coords ? "Nearby" : "Set your city";
  }, [cityForMap, coords, preferences.home_city, preferences.home_state]);

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
        scrollEnabled={!filterDropdownOpen}
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
            Find happy hours near you.
          </Text>

          <View style={styles.queryRow}>
            <IconSymbol name="magnifyingglass" size={14} color={colors.textMutedLight} style={styles.searchInputIcon} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search bars & restaurants"
              placeholderTextColor={colors.textMutedLight}
              style={styles.searchInput}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.filterRail}>
            <Pressable
              onPress={openCityPicker}
              style={({ pressed }) => [
                styles.filterActionButton,
                pressed && styles.chipPressed,
              ]}
            >
              <View style={styles.filterActionTextWrap}>
                <Text style={styles.filterActionLabel} numberOfLines={1}>
                  City
                </Text>
                <Text style={styles.filterActionValue} numberOfLines={1}>
                  {cityLabel}
                </Text>
              </View>
              <IconSymbol name="chevron.down" size={18} color={colors.primary} />
            </Pressable>
            <SearchableOptionSheet
              label="Cuisine"
              value={selectedCuisine}
              options={cuisineMeta.options}
              onChange={setSelectedCuisine}
              formatOptionLabel={(option) => formatCuisineLabel(option, cuisineMeta.mode)}
              searchPlaceholder="Search cuisines"
              style={styles.filterRailControl}
              onOpenChange={setFilterDropdownOpen}
            />
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
              onOpenChange={setFilterDropdownOpen}
            />
          </View>

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
              ref={mapRef}
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
              onMarkerPress={(e) => {
                const markerId = e.nativeEvent?.id;
                if (markerId) {
                  const place = filtered.find((p) => p.id === markerId);
                  if (place) {
                    navigation.navigate("HappyHourDetail", { windowId: place.id });
                  }
                }
              }}
            >
              {filtered.map((place) => {
                const lat = place.venue?.lat;
                const lng = place.venue?.lng;
                if (lat == null || lng == null) return null;
                return (
                  <Marker
                    key={place.id}
                    identifier={place.id}
                    coordinate={{ latitude: lat, longitude: lng }}
                    pinColor={colors.primary}
                  />
                );
              })}
            </MapView>
            {/* Locate / recenter button */}
            {coords && (
              <Pressable
                onPress={() => {
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
                }}
                style={({ pressed }) => [
                  styles.mapLocateButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <IconSymbol name="location.fill" size={16} color={colors.primary} />
              </Pressable>
            )}
            {/* Maximize / expand map button */}
            <Pressable
              onPress={() => navigation.navigate("Map" as any)}
              style={({ pressed }) => [
                styles.mapExpandButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <IconSymbol name="arrow.up.left.and.arrow.down.right" size={14} color={colors.primary} />
            </Pressable>
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
          <FlatList
            horizontal
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const venueId = getVenueId(item);
              const coverUrl = venueId ? venueCovers[venueId] ?? null : null;
              const galleryUrls = venueId ? venueGalleries[venueId] ?? [] : [];

              return (
                <VenueCard
                  place={item}
                  width={cardWidth}
                  coverUrl={coverUrl}
                  imageUrls={galleryUrls.length > 0 ? galleryUrls : coverUrl ? [coverUrl] : []}
                  isFavorite={isFollowing(venueId)}
                  savingFavorite={savingVenueId === venueId}
                  onToggleFavorite={() => venueId ? toggleFollow(venueId) : undefined}
                  onImageSwipeStart={() => setVenueCarouselScrollEnabled(false)}
                  onImageSwipeEnd={() => setVenueCarouselScrollEnabled(true)}
                  onSelect={() =>
                    navigation.navigate("HappyHourDetail", { windowId: item.id })
                  }
                />
              );
            }}
            scrollEnabled={venueCarouselScrollEnabled}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            updateCellsBatchingPeriod={80}
            windowSize={5}
            removeClippedSubviews
            viewabilityConfig={venueViewabilityConfig.current}
            onViewableItemsChanged={onVenueViewableItemsChanged.current}
          />
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
          behavior={Platform.OS === "ios" ? "padding" : "height"}
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

type VenueCardProps = {
  place: HappyHourWindow;
  width: number;
  coverUrl?: string | null;
  imageUrls?: string[];
  isFavorite?: boolean;
  savingFavorite?: boolean;
  onToggleFavorite?: () => void;
  onImageSwipeStart?: () => void;
  onImageSwipeEnd?: () => void;
  onSelect?: () => void;
};

const VenueCard: React.FC<VenueCardProps> = ({
  place,
  width,
  coverUrl,
  imageUrls,
  isFavorite,
  savingFavorite,
  onToggleFavorite,
  onImageSwipeStart,
  onImageSwipeEnd,
  onSelect,
}) => {
  const name = getVenueName(place);
  const locationLabel = getVenueSubtitle(place);
  const priceTier = formatPriceTier(getPriceTier(place));
  const promoTier = getPromoTier(place);
  const isPromoted = promoTier != null;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const imageSources = useMemo(() => {
    const urls = [...(imageUrls ?? []), coverUrl]
      .filter((url): url is string => typeof url === "string" && url.length > 0);
    return Array.from(new Set(urls));
  }, [coverUrl, imageUrls]);

  React.useEffect(() => {
    if (activeImageIndex >= imageSources.length) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, imageSources.length]);

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
    <View
      style={[
        styles.card,
        { width },
        isPromoted && (
          promoTier === "featured" ? styles.cardPromoFeatured
          : promoTier === "premium" ? styles.cardPromoPremium
          : styles.cardPromoBasic
        ),
      ]}
    >
      <View style={styles.cardHero}>
        {imageSources.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            disableIntervalMomentum
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={[styles.cardImageScroll, { width }]}
            onTouchStart={onImageSwipeStart}
            onTouchEnd={onImageSwipeEnd}
            onTouchCancel={onImageSwipeEnd}
            onScrollBeginDrag={onImageSwipeStart}
            onScrollEndDrag={onImageSwipeEnd}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
              setActiveImageIndex(Math.max(0, Math.min(nextIndex, imageSources.length - 1)));
              onImageSwipeEnd?.();
            }}
          >
            {imageSources.map((url, index) => (
              <Image
                key={`${url}-${index}`}
                source={{ uri: url }}
                style={[styles.cardHeroImage, { width }]}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.cardHeroPlaceholder}>
            <Text style={styles.cardHeroPlaceholderInitial}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
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
        {imageSources.length > 1 ? (
          <View style={styles.cardHeroDots}>
            {imageSources.map((url, index) => (
              <View
                key={`${url}-dot`}
                style={[
                  styles.cardHeroDot,
                  index === activeImageIndex && styles.cardHeroDotActive,
                ]}
              />
            ))}
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={onSelect}
        disabled={!onSelect}
        style={({ pressed }) => [styles.cardBody, pressed && styles.cardBodyPressed]}
      >
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
      </Pressable>
    </View>
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
  queryRow: {
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
  filterRail: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
    zIndex: 30,
  },
  filterRailControl: {
    flex: 1,
  },
  filterActionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: colors.shadowSoft,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  filterActionTextWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  filterActionLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  filterActionValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  chipPressed: {
    opacity: 0.8
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
  mapLocateButton: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapExpandButton: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
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
  cardHero: {
    height: 150,
    backgroundColor: colors.brandSubtle,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: spacing.sm,
    position: "relative"
  },
  cardImageScroll: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  cardHeroImage: {
    height: 150,
  },
  cardHeroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeroPlaceholderInitial: {
    color: colors.primary,
    fontSize: 42,
    fontWeight: "900",
    opacity: 0.25,
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
  cardBodyPressed: {
    opacity: 0.85,
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
