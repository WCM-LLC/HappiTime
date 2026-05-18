import { Platform } from "react-native";
import { PROVIDER_GOOGLE, type MapViewProps } from "react-native-maps";
import { colors } from "../theme/colors";

// Minimal Google Maps style that removes POI/transit clutter and warms the
// land colour to match the app palette — visually closer to Apple Maps.
const ANDROID_MAP_STYLE: MapViewProps["customMapStyle"] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f5f0eb" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c8dce8" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.local", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e0d8d0" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#6b6158" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8a7f75" }] },
];

export const nativeMapViewProps: Pick<
  MapViewProps,
  | "provider"
  | "customMapStyle"
  | "loadingEnabled"
  | "loadingBackgroundColor"
  | "loadingIndicatorColor"
  | "userInterfaceStyle"
> = {
  provider: Platform.OS === "android" ? PROVIDER_GOOGLE : undefined,
  ...(Platform.OS === "android" ? { customMapStyle: ANDROID_MAP_STYLE } : {}),
  loadingEnabled: true,
  loadingBackgroundColor: colors.background,
  loadingIndicatorColor: colors.primary,
  userInterfaceStyle: "light",
};
