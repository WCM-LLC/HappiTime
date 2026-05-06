// src/components/HappyHourCard.tsx
import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, useWindowDimensions, Image, Linking } from "react-native";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { getHappyHourDisplayNames } from "../utils/happyHourDisplay";
import { formatDays, formatTimeRange } from "../utils/formatters";
import { timeAgo } from "../utils/time";

type HappyHourCardProps = {
  window: any;
  coverUrl?: string | null;
  imageUrls?: string[];
  onPress?: () => void;
};

export const HappyHourCard: React.FC<HappyHourCardProps> = ({
  window,
  coverUrl,
  imageUrls,
  onPress
}) => {
  const venue = window.venue ?? null;
  const { titleText, subtitleText, label } =
    getHappyHourDisplayNames(window);
  const showLabelPill = !!label && label !== titleText;
  const { width } = useWindowDimensions();
  const heroWidth = Math.max(1, width - spacing.lg * 2);
  const [activeHeroIndex, setActiveHeroIndex] = React.useState(0);
  const heroImages = React.useMemo(() => {
    const urls = [...(imageUrls ?? []), coverUrl]
      .filter((url): url is string => typeof url === "string" && url.length > 0);
    return Array.from(new Set(urls));
  }, [coverUrl, imageUrls]);

  React.useEffect(() => {
    if (activeHeroIndex >= heroImages.length) {
      setActiveHeroIndex(0);
    }
  }, [activeHeroIndex, heroImages.length]);

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

  const venueSocial = venue as any;
  const hasSocial = venueSocial?.facebook_url || venueSocial?.instagram_url || venueSocial?.tiktok_url;

  return (
    <View style={styles.card}>
      <View style={styles.hero}>
        {heroImages.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            style={[styles.heroScroll, { width: heroWidth }]}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / heroWidth);
              setActiveHeroIndex(Math.max(0, Math.min(nextIndex, heroImages.length - 1)));
            }}
          >
            {heroImages.map((url, index) => (
              <Image
                key={`${url}-${index}`}
                source={{ uri: url }}
                style={[styles.heroImage, { width: heroWidth }]}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.heroPlaceholder}>
            <Text style={styles.heroPlaceholderText}>
              {titleText.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {heroImages.length > 1 ? (
          <View style={styles.heroDots}>
            {heroImages.map((url, index) => (
              <View
                key={`${url}-dot`}
                style={[styles.heroDot, index === activeHeroIndex && styles.heroDotActive]}
              />
            ))}
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.cardBody, pressed && styles.cardBodyPressed]}
      >
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
                  <IconSymbol name="star.fill" size={13} color={colors.primary} />
                  <Text style={styles.metaText}>{rating.toFixed(1)}</Text>
                </View>
              )}
              {reviewCount != null && (
                <Text style={styles.metaSubtext}>
                  {rating != null
                    ? `(${reviewCount})`
                    : `${reviewCount} reviews`}
                </Text>
              )}
            </View>
            {distance != null && (
              <View style={styles.metaRight}>
                <IconSymbol
                  name="mappin.circle.fill"
                  size={13}
                  color={colors.textMuted}
                />
                <Text style={styles.metaDistanceText}>
                  {distance < 0.1 ? "nearby" : `${distance.toFixed(1)} mi`}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.divider} />

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
            <View style={styles.verifiedBadge}>
              <IconSymbol name="checkmark.seal.fill" size={12} color={colors.success} />
              <Text style={styles.verifiedText}>
                Verified {lastConfirmedText}
              </Text>
            </View>
          ) : (
            <Text style={styles.verifiedTextMuted}>
              Last updated info not available
            </Text>
          )}
        </View>
      </Pressable>

      {hasSocial && (
        <View style={styles.socialRow}>
          {venueSocial?.facebook_url && (
            <Pressable
              style={({ pressed }) => [styles.socialButton, pressed && styles.socialButtonPressed]}
              onPress={() => Linking.openURL(venueSocial.facebook_url).catch(() => {})}
            >
              <Text style={styles.socialButtonText}>Facebook</Text>
            </Pressable>
          )}
          {venueSocial?.instagram_url && (
            <Pressable
              style={({ pressed }) => [styles.socialButton, pressed && styles.socialButtonPressed]}
              onPress={() => Linking.openURL(venueSocial.instagram_url).catch(() => {})}
            >
              <Text style={styles.socialButtonText}>Instagram</Text>
            </Pressable>
          )}
          {venueSocial?.tiktok_url && (
            <Pressable
              style={({ pressed }) => [styles.socialButton, pressed && styles.socialButtonPressed]}
              onPress={() => Linking.openURL(venueSocial.tiktok_url).catch(() => {})}
            >
              <Text style={styles.socialButtonText}>TikTok</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardBodyPressed: {
    opacity: 0.88,
  },
  hero: {
    height: 190,
    backgroundColor: colors.brandSubtle,
    position: "relative"
  },
  heroPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholderText: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.primary,
    opacity: 0.3,
  },
  heroScroll: {
    height: "100%"
  },
  heroImage: {
    height: "100%"
  },
  heroDots: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface,
    opacity: 0.5
  },
  heroDotActive: {
    backgroundColor: colors.surface,
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
    letterSpacing: -0.2,
    marginBottom: spacing.xs
  },
  venueNameTight: {
    marginBottom: 2
  },
  venueSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
    marginBottom: spacing.xs
  },
  address: {
    color: colors.textMutedLight,
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
    backgroundColor: colors.primary,
  },
  labelText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
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
    gap: 3
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
    gap: 3
  },
  metaDistanceText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },
  rowValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    maxWidth: "60%",
    textAlign: "right"
  },
  footerRow: {
    marginTop: spacing.sm
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  verifiedText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "500",
  },
  verifiedTextMuted: {
    color: colors.textMutedLight,
    fontSize: 12
  },
  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  socialButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  socialButtonPressed: {
    opacity: 0.6,
  },
  socialButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMuted,
  },
});
