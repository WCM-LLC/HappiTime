// src/navigation/types.ts
export type RootStackParamList = {
  Home: undefined;
  Auth: undefined;
  AppTabs: { screen?: keyof MainTabParamList; params?: Record<string, unknown> } | undefined;
  HappyHourDetail: { windowId: string };
  VenuePreview?: { venueId: string };
};

export type MainTabParamList = {
  Home: undefined;
  Map: undefined;
  Favorites: { openListId?: string } | undefined;
  Activity: undefined;
  Profile: undefined;
};
