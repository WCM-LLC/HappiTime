import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { supabase } from "../api/supabaseClient";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import type { ItineraryMapVenue, RootStackParamList } from "../navigation/types";
import { useSaveSharedItinerary } from "../hooks/useSaveSharedItinerary";

// Read-only viewer for an itinerary opened via a share link. Data comes from the
// get_shared_itinerary(p_token) RPC (SECURITY DEFINER → bypasses RLS), so it renders
// even for private lists the viewer isn't a member of. Tapping a venue still routes
// into the normal VenuePreview screen. The viewer can Save a copy into their own
// itineraries, or open it on the Map (which also offers the same Save).

type SharedItem = {
  venue_id: string;
  name: string;
  slug: string | null;
  org_name: string | null;
  cuisine_type: string | null;
  price_tier: number | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  timezone: string | null;
  tags: string[] | null;
  app_name_preference: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  promotion_tier: string | null;
  promotion_priority: number | null;
  address: string | null;
  notes: string | null;
};

function toMapVenue(item: SharedItem): ItineraryMapVenue {
  return {
    id: item.venue_id,
    name: item.name,
    org_name: item.org_name,
    address: item.address,
    neighborhood: item.neighborhood,
    city: item.city,
    state: item.state,
    zip: item.zip,
    timezone: item.timezone,
    tags: item.tags,
    cuisine_type: item.cuisine_type,
    price_tier: item.price_tier,
    app_name_preference: item.app_name_preference,
    status: item.status,
    lat: item.lat,
    lng: item.lng,
    phone: item.phone,
    website: item.website,
    facebook_url: item.facebook_url,
    instagram_url: item.instagram_url,
    tiktok_url: item.tiktok_url,
    promotion_tier: item.promotion_tier,
    promotion_priority: item.promotion_priority,
  };
}

type SharedItinerary = {
  id: string;
  name: string;
  description: string | null;
  author_handle: string | null;
  author_display_name: string | null;
  items: SharedItem[];
};

const priceLabel = (tier: number | null) => (tier && tier > 0 ? "$".repeat(tier) : null);

function metaLine(item: SharedItem): string {
  return [
    item.cuisine_type,
    priceLabel(item.price_tier),
    item.neighborhood ? item.neighborhood.replace(/_/g, " ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

type Props = NativeStackScreenProps<RootStackParamList, "SharedItinerary">;

export const SharedItineraryScreen: React.FC<Props> = ({ route, navigation }) => {
  const { token } = route.params;

  const [itinerary, setItinerary] = useState<SharedItinerary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const { saving, save } = useSaveSharedItinerary();
  const [savedListId, setSavedListId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc("get_shared_itinerary", {
        p_token: token,
      });
      if (cancelled) return;
      if (error || !data) {
        setStatus("error");
        return;
      }
      setItinerary(data as SharedItinerary);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (status === "error" || !itinerary) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Itinerary unavailable</Text>
        <Text style={styles.emptyText}>
          This shared link may have expired or been removed.
        </Text>
      </View>
    );
  }

  const author = itinerary.author_display_name ?? itinerary.author_handle;

  const handleSave = async () => {
    if (savedListId) {
      navigation.navigate("AppTabs", {
        screen: "Favorites",
        params: { openListId: savedListId, tab: "lists" },
      });
      return;
    }
    const result = await save(token);
    if (result.ok) {
      setSavedListId(result.listId);
      navigation.navigate("AppTabs", {
        screen: "Favorites",
        params: { openListId: result.listId, tab: "lists" },
      });
    } else if ("needsAuth" in result) {
      Alert.alert("Sign in to save", "Create an account or sign in to save this itinerary.", [
        { text: "Not now", style: "cancel" },
        { text: "Sign in", onPress: () => navigation.navigate("Auth") },
      ]);
    } else {
      Alert.alert("Couldn't save", result.error);
    }
  };

  const handleViewOnMap = () => {
    const mapVenues = itinerary.items.map(toMapVenue);
    const mappable = mapVenues.filter(
      (v) => v.lat != null && v.lng != null && Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lng))
    );
    if (mappable.length === 0) {
      Alert.alert("No map pins yet", "The venues in this itinerary don't have map coordinates yet.");
      return;
    }
    navigation.navigate("AppTabs", {
      screen: "Map",
      params: {
        itineraryVenueIds: mapVenues.map((v) => v.id),
        itineraryVenues: mapVenues,
        itineraryName: itinerary.name,
        itineraryShareToken: token,
        itineraryRequestId: Date.now(),
      },
    });
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>HappiTime Itinerary</Text>
      <Text style={styles.title}>{itinerary.name}</Text>
      {author ? (
        <Text style={styles.author}>
          Shared by {author}
          {itinerary.author_handle ? ` (@${itinerary.author_handle})` : ""}
        </Text>
      ) : null}
      {itinerary.description && itinerary.description !== itinerary.name ? (
        <Text style={styles.description}>{itinerary.description}</Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveButton, pressed && styles.cardPressed]}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>
              {savedListId ? "Saved ✓ — View" : "Save to my itineraries"}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={handleViewOnMap}
          style={({ pressed }) => [styles.mapButton, pressed && styles.cardPressed]}
        >
          <Text style={styles.mapButtonText}>View on map</Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {itinerary.items.map((item, idx) => {
          const meta = metaLine(item);
          const location = [item.address, item.city, item.state].filter(Boolean).join(", ");
          return (
            <Pressable
              key={item.venue_id}
              onPress={() => navigation.navigate("VenuePreview", { venueId: item.venue_id })}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{idx + 1}</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.venueName}>{item.name}</Text>
                {meta ? <Text style={styles.venueMeta}>{meta}</Text> : null}
                {location ? <Text style={styles.venueMeta}>{location}</Text> : null}
                {item.notes ? <Text style={styles.venueNotes}>“{item.notes}”</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {itinerary.items.length === 0 ? (
        <Text style={styles.emptyText}>This itinerary doesn’t have any spots yet.</Text>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: spacing.xs,
  },
  author: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  description: { color: colors.text, fontSize: 15, marginTop: spacing.sm, lineHeight: 21 },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  saveButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  mapButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  mapButtonText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  list: { marginTop: spacing.lg, gap: spacing.sm },
  card: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardPressed: { opacity: 0.8 },
  badge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  cardBody: { flex: 1, minWidth: 0 },
  venueName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  venueMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  venueNotes: { color: colors.text, fontSize: 14, marginTop: spacing.xs },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
});
