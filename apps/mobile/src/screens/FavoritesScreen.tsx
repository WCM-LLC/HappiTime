// src/screens/FavoritesScreen.tsx
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Modal, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, Share } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { HappyHourCard } from "../components/HappyHourCard";
import { useHappyHours, type HappyHourWindow } from "../hooks/useHappyHours";
import { useUserFollowedVenues } from "../hooks/useUserFollowedVenues";
import { useUserHistory, type HistoryEntry } from "../hooks/useUserHistory";
import { useUserLists, type UserList } from "../hooks/useUserLists";
import { useUserFollowers } from "../hooks/useUserFollowers";
import { useUserLocation } from "../hooks/useUserLocation";
import { useVenueCovers } from "../hooks/useVenueCovers";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { distanceMiles } from "../utils/location";

export const FavoritesScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<"favorites" | "history" | "lists">(
    "favorites"
  );
  const { data } = useHappyHours();
  const { coords } = useUserLocation();
  const { venueIds: followedVenueIds, loading: followedLoading } =
    useUserFollowedVenues();
  const { entries: historyEntries, loading: historyLoading } = useUserHistory();
  const { lists, loading: listsLoading, updateList, deleteList, shareWithFriend } = useUserLists();
  const { followers } = useUserFollowers();
  const [editingList, setEditingList] = useState<UserList | null>(null);

  const favoriteWindows = data;
  const favoritesWithDistance = useMemo(() => {
    return favoriteWindows.map((window) => {
      if (typeof window.distance === "number") return window;
      const lat = window.venue?.lat ?? null;
      const lng = window.venue?.lng ?? null;
      if (!coords || lat == null || lng == null) {
        return { ...window, distance: null };
      }
      return {
        ...window,
        distance: distanceMiles(coords.lat, coords.lng, lat, lng)
      };
    });
  }, [favoriteWindows, coords]);
  const followedVenueSet = useMemo(
    () => new Set(followedVenueIds),
    [followedVenueIds]
  );

  const favoriteOnly = useMemo(() => {
    if (followedVenueSet.size === 0) return [];
    return favoritesWithDistance.filter(
      (window) =>
        typeof window.venue_id === "string" &&
        followedVenueSet.has(window.venue_id)
    );
  }, [favoritesWithDistance, followedVenueSet]);

  const favoriteVenueIds = useMemo(
    () => favoriteOnly.map((w) => w.venue?.id).filter((id): id is string => !!id),
    [favoriteOnly]
  );
  const venueCovers = useVenueCovers(favoriteVenueIds);

  const nearbyPlaces = useMemo(() => {
    const withDistance = favoriteOnly.filter(
      (place) => typeof place.distance === "number"
    );
    return withDistance
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, 4);
  }, [favoriteOnly]);

  return (
    <View style={styles.container}>
      <Text style={styles.logoText}>HappiTime</Text>

      <SegmentedTabs
        tabs={[
          { key: "favorites", label: "Favorites" },
          { key: "history", label: "History" },
          { key: "lists", label: "Itineraries" }
        ]}
        activeKey={tab}
        onChange={(key) => setTab(key as any)}
      />

      {tab === "favorites" && (
        <FlatList
          data={favoriteOnly}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            followedLoading ? (
              <LoadingSpinner />
            ) : (
              <EmptyState
                title="No saved venues yet"
                message="Save a venue from a happy hour detail screen."
              />
            )
          }
          ListFooterComponent={
            nearbyPlaces.length > 0 ? (
              <NearbyList items={nearbyPlaces} />
            ) : null
          }
          renderItem={({ item }) => (
            <HappyHourCard
              window={item}
              coverUrl={item.venue?.id ? venueCovers[item.venue.id] ?? null : null}
              onPress={() => navigation.navigate("HappyHourDetail", { windowId: item.id })}
            />
          )}
        />
      )}

      {tab === "history" && (
        historyLoading ? (
          <LoadingSpinner />
        ) : historyEntries.length > 0 ? (
          <FlatList
            data={historyEntries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => <HistoryRow entry={item} />}
          />
        ) : (
          <EmptyState
            title="No history yet"
            message="Past spots you've checked out will appear here."
          />
        )
      )}

      {tab === "lists" && (
        listsLoading ? (
          <LoadingSpinner />
        ) : lists.length > 0 ? (
          <FlatList
            data={lists}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <ListRow list={item} onEdit={() => setEditingList(item)} />
            )}
          />
        ) : (
          <EmptyState
            title="No itineraries yet"
            message="Tap the + tab to create your first itinerary."
          />
        )
      )}

      <EditListModal
        list={editingList}
        followers={followers}
        onClose={() => setEditingList(null)}
        onSave={async (id, updates) => {
          const { error } = await updateList(id, updates);
          if (error) Alert.alert("Couldn't save", error.message);
          else setEditingList(null);
        }}
        onDelete={async (id) => {
          Alert.alert("Delete itinerary", "This will permanently delete the itinerary.", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                const { error } = await deleteList(id);
                if (error) Alert.alert("Couldn't delete", error.message);
                else setEditingList(null);
              },
            },
          ]);
        }}
        onShareWithFriend={async (listId, userId) => {
          const { error } = await shareWithFriend(listId, userId);
          if (error) Alert.alert("Couldn't share", error.message);
        }}
      />
    </View>
  );
};

