import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { supabase } from "../api/supabaseClient";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

/**
 * Listing verification loop — consumer side (Verification Loop Spec v1).
 *
 * Renders a freshness line for the venue's listing:
 *   • fresh   (≤45 days): "Verified <date>"
 *   • stale   (>45 days): honest caveat — never fake freshness
 *   • disputed (2+ open reports): same caveat, server-driven
 * plus a low-key "Something's off?" link opening a 3-tap report sheet that
 * inserts into listing_reports (RLS: authenticated, user_id = auth.uid()).
 *
 * Self-contained: fetches its own venue row (same pattern as the Toastmaker
 * lookup in VenuePreviewScreen). Uses (supabase as any) until generated types
 * include listing_reports — same precedent as venue_toastmakers.
 */

const STALE_AFTER_DAYS = 45;

const REPORT_OPTIONS: { type: ReportType; label: string }[] = [
  { type: "hours_wrong", label: "Hours are wrong" },
  { type: "menu_or_price_wrong", label: "Menu or prices are wrong" },
  { type: "deal_not_honored", label: "Deal wasn't honored" },
];

type ReportType = "hours_wrong" | "menu_or_price_wrong" | "deal_not_honored";

type Props = {
  venueId: string | null;
};

function formatVerifiedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export const ListingFreshness: React.FC<Props> = ({ venueId }) => {
  const [lastConfirmedAt, setLastConfirmedAt] = useState<string | null>(null);
  const [disputed, setDisputed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    let active = true;
    (supabase as any)
      .from("venues")
      .select("last_confirmed_at,listing_disputed")
      .eq("id", venueId)
      .eq("status", "published")
      .maybeSingle()
      .then(
        ({
          data,
        }: {
          data: {
            last_confirmed_at: string | null;
            listing_disputed: boolean | null;
          } | null;
        }) => {
          if (!active) return;
          setLastConfirmedAt(data?.last_confirmed_at ?? null);
          setDisputed(data?.listing_disputed === true);
          setLoaded(true);
        }
      )
      .catch(() => {
        // Non-critical: render nothing rather than a wrong claim.
        if (active) setLoaded(false);
      });
    return () => {
      active = false;
    };
  }, [venueId]);

  async function handleSubmit(type: ReportType) {
    if (!venueId || submitting) return;
    setSubmitting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) {
        Alert.alert(
          "Sign in to report",
          "Create an account or sign in so we can follow up when it's fixed."
        );
        return;
      }
      const { error } = await (supabase as any).from("listing_reports").insert({
        user_id: userId,
        venue_id: venueId,
        report_type: type,
        note: note.trim() || null,
      });
      if (error) {
        // 23505 = unique violation: one open report per user/venue/type.
        if ((error as { code?: string }).code === "23505") {
          setSubmitted(true);
        } else {
          Alert.alert("Couldn't send report", "Please try again in a moment.");
        }
        return;
      }
      setSubmitted(true);
    } catch {
      Alert.alert("Couldn't send report", "Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function closeSheet() {
    setSheetOpen(false);
    setSelectedType(null);
    setNote("");
    setSubmitted(false);
  }

  if (!loaded) return null;

  const ageDays = lastConfirmedAt
    ? (Date.now() - new Date(lastConfirmedAt).getTime()) / 86_400_000
    : Infinity;
  const isFresh = !disputed && ageDays <= STALE_AFTER_DAYS;

  return (
    <>
      <View style={styles.row}>
        {isFresh && lastConfirmedAt ? (
          <View style={styles.freshBadge}>
            <Text style={styles.freshBadgeText}>
              ✓ Verified {formatVerifiedDate(lastConfirmedAt)}
            </Text>
          </View>
        ) : (
          <Text style={styles.staleText}>
            Details may have changed — confirm with the venue
          </Text>
        )}
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Report a problem with this listing"
          hitSlop={8}
        >
          <Text style={styles.reportLink}>Something&apos;s off?</Text>
        </Pressable>
      </View>

      <Modal
        visible={sheetOpen}
        animationType="slide"
        transparent
        onRequestClose={closeSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalRoot}
        >
          <Pressable style={styles.backdrop} onPress={closeSheet} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            {submitted ? (
              <>
                <Text style={styles.title}>Thanks — we&apos;re on it 🍻</Text>
                <Text style={styles.thanksText}>
                  We&apos;ll check this listing and let you know when it&apos;s
                  fixed. Reports like yours keep HappiTime honest.
                </Text>
                <Pressable style={styles.doneBtn} onPress={closeSheet}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>What&apos;s off?</Text>
                {REPORT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.type}
                    style={[
                      styles.optionRow,
                      selectedType === opt.type && styles.optionRowActive,
                    ]}
                    onPress={() => setSelectedType(opt.type)}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selectedType === opt.type && styles.optionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
                <TextInput
                  style={styles.noteInput}
                  placeholder="Anything else? (optional)"
                  placeholderTextColor={colors.textMutedLight}
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
                <Pressable
                  style={[
                    styles.submitBtn,
                    (!selectedType || submitting) && { opacity: 0.5 },
                  ]}
                  disabled={!selectedType || submitting}
                  onPress={() => selectedType && handleSubmit(selectedType)}
                >
                  <Text style={styles.submitBtnText}>
                    {submitting ? "Sending…" : "Send report"}
                  </Text>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  freshBadge: {
    backgroundColor: colors.successLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  freshBadgeText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "700",
  },
  staleText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
  },
  reportLink: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    textDecorationLine: "underline",
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
  optionRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  optionRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.brandSubtle,
  },
  optionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  optionTextActive: {
    color: colors.primaryDark,
  },
  noteInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    textAlignVertical: "top",
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  thanksText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  doneBtn: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  doneBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
});
