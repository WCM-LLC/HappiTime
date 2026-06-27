import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useRef } from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useNotificationNavigation } from "../hooks/useNotificationNavigation";
import { useVenueDeepLink } from "../hooks/useVenueDeepLink";
import { useItineraryDeepLink } from "../hooks/useItineraryDeepLink";
import { useCheckinPrimeHandoff } from "../hooks/useCheckinPrimeHandoff";
import { SharedItineraryScreen } from "../screens/SharedItineraryScreen";
import { UpdateAvailableModal } from "../components/UpdateAvailableModal";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { ActivityScreen } from "../screens/ActivityScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { FavoritesScreen } from "../screens/FavoritesScreen";
import { HappyHourDetailScreen } from "../screens/HappyHourDetailScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { MapScreen } from "../screens/MapScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { InviteScreen } from "../screens/InviteScreen";
import { InsiderCodeScreen } from "../screens/InsiderCodeScreen";
import { VenuePreviewScreen } from "../screens/VenuePreviewScreen";
import { ItineraryDetailScreen } from "../screens/ItineraryDetailScreen";
import { EventCalendarScreen } from "../screens/EventCalendarScreen";
import { CheckInScreen } from "../screens/CheckInScreen";
import { RoundRedemptionScreen } from "../screens/RoundRedemptionScreen";
import { colors } from "../theme/colors";
import type { MainTabParamList, RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const navTheme: typeof DefaultTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary
  }
};

function AppTabs({ initialRouteName }: { initialRouteName?: keyof MainTabParamList }) {
  const { user } = useCurrentUser();
  const insets = useSafeAreaInsets();
  const isGuest = !user;
  const tabBarHeight = 56 + insets.bottom;
  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={({ route }: { route: { name: keyof MainTabParamList } }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.2,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: tabBarHeight,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          shadowColor: colors.shadowMedium,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 1,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactiveTint,
        tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => {
          let name:
            | "house.fill"
            | "star.fill"
            | "map.fill"
            | "bell.fill"
            | "person.crop.circle.fill" = "house.fill";
          const size = 22;

          if (route.name === "Home") name = "house.fill";
          if (route.name === "Map") name = "map.fill";
          if (route.name === "Favorites") name = "star.fill";
          if (route.name === "Activity") name = "bell.fill";
          if (route.name === "Profile") name = "person.crop.circle.fill";

          return (
            <IconSymbol
              name={name}
              size={size}
              color={color}
              weight={focused ? "semibold" : "regular"}
            />
          );
        }
      })}
    >
      <Tab.Screen name="Map" component={MapScreen} />
      {!isGuest ? <Tab.Screen name="Home" component={HomeScreen} /> : null}
      {!isGuest ? <Tab.Screen name="Favorites" component={FavoritesScreen} /> : null}
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator({ initialTab }: { initialTab?: keyof MainTabParamList } = {}) {
  const navigationRef = useRef<any>(null);
  useNotificationNavigation(navigationRef);
  useVenueDeepLink(navigationRef);
  useItineraryDeepLink(navigationRef);
  useCheckinPrimeHandoff(navigationRef);

  return (
    <>
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator>
        <Stack.Screen
          name="AppTabs"
          children={() => <AppTabs initialRouteName={initialTab} />}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Auth"
          component={AuthScreen}
          options={{ title: "Sign in" }}
        />
        <Stack.Screen
          name="HappyHourDetail"
          component={HappyHourDetailScreen}
          options={{
            headerShown: true,
            title: "Details",
            headerBackTitle: "Back",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: {
              fontSize: 17,
              fontWeight: "600",
            },
          }}
        />
        <Stack.Screen
          name="VenuePreview"
          component={VenuePreviewScreen}
          options={{
            headerShown: true,
            title: "Venue",
            headerBackTitle: "Back",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: {
              fontSize: 17,
              fontWeight: "600",
            },
          }}
        />
        <Stack.Screen
          name="ItineraryDetail"
          component={ItineraryDetailScreen}
          options={{
            headerShown: true,
            title: "Itinerary",
            headerBackTitle: "Back",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          }}
        />
        <Stack.Screen
          name="SharedItinerary"
          component={SharedItineraryScreen}
          options={{
            headerShown: true,
            title: "Shared Itinerary",
            headerBackTitle: "Back",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          }}
        />
        <Stack.Screen
          name="InviteScreen"
          component={InviteScreen}
          options={{
            presentation: "modal",
            headerShown: true,
            title: "Invite a Friend",
            headerBackTitle: "Cancel",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          }}
        />
        <Stack.Screen
          name="EventCalendar"
          component={EventCalendarScreen}
          options={{
            headerShown: true,
            title: "Upcoming Events",
            headerBackTitle: "Back",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          }}
        />
        <Stack.Screen
          name="CheckIn"
          component={CheckInScreen}
          options={{
            headerShown: true,
            title: "Check In",
            headerBackTitle: "Back",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          }}
        />
        <Stack.Screen
          name="RoundRedemption"
          component={RoundRedemptionScreen}
          options={{
            headerShown: true,
            title: "Free Round",
            headerBackTitle: "Back",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          }}
        />
        <Stack.Screen
          name="InsiderCode"
          component={InsiderCodeScreen}
          options={{
            headerShown: true,
            title: "My Insider Code",
            headerBackTitle: "Back",
            headerTintColor: colors.text,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerTitleStyle: { fontSize: 17, fontWeight: "600" },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
    <UpdateAvailableModal />
    </>
  );
}
