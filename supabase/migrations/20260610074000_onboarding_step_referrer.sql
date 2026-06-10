alter table public.user_preferences
  drop constraint if exists user_preferences_onboarding_step_check;
alter table public.user_preferences
  add constraint user_preferences_onboarding_step_check
  check (onboarding_step in (
    'welcome','location','preferences','notifications','handle','profile','referrer','complete'
  ));
