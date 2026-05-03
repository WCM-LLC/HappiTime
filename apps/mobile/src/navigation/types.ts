// src/navigation/types.ts
export type ItineraryMapVenue = {
  id: string;
  name: string;
  org_name?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  timezone?: string | null;
  tags?: string[] | null;
  cuisine_type?: string | null;
  price_tier?: number | null;
  app_name_preference?: string | null;
  status?: string | null;
  lat?: number | null;
  lng?: number | null;
  promotion_tier?: string | null;
  promotion_priority?: number | null;
};

export type RootStackParamList = {
  Home: undefined;
  Auth: undefined;
  AppTabs: { screen?: keyof MainTabParamList; params?: Record<string, unknown> } | undefined;
  HappyHourDetail: { windowId: string };
  VenuePreview?: { venueId: string };
};

export type MainTabParamList = {
  Home: undefined;
  Map: {
    itineraryVenueIds?: string[];
    itineraryVenues?: ItineraryMapVenue[];
    itineraryName?: string;
    itineraryRequestId?: number;
  } | undefined;
  Favorites: { openListId?: string; tab?: "favorites" | "history" | "lists" } | undefined;
  Activity: undefined;
  Profile: undefined;
};
