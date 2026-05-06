alter table venues
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists tiktok_url text;
