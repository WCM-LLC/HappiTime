// src/screens/GuidesScreen.tsx — published Tastemaker guides, newest first.
import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { fetchPublishedGuides, type GuideSummary } from "../api/guides";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import type { RootStackParamList } from "../navigation/types";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function GuidesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [guides, setGuides] = useState<GuideSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setGuides(await fetchPublishedGuides());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load guides.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (error && !guides) return <ErrorState message={error} />;
  if (!guides) return <LoadingSpinner />;

  return (
    <FlatList
      data={guides}
      keyExtractor={(g) => g.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Guides</Text>
          <Text style={styles.subtitle}>Happy hours and nights out, picked by Kansas City Tastemakers.</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No guides yet</Text>
          <Text style={styles.emptyBody}>Tastemakers are writing. Check back soon.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title}${item.author?.display_name ? `, by ${item.author.display_name}` : ""}`}
          onPress={() => navigation.navigate("GuideDetail", { slug: item.slug })}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          {item.cover_image_url ? (
            <Image source={{ uri: item.cover_image_url }} style={styles.cover} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]} />
          )}
          <View style={styles.cardBody}>
            {item.neighborhood || item.city ? (
              <Text style={styles.eyebrow}>{(item.neighborhood ?? item.city ?? "").toUpperCase()}</Text>
            ) : null}
            <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
            {item.subtitle ? <Text style={styles.cardSubtitle} numberOfLines={2}>{item.subtitle}</Text> : null}
            <View style={styles.byline}>
              {item.author?.avatar_url ? (
                <Image source={{ uri: item.author.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{(item.author?.display_name ?? "H").charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.bylineText} numberOfLines={1}>
                {item.author?.display_name ?? "HappiTime"}
                {item.published_at ? ` · ${fmtDate(item.published_at)}` : ""}
              </Text>
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing["4xl"], gap: spacing.lg, backgroundColor: colors.background, flexGrow: 1 },
  header: { gap: 4, marginBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.3, color: colors.text },
  subtitle: { fontSize: 15, lineHeight: 21, color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  cover: { width: "100%", aspectRatio: 2 },
  coverPlaceholder: { backgroundColor: colors.brandSubtle },
  cardBody: { padding: spacing.lg, gap: 6 },
  eyebrow: { fontSize: 11, fontWeight: "600", letterSpacing: 1, color: colors.brandDark },
  cardTitle: { fontSize: 18, fontWeight: "700", lineHeight: 23, color: colors.text },
  cardSubtitle: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  byline: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandSubtle },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 11, fontWeight: "700", color: colors.brandDark },
  bylineText: { fontSize: 13, color: colors.textMuted, flex: 1 },
  empty: { alignItems: "center", paddingVertical: spacing["4xl"], gap: 4 },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  emptyBody: { fontSize: 14, color: colors.textMuted },
});
