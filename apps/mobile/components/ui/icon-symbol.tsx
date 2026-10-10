// MaterialIcons on every platform.
//
// This started life as the Expo template's Android/web FALLBACK, alongside an
// icon-symbol.ios.tsx that rendered real SF Symbols. That iOS file was never
// added, so the fallback is the whole implementation — and the docstring below
// used to claim "native SF Symbols on iOS", which was never true of this app.
// Fixed rather than repeated: `expo-symbols` is a native module, so adopting it
// is a release decision (new runtime version, new store build), not something
// this component can quietly imply it already does.
//
// It also used to accept a `weight` prop and drop it on the floor. MaterialIcons
// is a single-weight font, so the prop could not have worked; the one caller
// that relied on it was the tab bar, trying to distinguish the selected tab.
// That now lives in ./tab-bar-icon.tsx, which uses a filled/outlined glyph pair
// instead. The prop is gone rather than left as a lie a caller might trust.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'magnifyingglass': 'search',
  'plus.circle.fill': 'add-circle',
  'bell.fill': 'notifications',
  'person.crop.circle.fill': 'account-circle',
  'star.fill': 'star',
  'map.fill': 'map',
  'mappin.circle.fill': 'place',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.left': 'chevron-left',
  'chevron.right': 'chevron-right',
  'chevron.down': 'keyboard-arrow-down',
  'chevron.up': 'keyboard-arrow-up',
  'checkmark': 'check',
  'checkmark.seal.fill': 'verified',
  'arrow.up.left.and.arrow.down.right': 'fullscreen',
  'heart': 'favorite-border',
  'heart.fill': 'favorite',
  'location.fill': 'my-location',
  'xmark.circle.fill': 'cancel',
  'globe': 'language',
  'phone': 'phone',
  'at': 'alternate-email',
} as const;

type IconSymbolName = keyof typeof MAPPING;

/**
 * Renders a Material Icon on every platform, including iOS.
 *
 * The `name`s are SF Symbol names because that is the vocabulary MAPPING is
 * keyed by — not because an SF Symbol is drawn. Keep using them so the mapping
 * stays the single place a glyph is chosen, and add new entries there.
 *
 * For a control that needs to show selected/unselected state, this is the wrong
 * component: see ./tab-bar-icon.tsx.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name] as any} style={style} />;
}
