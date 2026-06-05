import React from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
import { useSharedItineraries, type SharedItinerary } from "../hooks/useSharedItineraries";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

/**
 * "Shared with you" section for the Itineraries tab. Lists itineraries other
 * users have shared directly with the current user (via useSharedItineraries →
 * the list_itineraries_shared_with_me RPC). Renders nothing until there is at
 * least one share, so it stays invisible for users no one has shared with.
 */
export const SharedItinerarySection: React.FC<{
  onOpen: (item: SharedItinerary) => void;
}> = ({ onOpen }) => {
  const { itineraries, loading } = useSharedItineraries();

  if (loading || itineraries.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Shared with you</Text>
      {itineraries.map((item) => {
        const authorName =
          item.authorDisplayName ?? item.authorHandle ?? "A HappiTime user";
        return (
          <Pressable
            key={item.id}
            onPress={() => onOpen(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            {item.authorAvatar ? (
              <Image source={{ uri: item.authorAvatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {authorName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.author} numberOfLines={1}>
                {item.authorHandle ? `@${item.authorHandle}` : authorName}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: {
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: spacing.md,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.brandDark,
  },
  text: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  author: {
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
