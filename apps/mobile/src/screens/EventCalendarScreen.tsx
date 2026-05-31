import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Linking,
  RefreshControl,
  ScrollView,
  type ScrollView as ScrollViewType,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUpcomingEvents, type UpcomingEvent } from "../hooks/useUpcomingEvents";
import { tierVariant } from "../lib/venueTier";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useUserFollowedVenues } from "../hooks/useUserFollowedVenues";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

/* ── Date/format helpers ── */

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dayName}, ${month} ${day} at ${time}`;
}

function formatRecurrenceRule(rule: string | null, startTime: string): string {
  const DOW_MAP: Record<string, string> = {
    SU: "Sun", MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat",
  };
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

/* ── Recurrence helpers ── */

const DOW_RRULE: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

// Returns true if a recurring event's BYDAY schedule includes the given JS day-of-week (0=Sun).
// Falls back to the DOW of starts_at when no BYDAY is present.
function recurringOccursOnDow(rule: string | null, startTime: string, targetDow: number): boolean {
  if (!rule) return new Date(startTime).getDay() === targetDow;
  const match = rule.match(/BYDAY=([A-Z,]+)/);
  if (!match) return new Date(startTime).getDay() === targetDow;
  return match[1].split(",").some((d) => DOW_RRULE[d] === targetDow);
}

// Returns true if any of the next 7 days (starting from today) matches the recurrence schedule.
function recurringOccursThisWeek(rule: string | null, startTime: string, todayDow: number): boolean {
  for (let i = 0; i < 7; i++) {
    if (recurringOccursOnDow(rule, startTime, (todayDow + i) % 7)) return true;
  }
  return false;
}

/* ── Filter definitions ── */

type EventFilter = "all" | "following" | "interests" | "today" | "this_week" | "happening_now" | "featured";

type FilterDef = { key: EventFilter; label: string; authOnly?: boolean };

const ALL_FILTERS: FilterDef[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "happening_now", label: "Happening Now" },
  { key: "featured", label: "Featured" },
  { key: "following", label: "Following", authOnly: true },
  { key: "interests", label: "Interests", authOnly: true },
];

// Maps onboarding interest values to venue_event event_type values.
const INTEREST_TO_EVENT_TYPES: Record<string, string[]> = {
  live_music: ["live_music"],
  sports_bars: ["sports"],
  happy_hours: ["special"],
  cocktails: ["special"],
  beer: ["special"],
  wine: ["special"],
  brunch: ["event"],
  coffee: ["event"],
  date_night: ["event", "special", "live_music"],
  casual_dining: ["event", "special"],
  family_friendly: ["trivia", "sports", "event"],
  late_night: ["live_music", "event", "special"],
};

function deriveEventTypesFromInterests(interests: string[]): string[] {
  const types = new Set<string>();
  for (const interest of interests) {
    for (const t of INTEREST_TO_EVENT_TYPES[interest] ?? []) {
      types.add(t);
    }
  }
  return Array.from(types);
}

function applyFilter(
  events: UpcomingEvent[],
  filter: EventFilter,
  followedVenueIds: string[],
  interestEventTypes: string[]
): UpcomingEvent[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  switch (filter) {
    case "all":
      return events;

    case "following":
      return events.filter((ev) => followedVenueIds.includes(ev.venue_id));

    case "interests":
      if (interestEventTypes.length === 0) return events;
      return events.filter((ev) => interestEventTypes.includes(ev.event_type));

    case "today":
      return events.filter((ev) => {
        if (ev.is_recurring) return recurringOccursOnDow(ev.recurrence_rule, ev.starts_at, now.getDay());
        const d = new Date(ev.starts_at);
        return d >= todayStart && d < todayEnd;
      });

    case "this_week":
      return events.filter((ev) => {
        if (ev.is_recurring) return recurringOccursThisWeek(ev.recurrence_rule, ev.starts_at, now.getDay());
        const d = new Date(ev.starts_at);
        return d >= todayStart && d < weekEnd;
      });

    case "happening_now":
      // Recurring events require a calendar engine to determine current occurrence — excluded.
      return events.filter((ev) => {
        if (ev.is_recurring) return false;
        const start = new Date(ev.starts_at);
        const end = ev.ends_at
          ? new Date(ev.ends_at)
          : new Date(start.getTime() + 3 * 60 * 60 * 1000); // assume 3h window if no end time
        return start <= now && end >= now;
      });

    case "featured":
      // Featured filter = featured-level tiers (featured / founding_pilot / bundles).
      return events.filter((ev) => tierVariant(ev.venues?.promotion_tier) === "featured");
  }
}

/* ── Sub-components ── */

const EventCard: React.FC<{ event: UpcomingEvent; onPress: () => void }> = ({ event: ev, onPress }) => {
  const venueName = ev.venues?.name ?? null;
  const neighborhood = ev.venues?.neighborhood ?? ev.venues?.city ?? null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.eventCard, pressed && { opacity: 0.75 }]}
    >
      <View style={styles.eventHeader}>
        <View style={styles.eventTypeBadge}>
          <Text style={styles.eventTypeBadgeText}>
            {EVENT_TYPE_LABELS[ev.event_type] ?? ev.event_type}
          </Text>
        </View>
        {ev.price_info ? (
          <Text style={styles.eventPrice}>{ev.price_info}</Text>
        ) : null}
        {ev.is_recurring ? (
          <View style={styles.recurringBadge}>
            <Text style={styles.recurringBadgeText}>Recurring</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.eventTitle}>{ev.title}</Text>

      <Text style={styles.eventDate}>
        {ev.is_recurring
          ? formatRecurrenceRule(ev.recurrence_rule, ev.starts_at)
          : formatEventDate(ev.starts_at)}
        {ev.ends_at
          ? ` – ${new Date(ev.ends_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
          : ""}
      </Text>

      {venueName ? (
        <View style={styles.venueRow}>
          <Text style={styles.venueName}>{venueName}</Text>
          {neighborhood ? (
            <Text style={styles.venueNeighborhood}> · {neighborhood}</Text>
          ) : null}
        </View>
      ) : null}

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
    </Pressable>
  );
};

