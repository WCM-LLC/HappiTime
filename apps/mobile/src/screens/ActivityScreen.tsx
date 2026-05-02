// src/screens/ActivityScreen.tsx
import React, { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { useFriendActivity, type ActivityItem } from "../hooks/useFriendActivity";
import { useFriendSuggestions, type FriendSuggestion } from "../hooks/useFriendSuggestions";
import { useDiscoverFeed, type DiscoverFeedItem } from "../hooks/useDiscoverFeed";
import { useUserFollowers } from "../hooks/useUserFollowers";
import { useUserCheckins, type CheckInItem } from "../hooks/useUserCheckins";
import { isFeatureEnabled } from "../lib/featureFlags";
import { colors } from "../theme/colors";
import { SuggestionCard } from "../components/SuggestionCard";
import { spacing } from "../theme/spacing";

/* ── Helpers ── */

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - Date.parse(iso);
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const RatingStars: React.FC<{ rating: number }> = ({ rating }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Text key={i} style={i <= rating ? styles.starFilled : styles.starEmpty}>
        {"★"}
      </Text>
    );
  }
  return <View style={styles.starsRow}>{stars}</View>;
};

/* ── Pending Request Card ── */

const PendingRequestCard: React.FC<{
  id: string;
  name: string;
  avatarUrl: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}> = ({ id, name, avatarUrl, onApprove, onReject }) => (
  <View style={styles.pendingCard}>
    <View style={styles.avatarWrap}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
    <View style={styles.pendingTextWrap}>
      <Text style={styles.actor}>{name}</Text>
      <Text style={styles.message}>wants to follow you</Text>
    </View>
    <View style={styles.pendingActions}>
      <Pressable
        onPress={() => onApprove(id)}
        style={({ pressed }) => [styles.acceptButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.acceptText}>Accept</Text>
      </Pressable>
      <Pressable
        onPress={() => onReject(id)}
        style={({ pressed }) => [styles.rejectButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.rejectText}>Reject</Text>
      </Pressable>
    </View>
  </View>
);

/* ── Activity Card ── */

const ActivityCard: React.FC<{ item: ActivityItem }> = ({ item }) => (
  <View style={styles.row}>
    <View style={styles.avatarWrap}>
      {item.userAvatar ? (
        <Image source={{ uri: item.userAvatar }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>
            {item.userName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
    <View style={styles.textContainer}>
      <View style={styles.nameRow}>
        <Text style={styles.actor}>{item.userName}</Text>
        <Text style={styles.when}>{timeAgo(item.visitedAt)}</Text>
      </View>
      <Text style={styles.message}>
        {item.isAnonymized ? (
          "checked in privately"
        ) : (
          <>
            visited <Text style={styles.venueName}>{item.venueName}</Text>
          </>
        )}
      </Text>
      {item.rating != null && <RatingStars rating={item.rating} />}
      {item.comment ? (
        <Text style={styles.comment} numberOfLines={2}>
          {item.comment}
        </Text>
      ) : null}
    </View>
  </View>
);

/* ── Suggestion Card ── */

const SuggestionCard: React.FC<{
  suggestion: FriendSuggestion;
  onFollow: (userId: string) => void;
  following: boolean;
}> = ({ suggestion, onFollow, following }) => {
  const name =
    suggestion.display_name ?? suggestion.handle ?? suggestion.user_id.slice(0, 8);

  return (
    <View style={styles.row}>
      <View style={styles.avatarWrap}>
        {suggestion.avatar_url ? (
          <Image source={{ uri: suggestion.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.actor}>{name}</Text>
        {suggestion.handle ? (
          <Text style={styles.handle}>@{suggestion.handle}</Text>
        ) : null}
        <Text style={styles.message}>
          You both visited{" "}
          <Text style={styles.venueName}>{suggestion.shared_venue_name}</Text>
        </Text>
      </View>
      <View style={styles.trailing}>
        <Pressable
          onPress={() => onFollow(suggestion.user_id)}
          disabled={following}
          style={({ pressed }) => [
            styles.followButton,
            following && styles.followButtonActive,
            pressed && styles.followButtonPressed,
          ]}
        >
          <Text
            style={[styles.followText, following && styles.followTextActive]}
          >
            {following ? "Requested" : "Follow"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const DiscoverFeedCard: React.FC<{ item: DiscoverFeedItem }> = ({ item }) => {
  const actor = item.userHandle ? `@${item.userHandle}` : item.userDisplayName ?? "a HappiTime user";
  const message = (() => {
    if (item.eventType === "itinerary_share") {
      const itineraryName = item.itineraryName ?? "an itinerary";
      return `${actor} shared their itinerary ${itineraryName}`;
    }
    if (item.eventType === "auto_checkin") {
      if (item.isPrivate) return "a HappiTime user checked in";
      const venueName = item.venueName ?? "a venue";
      return `${actor} checked in at ${venueName}`;
    }
    if (item.eventType === "rating") return `${actor} left a new rating`;
    if (item.eventType === "comment") return `${actor} posted a comment`;
    if (item.eventType === "follow") return `${actor} followed someone new`;
    return `${actor} had new activity`;
  })();

  return (
    <View style={styles.row}>
      <View style={styles.textContainer}>
        <View style={styles.nameRow}>
          <Text style={styles.when}>{timeAgo(item.createdAt)}</Text>
        </View>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
};

/* ── Check-In Card ── */

const CheckInCard: React.FC<{
  item: CheckInItem;
  onTogglePrivacy: (id: string, makePrivate: boolean) => void;
}> = ({ item, onTogglePrivacy }) => {
  const isAuto = item.source === "auto_proximity";

  return (
    <View style={styles.checkinRow}>
      <View style={styles.checkinIcon}>
        <Text style={styles.checkinIconText}>{isAuto ? "📍" : "✓"}</Text>
      </View>
      <View style={styles.textContainer}>
        <View style={styles.nameRow}>
          <Text style={styles.actor} numberOfLines={1}>{item.venue_name}</Text>
          <Text style={styles.when}>{timeAgo(item.entered_at)}</Text>
        </View>
        <Text style={styles.checkinDate}>{formatDate(item.entered_at)}</Text>
        <View style={styles.checkinMeta}>
          {isAuto && (
            <View style={styles.autoBadge}>
              <Text style={styles.autoBadgeText}>Auto</Text>
            </View>
          )}
          {item.rating != null && <RatingStars rating={item.rating} />}
        </View>
      </View>
      <Pressable
        onPress={() => onTogglePrivacy(item.id, !item.is_private)}
        style={({ pressed }) => [styles.privacyButton, pressed && styles.buttonPressed]}
        hitSlop={8}
      >
        <Text style={styles.privacyIcon}>{item.is_private ? "🔒" : "👁"}</Text>
      </Pressable>
    </View>
  );
};

/* ── Main Screen ── */

type Tab = "friends" | "discover" | "checkins";
type DiscoverListItem =
  | { kind: "feed"; id: string; item: DiscoverFeedItem }
  | { kind: "suggestion"; id: string; item: FriendSuggestion };

export const ActivityScreen: React.FC = () => {
  const [tab, setTab] = useState<Tab>("friends");
  const {
    pendingRequests,
    loading: followersLoading,
    approveFollowRequest,
    rejectFollowRequest,
  } = useUserFollowers();
  const { activities, loading: activityLoading, refresh: refreshActivity } = useFriendActivity();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { items: discoverItems, loading: suggestionsLoading, refresh: refreshSuggestions } = useDiscoverActivity();
  const {
    feed: discoverFeed,
    loading: discoverLoading,
    refresh: refreshDiscoverFeed,
  } = useDiscoverFeed();
  const {
    checkins,
    loading: checkinsLoading,
    refresh: refreshCheckins,
    togglePrivacy,
  } = useUserCheckins();
  const { preferences, savePreferences } = useUserPreferences();

  const [requestedUsers, setRequestedUsers] = useState<Record<string, boolean>>({});
  const useDiscoverFeedSource = isFeatureEnabled("discoverFeedFromUserEvents");
  const discoverListData: DiscoverListItem[] = useDiscoverFeedSource
    ? discoverFeed.map((item) => ({ kind: "feed" as const, id: item.id, item }))
    : suggestions.map((item) => ({ kind: "suggestion" as const, id: item.user_id, item }));

  const handleDiscoverPress = (listId: string) => {
    navigation.navigate("AppTabs", { screen: "Favorites", params: { openListId: listId } } as any);
  };

  const handleApprove = (followId: string) => {
    void approveFollowRequest(followId);
  };

  const handleReject = (followId: string) => {
    void rejectFollowRequest(followId);
  };

  const isLoading =
    tab === "friends" ? followersLoading || activityLoading
    : tab === "discover" ? (useDiscoverFeedSource ? discoverLoading : suggestionsLoading)
    : checkinsLoading;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Activity</Text>
      <SegmentedTabs
        tabs={[
          { key: "friends", label: "Friends" },
          { key: "discover", label: "Discover" },
          { key: "checkins", label: "Check Ins" },
        ]}
        activeKey={tab}
        onChange={(key) => setTab(key as Tab)}
      />

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : tab === "friends" ? (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={refreshActivity}
          refreshing={activityLoading}
          ListHeaderComponent={
            pendingRequests.length > 0 ? (
              <View style={styles.pendingSection}>
                <Text style={styles.sectionTitle}>Follow Requests</Text>
                {pendingRequests.map((req) => {
                  const name =
                    req.profile?.display_name ??
                    req.profile?.handle ??
                    req.follower_id.slice(0, 8);
                  return (
                    <PendingRequestCard
                      key={req.follower_id}
                      id={req.follower_id}
                      name={name}
                      avatarUrl={req.profile?.avatar_url ?? null}
                      onApprove={handleApprove}
                      onReject={handleReject}
                    />
                  );
                })}
                <View style={styles.sectionDivider} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No friend activity yet</Text>
              <Text style={styles.emptyText}>
                Follow friends to see where they're going!
              </Text>
            </View>
          }
          renderItem={({ item }) => <ActivityCard item={item} />}
        />
      ) : tab === "discover" ? (
        <FlatList
          data={discoverListData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={useDiscoverFeedSource ? refreshDiscoverFeed : refreshSuggestions}
          refreshing={useDiscoverFeedSource ? discoverLoading : suggestionsLoading}
          ListHeaderComponent={
            suggestions.length > 0 && useDiscoverFeedSource ? (
              <View style={styles.pendingSection}>
                <Text style={styles.sectionTitle}>Suggested people</Text>
                {suggestions.slice(0, 5).map((item) => (
                  <SuggestionCard
                    key={item.user_id}
                    suggestion={item}
                    onFollow={handleFollow}
                    following={requestedUsers[item.user_id] ?? false}
                  />
                ))}
                <View style={styles.sectionDivider} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {useDiscoverFeedSource ? "No discover activity yet" : "No suggestions yet"}
              </Text>
              <Text style={styles.emptyText}>
                {useDiscoverFeedSource
                  ? "Visit more venues to populate your discover feed."
                  : "Visit more venues to discover people with similar taste!"}
              </Text>
              {useDiscoverFeedSource && suggestions.length > 0 ? (
                <View style={styles.pendingSection}>
                  <Text style={styles.sectionTitle}>Suggested people</Text>
                  {suggestions.slice(0, 5).map((item) => (
                    <SuggestionCard
                      key={item.user_id}
                      suggestion={item}
                      onFollow={handleFollow}
                      following={requestedUsers[item.user_id] ?? false}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) =>
            item.kind === "feed" ? (
              <DiscoverFeedCard item={item.item} />
            ) : (
              <SuggestionCard
                suggestion={item.item}
                onFollow={handleFollow}
                following={requestedUsers[item.item.user_id] ?? false}
              />
            )
          }
        />
      ) : (
        <FlatList
          data={checkins}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={refreshCheckins}
          refreshing={checkinsLoading}
          ListHeaderComponent={
            <View style={styles.privacyNote}>
              <Text style={styles.privacyNoteText}>
                Tap 👁 to make a check-in visible to friends, or 🔒 to keep it private.
              </Text>
              {!preferences.checkin_default_privacy ? (
                <View style={styles.privacyChoiceWrap}>
                  <Text style={styles.privacyChoiceTitle}>Default check-in privacy</Text>
                  <View style={styles.privacyChoiceRow}>
                    <Pressable
                      style={styles.privacyChoiceBtn}
                      onPress={() => void savePreferences({ checkin_default_privacy: "private" })}
                    >
                      <Text style={styles.privacyChoiceBtnText}>Keep Private</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.privacyChoiceBtn, styles.privacyChoiceBtnAlt]}
                      onPress={() => void savePreferences({ checkin_default_privacy: "public" })}
                    >
                      <Text style={[styles.privacyChoiceBtnText, styles.privacyChoiceBtnTextAlt]}>Share with Friends</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No check-ins yet</Text>
              <Text style={styles.emptyText}>
                Visit a venue to get your first check-in!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <CheckInCard
              item={item}
              onTogglePrivacy={togglePrivacy}
            />
          )}
        />
      )}
    </View>
  );
};

/* ── Styles ── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xxl + spacing.md,
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  avatarWrap: {
    position: "relative",
    marginRight: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    color: colors.brandDark,
    fontWeight: "700",
    fontSize: 16,
  },
  textContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 2,
  },
  actor: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginRight: spacing.sm,
    flexShrink: 1,
  },
  handle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 2,
  },
  when: {
    color: colors.textMuted,
    fontSize: 13,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  venueName: {
    color: colors.primary,
    fontWeight: "600",
  },
  comment: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 4,
  },
  starsRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  starFilled: {
    color: colors.primary,
    fontSize: 14,
    marginRight: 1,
  },
  starEmpty: {
    color: colors.border,
    fontSize: 14,
    marginRight: 1,
  },
  trailing: {
    marginLeft: spacing.md,
  },
  followButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    minWidth: 72,
    alignItems: "center",
  },
  followButtonActive: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followButtonPressed: {
    opacity: 0.85,
  },
  followText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  followTextActive: {
    color: colors.text,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 56,
  },

  /* ── Pending requests section ── */
  pendingSection: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  pendingTextWrap: {
    flex: 1,
  },
  pendingActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginLeft: spacing.sm,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  acceptText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  rejectButton: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rejectText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
  },

  /* ── Empty states ── */
  emptyState: {
    paddingTop: spacing.xl,
    alignItems: "center",
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },

  /* ── Check-in tab ── */
  checkinRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  checkinIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  checkinIconText: {
    fontSize: 20,
  },
  checkinDate: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  checkinMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: 2,
  },
  autoBadge: {
    backgroundColor: colors.brandSubtle,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  autoBadgeText: {
    color: colors.brandDark,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  privacyButton: {
    marginLeft: spacing.md,
    padding: spacing.xs,
  },
  privacyIcon: {
    fontSize: 20,
  },
  privacyNote: {
    backgroundColor: colors.cream,
    borderRadius: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  privacyNoteText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  privacyChoiceWrap: {
    marginTop: spacing.sm,
  },
  privacyChoiceTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  privacyChoiceRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  privacyChoiceBtn: {
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  privacyChoiceBtnAlt: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  privacyChoiceBtnText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: "700",
  },
  privacyChoiceBtnTextAlt: {
    color: colors.text,
  },
});
