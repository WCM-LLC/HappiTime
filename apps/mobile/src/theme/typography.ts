/**
 * HappiTime — Typography scale
 * Matches the web design system (display → caption).
 * Uses system font (San Francisco on iOS, Roboto on Android).
 */

import { TextStyle } from "react-native";

export const typography = {
  displayLg: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 38,
  } as TextStyle,

  displayMd: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.3,
    lineHeight: 32,
  } as TextStyle,

  displaySm: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
    lineHeight: 28,
  } as TextStyle,

  headingLg: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 26,
  } as TextStyle,

  headingSm: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
  } as TextStyle,

  bodyMd: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 22,
  } as TextStyle,

  bodySm: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  } as TextStyle,

  caption: {
    fontSize: 11,
    fontWeight: "500",
    lineHeight: 14,
    letterSpacing: 0.2,
  } as TextStyle,

  label: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  } as TextStyle,
};
