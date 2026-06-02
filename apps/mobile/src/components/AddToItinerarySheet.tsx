import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useUserLists } from "../hooks/useUserLists";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = {
  venueId: string | null;
};

export const AddToItinerarySheet: React.FC<Props> = ({ venueId }) => {
  const { lists, addVenue, createList } = useUserLists();
  const [showItineraryPicker, setShowItineraryPicker] = useState(false);
  const [addedToIds, setAddedToIds] = useState<Set<string>>(new Set());
  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListDesc, setNewListDesc] = useState("");
  const [newListVisibility, setNewListVisibility] = useState<
    "private" | "friends" | "public"
  >("private");
  const [creatingList, setCreatingList] = useState(false);

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.actionButton,
          pressed && styles.actionButtonPressed,
        ]}
        onPress={() => setShowItineraryPicker(true)}
      >
        <Text style={styles.actionText}>Add to Itinerary</Text>
      </Pressable>

      <Modal
        visible={showItineraryPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowItineraryPicker(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalRoot}
        >
          <Pressable
            style={styles.backdrop}
            onPress={() => setShowItineraryPicker(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>Add to Itinerary</Text>

            {lists.length === 0 || showCreateForm ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.createForm}
              >
                <Text style={styles.createLabel}>Create a new itinerary</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Name (e.g. Friday Night Crawl)"
                  placeholderTextColor={colors.textMutedLight}
                  value={newListName}
                  onChangeText={setNewListName}
                  autoFocus
                />
                <TextInput
                  style={[styles.input, { height: 60 }]}
                  placeholder="Description (optional)"
                  placeholderTextColor={colors.textMutedLight}
                  value={newListDesc}
                  onChangeText={setNewListDesc}
                  multiline
                />
                <View style={styles.visRow}>
                  {(["private", "friends", "public"] as const).map((v) => (
                    <Pressable
                      key={v}
                      style={[
                        styles.visChip,
                        newListVisibility === v && styles.visChipActive,
                      ]}
                      onPress={() => setNewListVisibility(v)}
                    >
                      <Text
                        style={[
                          styles.visChipText,
                          newListVisibility === v && styles.visChipTextActive,
                        ]}
                      >
                        {v === "private"
                          ? "Private"
                          : v === "friends"
                          ? "Friends"
                          : "Public"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  style={[
                    styles.createBtn,
                    (!newListName.trim() || creatingList) && { opacity: 0.5 },
                  ]}
                  disabled={!newListName.trim() || creatingList}
                  onPress={async () => {
                    setCreatingList(true);
                    const { error, listId } = await createList(
                      newListName,
                      newListDesc || undefined
                    );
                    let addError: Error | null = null;
                    if (!error && listId && venueId) {
                      const result = await addVenue(listId, venueId);
                      addError = result.error;
                    }
                    setCreatingList(false);
                    if (error) {
                      Alert.alert("Error", error.message);
                    } else if (addError) {
                      Alert.alert(
                        "Itinerary created",
                        `Couldn't add this venue yet: ${addError.message}`
                      );
                    } else {
                      if (listId) {
                        setAddedToIds((prev) => new Set(prev).add(listId));
                      }
                      setNewListName("");
                      setNewListDesc("");
                      setNewListVisibility("private");
                      setShowCreateForm(false);
                    }
                  }}
                >
                  <Text style={styles.createBtnText}>
                    {creatingList ? "Creating…" : "Create Itinerary"}
                  </Text>
                </Pressable>
                {lists.length > 0 && (
                  <Pressable onPress={() => setShowCreateForm(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                )}
              </ScrollView>
            ) : (
              <>
                <FlatList
                  data={lists}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  ItemSeparatorComponent={() => <View style={styles.sep} />}
                  renderItem={({ item }) => {
                    const added = addedToIds.has(item.id);
                    const adding = addingToId === item.id;
                    return (
                      <Pressable
                        style={({ pressed }) => [
                          styles.row,
                          pressed && { opacity: 0.75 },
                        ]}
                        disabled={added || adding}
                        onPress={async () => {
                          if (!venueId) return;
                          setAddingToId(item.id);
                          const { error } = await addVenue(item.id, venueId);
                          setAddingToId(null);
                          if (error) {
                            Alert.alert("Couldn't add", error.message);
                          } else {
                            setAddedToIds((prev) => new Set(prev).add(item.id));
                          }
                        }}
                      >
                        <View style={styles.rowText}>
                          <Text style={styles.rowName}>{item.name}</Text>
                          {item.description ? (
                            <Text style={styles.rowDesc} numberOfLines={1}>
                              {item.description}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.rowAction,
                            added && styles.rowActionDone,
                          ]}
                        >
                          {adding ? "…" : added ? "Added ✓" : "Add"}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
                <Pressable
                  style={styles.newListBtn}
                  onPress={() => setShowCreateForm(true)}
                >
                  <Text style={styles.newListBtnText}>+ New Itinerary</Text>
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  actionButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
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
    maxHeight: "60%",
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
    marginBottom: spacing.md,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  rowDesc: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  rowAction: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    overflow: "hidden",
  },
  rowActionDone: {
    backgroundColor: colors.surface,
    color: colors.textMuted,
  },
  createForm: {
    paddingVertical: spacing.sm,
  },
  createLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  visRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  visChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  visChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  visChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  visChipTextActive: {
    color: "#FFFFFF",
  },
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  createBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginTop: spacing.md,
  },
  newListBtn: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  newListBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
});
