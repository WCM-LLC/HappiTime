import { Platform } from "react-native";
import { PROVIDER_GOOGLE, type MapViewProps } from "react-native-maps";
import { colors } from "../theme/colors";

export const nativeMapViewProps: Pick<
  MapViewProps,
  | "provider"
  | "loadingEnabled"
  | "loadingBackgroundColor"
  | "loadingIndicatorColor"
  | "userInterfaceStyle"
> = {
  provider: Platform.OS === "android" ? PROVIDER_GOOGLE : undefined,
  loadingEnabled: true,
  loadingBackgroundColor: colors.background,
  loadingIndicatorColor: colors.primary,
  userInterfaceStyle: "light",
};
