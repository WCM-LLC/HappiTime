import type { SubscriptionPlan } from './stripe';

export type FeatureKey =
  | 'photo_forward_layout'
  | 'top_of_category'
  | 'push_notifications'
  | 'weekly_social_post'
  | 'menu_editing';

export type FeatureDef = {
  key: FeatureKey;
  label: string;
  description: string;
};

export const FEATURES: FeatureDef[] = [
  {
    key: 'photo_forward_layout',
    label: 'Photo-forward layout',
    description: 'Full-bleed hero images in venue listings',
  },
  {
    key: 'top_of_category',
    label: 'Top-of-category placement',
    description: 'Venue appears at the top of search results in your category',
  },
  {
    key: 'push_notifications',
    label: 'Push notifications',
    description: 'Notify nearby users when your happy hour starts',
  },
  {
    key: 'weekly_social_post',
    label: 'Weekly social post',
    description: 'Automated weekly social media post for your venue',
  },
  {
    key: 'menu_editing',
    label: 'Self-serve menu editing',
    description: 'Edit your menu directly from the portal',
  },
];

export const PLAN_FEATURES: Record<SubscriptionPlan, Set<FeatureKey>> = {
  listed:   new Set([]),
  basic:    new Set(['photo_forward_layout', 'menu_editing']),
  featured: new Set(['photo_forward_layout', 'menu_editing', 'top_of_category', 'push_notifications']),
  premium:  new Set(['photo_forward_layout', 'menu_editing', 'top_of_category', 'push_notifications', 'weekly_social_post']),
};

export const PLAN_PRICE: Record<SubscriptionPlan, number | null> = {
  listed:   null,
  basic:    49,
  featured: 99,
  premium:  199,
};

export const PLAN_LABEL: Record<SubscriptionPlan, string> = {
  listed:   'Listed',
  basic:    'Basic',
  featured: 'Featured',
  premium:  'Premium',
};

export function hasFeature(plan: SubscriptionPlan, feature: FeatureKey): boolean {
  return PLAN_FEATURES[plan].has(feature);
}