const formatPriceTier = (tier?: number | null) =>
  typeof tier === "number" && tier > 0 ? "$".repeat(tier) : null;

const getPriceTier = (window: HappyHourWindow) => {
  const tier = window.venue?.price_tier;
  return typeof tier === "number" && tier > 0 ? tier : null;
};

type EmptyStateProps = {
  title: string;
  message: string;
};

const EmptyState: React.FC<EmptyStateProps> = ({ title, message }) => (
  <View style={styles.placeholder}>
    <Text style={styles.placeholderTitle}>{title}</Text>
    <Text style={styles.placeholderText}>{message}</Text>
  </View>
);

const EVENT_LABEL: Record<string, string> = {
  venue_view: "Viewed",
  venue_save: "Saved",
  venue_checkin: "Checked in",
};

const formatHistoryDate = (iso: string) => {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
};

type HistoryRowProps = { entry: HistoryEntry };

const HistoryRow: React.FC<HistoryRowProps> = ({ entry }) => {
  const venueName = entry.venue?.name ?? "Unknown venue";
  const locationParts = [entry.venue?.city, entry.venue?.state].filter(Boolean);
  const location = locationParts.join(", ");
  const label = EVENT_LABEL[entry.event_type] ?? entry.event_type;

  return (
    <View style={styles.historyRow}>
      <View style={styles.historyInitial}>
        <Text style={styles.historyInitialText}>
          {venueName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.historyText}>
        <Text style={styles.historyVenue}>{venueName}</Text>
        {location ? (
          <Text style={styles.historyMeta}>{location}</Text>
        ) : null}
      </View>
      <View style={styles.historyTrailing}>
        <Text style={styles.historyLabel}>{label}</Text>
        <Text style={styles.historyWhen}>{formatHistoryDate(entry.created_at)}</Text>
      </View>
    </View>
  );
};

type ListRowProps = { list: UserList; onEdit: () => void };

const ListRow: React.FC<ListRowProps> = ({ list, onEdit }) => (
  <Pressable
    onPress={onEdit}
    style={({ pressed }) => [styles.historyRow, pressed && { opacity: 0.75 }]}
  >
    <View style={styles.historyText}>
      <Text style={styles.historyVenue}>{list.name}</Text>
      {list.description ? (
        <Text style={styles.historyMeta}>{list.description}</Text>
      ) : null}
    </View>
    <View style={styles.historyTrailing}>
      <Text style={styles.historyLabel}>
        {list.item_count} {list.item_count === 1 ? "venue" : "venues"}
      </Text>
      <Text style={styles.historyWhen}>
        {list.visibility === "public" ? "Public" : "Private"}
      </Text>
    </View>
  </Pressable>
);

type EditListModalProps = {
  list: UserList | null;
  followers: import("../hooks/useUserFollowers").Follower[];
  onClose: () => void;
  onSave: (id: string, updates: { name: string; description: string | null; visibility: string }) => Promise<void>;
  onDelete: (id: string) => void;
  onShareWithFriend: (listId: string, userId: string) => Promise<void>;
};

const HAPPITIME_APP_STORE_URL = "https://apps.apple.com/app/happitime";
const HAPPITIME_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.happitime";

