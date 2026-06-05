import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Alert,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { usePublicItinerary } from "../hooks/usePublicItinerary";
import { SuperUserBadge } from "../components/SuperUserBadge";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = NativeStackScreenProps<RootStackParamList, "ItineraryDetail">;

const formatLocation = (venue: {
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}): string | null => {
  const parts = [venue.neighborhood, venue.city, venue.state].filter(
    (p): p is string => Boolean(p)
  );
  return parts.length > 0 ? parts.join(" · ") : null;
};

export const ItineraryDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { listId } = route.params;
  const insets = useSafeAreaInsets();
  const { header, venues, loading, error } = usePublicItinerary(listId);

  // Route params give an instant paint (feed / "Shared with me"); a notification
  // deep-link carries only listId, so fall back to the fetched header.
  const name = route.params.name ?? header?.name ?? "Itinerary";
  const description = route.params.description ?? header?.description ?? null;
  const authorHandle = route.params.authorHandle ?? header?.authorHandle ?? null;
  const authorDisplayName =
    route.params.authorDisplayName ?? header?.authorDisplayName ?? null;
  const authorAvatar = route.params.authorAvatar ?? header?.authorAvatar ?? null;

  const authorName = authorDisplayName ?? authorHandle ?? "HappiTime Insider";

  const handleOpenVenue = (venueId: string) => {
    navigation.navigate("VenuePreview", { venueId });
  };

  const handleViewOnMap = () => {
    const mappable = venues.filter(
      (v) =>
        v.lat != null &&
        v.lng != null &&
        Number.isFinite(Number(v.lat)) &&
        Number.isFinite(Number(v.lng))
    );
    if (mappable.length === 0) {
      Alert.alert(
        "No map pins yet",
        "The venues in this itinerary do not have map coordinates yet."
      );
      return;
    }
    navigation.navigate("AppTabs", {
      screen: "Map",
      params: {
        itineraryVenueIds: venues.map((v) => v.id),
        itineraryVenues: venues,
        itineraryName: name,
        itineraryRequestId: Date.now(),
      },
    });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    >
      <View style={styles.header}>
        {authorAvatar ? (
          <Image source={{ uri: authorAvatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{authorName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.title}>{name}</Text>
        <View style={styles.authorRow}>
          <Text style={styles.author} numberOfLines={1}>
            {authorHandle ? `@${authorHandle}` : authorName}
          </Text>
          <SuperUserBadge role="super_user" size="sm" />
        </View>
        {!loading ? (
          <Text style={styles.count}>
            {venues.length} {venues.length === 1 ? "spot" : "spots"}
          </Text>
        ) : null}
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>

      {!loading && venues.length > 0 ? (
        <Pressable
          onPress={handleViewOnMap}
          style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}
        >
          <Text style={styles.mapButtonText}>View all on map</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.stateWrap}>
          <LoadingSpinner />
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <ErrorState message={error} />
        </View>
      ) : venues.length === 0 ? (
        <View style={styles.stateWrap}>
          <Text style={styles.emptyText}>This itinerary doesn't have any venues yet.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {venues.map((venue, index) => {
            const location = formatLocation(venue);
            return (
              <Pressable
                key={venue.itemId}
                onPress={() => handleOpenVenue(venue.id)}
                style={({ pressed }) => [styles.venueRow, pressed && styles.pressed]}
              >
                <View style={styles.venueNumber}>
                  <Text style={styles.venueNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.venueText}>
                  <Text style={styles.venueName} numberOfLines={1}>
                    {venue.name}
                  </Text>
                  {location ? (
                    <Text style={styles.venueLocation} numberOfLines={1}>
                      {location}
                    </Text>
                  ) : null}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: spacing.md,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  avatarInitial: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.brandDark,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  author: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  count: {
    fontSize: 13,
    color: colors.textMutedLight,
    marginTop: spacing.xs,
  },
  description: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  mapButton: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  mapButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  stateWrap: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  venueNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  venueNumberText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brandDark,
  },
  venueText: {
    flex: 1,
  },
  venueName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  venueLocation: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: colors.textMutedLight,
    marginLeft: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
