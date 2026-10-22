// src/screens/SuperUserMetricsScreen.tsx — a Tastemaker's reach, on the phone.
//
// Same numbers as the console's /dashboard/metrics (one super_user_metrics()
// read), laid out for a 390px screen: range control, the people-sent hero with a
// daily bar strip, four tiles, milestones, venues you're moving, by-guide, and
// the shareable stats card. No chart library — bars are Views — so it ships OTA.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  RANGE_LABEL,
  delta,
  fetchSuperUserMetrics,
  milestonesFor,
  shareStatsCard,
  type MetricsRange,
  type SuperUserMetrics,
} from "../api/superUserMetrics";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import type { RootStackParamList } from "../navigation/types";

const RANGES: MetricsRange[] = ["7d", "28d", "90d", "all"];

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("en-US"));
const fmtDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Tile({ label, value, note, up, dim }: { label: string; value: string; note?: string | null; up?: boolean; dim?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.lbl}>{label}</Text>
      <Text style={[styles.tileValue, dim && { color: colors.textMuted }]}>{value}</Text>
      {note ? <Text style={[styles.tileNote, up && { color: colors.successInk }]}>{note}</Text> : null}
    </View>
  );
}

export function SuperUserMetricsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [range, setRange] = useState<MetricsRange>("28d");
  const [m, setM] = useState<SuperUserMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(async (r: MetricsRange) => {
    try {
      setError(null);
      setM(await fetchSuperUserMetrics(r));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(range);
  }, [range, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(range);
    setRefreshing(false);
  }, [range, load]);

  const onShare = useCallback(async () => {
    if (!m) return;
    setSharing(true);
    try {
      await shareStatsCard(range, m.handle);
    } catch (e) {
      Alert.alert("Couldn't share", e instanceof Error ? e.message : "Try again in a moment.");
    } finally {
      setSharing(false);
    }
  }, [m, range]);

  const milestones = useMemo(() => (m ? milestonesFor(m.totals) : []), [m]);
  const peopleDelta = m ? delta(m.influence.people_sent, m.influence.people_sent_prior) : null;
  const bars = m?.daily ?? [];
  const barMax = Math.max(1, ...bars.map((d) => d.people_sent));
  const peak = bars.reduce<typeof bars[number] | null>((a, b) => (b.people_sent > (a?.people_sent ?? 0) ? b : a), null);
  const published = (m?.guides.items ?? []).filter((g) => g.status === "published");
  const windowText = m
    ? m.range_days === null
      ? "All time"
      : `${m.window_start ? fmtDay(m.window_start.slice(0, 10)) : ""} – ${fmtDay(m.window_end.slice(0, 10))} · vs the ${m.range_days} days before`
    : "";

  if (error && !m) return <ErrorState message={error} />;
  if (loading && !m) return <LoadingSpinner />;
  if (!m) return null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={{ gap: 10 }}>
        <View style={{ gap: 2 }}>
          <Text style={styles.title}>Your reach</Text>
          <Text style={styles.sub}>{windowText}</Text>
        </View>
        <View style={styles.seg} accessibilityRole="tablist">
          {RANGES.map((r) => (
            <Pressable
              key={r}
              accessibilityRole="tab"
              accessibilityState={{ selected: r === range }}
              onPress={() => setRange(r)}
              style={[styles.segBtn, r === range && styles.segBtnOn]}
            >
              <Text style={[styles.segText, r === range && styles.segTextOn]}>{RANGE_LABEL[r]}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Hero */}
      <View style={styles.card}>
        <Text style={styles.lbl}>People you sent to venues</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <Text style={[styles.hero, !m.influence.people_sent && { color: colors.textMuted }]}>{fmt(m.influence.people_sent)}</Text>
          {peopleDelta ? (
            <Text style={[styles.heroDelta, peopleDelta.up && { color: colors.successInk }]}>{peopleDelta.text}</Text>
          ) : null}
        </View>
        <Text style={styles.body}>
          {m.influence.people_sent
            ? `${fmt(m.influence.new_faces)} were first-timers at that venue.${peak && peak.people_sent > 0 ? ` Best day: ${fmtDay(peak.day)}.` : ""}`
            : "This moves when someone checks in after opening your guide as an itinerary, scanning your QR, or joining through your link."}
        </Text>
        <View style={styles.bars} accessibilityRole="image" accessibilityLabel={`Daily people sent, ${windowText}`}>
          {bars.map((d) => (
            <View key={d.day} style={styles.barSlot}>
              <View style={[styles.bar, { height: Math.max(2, (d.people_sent / barMax) * 72) }, d.people_sent === 0 && styles.barZero]} />
            </View>
          ))}
        </View>
        {bars.length ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.axis}>{fmtDay(bars[0].day)}</Text>
            <Text style={styles.axis}>{fmtDay(bars[bars.length - 1].day)}</Text>
          </View>
        ) : null}
      </View>

      {/* Tiles */}
      <View style={styles.grid}>
        <Tile label="New faces" value={fmt(m.influence.new_faces)} dim={!m.influence.new_faces} {...(delta(m.influence.new_faces, m.influence.new_faces_prior) ?? {})} note={delta(m.influence.new_faces, m.influence.new_faces_prior)?.text} />
        <Tile label="Venues moved" value={fmt(m.influence.venues_moved)} dim={!m.influence.venues_moved} note={delta(m.influence.venues_moved, m.influence.venues_moved_prior)?.text} up={delta(m.influence.venues_moved, m.influence.venues_moved_prior)?.up} />
        <Tile label="Guide views" value={m.totals.guides_published ? fmt(m.guides.views) : "—"} dim={!m.guides.views} note={m.totals.guides_published ? delta(m.guides.views, m.guides.views_prior)?.text : "Starts with your first guide"} up={delta(m.guides.views, m.guides.views_prior)?.up} />
        <Tile label="Referrals" value={fmt(m.referrals.joined)} dim={!m.referrals.joined} note={m.referrals.qr_scans ? `${fmt(m.referrals.qr_scans)} QR scans` : delta(m.referrals.joined, m.referrals.joined_prior)?.text} up={delta(m.referrals.joined, m.referrals.joined_prior)?.up} />
      </View>

      {/* Milestones */}
      {milestones.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.lg }} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 10 }}>
          {milestones.map((ms) => (
            <View key={ms.key} style={[styles.milestone, ms.done && styles.milestoneDone]}>
              <View style={[styles.msDot, ms.done && styles.msDotDone]}>
                {ms.done ? <Text style={styles.msCheck}>✓</Text> : <View style={[styles.msFill, { height: `${Math.min(100, Math.round((ms.value / ms.target) * 100))}%` }]} />}
              </View>
              <View>
                <Text style={styles.msLabel}>{ms.label}</Text>
                <Text style={[styles.msSub, ms.done && { color: colors.brandDark }]}>{ms.done ? "Reached" : `${fmt(ms.value)} · ${Math.round((ms.value / ms.target) * 100)}%`}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* Venues */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.h2}>Venues you&apos;re moving</Text>
          <Text style={styles.axis}>{m.range_days ? `${m.range_days} days` : "all time"}</Text>
        </View>
        {m.influence.venues.length === 0 ? (
          <Text style={styles.body}>Nobody has checked in after a touch from you yet. The first one shows up here.</Text>
        ) : (
          m.influence.venues.slice(0, 6).map((v) => {
            const max = Math.max(1, m.influence.venues[0].people_sent);
            return (
              <View key={v.venue_id} style={{ gap: 5 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {v.name}
                    {v.neighborhood ? <Text style={styles.rowSub}> · {v.neighborhood}</Text> : null}
                  </Text>
                  <Text style={styles.rowValue}>
                    {fmt(v.people_sent)}
                    {v.new_faces ? <Text style={styles.rowSub}> · {v.new_faces} new</Text> : null}
                  </Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(4, (v.people_sent / max) * 100)}%` }]} />
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Guides */}
      <View style={{ gap: 10 }}>
        <View style={styles.cardHead}>
          <Text style={styles.h2}>Guides</Text>
          <Text style={styles.axis}>people sent · views · clicks</Text>
        </View>
        {published.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>No published guides yet. Views and venue clicks start with your first one.</Text>
          </View>
        ) : (
          published.map((g) => {
            const max = Math.max(1, ...g.daily.map((d) => d.views));
            return (
              <Pressable
                key={g.guide_id}
                accessibilityRole="button"
                onPress={() => navigation.navigate("GuideDetail", { slug: g.slug })}
                style={({ pressed }) => [styles.card, styles.guideRow, pressed && { opacity: 0.85 }]}
              >
                <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                  <Text style={styles.rowLabel}>{g.title}</Text>
                  <Text style={styles.rowSub}>
                    {fmt(g.views)} views · {fmt(g.venue_clicks)} clicks{g.ctr !== null ? ` · ${(g.ctr * 100).toFixed(1)}%` : ""}
                  </Text>
                  <View style={styles.spark}>
                    {g.daily.slice(-28).map((d) => (
                      <View key={d.day} style={[styles.sparkBar, { height: Math.max(2, (d.views / max) * 18) }, d.views === 0 && styles.barZero]} />
                    ))}
                  </View>
                </View>
                <Text style={styles.guideSent}>{fmt(g.people_sent)}</Text>
              </Pressable>
            );
          })
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={sharing}
        onPress={onShare}
        style={({ pressed }) => [styles.shareBtn, (pressed || sharing) && { opacity: 0.8 }]}
      >
        {sharing ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.shareText}>Share your stats card</Text>}
      </Pressable>

      <Text style={styles.foot}>Influence and referrals are counted separately. Guide views and QR scans tracked since Oct 2026. Numbers are live.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing["4xl"], gap: spacing.lg },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.3, color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
  seg: { flexDirection: "row", gap: 2, padding: 3, backgroundColor: colors.surface, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  segBtn: { flex: 1, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  segBtnOn: { backgroundColor: colors.text },
  segText: { fontSize: 13, fontWeight: "500", color: colors.textMuted },
  segTextOn: { color: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: spacing.lg, gap: 10 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  lbl: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: colors.textMuted },
  hero: { fontSize: 56, fontWeight: "700", letterSpacing: -2, lineHeight: 60, color: colors.text, fontVariant: ["tabular-nums"] },
  heroDelta: { fontSize: 15, fontWeight: "600", color: colors.textMuted },
  body: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 76, marginTop: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 2 },
  barSlot: { flex: 1, justifyContent: "flex-end" },
  bar: { backgroundColor: colors.primary, borderRadius: 2 },
  barZero: { backgroundColor: colors.brandLight },
  axis: { fontSize: 11, color: colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 14, gap: 6 },
  tileValue: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5, lineHeight: 30, color: colors.text, fontVariant: ["tabular-nums"] },
  tileNote: { fontSize: 12, fontWeight: "500", color: colors.textMuted },
  milestone: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, paddingRight: 14, borderRadius: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  milestoneDone: { backgroundColor: colors.brandSubtle, borderColor: colors.brandLight },
  msDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.border, overflow: "hidden", justifyContent: "flex-end" },
  msDotDone: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  msFill: { backgroundColor: colors.primary, width: "100%" },
  msCheck: { fontSize: 11, fontWeight: "800", color: colors.onPrimary },
  msLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
  msSub: { fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"] },
  h2: { fontSize: 15, fontWeight: "600", color: colors.text },
  rowLabel: { fontSize: 13, fontWeight: "500", color: colors.text, flexShrink: 1 },
  rowSub: { fontSize: 12, color: colors.textMuted, fontWeight: "400" },
  rowValue: { fontSize: 13, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] },
  track: { height: 5, borderRadius: 999, backgroundColor: colors.brandSubtle, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.primary, borderRadius: 999 },
  guideRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  spark: { flexDirection: "row", alignItems: "flex-end", gap: 1.5, height: 18, marginTop: 2 },
  sparkBar: { width: 3, backgroundColor: colors.primary, borderRadius: 1 },
  guideSent: { fontSize: 18, fontWeight: "700", color: colors.brandDark, fontVariant: ["tabular-nums"] },
  shareBtn: { height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  shareText: { fontSize: 15, fontWeight: "600", color: colors.onPrimary },
  foot: { fontSize: 11, lineHeight: 16, color: colors.textMuted, textAlign: "center" },
});
