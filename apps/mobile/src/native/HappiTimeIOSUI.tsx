import { requireNativeView } from "expo";
import React from "react";
import type { ViewProps } from "react-native";
import { Platform } from "react-native";

export type HappiTimePermissionVariant = "location" | "notifications" | "settings";

export type HappiTimeIOSPermissionPanelProps = ViewProps & {
  variant: HappiTimePermissionVariant;
  title: string;
  message: string;
  primaryTitle: string;
  secondaryTitle: string;
  loading?: boolean;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
};

type NativeHappiTimeIOSPermissionPanelProps = HappiTimeIOSPermissionPanelProps;

let NativeHappiTimeIOSPermissionPanel:
  | React.ComponentType<NativeHappiTimeIOSPermissionPanelProps>
  | null = null;

if (Platform.OS === "ios") {
  try {
    NativeHappiTimeIOSPermissionPanel =
      requireNativeView<NativeHappiTimeIOSPermissionPanelProps>("HappiTimeIOSUI");
  } catch {
    NativeHappiTimeIOSPermissionPanel = null;
  }
}

export const isHappiTimeIOSUIAvailable = NativeHappiTimeIOSPermissionPanel !== null;

export function HappiTimeIOSPermissionPanel(
  props: HappiTimeIOSPermissionPanelProps
) {
  if (!NativeHappiTimeIOSPermissionPanel) return null;
  return <NativeHappiTimeIOSPermissionPanel {...props} loading={props.loading ?? false} />;
}
