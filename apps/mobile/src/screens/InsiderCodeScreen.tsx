// src/screens/InsiderCodeScreen.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useUserProfile } from "../hooks/useUserProfile";
import { supabase } from "../api/supabaseClient";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export const InsiderCodeScreen: React.FC = () => {
  const { user, loading: userLoading } = useCurrentUser();
  const { profile, loading: profileLoading } = useUserProfile();
  const [referralCount, setReferralCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  const isSuperUser = profile?.role === "super_user";
  const handle = profile?.handle ?? null;

  useEffect(() => {
    if (!user?.id || !isSuperUser) return;
    setCountLoading(true);
    void (supabase as any)
      .from("user_referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_user_id", user.id)
      .then(({ count }: { count: number | null }) => {
        setReferralCount(count ?? 0);
        setCountLoading(false);
      })
      .catch(() => {
        // Network/query failure: stop the spinner rather than hang on "Loading…".
        setReferralCount(0);
        setCountLoading(false);
      });
  }, [user?.id, isSuperUser]);

  const handleShare = () => {
    if (!handle) return;
    void Share.share({
      message: `Join me on HappiTime: https://happitime.biz/r/${handle}`,
    });
  };

  if (userLoading || profileLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isSuperUser) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.notAvailable}>
            This feature is not available for your account.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!handle) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.notAvailable}>
            Set a handle on your profile to use your Insider Code.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const referralLink = `https://happitime.biz/r/${handle}`;
  const qrUri = `https://happitime.biz/r/${handle}/qr`;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.brandLabel}>HappiTime Insider</Text>
          <Text style={styles.heading}>My Insider Code</Text>

          <Text style={styles.handleText}>@{handle}</Text>
          <Text style={styles.linkText} selectable>{referralLink}</Text>

          <View style={styles.qrWrapper}>
            <Image
              source={{ uri: qrUri }}
              style={styles.qrImage}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.countText}>
            {countLoading
              ? "Loading referrals…"
              : `You've brought ${referralCount ?? 0} ${
                  referralCount === 1 ? "person" : "people"
                }.`}
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.shareButton,
              pressed && styles.shareButtonPressed,
            ]}
            onPress={handleShare}
          >
            <Text style={styles.shareButtonText}>Share my link</Text>
          </Pressable>
        </View>

        <Text style={styles.helpText}>
          When someone installs HappiTime via your link and signs in, they'll be
          counted as your referral.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  notAvailable: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 100,
    alignItems: "center",
  },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  brandLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  heading: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    marginBottom: spacing.lg,
  },
  handleText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  linkText: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  qrWrapper: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    backgroundColor: "#FFFFFF",
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  countText: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    textAlign: "center",
  },
  shareButton: {
    width: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  shareButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  helpText: {
    marginTop: spacing.lg,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
});
