// src/screens/FavoritesScreen.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Modal, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView, Share } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { HappyHourCard } from "../components/HappyHourCard";
import { useHappyHours, type HappyHourWindow } from "../hooks/useHappyHours";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useUserFollowedVenues } from "../hooks/useUserFollowedVenues";
import { useUserHistory, type HistoryEntry } from "../hooks/useUserHistory";
import { useUserLists, type UserList } from "../hooks/useUserLists";
import { useUserFollowers } from "../hooks/useUserFollowers";
import { useUserLocation } from "../hooks/useUserLocation";
import { useVenueMediaGalleries } from "../hooks/useVenueCovers";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { distanceMiles } from "../utils/location";

export const FavoritesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [tab, setTab] = useState<"favorites" | "history" | "lists">(
    "favorites"
  );
  const { data } = useHappyHours();
  const { coords } = useUserLocation();
  const { venueIds: followedVenueIds, loading: followedLoading } =
    useUserFollowedVenues();
  const { user, loading: authLoading } = useCurrentUser();
  const { entries: historyEntries, loading: historyLoading } = useUserHistory();
  const {
    lists,
    loading: listsLoading,
    createList,
    updateList,
    deleteList,
    shareWithFriend,
    refresh: refreshLists,
  } = useUserLists();
  const { followers } = useUserFollowers();
  const [editingList, setEditingList] = useState<UserList | null>(null);
  const [showNewListForm, setShowNewListForm] = useState(false);

  useEffect(() => {
    const requestedTab = route?.params?.tab as "favorites" | "history" | "lists" | undefined;
    if (requestedTab) {
      setTab(requestedTab);
      navigation.setParams({ tab: undefined } as any);
    }
  }, [navigation, route?.params?.tab]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshLists();
    }, [refreshLists])
  );

  useEffect(() => {
    const openListId = route?.params?.openListId as string | undefined;
    if (!openListId || lists.length === 0) return;
    const found = lists.find((l) => l.id === openListId);
    if (found) {
      setTab("lists");
      setEditingList(found);
      navigation.setParams({ openListId: undefined } as any);
    }
  }, [lists, navigation, route?.params?.openListId]);

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
  const venueGalleries = useVenueMediaGalleries(favoriteVenueIds, 4);

  const nearbyPlaces = useMemo(() => {
    const withDistance = favoriteOnly.filter(
      (place) => typeof place.distance === "number"
    );
    return withDistance
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, 4);
  }, [favoriteOnly]);

  if (authLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.pageTitle}>Saved</Text>
        <Text style={styles.pageSubtitle}>Sign in to save venues, history, and itineraries.</Text>
        <EmptyState
          title="Sign in required"
          message="Saving and sharing venues or itineraries requires an account."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>Saved</Text>
      <Text style={styles.pageSubtitle}>Your go-to spots.</Text>

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
              coverUrl={item.venue?.id ? venueGalleries[item.venue.id]?.[0] ?? null : null}
              imageUrls={item.venue?.id ? venueGalleries[item.venue.id] ?? [] : []}
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
        <>
          <View style={styles.itineraryHeader}>
            <Text style={styles.itineraryTitle}>Itineraries</Text>
            <Pressable
              style={({ pressed }) => [
                styles.newListButton,
                pressed && { opacity: 0.75, transform: [{ scale: 0.95 }] },
              ]}
              onPress={() => setShowNewListForm(true)}
            >
              <Text style={styles.newListButtonText}>+</Text>
            </Pressable>
          </View>
          {listsLoading ? (
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
              message="Tap the + button above to create your first itinerary."
            />
          )}
        </>
      )}

      <NewListModal
        visible={showNewListForm}
        onClose={() => setShowNewListForm(false)}
        onCreate={createList}
      />

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
        onShowVenueCard={(venueId) => {
          setEditingList(null);
          navigation.navigate("VenuePreview", { venueId });
        }}
        onShowOnMap={(list) => {
          const venueIds = list.items.map((item) => item.venue_id);
          const itineraryVenues = list.items.flatMap((item) =>
            item.venue ? [item.venue] : []
          );
          const mappableVenues = itineraryVenues.filter(
            (venue) =>
              venue.lat != null &&
              venue.lng != null &&
              Number.isFinite(Number(venue.lat)) &&
              Number.isFinite(Number(venue.lng))
          );
          if (venueIds.length === 0) {
            Alert.alert("No venues yet", "Add venues to this itinerary before viewing it on the map.");
            return;
          }
          if (mappableVenues.length === 0) {
            Alert.alert(
              "No map pins yet",
              "The venues in this itinerary do not have map coordinates yet."
            );
            return;
          }
          setEditingList(null);
          navigation.navigate("Map", {
            itineraryVenueIds: venueIds,
            itineraryVenues,
            itineraryName: list.name,
            itineraryRequestId: Date.now(),
          });
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

const normalizeHandleSearch = (value?: string | null) =>
  (value ?? "").trim().replace(/^@/, "").toLowerCase();

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

const ListRow: React.FC<ListRowProps> = ({ list, onEdit }) => {
  const previewNames = list.item_preview.map((item) => item.venue_name);
  const remainingCount = Math.max(list.item_count - previewNames.length, 0);
  const previewText =
    previewNames.length > 0
      ? `${previewNames.join(" | ")}${remainingCount > 0 ? ` +${remainingCount} more` : ""}`
      : null;

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [styles.historyRow, pressed && { opacity: 0.75 }]}
    >
      <View style={styles.historyText}>
        <Text style={styles.historyVenue}>{list.name}</Text>
        {previewText ? (
          <Text style={styles.itineraryPreview} numberOfLines={1}>
            {previewText}
          </Text>
        ) : list.description ? (
          <Text style={styles.historyMeta} numberOfLines={1}>
            {list.description}
          </Text>
        ) : null}
        {previewText && list.description ? (
          <Text style={styles.historyMeta} numberOfLines={1}>
            {list.description}
          </Text>
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
};

// ── New List Modal ──────────────────────────────────────────────────────────

type NewListModalProps = {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string) => Promise<{ error: any }>;
};

const NewListModal: React.FC<NewListModalProps> = ({ visible, onClose, onCreate }) => {
  const { user, loading: authLoading } = useCurrentUser();
  const [listName, setListName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const isValid = listName.trim().length > 0;
  const canSubmit = isValid && !saving && !authLoading && !!user;

  const handleCreate = async () => {
    if (!isValid) return;
    if (!user) {
      Alert.alert("Sign in required", "Please sign in to create lists.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await onCreate(listName.trim(), description.trim() || undefined);
      if (error) {
        Alert.alert("Something went wrong", error.message);
        return;
      }
      Alert.alert("Itinerary created!", `"${listName.trim()}" is ready.`, [
        {
          text: "Done",
          onPress: () => {
            setListName("");
            setDescription("");
            onClose();
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert("Something went wrong", e?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setListName("");
    setDescription("");
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={editStyles.modalRoot}
      >
        <Pressable style={editStyles.backdrop} onPress={handleClose} />
        <View style={editStyles.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={editStyles.sheetScroll}
            contentContainerStyle={editStyles.sheetScrollContent}
          >
            <View style={editStyles.handle} />
            <Text style={[editStyles.title, editStyles.titleStandalone]}>New Itinerary</Text>
            <Text style={newListStyles.subtitle}>
              Give your itinerary a name to get started.
            </Text>

            <Text style={editStyles.label}>Itinerary name *</Text>
            <TextInput
              style={editStyles.input}
              placeholder="e.g. Sunday Brunch Crawl"
              placeholderTextColor={colors.textMuted}
              value={listName}
              onChangeText={setListName}
              returnKeyType="next"
              autoFocus
            />

            <Text style={editStyles.label}>Description (optional)</Text>
            <TextInput
              style={[editStyles.input, editStyles.multilineInput]}
              placeholder="What's this list about?"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              returnKeyType="done"
            />

            <Pressable
              style={({ pressed }) => [
                editStyles.saveButton,
                !canSubmit && editStyles.saveButtonDisabled,
                pressed && canSubmit && { opacity: 0.85 },
              ]}
              onPress={handleCreate}
              disabled={!canSubmit}
            >
              <Text style={editStyles.saveButtonText}>
                {saving ? "Creating..." : "Create itinerary"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ── Edit List Modal ─────────────────────────────────────────────────────────

type EditListModalProps = {
  list: UserList | null;
  followers: import("../hooks/useUserFollowers").Follower[];
  onClose: () => void;
  onSave: (id: string, updates: { name: string; description: string | null; visibility: string }) => Promise<void>;
  onDelete: (id: string) => void;
  onShareWithFriend: (listId: string, userId: string) => Promise<void>;
  onShowVenueCard: (venueId: string) => void;
  onShowOnMap: (list: UserList) => void;
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
  onShowVenueCard,
  onShowOnMap,
}) => {
  const [mode, setMode] = useState<"details" | "edit" | "share">("details");
  const [name, setName] = useState(list?.name ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [isPublic, setIsPublic] = useState(list?.visibility === "public");
  const [saving, setSaving] = useState(false);
  const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [friendQuery, setFriendQuery] = useState("");

  React.useEffect(() => {
    if (list) {
      setName(list.name);
      setDescription(list.description ?? "");
      setIsPublic(list.visibility === "public");
      setMode("details");
      setSharedIds(new Set());
      setFriendQuery("");
    }
  }, [list]);

  const friendHandleSearch = normalizeHandleSearch(friendQuery);
  const filteredFollowers = useMemo(() => {
    if (!friendHandleSearch) return followers;
    return followers.filter((f) =>
      normalizeHandleSearch(f.profile?.handle).includes(friendHandleSearch)
    );
  }, [followers, friendHandleSearch]);

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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={editStyles.modalRoot}
      >
        <Pressable style={editStyles.backdrop} onPress={onClose} />
        <View style={editStyles.sheet}>
          <View style={editStyles.handle} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={editStyles.sheetScroll}
            contentContainerStyle={editStyles.sheetScrollContent}
          >

            <View style={editStyles.titleRow}>
              <Text style={editStyles.title} numberOfLines={1}>
                {mode === "details"
                  ? list.name
                  : mode === "edit"
                  ? "Edit Itinerary"
                  : "Share Itinerary"}
              </Text>
              <View style={editStyles.titleActions}>
                {mode === "details" ? (
                  <>
                    <Pressable
                      onPress={() => setMode("edit")}
                      style={({ pressed }) => [editStyles.shareToggle, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={editStyles.shareToggleText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setMode("share")}
                      style={({ pressed }) => [editStyles.shareToggle, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={editStyles.shareToggleText}>Share</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    onPress={() => setMode("details")}
                    style={({ pressed }) => [editStyles.shareToggle, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={editStyles.shareToggleText}>List</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {mode === "details" ? (
              <>
                {list.description ? (
                  <Text style={editStyles.detailDescription}>{list.description}</Text>
                ) : null}
                <Text style={editStyles.shareSection}>
                  {list.item_count} {list.item_count === 1 ? "venue" : "venues"}
                </Text>
                {list.items.length === 0 ? (
                  <Text style={editStyles.shareEmpty}>
                    Add venues to this itinerary from a venue detail screen.
                  </Text>
                ) : (
                  <View style={editStyles.itineraryVenueList}>
                    {list.items.map((item) => (
                      <View key={item.id} style={editStyles.itineraryVenueRow}>
                        <Text style={editStyles.itineraryVenueName} numberOfLines={1}>
                          {item.venue_name}
                        </Text>
                        <Pressable
                          onPress={() => onShowVenueCard(item.venue_id)}
                          style={({ pressed }) => [
                            editStyles.venueCardButton,
                            pressed && { opacity: 0.75 },
                          ]}
                        >
                          <Text style={editStyles.venueCardButtonText}>Card</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                <Pressable
                  style={({ pressed }) => [
                    editStyles.saveButton,
                    list.items.length === 0 && editStyles.saveButtonDisabled,
                    pressed && list.items.length > 0 && { opacity: 0.85 },
                  ]}
                  onPress={() => onShowOnMap(list)}
                  disabled={list.items.length === 0}
                >
                  <Text style={editStyles.saveButtonText}>Show on the Map</Text>
                </Pressable>
              </>
            ) : mode === "edit" ? (
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
                    {saving ? "Saving..." : "Save changes"}
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
                <TextInput
                  value={friendQuery}
                  onChangeText={setFriendQuery}
                  placeholder="Search by @handle"
                  placeholderTextColor={colors.textMutedLight}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={editStyles.friendSearchInput}
                />
                {followers.length === 0 ? (
                  <Text style={editStyles.shareEmpty}>
                    You don't have any followers yet.
                  </Text>
                ) : filteredFollowers.length === 0 ? (
                  <Text style={editStyles.shareEmpty}>
                    No friends match that handle.
                  </Text>
                ) : (
                  filteredFollowers.map((f) => {
                    const displayName =
                      f.profile?.display_name ?? f.profile?.handle ?? f.follower_id.slice(0, 8);
                    const handle = f.profile?.handle ?? null;
                    const alreadyShared = sharedIds.has(f.follower_id);
                    const isSending = sharingId === f.follower_id;
                    return (
                      <View key={f.follower_id} style={editStyles.friendRow}>
                        <View style={editStyles.friendAvatar}>
                          <Text style={editStyles.friendAvatarText}>
                            {displayName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={editStyles.friendIdentity}>
                          <Text style={editStyles.friendName} numberOfLines={1}>
                            {displayName}
                          </Text>
                          {handle ? (
                            <Text style={editStyles.friendHandle} numberOfLines={1}>
                              @{handle}
                            </Text>
                          ) : null}
                        </View>
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
                            {isSending ? "..." : alreadyShared ? "Sent" : "Share"}
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
  pageTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
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
    backgroundColor: colors.primary
  },
  nearbyDotInactive: {
    backgroundColor: colors.border
  },
  nearbyText: {
    color: colors.textMuted,
    fontSize: 13
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
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
    backgroundColor: colors.brandSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md
  },
  historyInitialText: {
    color: colors.brandDark,
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
  itineraryPreview: {
    color: colors.text,
    fontSize: 12,
    marginTop: 3,
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
  },
  itineraryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  itineraryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  newListButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 3,
  },
  newListButtonText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 24,
  },
});

const newListStyles = StyleSheet.create({
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.lg,
  },
});

const editStyles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
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
  sheetScroll: {
    width: "100%",
  },
  sheetScrollContent: {
    paddingBottom: spacing.sm,
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
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  titleStandalone: {
    marginBottom: spacing.sm,
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
    backgroundColor: colors.primary,
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
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
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
    gap: spacing.sm,
  },
  titleActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
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
  detailDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  itineraryVenueList: {
    borderTopWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  itineraryVenueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  itineraryVenueName: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  venueCardButton: {
    borderRadius: 999,
    backgroundColor: colors.dark,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  venueCardButtonText: {
    color: colors.pillActiveText,
    fontSize: 13,
    fontWeight: "800",
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
  friendSearchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 14,
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
    backgroundColor: colors.brandSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  friendAvatarText: {
    color: colors.brandDark,
    fontWeight: "700",
    fontSize: 14,
  },
  friendIdentity: {
    flex: 1,
    marginRight: spacing.sm,
  },
  friendName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  friendHandle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  friendShareBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.primary,
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
