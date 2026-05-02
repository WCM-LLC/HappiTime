import React from "react";
import { Image, Pressable, Text, View, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export type SuggestionCardItem = {
  actorHandle: string;
  actorAvatar: string | null;
  createdAtLabel: string;
  message: string;
};

type Props = {
  item: SuggestionCardItem;
  onPress?: () => void;
};

export function SuggestionCard({ item, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.avatarWrap}>
        {item.actorAvatar ? (
          <Image source={{ uri: item.actorAvatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{item.actorHandle.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.textContainer}>
        <View style={styles.nameRow}>
          <Text style={styles.actor}>@{item.actorHandle}</Text>
          <Text style={styles.when}>{item.createdAtLabel}</Text>
        </View>
        <Text style={styles.message}>{item.message}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md },
  avatarWrap: { marginRight: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: colors.text, fontWeight: "700" },
  textContainer: { flex: 1 },
  nameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actor: { color: colors.text, fontWeight: "700" },
  when: { color: colors.textMuted, fontSize: 12 },
  message: { color: colors.textMuted, marginTop: 2 },
});
