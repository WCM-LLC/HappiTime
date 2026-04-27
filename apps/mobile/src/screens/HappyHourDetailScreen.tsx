import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Linking,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Image,
  Platform,
  Alert,
  Modal,
  FlatList,
  TextInput,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useHappyHours } from "../hooks/useHappyHours";
import { useUserFollowedVenues } from "../hooks/useUserFollowedVenues";
import { useUserLists } from "../hooks/useUserLists";
import { useVenueMenus } from "../hooks/useVenueMenus";
import { useVenueCovers } from "../hooks/useVenueCovers";
import { useVenueMedia } from "../hooks/useVenueMedia";
import { useUserLocation } from "../hooks/useUserLocation";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { getHappyHourDisplayNames } from "../utils/happyHourDisplay";
import { formatDays, formatTimeRange } from "../utils/formatters";
import { distanceMiles } from "../utils/location";
import { IconSymbol } from "../../components/ui/icon-symbol";

type Props = NativeStackScreenProps<RootStackParamList, "HappyHourDetail">;

const formatPriceTier = (tier?: number | null) =>
  typeof tier === "number" && tier > 0 ? "$".repeat(tier) : null;

const getDowValues = (window: { dow?: unknown }) => {
  if (!Array.isArray(window.dow)) return [];
  return window.dow.map((v: unknown) => Number(v)).filter((v) => Number.isFinite(v));
};

