// src/screens/GuideDetailScreen.tsx — one guide, read in the app.
//
// Venues the guide links open in-app (VenuePreview). Every open and venue tap is
// tracked for the author (see api/guides.ts); "Open as itinerary" hands off to the
// existing SharedItinerary screen so the map / save / check-in rails are unchanged.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  fetchGuideBySlug,
  fetchGuideItinerary,
  resolveLinkedVenues,
  trackGuideVenueTap,
  trackGuideView,
  type Guide,
  type GuideItinerary,
} from "../api/guides";
import { GuideMarkdown } from "../components/GuideMarkdown";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import type { RootStackParamList } from "../navigation/types";


function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function GuideDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute() as { params: RootStackParamList["GuideDetail"] };
  const [guide, setGuide] = useState<Guide | null | undefined>(undefined);
  const [itinerary, setItinerary] = useState<GuideItinerary | null>(null);
  const [venues, setVenues] = useState<Record<string, { id: string; name: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const viewed = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await fetchGuideBySlug(params.slug);
        if (!alive) return;
        setGuide(g);
        if (!g) return;
        navigation.setOptions({ title: g.title });
        const [it, linked] = await Promise.all([fetchGuideItinerary(g.id), resolveLinkedVenues(g.body_md)]);
        if (!alive) return;
        setItinerary(it);
        setVenues(linked);
        if (viewed.current !== g.id) {
          viewed.current = g.id;
          void trackGuideView(g, it);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Couldn't load this guide.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [params.slug, navigation]);

  const onVenuePress = useCallback(
    (slug: string, href: string) => {
      const v = venues[slug];
      if (v && guide) {
        void trackGuideVenueTap(guide, v.id, itinerary);
        navigation.navigate("VenuePreview", { venueId: v.id });
      } else {
        void Linking.openURL(/^https?:\/\//i.test(href) ? href : `https://www.happitime.biz${href}`);
      }
    },
    [venues, guide, itinerary, navigation],
  );

  const onShare = useCallback(() => {
    if (!guide) return;
    void Share.share({ message: `${guide.title} — https://www.happitime.biz/guides/${guide.slug}/` });
  }, [guide]);

  if (error) return <ErrorState message={error} />;
  if (guide === undefined) return <LoadingSpinner />;
  if (guide === null) return <ErrorState message="This guide isn't published anymore." />;

  const linkedList = Object.values(venues);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {guide.cover_image_url ? (
        <Image source={{ uri: guide.cover_image_url }} style={styles.cover} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}
      {guide.city || guide.neighborhood ? (
        <Text style={styles.eyebrow}>{(guide.neighborhood ?? guide.city ?? "").toUpperCase()}</Text>
      ) : null}
      <Text style={styles.title}>{guide.title}</Text>
      {guide.subtitle ? <Text style={styles.subtitle}>{guide.subtitle}</Text> : null}

      <View style={styles.byline}>
        {guide.author?.avatar_url ? (
          <Image source={{ uri: guide.author.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{(guide.author?.display_name ?? "H").charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.bylineName}>{guide.author?.display_name ?? "HappiTime editors"}</Text>
          <Text style={styles.bylineMeta}>
            {itinerary?.author_handle ? `@${itinerary.author_handle} · ` : ""}
            {guide.published_at ? `Published ${fmtDate(guide.published_at)}` : ""}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Share guide" onPress={onShare} style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}>
          <Text style={styles.shareBtnText}>Share</Text>
        </Pressable>
      </View>

      {itinerary ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate("SharedItinerary", { token: itinerary.token })}
          style={({ pressed }) => [styles.itineraryCard, pressed && { opacity: 0.85 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.itineraryTitle}>
              Take {itinerary.spots === 1 ? "this spot" : `these ${itinerary.spots} spots`} with you
            </Text>
            <Text style={styles.itineraryBody}>See them on the map, save the list and check in when you get there.</Text>
          </View>
          <Text style={styles.itineraryChevron}>›</Text>
        </Pressable>
      ) : null}

      <GuideMarkdown body={guide.body_md ?? ""} onVenuePress={onVenuePress} />

      {linkedList.length ? (
        <View style={styles.spots}>
          <Text style={styles.spotsTitle}>Spots in this guide</Text>
          {linkedList.map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              onPress={() => {
                void trackGuideVenueTap(guide, v.id, itinerary);
                navigation.navigate("VenuePreview", { venueId: v.id });
              }}
              style={({ pressed }) => [styles.spotRow, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.spotName}>{v.name}</Text>
              <Text style={styles.itineraryChevron}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing["4xl"], gap: spacing.md },
  cover: { width: "100%", aspectRatio: 2, borderRadius: 14, backgroundColor: colors.brandSubtle, marginBottom: 4 },
  eyebrow: { fontSize: 11, fontWeight: "600", letterSpacing: 1, color: colors.brandDark },
  title: { fontSize: 26, fontWeight: "800", letterSpacing: -0.4, lineHeight: 31, color: colors.text },
  subtitle: { fontSize: 16, lineHeight: 23, color: colors.textMuted },
  byline: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandSubtle },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 14, fontWeight: "700", color: colors.brandDark },
  bylineName: { fontSize: 14, fontWeight: "600", color: colors.text },
  bylineMeta: { fontSize: 12, color: colors.textMuted },
  shareBtn: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  shareBtnText: { fontSize: 13, fontWeight: "600", color: colors.text },
  itineraryCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderRadius: 14, backgroundColor: colors.brandSubtle, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.brandLight },
  itineraryTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  itineraryBody: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
  itineraryChevron: { fontSize: 22, color: colors.brandDark, paddingHorizontal: 4 },
  spots: { marginTop: spacing.md, gap: 8 },
  spotsTitle: { fontSize: 13, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: colors.textMuted },
  spotRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderRadius: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  spotName: { fontSize: 15, fontWeight: "600", color: colors.text },
});
