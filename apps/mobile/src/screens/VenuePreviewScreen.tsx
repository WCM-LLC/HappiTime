import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ScrollView,
  Pressable,
  Linking,
  Alert,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { supabase } from "../api/supabaseClient";
import { useHappyHours } from "../hooks/useHappyHours";
import { HappyHourCard } from "../components/HappyHourCard";
import { useVenueEvents } from "../hooks/useVenueEvents";
import { useVenueMedia } from "../hooks/useVenueMedia";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { ImageLightbox } from "../components/ImageLightbox";
import { fetchVenueById } from "@happitime/shared-api";
import { AddToItinerarySheet } from "../components/AddToItinerarySheet";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = NativeStackScreenProps<RootStackParamList, "VenuePreview">;

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dayName}, ${month} ${day} at ${time}`;
}

function formatRecurrenceRule(rule: string | null, startTime: string): string {
  const DOW_MAP: Record<string, string> = { SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat" };
  const time = new Date(startTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (!rule) return `Recurring at ${time}`;
  const match = rule.match(/BYDAY=([A-Z,]+)/);
  if (!match) return `Recurring at ${time}`;
  const days = match[1].split(",").map((d) => DOW_MAP[d] ?? d).join(", ");
  return `Every ${days} at ${time}`;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  special: "Special",
  live_music: "Live Music",
  trivia: "Trivia",
  sports: "Sports",
  other: "Other",
};

// Persisted anonymous device id, used to dedupe attribution events server-side.
const SESSION_KEY = "happitime_session_id";
async function getSessionId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export const VenuePreviewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { venueId } = route.params;
  const insets = useSafeAreaInsets();
  const { data, loading, error, refreshing, refresh } = useHappyHours();
  const { data: events } = useVenueEvents(venueId ?? null);
  const { media } = useVenueMedia(venueId ?? null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [fetchedVenueName, setFetchedVenueName] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) return;
    let active = true;
    fetchVenueById(supabase as any, venueId)
      .then(({ data }) => {
        if (active && data?.name) setFetchedVenueName(data.name);
      })
      .catch(() => {
        /* name falls back to the window-derived value */
      });
    return () => {
      active = false;
    };
  }, [venueId]);

  // One-shot "Checked in!" confirmation when arriving from a QR scan
  // (route param fromScan). Display-only — the web bridge already recorded the
  // visit; we just confirm it. Cleared after showing so back-nav won't replay it.
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const [showScanBanner, setShowScanBanner] = useState(false);

  // Banner is a navigation-arrival concern: show once when this screen is opened
  // from a QR scan (fromScan param). Runs on mount only, so clearing the param and
  // the fade sequence aren't interrupted; cleanup stops the animation on unmount.
  // Known v1 limitation: scanning a second venue while already on this screen won't
  // replay the banner (would need a per-scan nonce param) — tracked as a follow-up.
  useEffect(() => {
    if (route.params?.fromScan !== true) return;
    navigation.setParams({ fromScan: false });
    setShowScanBanner(true);
    const anim = Animated.sequence([
      Animated.timing(bannerOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(bannerOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => {
      if (finished) setShowScanBanner(false);
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "I'm here" — records an app_checkin attribution event for this venue via the
  // public track-visit edge function. Lightweight: no geofence enforcement yet.
  async function handleCheckIn() {
    if (!venueId || checkingIn || checkedIn) return;
    setCheckingIn(true);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("track-visit", {
        body: {
          venue_id: venueId,
          source: "app_checkin",
          session_id: await getSessionId(),
        },
      });
      if (fnError || (res && (res as { ok?: boolean }).ok === false)) {
        Alert.alert("Couldn't check in", "Please try again in a moment.");
        return;
      }
      setCheckedIn(true);
    } catch {
      Alert.alert("Couldn't check in", "Please check your connection and try again.");
    } finally {
      setCheckingIn(false);
    }
  }

  const windowsForVenue = useMemo(
    () => data.filter((w) => w.venue_id === venueId),
    [data, venueId]
  );

  const venueName =
    windowsForVenue[0]?.venue?.name ?? fetchedVenueName ?? "This venue";
  const images = useMemo(
    () => [...media].sort((a, b) => a.sort_order - b.sort_order),
    [media]
  );
  const coverUrl = images[0]?.url ?? null;
  // Stable url array — the lightbox Modal/FlatList stays mounted across opens,
  // so a fresh array each render would re-render all gallery pages off-screen.
  const imageUrls = useMemo(() => images.map((img) => img.url), [images]);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (loading && windowsForVenue.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  if (error && windowsForVenue.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState message={error.message} />
      </View>
    );
  }

  const sections: React.ReactNode[] = [];

  // Photos gallery
  if (images.length > 0) {
    sections.push(
      <View key="photos" style={styles.section}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
          {images.map((img, index) => (
            <Pressable
              key={img.id}
              onPress={() => {
                setLightboxIndex(index);
                setLightboxVisible(true);
              }}
              accessibilityRole="imagebutton"
              accessibilityLabel="Expand photo"
            >
              <Image
                source={{ uri: img.url }}
                style={styles.photoThumb}
                resizeMode="cover"
                onError={(e) => console.warn('[img-fail] venue-preview', img.url, e.nativeEvent?.error)}
              />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Upcoming events
  if (events.length > 0) {
    sections.push(
      <View key="events" style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Events</Text>
        {events.map((ev) => (
          <View key={ev.id} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <View style={styles.eventTypeBadge}>
                <Text style={styles.eventTypeBadgeText}>
                  {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
                </Text>
              </View>
              {ev.price_info ? (
                <Text style={styles.eventPrice}>{ev.price_info}</Text>
              ) : null}
            </View>
            <Text style={styles.eventTitle}>{ev.title}</Text>
            <Text style={styles.eventDate}>
              {ev.is_recurring
                ? formatRecurrenceRule(ev.recurrence_rule, ev.starts_at)
                : formatEventDate(ev.starts_at)}
              {ev.ends_at && !ev.is_recurring
                ? ` – ${new Date(ev.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                : ev.ends_at && ev.is_recurring
                ? ` – ${new Date(ev.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
                : ""}
            </Text>
            {ev.is_recurring && (
              <View style={styles.recurringBadge}>
                <Text style={styles.recurringBadgeText}>Recurring</Text>
              </View>
            )}
            {ev.description ? (
              <Text style={styles.eventDesc} numberOfLines={3}>
                {ev.description}
              </Text>
            ) : null}
            {ev.external_url || ev.ticket_url ? (
              <View style={styles.eventLinks}>
                {ev.external_url ? (
                  <Pressable onPress={() => Linking.openURL(ev.external_url!)}>
                    <Text style={styles.eventLink}>More info</Text>
                  </Pressable>
                ) : null}
                {ev.ticket_url ? (
                  <Pressable onPress={() => Linking.openURL(ev.ticket_url!)}>
                    <Text style={styles.eventLink}>Get tickets</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showScanBanner ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.scanBannerWrap, { opacity: bannerOpacity, top: insets.top + spacing.sm }]}
        >
          <View style={styles.scanBanner}>
            <Text style={styles.scanBannerText}>📍 Checked in!</Text>
          </View>
        </Animated.View>
      ) : null}
      <Text style={styles.title}>{venueName}</Text>
      <AddToItinerarySheet venueId={venueId} />
      {windowsForVenue.length === 0 && events.length === 0 ? (
        <Text style={styles.emptyText}>
          {venueName} doesn&apos;t have any published happy hours or events yet.
        </Text>
      ) : (
        <>
          <Text style={styles.subtitle}>Tap below to see Menus</Text>

          <Pressable
            onPress={handleCheckIn}
            disabled={checkingIn || checkedIn}
            accessibilityRole="button"
            accessibilityLabel={checkedIn ? "Checked in" : "Check in at this venue"}
            style={({ pressed }) => [
              styles.checkInButton,
              (checkingIn || checkedIn) && styles.checkInButtonDisabled,
              pressed && styles.checkInButtonPressed
            ]}
          >
            <Text style={styles.checkInButtonText}>
              {checkedIn ? "You're here ✓" : checkingIn ? "Checking in…" : "I'm here 🍻"}
            </Text>
          </Pressable>

          <FlatList
            data={windowsForVenue}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: spacing.xl + insets.bottom }]}
            refreshing={refreshing}
            onRefresh={refresh}
            ListHeaderComponent={<>{sections}</>}
            renderItem={({ item }) => (
              <HappyHourCard
                window={item}
                coverUrl={coverUrl}
                imageUrls={imageUrls}
                onPress={() =>
                  navigation.navigate("HappyHourDetail", {
                    windowId: item.id
                  })
                }
              />
            )}
          />
        </>
      )}
      <ImageLightbox
        visible={lightboxVisible}
        images={imageUrls}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxVisible(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: spacing.xl
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: spacing.xs
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.lg
  },
  checkInButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg
  },
  checkInButtonPressed: {
    opacity: 0.85
  },
  checkInButtonDisabled: {
    opacity: 0.6
  },
  checkInButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: "700"
  },
  listContent: {
    paddingBottom: spacing.xl
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14
  },
  section: {
    marginBottom: spacing.lg
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.sm
  },
  photoRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg
  },
  photoThumb: {
    width: 140,
    height: 105,
    borderRadius: 12,
    backgroundColor: colors.surface
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs
  },
  eventTypeBadge: {
    backgroundColor: colors.brandSubtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3
  },
  eventTypeBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700"
  },
  eventPrice: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700"
  },
  eventTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2
  },
  eventDate: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs
  },
  eventDesc: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.xs
  },
  eventLinks: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs
  },
  eventLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600"
  },
  recurringBadge: {
    backgroundColor: colors.brandSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
    marginTop: 2
  },
  recurringBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700"
  },
  scanBannerWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  scanBanner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: "#EAF6EC",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  scanBannerText: {
    color: "#1B7A34",
    fontSize: 15,
    fontWeight: "600",
  },
});
