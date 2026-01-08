// src/components/SegmentedTabs.tsx
import React from "react";
import { ScrollView, Text, Pressable, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

export type SegmentedTab = {
  key: string;
  label: string;
};

type Props = {
  tabs: SegmentedTab[];
  activeKey: string;
  onChange: (key: string) => void;
};

export const SegmentedTabs: React.FC<Props> = ({
  tabs,
  activeKey,
  onChange
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {tabs.map((tab) => {
        const selected = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && styles.tabPressed
            ]}
          >
            <Text style={selected ? styles.tabTextSelected : styles.tabText}>   
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.lg,
    marginBottom: spacing.md
  },
  tab: {
    flexGrow: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border
  },
  tabSelected: {
    backgroundColor: colors.pillActiveBg,
    borderColor: colors.pillActiveBg
  },
  tabPressed: {
    opacity: 0.85
  },
  tabText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500"
  },
  tabTextSelected: {
    color: colors.pillActiveText,
    fontSize: 14,
    fontWeight: "600"
  }
});
