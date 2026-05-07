import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { colors } from "../../src/theme/colors";

type Platform = "facebook" | "instagram" | "tiktok";

const ICON_MAP: Record<Platform, string> = {
  facebook: "facebook",
  instagram: "instagram",
  tiktok: "music-note",
};

type Props = {
  platform: Platform;
  size?: number;
  color?: string;
};

export function SocialIcon({ platform, size = 20, color = colors.primary }: Props) {
  return (
    <MaterialCommunityIcons
      name={ICON_MAP[platform] as any}
      size={size}
      color={color}
    />
  );
}
