// src/components/SegmentedTabs.tsx
import React from "react";
import { View, ScrollView, Text, Pressable, StyleSheet } from "react-native";
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
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
        style={styles.scroll}
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
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexShrink: 0,
    marginBottom: spacing.md,
  },
  scroll: {
    flexGrow: 0,
    overflow: "visible",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingRight: spacing.lg,
  },
  tab: {
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 40,
    justifyContent: "center",
  },
  tabSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  tabPressed: {
    opacity: 0.85
  },
  tabText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 18,
  },
  tabTextSelected: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    letterSpacing: 0.2,
  }
});
