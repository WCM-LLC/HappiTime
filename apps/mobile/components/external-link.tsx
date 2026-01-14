import React from "react";
import { Linking, Text, type TextProps } from "react-native";

type Props = TextProps & { href: string };

export function ExternalLink({ href, onPress, ...rest }: Props) {
  return (
    <Text
      {...rest}
      accessibilityRole="link"
      onPress={(event) => {
        onPress?.(event);
        void Linking.openURL(href);
      }}
    />
  );
}
