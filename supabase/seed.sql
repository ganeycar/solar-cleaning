-- Starting data. Every price is a DRAFT with no amount, so nothing can be
-- purchased until the owner enters and publishes prices.

insert into public.business_settings (id, business_name, tagline, headquarters_city)
values (1, 'Solar Cleaning Co.', 'Solar panel cleaning and care memberships for Solano and Yolo County homes.', 'Vacaville')
on conflict (id) do nothing;

-- Launch in Vacaville; other cities are listed but on a waitlist until the
-- owner turns on "accepting new customers" for each one.
insert into public.service_territories (slug, name, cities, travel_fee_cents, is_active, accepting_new, sort_order) values
  ('vacaville',   'Vacaville',   array['vacaville'],   0, true, true,  1),
  ('fairfield',   'Fairfield',   array['fairfield'],   0, true, false, 2),
  ('suisun-city', 'Suisun City', array['suisun city'], 0, true, false, 3),
  ('dixon',       'Dixon',       array['dixon'],       0, true, false, 4),
  ('winters',     'Winters',     array['winters'],     0, true, false, 5),
  ('davis',       'Davis',       array['davis'],       0, true, false, 6)
on conflict (slug) do nothing;

insert into public.plans (slug, name, kind, summary, cleanings_per_year, min_days_between_cleanings, priority_scheduling, benefits, limitations, display_order) values
  ('one-time', 'One-Time Cleaning', 'one_time', 'A single, complete standard cleaning with no recurring commitment.', 1, null, false,
    '["One complete standard cleaning","Before-and-after photos","No recurring commitment"]', '[]', 1),
  ('seasonal-care', 'Seasonal Care', 'subscription', 'Two standard cleanings a year, timed around the dry season.', 2, 120, false,
    '["Two standard cleanings per year","Before-and-after photos every visit","Monthly or annual billing"]',
    '["Cleanings scheduled in dry-weather windows","Unused cleanings do not roll over"]', 2),
  ('premium-care', 'Premium Care', 'subscription', 'Four standard cleanings a year for homes that collect dust and pollen quickly.', 4, 60, false,
    '["Four standard cleanings per year","Before-and-after photos every visit","Monthly or annual billing"]',
    '["Cleanings scheduled in dry-weather windows","Unused cleanings do not roll over"]', 3),
  ('unlimited-care', 'Unlimited Care', 'subscription', 'Up to one standard cleaning every 30 days, with priority scheduling.', 12, 30, true,
    '["Up to one standard cleaning every 30 days","Priority scheduling","Monthly or annual billing"]',
    '["Maximum one cleaning per 30 days","Subject to weather, safe access, and eligibility limits in the Membership Terms","Panel count limit applies"]', 4),
  ('commercial', 'Commercial Service', 'commercial', 'Custom cleaning frequency and scope for larger installations.', null, null, false,
    '["Site assessment","Custom frequency and scope","Contract or invoice billing"]', '[]', 5)
on conflict (slug) do nothing;

-- Draft price slots (no amounts). The owner fills these in and publishes them.
insert into public.plan_prices (plan_id, billing_interval, amount_cents, status)
select p.id, i.billing_interval, null, 'draft'
from public.plans p
cross join lateral (
  select unnest(case when p.kind = 'one_time' then array['one_time']::public.billing_interval[]
                     when p.kind = 'subscription' then array['month', 'year']::public.billing_interval[]
                     else array[]::public.billing_interval[] end) as billing_interval
) i
where not exists (select 1 from public.plan_prices x where x.plan_id = p.id);

-- Draft quote-engine rules. Money values are 0 until the owner sets them;
-- because this version is not published, customers never see a price.
insert into public.pricing_rules (version, status, notes, config) values (1, 'draft', 'Initial draft: set prices, then publish.', '{
  "version": 1,
  "published": false,
  "baseVisitCents": 0,
  "includedPanels": 0,
  "panelTiers": [{"minPanels": 1, "perPanelCents": 0}],
  "perExtraStoryCents": 0,
  "accessSurchargesCents": {"ladder_required": 0},
  "membershipDiscountPct": {"seasonal": 0, "premium": 0, "unlimited": 0},
  "minimumVisitCents": 0,
  "zones": [],
  "review": {
    "maxAutoPanels": 60,
    "maxAutoStories": 2,
    "reviewRoofTypes": ["tile", "unknown", "other"],
    "reviewAccessTypes": ["roof_access_required", "unsure"],
    "reviewPropertyTypes": ["commercial", "multi_family", "other"]
  }
}') on conflict (version) do nothing;
