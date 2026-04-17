// src/components/HappyHourCard.tsx
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions, Image } from "react-native";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { getHappyHourDisplayNames } from "../utils/happyHourDisplay";
import { formatDays, formatTimeRange } from "../utils/formatters";
import { timeAgo } from "../utils/time";

type HappyHourCardProps = {
  window: any;
  coverUrl?: string | null;
  onPress?: () => void;
};

export const HappyHourCard: React.FC<HappyHourCardProps> = ({
  window,
  coverUrl,
  onPress
}) => {
  const venue = window.venue ?? null;
  const { titleText, subtitleText, label } =
    getHappyHourDisplayNames(window);
  const showLabelPill = !!label && label !== titleText;
  const { width } = useWindowDimensions();
  const heroWidth = Math.max(1, width - spacing.lg * 2);
  const heroSlides = [0, 1, 2];

  // Distance: attached in screens or derived from distance_miles.
  const distance: number | null =
    typeof window.distance === "number"
      ? window.distance
      : typeof (window as any).distance_miles === "number"
        ? (window as any).distance_miles
        : null;

  const ratingRaw =
    (venue as any)?.rating ??
    (venue as any)?.avg_rating ??
    (window as any)?.rating ??
    null;
  const reviewCountRaw =
    (venue as any)?.review_count ??
    (venue as any)?.reviews_count ??
    (window as any)?.review_count ??
    null;

  const ratingValue = Number(ratingRaw);
  const reviewCountValue = Number(reviewCountRaw);
  const rating = Number.isFinite(ratingValue) ? ratingValue : null;
  const reviewCount = Number.isFinite(reviewCountValue)
    ? Math.round(reviewCountValue)
    : null;

  // Trust signal: prefer explicit last_confirmed_at, fall back to updated_at
  const lastConfirmedRaw =
    (window as any).last_confirmed_at ??
    (venue && (venue as any).last_confirmed_at) ??
    (window as any).updated_at ??
    venue?.updated_at ??
    (window as any).created_at ??
    null;

  const lastConfirmedText = timeAgo(lastConfirmedRaw);

  const daysSource = Array.isArray(window.dow)
    ? window.dow
    : (window as any).happy_days ?? [];
  const timeText = formatTimeRange(
    (window as any).start_time ?? null,
    (window as any).end_time ?? null
  );
  const daysText = formatDays(daysSource);
  const address =
    venue?.address ??
    (window as any).address ??
    null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed
      ]}
    >
      <View style={styles.hero}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : null}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={[styles.heroScroll, { width: heroWidth }]}
          contentContainerStyle={[
            styles.heroContent,
            { width: heroWidth * heroSlides.length }
          ]}
        >
          {heroSlides.map((slide) => (
            <View
              key={slide}
              style={[styles.heroSlide, { width: heroWidth }, coverUrl ? styles.heroSlideTransparent : null]}
            />
          ))}
        </ScrollView>
        <View style={styles.heroDots}>
          <View style={[styles.heroDot, styles.heroDotActive]} />
          <View style={styles.heroDot} />
          <View style={styles.heroDot} />
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.venueName, subtitleText && styles.venueNameTight]}>
              {titleText}
            </Text>
            {subtitleText && (
              <Text style={styles.venueSubtitle} numberOfLines={1}>
                {subtitleText}
              </Text>
            )}
            {address && (
              <Text style={styles.address} numberOfLines={1}>
                {address}
              </Text>
            )}
          </View>

          <View style={styles.rightHeader}>
            {showLabelPill && (
              <View style={styles.labelPill}>
                <Text style={styles.labelText}>{label}</Text>
              </View>
            )}
          </View>
        </View>

        {(rating != null || reviewCount != null || distance != null) && (
          <View style={styles.metaRow}>
            <View style={styles.metaLeft}>
              {rating != null && (
                <View style={styles.metaItem}>
                  <IconSymbol name="star.fill" size={14} color={colors.text} />
                  <Text style={styles.metaText}>{rating.toFixed(1)}</Text>
                </View>
              )}
              {reviewCount != null && (
                <Text style={styles.metaSubtext}>
                  {rating != null
                    ? `(${reviewCount} reviews)`
                    : `${reviewCount} reviews`}
                </Text>
              )}
            </View>
            {distance != null && (
              <View style={styles.metaRight}>
                <IconSymbol
                  name="mappin.circle.fill"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.metaDistanceText}>
                  {distance < 0.1 ? "nearby" : `${distance.toFixed(1)} mi`}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>When</Text>
          <Text style={styles.rowValue}>
            {timeText}
            {(window as any).timezone ? ` (${(window as any).timezone})` : ""}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Days</Text>
          <Text style={styles.rowValue}>{daysText}</Text>
        </View>

        <View style={styles.footerRow}>
          {lastConfirmedText ? (
            <Text style={styles.verifiedText}>
              Verified {lastConfirmedText}
            </Text>
          ) : (
            <Text style={styles.verifiedTextMuted}>
              Last updated info not available
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card ?? colors.background,
    borderRadius: 16,
    padding: 0,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden"
  },
  cardPressed: {
    opacity: 0.9
  },
  hero: {
    height: 180,
    backgroundColor: colors.inputBackground,
    position: "relative"
  },
  heroScroll: {
    flex: 1
  },
  heroContent: {
    height: "100%"
  },
  heroSlide: {
    height: "100%",
    backgroundColor: colors.inputBackground
  },
  heroSlideTransparent: {
    backgroundColor: "transparent"
  },
  heroDots: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    opacity: 0.6
  },
  heroDotActive: {
    backgroundColor: colors.text,
    opacity: 1
  },
  cardBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: spacing.sm
  },
  venueName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: spacing.xs
  },
  venueNameTight: {
    marginBottom: 2
  },
  venueSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: spacing.xs
  },
  address: {
    color: colors.textMuted,
    fontSize: 13
  },
  rightHeader: {
    alignItems: "flex-end",
    marginLeft: spacing.md
  },
  labelPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.pillActiveBg,
    marginBottom: spacing.xs
  },
  labelText: {
    color: colors.pillActiveText,
    fontSize: 12,
    fontWeight: "600"
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  metaText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  metaSubtext: {
    color: colors.textMuted,
    fontSize: 12
  },
  metaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  metaDistanceText: {
    color: colors.textMuted,
    fontSize: 12
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 13
  },
  rowValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "500",
    maxWidth: "60%",
    textAlign: "right"
  },
  footerRow: {
    marginTop: spacing.sm
  },
  verifiedText: {
    color: colors.textMuted,
    fontSize: 12
  },
  verifiedTextMuted: {
    color: colors.textMuted,
    fontSize: 12
  }
});
