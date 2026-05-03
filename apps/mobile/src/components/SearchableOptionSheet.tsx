import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type SearchableOptionSheetProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  formatOptionLabel?: (value: string) => string;
  searchPlaceholder?: string;
  style?: StyleProp<ViewStyle>;
  onOpenChange?: (open: boolean) => void;
};

const defaultFormatLabel = (value: string) => value;

const normalizeSearch = (value: string) =>
  value.trim().replace(/^@/, "").toLowerCase();

export const SearchableOptionSheet: React.FC<SearchableOptionSheetProps> = ({
  label,
  value,
  options,
  onChange,
  formatOptionLabel = defaultFormatLabel,
  searchPlaceholder = "Search",
  style,
  onOpenChange,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedLabel = formatOptionLabel(value);
  const filteredOptions = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return options;
    return options.filter((option) => {
      const optionLabel = formatOptionLabel(option).toLowerCase();
      return optionLabel.includes(q) || option.toLowerCase().includes(q);
    });
  }, [formatOptionLabel, options, query]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setQuery("");
    setOpen(false);
    onOpenChange?.(false);
  };

  const handleToggleOpen = () => {
    setOpen((current) => {
      const next = !current;
      onOpenChange?.(next);
      return next;
    });
  };

  return (
    <View style={[styles.container, open && styles.containerOpen, style]}>
      <Pressable
        onPress={handleToggleOpen}
        style={({ pressed }) => [
          styles.trigger,
          open && styles.triggerOpen,
          value !== "all" && styles.triggerActive,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.triggerTextWrap}>
          <Text
            style={[styles.label, value !== "all" && styles.labelActive]}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            style={[styles.triggerText, value !== "all" && styles.triggerTextActive]}
            numberOfLines={1}
          >
            {selectedLabel}
          </Text>
        </View>
        <IconSymbol
          name={open ? "chevron.up" : "chevron.down"}
          size={18}
          color={value !== "all" ? colors.pillActiveText : colors.primary}
        />
      </Pressable>

      {open ? (
        <View style={styles.dropdown}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMutedLight}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={styles.searchInput}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.optionList}
            contentContainerStyle={[
              styles.optionListContent,
              filteredOptions.length === 0 && styles.optionListEmptyContent,
            ]}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const selected = option === value;
                return (
                  <Pressable
                    key={option}
                    onPress={() => handleSelect(option)}
                    style={({ pressed }) => [
                      styles.optionRow,
                      selected && styles.optionRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        selected && styles.optionTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {formatOptionLabel(option)}
                    </Text>
                    {selected ? (
                      <IconSymbol name="checkmark" size={16} color={colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No matches</Text>
                <Text style={styles.emptyText}>Try another search.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  containerOpen: {
    zIndex: 50,
  },
  trigger: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: colors.shadowSoft,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  triggerOpen: {
    borderColor: colors.primary,
  },
  triggerActive: {
    backgroundColor: colors.dark,
    borderColor: colors.dark,
  },
  pressed: {
    opacity: 0.78,
  },
  triggerTextWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: spacing.xs,
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  labelActive: {
    color: colors.darkMuted,
  },
  triggerText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 2,
  },
  triggerTextActive: {
    color: colors.pillActiveText,
  },
  dropdown: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    minWidth: 168,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    shadowColor: colors.shadowMedium,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 8,
  },
  searchInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBackground,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.text,
    fontSize: 13,
    marginBottom: spacing.xs,
  },
  optionList: {
    flexGrow: 0,
    height: 240,
  },
  optionListContent: {
    paddingBottom: spacing.xs,
  },
  optionListEmptyContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  optionRow: {
    minHeight: 38,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  optionRowSelected: {
    backgroundColor: colors.brandSubtle,
  },
  optionText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  optionTextSelected: {
    color: colors.brandDark,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
