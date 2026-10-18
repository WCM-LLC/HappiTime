// Per-venue Events & Specials page (spec 2026-08-05). The in-app home for a
// venue's recurring specials and upcoming events — "More info" links land
// here instead of bouncing to the venue website.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { supabase } from "../api/supabaseClient";
import { useVenueEvents, type VenueEventItem } from "../hooks/useVenueEvents";
import { EVENT_TYPE_LABELS, formatEventDate, formatEventTime, formatRecurrenceRule } from "../lib/eventDisplay";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import type { RootStackParamList } from "../navigation/types";

const EventRow: React.FC<{ ev: VenueEventItem; highlighted?: boolean }> = ({ ev, highlighted }) => (
  <View style={[styles.card, highlighted && styles.cardHighlighted]}>
    {highlighted ? <Text style={styles.highlightLabel}>From your notification</Text> : null}
    <View style={styles.cardHeader}>
      <View style={styles.typeBadge}>
        <Text style={styles.typeBadgeText}>{EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}</Text>
      </View>
      {ev.price_info ? <Text style={styles.price}>{ev.price_info}</Text> : null}
    </View>
    <Text style={styles.title}>{ev.title}</Text>
    <Text style={styles.date}>
      {ev.is_recurring ? formatRecurrenceRule(ev.recurrence_rule, ev.starts_at, ev.timezone ?? undefined) : formatEventDate(ev.starts_at, ev.timezone ?? undefined)}
      {ev.ends_at
        ? ` – ${formatEventTime(ev.ends_at, ev.timezone ?? undefined)}`
        : ""}
    </Text>
    {ev.description ? <Text style={styles.desc}>{ev.description}</Text> : null}
    {ev.ticket_url || ev.external_url ? (
      <View style={styles.links}>
        {ev.ticket_url ? (
          <Pressable accessibilityRole="button" onPress={() => Linking.openURL(ev.ticket_url!)}>
            <Text style={styles.link}>Get tickets</Text>
          </Pressable>
        ) : null}
        {ev.external_url ? (
          <Pressable accessibilityRole="button" onPress={() => Linking.openURL(ev.external_url!)}>
            <Text style={styles.linkSecondary}>Visit website</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null}
  </View>
);

export const VenueEventsScreen: React.FC = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { venueId, venueName, eventId } =
    (route.params as RootStackParamList["VenueEvents"]) ?? { venueId: "" };
  const { data: events, loading, error } = useVenueEvents(venueId || null);

  // A notification deep-link carries only venueId (+ eventId); look the name
  // up so the page says "Dos Lokos Sports Cantina", not "Events & Specials".
  const [fetchedName, setFetchedName] = useState<string | null>(null);
  useEffect(() => {
    if (venueName || !venueId) return;
    let cancelled = false;
    (supabase as any)
      .from("venues")
      .select("name")
      .eq("id", venueId)
      .maybeSingle()
      .then(({ data }: { data: { name?: string } | null }) => {
        if (!cancelled && data?.name) setFetchedName(data.name);
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, venueName]);
  const displayName = venueName || fetchedName || "";
  useEffect(() => {
    if (displayName) navigation.setOptions({ title: displayName });
  }, [displayName, navigation]);

  // The tapped event goes first in its section and gets a highlight.
  const pinFirst = (list: VenueEventItem[]) =>
    eventId ? [...list].sort((a, b) => Number(b.id === eventId) - Number(a.id === eventId)) : list;
  const recurring = pinFirst(events.filter((e) => e.is_recurring));
  const upcoming = pinFirst(events.filter((e) => !e.is_recurring));

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <View style={styles.centered}>
        <ErrorState message={error.message} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>{displayName || "Events & Specials"}</Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>No published events or specials yet.</Text>
      ) : (
        <>
          {recurring.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Recurring specials & events</Text>
              {recurring.map((ev) => <EventRow key={ev.id} ev={ev} highlighted={ev.id === eventId} />)}
            </>
          ) : null}
          {upcoming.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Upcoming</Text>
              {upcoming.map((ev) => <EventRow key={ev.id} ev={ev} highlighted={ev.id === eventId} />)}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  pageTitle: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  empty: { fontSize: 14, color: colors.textMuted, marginTop: spacing.md },
  card: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cardHighlighted: {
    backgroundColor: colors.brandSubtle,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0,
    marginBottom: spacing.sm,
  },
  highlightLabel: { fontSize: 11, fontWeight: "700", color: colors.brandDark, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 4 },
  // eventTypeBadge/eventTypeBadgeText copied verbatim from EventCalendarScreen —
  // colors.primaryLight does not exist in the theme.
  typeBadge: { backgroundColor: colors.brandSubtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  typeBadgeText: { color: colors.brandDark, fontSize: 11, fontWeight: "700" },
  price: { fontSize: 12, color: colors.textMuted },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  date: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  desc: { fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  links: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm },
  link: { fontSize: 13, fontWeight: "600", color: colors.brandDark },
  linkSecondary: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
});
