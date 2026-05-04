import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useRef } from "react";
import { StyleSheet } from "react-native";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useNotificationNavigation } from "../hooks/useNotificationNavigation";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { ActivityScreen } from "../screens/ActivityScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { FavoritesScreen } from "../screens/FavoritesScreen";
import { HappyHourDetailScreen } from "../screens/HappyHourDetailScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { MapScreen } from "../screens/MapScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { VenuePreviewScreen } from "../screens/VenuePreviewScreen";
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
  const isGuest = !user;
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
          height: 80,
          paddingBottom: 20,
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

  return (
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