export const HappyHourDetailScreen: React.FC<Props> = ({
  route,
  navigation
}) => {
  const { windowId } = route.params;
  const { data, loading: windowsLoading, error: windowsError } = useHappyHours();
  const { coords } = useUserLocation();
  const { width } = useWindowDimensions();
  const {
    isFollowing,
    loading: followLoading,
    savingVenueId,
    toggleFollow
  } = useUserFollowedVenues();
  const { lists, addVenue, createList } = useUserLists();
  const [showItineraryPicker, setShowItineraryPicker] = useState(false);
  const [addedToIds, setAddedToIds] = useState<Set<string>>(new Set());
  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [newListVisibility, setNewListVisibility] = useState<"private" | "friends" | "public">("private");
  const [creatingList, setCreatingList] = useState(false);

  const window = useMemo(
    () => data.find((w) => w.id === windowId),
    [data, windowId]
  );

  const venue = window?.venue ?? null;
  const venueId = window?.venue_id ?? null;
  const saved = isFollowing(venueId);
  const venueCovers = useVenueCovers(venueId ? [venueId] : []);
  const coverUrl = venueId ? venueCovers[venueId] ?? null : null;
  const { titleText, subtitleText } = getHappyHourDisplayNames(window);

  const {
    data: menus,
    loading: menusLoading,
    error: menusError
  } = useVenueMenus(venueId);

  const heroWidth = Math.max(1, width - spacing.lg * 2);
  const heroSlides = [0, 1, 2];

  const distance = useMemo(() => {
    if (!coords || !venue) return null;
    const lat = venue.lat ?? null;
    const lng = venue.lng ?? null;
    if (lat == null || lng == null) return null;
    return distanceMiles(coords.lat, coords.lng, lat, lng);
  }, [coords, venue]);

  const ratingRaw = venue?.rating ?? null;
  const reviewCountRaw = venue?.review_count ?? null;

  const ratingValue = Number(ratingRaw);
  const reviewCountValue = Number(reviewCountRaw);
  const rating = Number.isFinite(ratingValue) ? ratingValue : null;
  const reviewCount = Number.isFinite(reviewCountValue)
    ? Math.round(reviewCountValue)
    : null;

  const priceTier = formatPriceTier(venue?.price_tier);
  const distanceText =
    distance == null
      ? null
      : distance < 0.1
        ? "nearby"
        : `${distance.toFixed(1)} mi`;

  const addressDisplay = useMemo(() => {
    if (!venue?.address) return null;
    const addr = venue.address;
    // If address already contains the city (Google formatted_address), show as-is
    if (venue.city && addr.toLowerCase().includes(venue.city.toLowerCase())) {
      return addr;
    }
    const parts: string[] = [addr];
    if (venue.city) parts.push(venue.city);
    if (venue.state) parts.push(venue.state);
    if (venue.zip) parts.push(String(venue.zip));
    return parts.join(", ");
  }, [venue]);

  const relatedWindows = useMemo(() => {
    if (!venue?.city) return [];
    return data
      .filter(
        (item) =>
          item.id !== windowId && item.venue?.city === venue.city
      )
      .slice(0, 4);
  }, [data, venue?.city, windowId]);

  if (windowsLoading && !window) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  if (windowsError && !window) {
    return (
      <View style={styles.container}>
        <ErrorState message={windowsError.message} />
      </View>
    );
  }

  if (!window) {
    return (
      <View style={styles.container}>
        <ErrorState message="We could not find this happy hour window." />
      </View>
    );
  }

  if (!venue) {
    return (
      <View style={styles.container}>
        <ErrorState message="Venue details are not available yet." />
      </View>
    );
  }

  const openWebsite = () => {
    if (!venue.website) return;
    Linking.openURL(venue.website).catch(() => {});
  };

  const callVenue = () => {
    if (!venue.phone) return;
    const url = `tel:${venue.phone}`;
    Linking.openURL(url).catch(() => {});
  };

  const handleSelect = () => {
    const lat = venue.lat ?? null;
    const lng = venue.lng ?? null;
    if (lat != null && lng != null) {
      const label = encodeURIComponent(titleText);
      const url =
        Platform.OS === "ios"
          ? `maps://?ll=${lat},${lng}&q=${label}`
          : `geo:${lat},${lng}?q=${label}`;
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() => {});
      });
    } else if (addressDisplay) {
      const encoded = encodeURIComponent(addressDisplay);
      const url =
        Platform.OS === "ios"
          ? `maps://?q=${encoded}`
          : `geo:0,0?q=${encoded}`;
      Linking.openURL(url).catch(() => {
        Linking.openURL(`https://maps.google.com/?q=${encoded}`).catch(() => {});
      });
    }
  };

  const handleToggleSave = async () => {
    if (!venueId || followLoading) return;
    const wasSaved = saved;
    await toggleFollow(venueId);
    if (!wasSaved) {
      Alert.alert(
        "Saved!",
        `${titleText} has been added to your Favorites. You'll see updates in the Activity tab.`
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroWrap}>
          <View style={[styles.heroCard, { width: heroWidth }]}>
            {coverUrl ? (
              <Image
                source={{ uri: coverUrl }}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
            ) : null}
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={[styles.heroScroll, { width: heroWidth }]}
              contentContainerStyle={[
                styles.heroContent,
                { width: heroWidth * heroSlides.length }
              ]}
            >
              {heroSlides.map((slide) => (
                <View
                  key={slide}
                  style={[styles.heroSlide, { width: heroWidth }, coverUrl ? styles.heroSlideTransparent : null]}
                />
              ))}
            </ScrollView>
            <View style={styles.heroDots}>
              <View style={[styles.heroDot, styles.heroDotActive]} />
              <View style={styles.heroDot} />
              <View style={styles.heroDot} />
            </View>
          </View>
          <View style={styles.heroButtons}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [
                styles.heroButtonBack,
                pressed && styles.heroButtonPressed
              ]}
            >
              <Text style={styles.heroButtonBackText}>{"\u2190"} Back</Text>
            </Pressable>
            <Pressable
              onPress={handleSelect}
              style={({ pressed }) => [
                styles.heroButton,
                pressed && styles.heroButtonPressed
              ]}
            >
              <Text style={styles.heroButtonText}>Let's Go!</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{titleText}</Text>
            <Pressable
              onPress={handleToggleSave}
              disabled={followLoading || savingVenueId === venueId}
              hitSlop={10}
              style={({ pressed }) => [
                styles.titleHeart,
                pressed && styles.titleHeartPressed,
              ]}
            >
              <IconSymbol
                name={saved ? "heart.fill" : "heart"}
                size={24}
                color={saved ? colors.primary : colors.textMutedLight}
              />
            </Pressable>
          </View>
          {subtitleText && (
            <Text style={styles.subtitle}>{subtitleText}</Text>
          )}
          <View style={styles.metaRow}>
            <View style={styles.metaLeft}>
              {rating != null && (
                <View style={styles.ratingPill}>
                  <IconSymbol name="star.fill" size={12} color={colors.brandDark} />
                  <Text style={styles.ratingPillText}>{rating.toFixed(1)}</Text>
                  {reviewCount != null && (
                    <Text style={styles.ratingPillCount}>({reviewCount})</Text>
                  )}
                </View>
              )}
              {priceTier && (
                <Text style={styles.metaSubtext}>{priceTier}</Text>
              )}
              {distanceText && (
                <>
                  <Text style={styles.metaDot}>{"\u00B7"}</Text>
                  <Text style={styles.metaSubtext}>{distanceText} away</Text>
                </>
              )}
            </View>
          </View>
          {addressDisplay ? (
            <Text style={styles.address}>{addressDisplay}</Text>
          ) : null}

          {/* Tags */}
          {venue.tags && venue.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {venue.tags.map((tag: string) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{tag}</Text>
                </View>
              ))}
              {window.dow && getDowValues(window).includes(new Date().getDay()) && (
                <View style={styles.tagPillActive}>
                  <Text style={styles.tagPillActiveText}>Active today</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.detailRow}>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>WHEN</Text>
            <Text style={styles.detailValue}>
              {formatTimeRange(window.start_time, window.end_time)}
            </Text>
          </View>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>DAYS</Text>
            <Text style={styles.detailValue}>{formatDays(window.dow)}</Text>
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Menu Preview</Text>

          {menusError && (
            <Text style={styles.menuError}>
              Could not load menu: {menusError.message}
            </Text>
          )}

          {menusLoading && (
            <Text style={styles.menuLoading}>Loading menu...</Text>
          )}

          {!menusLoading && menus.length > 0 && (
            <View style={styles.menuList}>
              {menus.map((menu) => (
                <View key={menu.id} style={styles.menuBlock}>
                  {menus.length > 1 && (
                    <Text style={styles.menuName}>{menu.name}</Text>
                  )}
                  {menu.sections.map((section) => (
                    <View key={section.id} style={styles.menuSectionBlock}>
                      {menu.sections.length > 1 && (
                        <Text style={styles.menuSectionName}>
                          {section.name}
                        </Text>
                      )}
                      {section.items.map((item, index) => (
                        <View key={item.id} style={styles.menuRow}>
                          <View
                            style={[
                              styles.menuDot,
                              index === 0
                                ? styles.menuDotActive
                                : styles.menuDotInactive
                            ]}
                          />
                          <View style={styles.menuTextWrap}>
                            <Text style={styles.menuItemText}>
                              {item.name}
                              {item.price != null
                                ? ` - $${Number(item.price).toFixed(2)}`
                                : ""}
                            </Text>
                            {item.description && (
                              <Text style={styles.menuItemDescription}>
                                {item.description}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {!menusLoading && menus.length === 0 && (
            <Text style={styles.menuEmpty}>
              Menu coming soon.
              {/* TODO: Show menu items once the venue adds them. */}
            </Text>
          )}
        </View>

        {!menusLoading && menus.length === 0 && relatedWindows.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={styles.sectionTitle}>Nearby venues</Text>
            {relatedWindows.map((item, index) => {
              const name =
                item.venue?.app_name_preference ??
                item.venue?.name ??
                item.venue_name ??
                "Venue";
              const price = formatPriceTier(item.venue?.price_tier) ?? "$$";
              return (
                <View key={item.id} style={styles.relatedRow}>
                  <View
                    style={[
                      styles.menuDot,
                      index === 0
                        ? styles.menuDotActive
                        : styles.menuDotInactive
                    ]}
                  />
                  <Text style={styles.relatedText}>
                    {name} - {price}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed
            ]}
            onPress={() => setShowItineraryPicker(true)}
          >
            <Text style={styles.actionText}>Add to Itinerary</Text>
          </Pressable>
          <View style={styles.actionSecondaryRow}>
            {venue.website && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionButtonSecondary,
                  pressed && styles.actionButtonPressed
                ]}
                onPress={openWebsite}
              >
                <Text style={styles.actionSecondaryText}>Website</Text>
              </Pressable>
            )}
            {venue.phone && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionButtonSecondary,
                  pressed && styles.actionButtonPressed
                ]}
                onPress={callVenue}
              >
                <Text style={styles.actionSecondaryText}>Call</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showItineraryPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowItineraryPicker(false)}
      >
        <Pressable
          style={pickerStyles.backdrop}
          onPress={() => setShowItineraryPicker(false)}
        />
        <View style={pickerStyles.sheet}>
          <View style={pickerStyles.handle} />
          <Text style={pickerStyles.title}>Add to Itinerary</Text>

          {/* Create-list form — shown when no lists OR user taps "+ New" */}
          {(lists.length === 0 || showCreateForm) ? (
            <View style={pickerStyles.createForm}>
              <Text style={pickerStyles.createLabel}>Create a new itinerary</Text>
              <TextInput
                style={pickerStyles.input}
                placeholder="Name (e.g. Friday Night Crawl)"
                placeholderTextColor={colors.textMutedLight}
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
              />
              <TextInput
                style={[pickerStyles.input, { height: 60 }]}
                placeholder="Description (optional)"
                placeholderTextColor={colors.textMutedLight}
                value={newListDesc}
                onChangeText={setNewListDesc}
                multiline
              />
              <View style={pickerStyles.visRow}>
                {(["private", "friends", "public"] as const).map((v) => (
                  <Pressable
                    key={v}
                    style={[
                      pickerStyles.visChip,
                      newListVisibility === v && pickerStyles.visChipActive,
                    ]}
                    onPress={() => setNewListVisibility(v)}
                  >
                    <Text
                      style={[
                        pickerStyles.visChipText,
                        newListVisibility === v && pickerStyles.visChipTextActive,
                      ]}
                    >
                      {v === "private" ? "Private" : v === "friends" ? "Friends" : "Public"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[
                  pickerStyles.createBtn,
                  (!newListName.trim() || creatingList) && { opacity: 0.5 },
                ]}
                disabled={!newListName.trim() || creatingList}
                onPress={async () => {
                  setCreatingList(true);
                  const { error } = await createList(newListName, newListDesc || undefined);
                  setCreatingList(false);
                  if (error) {
                    Alert.alert("Error", error.message);
                  } else {
                    setNewListName("");
                    setNewListDesc("");
                    setNewListVisibility("private");
                    setShowCreateForm(false);
                  }
                }}
              >
                <Text style={pickerStyles.createBtnText}>
                  {creatingList ? "Creating…" : "Create Itinerary"}
                </Text>
              </Pressable>
              {lists.length > 0 && (
                <Pressable onPress={() => setShowCreateForm(false)}>
                  <Text style={pickerStyles.cancelText}>Cancel</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              <FlatList
                data={lists}
                keyExtractor={(item) => item.id}
                ItemSeparatorComponent={() => <View style={pickerStyles.sep} />}
                renderItem={({ item }) => {
                  const added = addedToIds.has(item.id);
                  const adding = addingToId === item.id;
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        pickerStyles.row,
                        pressed && { opacity: 0.75 },
                      ]}
                      disabled={added || adding}
                      onPress={async () => {
                        if (!venueId) return;
                        setAddingToId(item.id);
                        const { error } = await addVenue(item.id, venueId);
                        setAddingToId(null);
                        if (error) {
                          Alert.alert("Couldn't add", error.message);
                        } else {
                          setAddedToIds((prev) => new Set(prev).add(item.id));
                        }
                      }}
                    >
                      <View style={pickerStyles.rowText}>
                        <Text style={pickerStyles.rowName}>{item.name}</Text>
                        {item.description ? (
                          <Text style={pickerStyles.rowDesc} numberOfLines={1}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[
                        pickerStyles.rowAction,
                        added && pickerStyles.rowActionDone,
                      ]}>
                        {adding ? "…" : added ? "Added ✓" : "Add"}
                      </Text>
                    </Pressable>
                  );
                }}
              />
              <Pressable
                style={pickerStyles.newListBtn}
                onPress={() => setShowCreateForm(true)}
              >
                <Text style={pickerStyles.newListBtnText}>+ New Itinerary</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: spacing.xl
  },
  heroWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg
  },
  heroCard: {
    height: 220,
    borderRadius: 14,
    backgroundColor: colors.brandSubtle,
    overflow: "hidden",
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  heroScroll: {
    flex: 1
  },
  heroContent: {
    height: "100%"
  },
  heroSlide: {
    height: "100%",
    backgroundColor: colors.brandSubtle
  },
  heroSlideTransparent: {
    backgroundColor: "transparent"
  },
  heroDots: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row"
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    opacity: 0.6,
    marginRight: 6
  },
  heroDotActive: {
    backgroundColor: colors.text,
    opacity: 1
  },
  heroButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  heroButtonBack: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroButtonBackText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  heroButton: {
    flex: 2,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  heroButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  heroButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  infoSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
    marginRight: spacing.sm,
  },
  titleHeart: {
    padding: 4,
  },
  titleHeartPressed: {
    opacity: 0.6,
    transform: [{ scale: 1.2 }],
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: spacing.sm
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: spacing.sm,
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
  },
  ratingPillText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: "700",
  },
  ratingPillCount: {
    color: colors.brandDark,
    fontSize: 11,
    opacity: 0.7,
  },
  metaSubtext: {
    color: colors.textMuted,
    fontSize: 12,
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: 12,
  },
  address: {
    color: colors.textMutedLight,
    fontSize: 13,
    marginTop: 2,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: spacing.sm,
  },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.brandSubtle,
  },
  tagPillText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: "600",
  },
  tagPillActive: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.successLight,
  },
  tagPillActiveText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  detailCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: colors.shadowSoft,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 1,
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  menuSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    marginBottom: spacing.md,
  },
  menuList: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    backgroundColor: colors.surface,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  menuBlock: {
    marginBottom: spacing.md
  },
  menuName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.xs
  },
  menuSectionBlock: {
    marginBottom: spacing.sm
  },
  menuSectionName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: spacing.xs
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.sm
  },
  menuDot: {
    width: 3,
    height: 14,
    borderRadius: 2,
    marginRight: spacing.md,
    marginTop: 2
  },
  menuDotActive: {
    backgroundColor: colors.primary
  },
  menuDotInactive: {
    backgroundColor: colors.border
  },
  menuTextWrap: {
    flex: 1
  },
  menuItemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  menuItemDescription: {
    color: colors.textMuted,
    fontSize: 12
  },
  menuEmpty: {
    color: colors.textMuted,
    fontSize: 13
  },
  menuError: {
    color: colors.error,
    fontSize: 13,
    marginBottom: spacing.sm
  },
  menuLoading: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.sm
  },
  relatedSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg
  },
  relatedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm
  },
  relatedText: {
    color: colors.textMuted,
    fontSize: 13
  },
  actions: {
    paddingHorizontal: spacing.lg
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.sm
  },
  actionButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionButtonDisabled: {
    opacity: 0.6
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  actionSecondaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButtonSecondary: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: 999,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionSecondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  }
});

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "60%",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  rowDesc: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  rowAction: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    overflow: "hidden",
  },
  rowActionDone: {
    backgroundColor: colors.surface,
    color: colors.textMuted,
  },
  createForm: {
    paddingVertical: spacing.sm,
  },
  createLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  visRow: {
    flexDirection: "row" as const,
    gap: spacing.xs,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  visChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  visChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  visChipText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textMuted,
  },
  visChipTextActive: {
    color: "#FFFFFF",
  },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: "center" as const,
    marginTop: spacing.xs,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700" as const,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center" as const,
    marginTop: spacing.md,
  },
  newListBtn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center" as const,
    marginTop: spacing.xs,
  },
  newListBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600" as const,
  },
});
