import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  DefaultTheme,
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { IconSymbol } from "../../components/ui/icon-symbol";
import { useNotificationNavigation } from "../hooks/useNotificationNavigation";
import { ActivityScreen } from "../screens/ActivityScreen";
import { AddScreen } from "../screens/AddScreen";
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

function AppTabs() {
  return (
    <Tab.Navigator
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
            | "plus.circle.fill"
            | "bell.fill"
            | "person.crop.circle.fill" = "house.fill";
          let size = 22;

          if (route.name === "Home") name = "house.fill";
          if (route.name === "Map") name = "map.fill";
          if (route.name === "Favorites") name = "star.fill";
          if (route.name === "Add") {
            name = "plus.circle.fill";
            size = 28;
          }
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
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Favorites" component={FavoritesScreen} />
      <Tab.Screen name="Add" component={AddScreen} />
      <Tab.Screen
        name="Activity"
        component={ActivityScreen}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  useNotificationNavigation(navigationRef);

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator>
        <Stack.Screen
          name="AppTabs"
          component={AppTabs}
          options={{ headerShown: false }}
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
