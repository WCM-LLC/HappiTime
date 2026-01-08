-- Allow venues to choose org vs venue name in the app display.

alter table public.venues
  add column if not exists app_name_preference text not null default 'org';