const EditListModal: React.FC<EditListModalProps> = ({
  list,
  followers,
  onClose,
  onSave,
  onDelete,
  onShareWithFriend,
}) => {
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [isPublic, setIsPublic] = useState(list?.visibility === "public");
  const [saving, setSaving] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [sharingId, setSharingId] = useState<string | null>(null);

  React.useEffect(() => {
    if (list) {
      setName(list.name);
      setDescription(list.description ?? "");
      setIsPublic(list.visibility === "public");
      setShowShare(false);
      setSharedIds(new Set());
    }
  }, [list?.id]);

  if (!list) return null;

  const isValid = name.trim().length > 0;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    await onSave(list.id, {
      name: name.trim(),
      description: description.trim() || null,
      visibility: isPublic ? "public" : "private",
    });
    setSaving(false);
  };

  const handleShareFriend = async (userId: string) => {
    setSharingId(userId);
    await onShareWithFriend(list.id, userId);
    setSharedIds((prev) => new Set(prev).add(userId));
    setSharingId(null);
  };

  const handleShareOutside = async () => {
    const storeUrl =
      Platform.OS === "ios" ? HAPPITIME_APP_STORE_URL : HAPPITIME_PLAY_STORE_URL;
    try {
      await Share.share({
        message: `Check out my "${list.name}" itinerary on HappiTime!\n\nDownload the app: ${storeUrl}`,
        title: `${list.name} — HappiTime Itinerary`,
      });
    } catch {
      // user cancelled share sheet
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={editStyles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={editStyles.sheetWrap}
      >
        <View style={editStyles.sheet}>
          <View style={editStyles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <View style={editStyles.titleRow}>
              <Text style={editStyles.title}>Edit Itinerary</Text>
              <Pressable
                onPress={() => setShowShare((v) => !v)}
                style={({ pressed }) => [editStyles.shareToggle, pressed && { opacity: 0.7 }]}
              >
                <Text style={editStyles.shareToggleText}>
                  {showShare ? "← Edit" : "Share"}
                </Text>
              </Pressable>
            </View>

            {!showShare ? (
              <>
                <Text style={editStyles.label}>Itinerary name *</Text>
                <TextInput
                  style={editStyles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Itinerary name"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  returnKeyType="next"
                />

                <Text style={editStyles.label}>Description (optional)</Text>
                <TextInput
                  style={[editStyles.input, editStyles.multilineInput]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="What's this itinerary about?"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  returnKeyType="done"
                />

                <Pressable
                  onPress={() => setIsPublic((v) => !v)}
                  style={({ pressed }) => [editStyles.visibilityRow, pressed && { opacity: 0.75 }]}
                >
                  <View style={editStyles.visibilityText}>
                    <Text style={editStyles.visibilityLabel}>
                      {isPublic ? "Public" : "Private"}
                    </Text>
                    <Text style={editStyles.visibilityHint}>
                      {isPublic ? "Anyone can see this itinerary" : "Only you can see this itinerary"}
                    </Text>
                  </View>
                  <View style={[editStyles.toggle, isPublic && editStyles.toggleOn]}>
                    <View style={[editStyles.toggleThumb, isPublic && editStyles.toggleThumbOn]} />
                  </View>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    editStyles.saveButton,
                    !isValid && editStyles.saveButtonDisabled,
                    pressed && isValid && { opacity: 0.85 },
                  ]}
                  onPress={handleSave}
                  disabled={!isValid || saving}
                >
                  <Text style={editStyles.saveButtonText}>
                    {saving ? "Saving…" : "Save changes"}
                  </Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [editStyles.deleteButton, pressed && { opacity: 0.75 }]}
                  onPress={() => onDelete(list.id)}
                >
                  <Text style={editStyles.deleteButtonText}>Delete itinerary</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={editStyles.shareSection}>Share with friends</Text>
                {followers.length === 0 ? (
                  <Text style={editStyles.shareEmpty}>
                    You don't have any followers yet.
                  </Text>
                ) : (
                  followers.map((f) => {
                    const displayName =
                      f.profile?.display_name ?? f.profile?.handle ?? f.follower_id.slice(0, 8);
                    const alreadyShared = sharedIds.has(f.follower_id);
                    const isSending = sharingId === f.follower_id;
                    return (
                      <View key={f.follower_id} style={editStyles.friendRow}>
                        <View style={editStyles.friendAvatar}>
                          <Text style={editStyles.friendAvatarText}>
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={editStyles.friendName}>{displayName}</Text>
                        <Pressable
                          onPress={() => handleShareFriend(f.follower_id)}
                          disabled={alreadyShared || isSending}
                          style={({ pressed }) => [
                            editStyles.friendShareBtn,
                            (alreadyShared) && editStyles.friendShareBtnSent,
                            pressed && !alreadyShared && { opacity: 0.75 },
                          ]}
                        >
                          <Text style={[
                            editStyles.friendShareBtnText,
                            alreadyShared && editStyles.friendShareBtnTextSent,
                          ]}>
                            {isSending ? "…" : alreadyShared ? "Sent" : "Share"}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })
                )}

                <View style={editStyles.divider} />

                <Text style={editStyles.shareSection}>Share outside the app</Text>
                <Text style={editStyles.shareHint}>
                  Send a link — if they don't have HappiTime yet, they'll be directed to download it.
                </Text>
                <Pressable
                  style={({ pressed }) => [editStyles.saveButton, pressed && { opacity: 0.85 }]}
                  onPress={handleShareOutside}
                >
                  <Text style={editStyles.saveButtonText}>Share link</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

type NearbyListProps = {
  items: HappyHourWindow[];
};

const NearbyList: React.FC<NearbyListProps> = ({ items }) => (
  <View style={styles.nearbySection}>
    <Text style={styles.nearbyTitle}>Nearby venues</Text>
    {items.map((item, index) => {
      const distance =
        typeof item.distance === "number"
          ? item.distance < 0.1
            ? "nearby"
            : `${item.distance.toFixed(1)} mi`
          : "Distance unavailable";
      const venueName = item.venue?.name ?? item.venue_name ?? "Venue";
      const priceTier =
        formatPriceTier(getPriceTier(item)) ?? "$$";

      return (
        <View key={item.id} style={styles.nearbyRow}>
          <View
            style={[
              styles.nearbyDot,
              index === 0 ? styles.nearbyDotActive : styles.nearbyDotInactive
            ]}
          />
          <Text style={styles.nearbyText}>
            {venueName} | {distance} | {priceTier}
          </Text>
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.xxl + spacing.md,
    paddingHorizontal: spacing.lg
  },
  logoText: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.md,
    alignSelf: "center"
  },
  listContent: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.xs
  },
  placeholderText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center"
  },
  nearbySection: {
    marginTop: spacing.md,
    paddingBottom: spacing.xl
  },
  nearbyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.sm
  },
  nearbyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm
  },
  nearbyDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: spacing.md
  },
  nearbyDotActive: {
    backgroundColor: colors.text
  },
  nearbyDotInactive: {
    backgroundColor: colors.border
  },
  nearbyText: {
    color: colors.textMuted,
    fontSize: 13
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.6,
    marginLeft: 56
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md
  },
  historyInitial: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md
  },
  historyInitialText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15
  },
  historyText: {
    flex: 1
  },
  historyVenue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600"
  },
  historyMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  historyTrailing: {
    alignItems: "flex-end",
    marginLeft: spacing.sm
  },
  historyLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500"
  },
  historyWhen: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  listIcon: {
    backgroundColor: colors.pillActiveBg ?? colors.surface,
    borderColor: "transparent",
  }
});

const editStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl + spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "85%",
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
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground ?? colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    marginBottom: spacing.md,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  visibilityText: {
    flex: 1,
  },
  visibilityLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  visibilityHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: colors.pillActiveBg,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background,
    alignSelf: "flex-start",
  },
  toggleThumbOn: {
    alignSelf: "flex-end",
  },
  saveButton: {
    borderRadius: 999,
    backgroundColor: colors.pillActiveBg,
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: colors.pillActiveText,
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  deleteButtonText: {
    color: colors.error ?? "#ef4444",
    fontSize: 14,
    fontWeight: "500",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  shareToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shareToggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  shareSection: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  shareEmpty: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  shareHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  friendAvatarText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 14,
  },
  friendName: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  friendShareBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.pillActiveBg,
    minWidth: 60,
    alignItems: "center",
  },
  friendShareBtnSent: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  friendShareBtnText: {
    color: colors.pillActiveText,
    fontSize: 13,
    fontWeight: "600",
  },
  friendShareBtnTextSent: {
    color: colors.textMuted,
  },
});
