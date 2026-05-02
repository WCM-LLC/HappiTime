export const featureFlags = {
  discoverFeedFromUserEvents: false,
} as const;

export const isFeatureEnabled = (flag: keyof typeof featureFlags) => featureFlags[flag];
