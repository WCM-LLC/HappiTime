import { Platform } from "react-native";
import { PROVIDER_GOOGLE, type MapViewProps } from "react-native-maps";
import { colors } from "../theme/colors";

export const nativeMapViewProps: Pick<
  MapViewProps,
  | "provider"
  | "googleRenderer"
  | "loadingEnabled"
  | "loadingBackgroundColor"
  | "loadingIndicatorColor"
  | "userInterfaceStyle"
> = {
  provider: Platform.OS === "android" ? PROVIDER_GOOGLE : undefined,
  googleRenderer: Platform.OS === "android" ? "LEGACY" : undefined,
  loadingEnabled: true,
  loadingBackgroundColor: colors.background,
  loadingIndicatorColor: colors.primary,
  userInterfaceStyle: "light",
};
