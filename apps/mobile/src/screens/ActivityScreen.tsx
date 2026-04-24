// src/screens/ActivityScreen.tsx
import React, { useState } from "react";
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
import { useUserFollowers } from "../hooks/useUserFollowers";
import { colors } from "../theme/colors";
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

const RatingStars: React.FC<{ rating: number }> = ({ rating }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Text key={i} style={i <= rating ? styles.starFilled : styles.starEmpty}>
        {"\u2605"}
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
        visited <Text style={styles.venueName}>{item.venueName}</Text>
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

/* ── Main Screen ── */

export const ActivityScreen: React.FC = () => {
  const [tab, setTab] = useState<"friends" | "discover">("friends");
  const {
    pendingRequests,
    loading: followersLoading,
    approveFollowRequest,
    rejectFollowRequest,
    sendFollowRequest,
  } = useUserFollowers();
  const { activities, loading: activityLoading, refresh: refreshActivity } = useFriendActivity();
  const {
    suggestions,
    loading: suggestionsLoading,
    refresh: refreshSuggestions,
  } = useFriendSuggestions();

  const [requestedUsers, setRequestedUsers] = useState<Record<string, boolean>>({});

  const handleFollow = (userId: string) => {
    setRequestedUsers((prev) => ({ ...prev, [userId]: true }));
    void sendFollowRequest(userId);
  };

  const handleApprove = (followId: string) => {
    void approveFollowRequest(followId);
  };

  const handleReject = (followId: string) => {
    void rejectFollowRequest(followId);
  };

  const isLoading =
    tab === "friends" ? followersLoading || activityLoading : suggestionsLoading;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Activity</Text>
      <SegmentedTabs
        tabs={[
          { key: "friends", label: "Friends" },
          { key: "discover", label: "Discover" },
        ]}
        activeKey={tab}
        onChange={(key) => setTab(key as "friends" | "discover")}
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
                      key={req.id}
                      id={req.id}
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
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onRefresh={refreshSuggestions}
          refreshing={suggestionsLoading}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No suggestions yet</Text>
              <Text style={styles.emptyText}>
                Visit more venues to discover people with similar taste!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <SuggestionCard
              suggestion={item}
              onFollow={handleFollow}
              following={requestedUsers[item.user_id] ?? false}
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
});
