import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ScrollView,
  Pressable,
  Linking
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useHappyHours } from "../hooks/useHappyHours";
import { HappyHourCard } from "../components/HappyHourCard";
import { useVenueEvents } from "../hooks/useVenueEvents";
import { useVenueMedia } from "../hooks/useVenueMedia";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
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

export const VenuePreviewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { venueId } = route.params;
  const { data, loading, error, refreshing, refresh } = useHappyHours();
  const { data: events } = useVenueEvents(venueId ?? null);
  const { media } = useVenueMedia(venueId ?? null);

  const windowsForVenue = useMemo(
    () => data.filter((w) => w.venue_id === venueId),
    [data, venueId]
  );

  const venueName = windowsForVenue[0]?.venue?.name ?? "This venue";
  const images = useMemo(
    () => [...media].sort((a, b) => a.sort_order - b.sort_order),
    [media]
  );
  const coverUrl = images[0]?.url ?? null;

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
          {images.map((img) => (
            <Image
              key={img.id}
              source={{ uri: img.url }}
              style={styles.photoThumb}
              resizeMode="cover"
            />
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
      {windowsForVenue.length === 0 && events.length === 0 ? (
        <Text style={styles.emptyText}>
          {venueName} doesn&apos;t have any published happy hours or events yet.
        </Text>
      ) : (
        <>
          <Text style={styles.title}>{venueName}</Text>
          <Text style={styles.subtitle}>Preview of this venue in the app</Text>

          <FlatList
            data={windowsForVenue}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={refresh}
            ListHeaderComponent={<>{sections}</>}
            renderItem={({ item }) => (
              <HappyHourCard
                window={item}
                coverUrl={coverUrl}
                imageUrls={images.map((img) => img.url)}
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
  }
});
