import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { SuperUserBadge } from "../components/SuperUserBadge";
import { useInviteFriend, type ResolvedUser } from "../hooks/useInviteFriend";
import { useUserFollowers } from "../hooks/useUserFollowers";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export const InviteScreen: React.FC = () => {
  const navigation = useNavigation();
  const { resolveHandle, sendInvite, loading, error, success, reset } = useInviteFriend();
  const { sendFollowRequest } = useUserFollowers();

  const [handleInput, setHandleInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [resolved, setResolved] = useState<ResolvedUser | null>(null);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [followRequested, setFollowRequested] = useState(false);

  const handleSearch = async () => {
    const trimmed = handleInput.trim().replace(/^@/, "");
    if (!trimmed) return;
    setSearching(true);
    setSearched(false);
    setResolved(null);
    setShowEmailForm(false);
    reset();
    const user = await resolveHandle(trimmed);
    setResolved(user);
    setSearched(true);
    setSearching(false);
    if (!user) {
      setShowEmailForm(true);
    }
  };

  const handleFollow = async () => {
    if (!resolved) return;
    setFollowRequested(true);
    await sendFollowRequest(resolved.user_id);
  };

  const handleSendInvite = async () => {
    const email = emailInput.trim();
    if (!email) {
      Alert.alert("Email required", "Please enter the invitee's email address.");
      return;
    }
    const handle = handleInput.trim().replace(/^@/, "") || undefined;
    const ok = await sendInvite({ inviteeEmail: email, inviteeHandle: handle });
    if (!ok && error) {
      Alert.alert("Invite failed", error);
    }
  };

  const displayName = resolved
    ? resolved.display_name ?? resolved.handle
    : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Invite a Friend</Text>
        <Text style={styles.subtitle}>
          Search by handle — if they're on HappiTime you can follow them directly.
          If not, we'll email them an invitation.
        </Text>

        {/* ── Handle search ── */}
        <View style={styles.section}>
          <Text style={styles.label}>Find by handle</Text>
          <View style={styles.inputRow}>
            <Text style={styles.atPrefix}>@</Text>
            <TextInput
              style={styles.handleInput}
              value={handleInput}
              onChangeText={(v) => {
                setHandleInput(v.replace(/^@/, ""));
                setSearched(false);
                setResolved(null);
                setShowEmailForm(false);
                reset();
                setFollowRequested(false);
              }}
              placeholder="their_handle"
              placeholderTextColor={colors.textMutedLight}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <Pressable
              onPress={handleSearch}
              disabled={searching || !handleInput.trim()}
              style={({ pressed }) => [
                styles.searchButton,
                (searching || !handleInput.trim()) && styles.searchButtonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              {searching ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.searchButtonText}>Find</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* ── Search results ── */}
        {searched && resolved ? (
          <View style={styles.resultCard}>
            <View style={styles.resultAvatarWrap}>
              {resolved.avatar_url ? (
                <Image source={{ uri: resolved.avatar_url }} style={styles.resultAvatar} />
              ) : (
                <View style={styles.resultAvatarPlaceholder}>
                  <Text style={styles.resultAvatarInitial}>
                    {(displayName ?? "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.resultInfo}>
              <View style={styles.resultNameRow}>
                <Text style={styles.resultName}>{displayName}</Text>
                <SuperUserBadge role={resolved.role} />
              </View>
              <Text style={styles.resultHandle}>@{resolved.handle}</Text>
            </View>
            <Pressable
              onPress={handleFollow}
              disabled={followRequested}
              style={({ pressed }) => [
                styles.followButton,
                followRequested && styles.followButtonActive,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.followText, followRequested && styles.followTextActive]}>
                {followRequested ? "Requested" : "Follow"}
              </Text>
            </Pressable>
          </View>
        ) : searched && !resolved ? (
          <View style={styles.notFoundBanner}>
            <Text style={styles.notFoundText}>
              @{handleInput.trim().replace(/^@/, "")} isn't on HappiTime yet.
              Enter their email to invite them.
            </Text>
          </View>
        ) : null}

        {/* ── Email invite form ── */}
        {showEmailForm && !success ? (
          <View style={styles.section}>
            <Text style={styles.label}>Their email address</Text>
            <TextInput
              style={styles.emailInput}
              value={emailInput}
              onChangeText={setEmailInput}
              placeholder="friend@example.com"
              placeholderTextColor={colors.textMutedLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSendInvite}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Pressable
              onPress={handleSendInvite}
              disabled={loading}
              style={({ pressed }) => [
                styles.sendButton,
                loading && styles.sendButtonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.sendButtonText}>Send Invite</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {/* ── Email-only entry point ── */}
        {!searched && !showEmailForm ? (
          <View style={styles.emailOnlySection}>
            <Text style={styles.orLabel}>— or —</Text>
            <Pressable
              onPress={() => setShowEmailForm(true)}
              style={({ pressed }) => [styles.emailOnlyButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.emailOnlyText}>Invite directly by email</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Success state ── */}
        {success ? (
          <View style={styles.successBanner}>
            <Text style={styles.successTitle}>Invite sent!</Text>
            <Text style={styles.successText}>
              We emailed {emailInput} with an invitation. Once they sign up with
              that address, you'll be automatically connected.
            </Text>
            <Pressable
              onPress={() => {
                reset();
                setHandleInput("");
                setEmailInput("");
                setSearched(false);
                setResolved(null);
                setShowEmailForm(false);
                setFollowRequested(false);
              }}
              style={({ pressed }) => [styles.sendButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.sendButtonText}>Invite Another</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  atPrefix: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: "600",
  },
  handleInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
  },
  searchButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    minWidth: 60,
    alignItems: "center",
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  searchButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  resultAvatarWrap: {},
  resultAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  resultAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brandSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  resultAvatarInitial: {
    color: colors.brandDark,
    fontWeight: "700",
    fontSize: 18,
  },
  resultInfo: {
    flex: 1,
  },
  resultNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resultName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  resultHandle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 1,
  },
  followButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    minWidth: 72,
    alignItems: "center",
  },
  followButtonActive: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  followText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  followTextActive: {
    color: colors.text,
  },
  notFoundBanner: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  notFoundText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  emailInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error ?? "#D33",
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 14,
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  emailOnlySection: {
    alignItems: "center",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  orLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  emailOnlyButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  emailOnlyText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  successBanner: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  successTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  successText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
