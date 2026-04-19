// src/navigation/types.ts
export type RootStackParamList = {
  Home: undefined;
  Auth: undefined;
  AppTabs: undefined;
  HappyHourDetail: { windowId: string };
  VenuePreview?: { venueId: string };
};

export type MainTabParamList = {
  Home: undefined;
  Map: undefined;
  Favorites: undefined;
  Add: undefined;
  Activity: undefined;
  Profile: undefined;
};
