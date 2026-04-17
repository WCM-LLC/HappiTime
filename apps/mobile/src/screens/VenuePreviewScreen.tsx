import React, { useMemo } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { useHappyHours } from "../hooks/useHappyHours";
import { HappyHourCard } from "../components/HappyHourCard";
import { useVenueCovers } from "../hooks/useVenueCovers";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ErrorState } from "../components/ErrorState";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";

type Props = NativeStackScreenProps<RootStackParamList, "VenuePreview">;

export const VenuePreviewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { venueId } = route.params;
  const { data, loading, error, refreshing, refresh } = useHappyHours();

  const windowsForVenue = useMemo(
    () => data.filter((w) => w.venue_id === venueId),
    [data, venueId]
  );

  const venueName = windowsForVenue[0]?.venue?.name ?? "This venue";
  const venueCovers = useVenueCovers(venueId ? [venueId] : []);
  const coverUrl = venueId ? venueCovers[venueId] ?? null : null;

  if (loading && windowsForVenue.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  if (error && windowsForVenue.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState message={error.message} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {windowsForVenue.length === 0 ? (
        <Text style={styles.emptyText}>
          {venueName} doesn&apos;t have any published happy hour windows yet.
        </Text>
      ) : (
        <>
          <Text style={styles.title}>{venueName}</Text>
          <Text style={styles.subtitle}>Preview of this venue in the app</Text>

          <FlatList
            data={windowsForVenue}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshing={refreshing}
            onRefresh={refresh}
            renderItem={({ item }) => (
              <HappyHourCard
                window={item}
                coverUrl={coverUrl}
                onPress={() =>
                  navigation.navigate("HappyHourDetail", {
                    windowId: item.id
                  })
                }
              />
            )}
          />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: spacing.xl
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: spacing.xs
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.lg
  },
  listContent: {
    paddingBottom: spacing.xl
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14
  }
});
