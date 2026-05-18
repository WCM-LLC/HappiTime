-- Populate reserved_handles table.
-- Depends on: 20260518120000_super_users_and_guides.sql (creates the table)
-- Mirrors RESERVED_HANDLES in packages/shared-types/reserved-handles.ts.
-- ON CONFLICT DO NOTHING makes this idempotent.

INSERT INTO public.reserved_handles (handle) VALUES
  -- ── Brand / product ──────────────────────────────────────────────────────
  ('happitime'), ('happi'), ('happy'), ('happytime'), ('happi_time'),
  ('happy_time'), ('happiapp'), ('happyhour'), ('happy_hour'),
  ('happyhours'), ('happy_hours'), ('hh'), ('happitime_kc'), ('happi_kc'),
  ('happitime_official'), ('happitime_team'), ('happitime_support'),

  -- ── Role / system ────────────────────────────────────────────────────────
  ('admin'), ('administrator'), ('superuser'), ('super_user'),
  ('moderator'), ('mod'), ('staff'), ('team'), ('official'), ('support'),
  ('help'), ('system'), ('root'), ('api'), ('bot'), ('service'),
  ('internal'), ('ops'), ('security'), ('engineering'), ('eng'), ('dev'),
  ('developer'), ('legal'), ('press'), ('media'), ('marketing'), ('sales'),
  ('hr'), ('executive'), ('ceo'), ('coo'), ('cto'), ('cfo'),
  ('founder'), ('cofounder'), ('co_founder'),

  -- ── Generic app terms ────────────────────────────────────────────────────
  ('me'), ('you'), ('settings'), ('profile'), ('account'), ('login'),
  ('logout'), ('signin'), ('signout'), ('signup'), ('register'), ('auth'),
  ('verify'), ('verification'), ('reset'), ('password'), ('notification'),
  ('notifications'), ('discover'), ('explore'), ('search'), ('activity'),
  ('feed'), ('home'), ('trending'), ('featured'), ('popular'), ('new'),
  ('latest'), ('guides'), ('guide'), ('itinerary'), ('itineraries'),
  ('venue'), ('venues'), ('event'), ('events'), ('checkin'), ('checkins'),
  ('friend'), ('friends'), ('following'), ('follower'), ('followers'),
  ('invite'), ('invites'), ('directory'), ('app'), ('web'), ('mobile'),
  ('ios'), ('android'), ('null'), ('undefined'), ('anonymous'), ('anon'),
  ('nobody'), ('everyone'), ('anyone'), ('someone'), ('user'), ('users'),
  ('test'), ('testing'), ('demo'), ('beta'), ('staging'), ('prod'),
  ('production'), ('sandbox'),

  -- ── Tier 1 US cities ─────────────────────────────────────────────────────
  ('newyork'), ('new_york'), ('nyc'), ('losangeles'), ('los_angeles'), ('la'),
  ('chicago'), ('houston'), ('phoenix'), ('philadelphia'), ('philly'),
  ('sanantonio'), ('san_antonio'), ('sandiego'), ('san_diego'), ('dallas'),
  ('sanjose'), ('san_jose'), ('austin'), ('jacksonville'), ('fortworth'),
  ('fort_worth'), ('columbus'), ('charlotte'), ('sanfrancisco'),
  ('san_francisco'), ('sf'), ('indianapolis'), ('indy'), ('seattle'),
  ('denver'), ('washington'), ('dc'), ('nashville'), ('oklahomacity'),
  ('oklahoma_city'), ('okc'), ('elpaso'), ('el_paso'), ('boston'),
  ('portland'), ('lasvegas'), ('las_vegas'), ('vegas'), ('memphis'),
  ('louisville'), ('baltimore'), ('milwaukee'), ('albuquerque'), ('tucson'),
  ('fresno'), ('sacramento'), ('mesa'), ('atlanta'), ('atl'),
  ('minneapolis'), ('tampa'), ('miami'), ('raleigh'), ('omaha'),
  ('detroit'), ('pittsburgh'), ('cincinnati'), ('cleveland'),
  ('kansascity'), ('kansas_city'), ('kc'), ('kcmo'), ('kckansas'), ('kcks'),

  -- ── KC neighborhoods & suburbs ───────────────────────────────────────────
  ('kc_downtown'), ('kcdowntown'), ('midtown'), ('midtown_kc'), ('brookside'),
  ('westport'), ('crossroads'), ('rivermarket'), ('river_market'), ('plaza'),
  ('the_plaza'), ('country_club_plaza'), ('country_club'), ('powelljackson'),
  ('north_kc'), ('northkc'), ('northland'), ('waldo'), ('hyde_park'),
  ('volker'), ('union_hill'), ('quality_hill'), ('crown_center'),
  ('overland_park'), ('op'), ('lenexa'), ('olathe'), ('shawnee'), ('leawood'),
  ('merriam'), ('mission'), ('prairievillage'), ('prairie_village'),
  ('belton'), ('grandview'), ('independence'), ('lees_summit'), ('lee_summit'),
  ('raytown'), ('gladstone'), ('liberty'), ('blue_springs'), ('parkville'),
  ('riverside'), ('zona_rosa'), ('zona'), ('legends'), ('legends_kc'),
  ('streetcar'), ('uptown'), ('south_kc'), ('east_kc'), ('west_kc'),

  -- ── Abuse / typosquatting seeds ──────────────────────────────────────────
  ('h4ppytime'), ('happytyme'), ('happitiime'), ('hapitime'),
  ('hap_pi_time'), ('happitlme'),

  -- ── Partner-reserved ─────────────────────────────────────────────────────
  ('gary_mitchell'), ('tgihh'), ('captiview'), ('alby'), ('soccer_city_kc')

ON CONFLICT (handle) DO NOTHING;
