import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HappiTime — Happy Hour Guide",
    short_name: "HappiTime",
    description:
      "Find the best happy hours in Kansas City. Browse deals by neighborhood.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAF8",
    theme_color: "#C8965A",
    icons: [
      {
        src: "/icon.png",
        sizes: "256x256",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
