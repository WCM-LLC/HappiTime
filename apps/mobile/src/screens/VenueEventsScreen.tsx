// Per-venue Events & Specials page (spec 2026-08-05). The in-app home for a
// venue's recurring specials and upcoming events — "More info" links land
// here instead of bouncing to the venue website.
import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useRoute } from "@react-navigation/native";
import { useVenueEvents, type VenueEventItem } from "../hooks/useVenueEvents";
import { EVENT_TYPE_LABELS, formatEventDate, formatRecurrenceRule } from "../lib/eventDisplay";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import type { RootStackParamList } from "../navigation/types";

const EventRow: React.FC<{ ev: VenueEventItem }> = ({ ev }) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.typeBadge}>
        <Text style={styles.typeBadgeText}>{EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}</Text>
      </View>
      {ev.price_info ? <Text style={styles.price}>{ev.price_info}</Text> : null}
    </View>
    <Text style={styles.title}>{ev.title}</Text>
    <Text style={styles.date}>
      {ev.is_recurring ? formatRecurrenceRule(ev.recurrence_rule, ev.starts_at) : formatEventDate(ev.starts_at)}
      {ev.ends_at
        ? ` – ${new Date(ev.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
        : ""}
    </Text>
    {ev.description ? <Text style={styles.desc}>{ev.description}</Text> : null}
    {ev.ticket_url || ev.external_url ? (
      <View style={styles.links}>
        {ev.ticket_url ? (
          <Pressable onPress={() => Linking.openURL(ev.ticket_url!)}>
            <Text style={styles.link}>Get tickets</Text>
          </Pressable>
        ) : null}
        {ev.external_url ? (
          <Pressable onPress={() => Linking.openURL(ev.external_url!)}>
            <Text style={styles.linkSecondary}>Visit website</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null}
  </View>
);

export const VenueEventsScreen: React.FC = () => {
  const route = useRoute();
  const { venueId, venueName } = (route.params as RootStackParamList["VenueEvents"]) ?? { venueId: "" };
  const { data: events, loading } = useVenueEvents(venueId || null);

  const recurring = events.filter((e) => e.is_recurring);
  const upcoming = events.filter((e) => !e.is_recurring);

  if (loading) return <LoadingSpinner />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>{venueName || "Events & Specials"}</Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>No published events or specials yet.</Text>
      ) : (
        <>
          {recurring.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Recurring specials & events</Text>
              {recurring.map((ev) => <EventRow key={ev.id} ev={ev} />)}
            </>
          ) : null}
          {upcoming.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Upcoming</Text>
              {upcoming.map((ev) => <EventRow key={ev.id} ev={ev} />)}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  pageTitle: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  empty: { fontSize: 14, color: colors.textMuted, marginTop: spacing.md },
  card: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 },
  // eventTypeBadge/eventTypeBadgeText copied verbatim from EventCalendarScreen —
  // colors.primaryLight does not exist in the theme.
  typeBadge: { backgroundColor: colors.brandSubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  typeBadgeText: { color: colors.primary, fontSize: 11, fontWeight: "700" },
  price: { fontSize: 12, color: colors.textMuted },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  date: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  desc: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  links: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  link: { fontSize: 13, fontWeight: "600", color: colors.primary },
  linkSecondary: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
});