const FilterBar: React.FC<{
  filters: FilterDef[];
  active: EventFilter;
  onChange: (f: EventFilter) => void;
}> = ({ filters, active, onChange }) => {
  const scrollRef = useRef<ScrollViewType>(null);
  const chipLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [barWidth, setBarWidth] = useState(0);

  const handlePress = (key: EventFilter) => {
    onChange(key);
    const layout = chipLayouts.current[key];
    if (layout && scrollRef.current && barWidth > 0) {
      const scrollX = layout.x - barWidth / 2 + layout.width / 2;
      scrollRef.current.scrollTo({ x: Math.max(0, scrollX), animated: true });
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterBarScroll}
      contentContainerStyle={styles.filterBar}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      {filters.map((f) => (
        <Pressable
          key={f.key}
          onPress={() => handlePress(f.key)}
          onLayout={(e) => {
            chipLayouts.current[f.key] = {
              x: e.nativeEvent.layout.x,
              width: e.nativeEvent.layout.width,
            };
          }}
          style={({ pressed }) => [
            styles.chip,
            active === f.key && styles.chipActive,
            pressed && styles.chipPressed,
          ]}
        >
          <Text style={[styles.chipText, active === f.key && styles.chipTextActive]} numberOfLines={1}>
            {f.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

/* ── Screen ── */

export const EventCalendarScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useCurrentUser();
  const isGuest = !user;

  const { data, loading, error, refresh } = useUpcomingEvents(60);
  const { venueIds: followedVenueIds } = useUserFollowedVenues();
  const { preferences } = useUserPreferences();

  const [activeFilter, setActiveFilter] = useState<EventFilter>("all");

  const interestEventTypes = useMemo(
    () => deriveEventTypesFromInterests(preferences.interests),
    [preferences.interests]
  );

  const visibleFilters = useMemo(() => {
    if (isGuest) return ALL_FILTERS.filter((f) => !f.authOnly);
    // Hide "Interests" if the user hasn't set any
    return ALL_FILTERS.filter(
      (f) => !(f.key === "interests" && preferences.interests.length === 0)
    );
  }, [isGuest, preferences.interests]);

  const filtered = useMemo(
    () => applyFilter(data, activeFilter, followedVenueIds, interestEventTypes),
    [data, activeFilter, followedVenueIds, interestEventTypes]
  );

  // Reset to "all" if the active filter is no longer visible (e.g. user signed out)
  const safeFilter = visibleFilters.some((f) => f.key === activeFilter)
    ? activeFilter
    : "all";

  if (loading && data.length === 0) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner />
      </View>
    );
  }

  if (error && data.length === 0) {
    return (
      <View style={styles.centered}>
        <ErrorState message={error.message} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FilterBar filters={visibleFilters} active={safeFilter} onChange={setActiveFilter} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: spacing.xl + insets.bottom, flexGrow: 1 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <EventCard
            event={item}
            onPress={() => navigation.navigate("VenuePreview", { venueId: item.venue_id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No events found</Text>
            <Text style={styles.emptySubtitle}>
              {activeFilter === "following"
                ? "Follow venues to see their events here."
                : activeFilter === "interests"
                ? "No events match your interests right now."
                : activeFilter === "happening_now"
                ? "Nothing is happening right now. Check back soon."
                : activeFilter === "featured"
                ? "No featured events at the moment."
                : "Check back soon — events are added regularly."}
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterBarScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  eventCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
    flexWrap: "wrap",
  },
  eventTypeBadge: {
    backgroundColor: colors.brandSubtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  eventTypeBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  eventPrice: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  recurringBadge: {
    backgroundColor: colors.brandSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  recurringBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "700",
  },
  eventTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  eventDate: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  venueRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
    flexWrap: "wrap",
  },
  venueName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  venueNeighborhood: {
    color: colors.textMuted,
    fontSize: 13,
  },
  eventDesc: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  eventLinks: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  eventLink: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  emptyWrap: {
    paddingTop: spacing["3xl"],
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
