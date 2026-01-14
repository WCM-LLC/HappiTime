import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Platform, Vibration, type GestureResponderEvent } from "react-native";

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev: GestureResponderEvent) => {
        if (Platform.OS === "ios") {
          Vibration.vibrate(10);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
