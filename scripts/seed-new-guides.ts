/**
 * Seeds two new HappiTime staff-authored guides into the `guides` table:
 *   - wc-2026-kc-happy-hours    (World Cup 2026 happy hours)
 *   - daycap-women-kansas-city  (daycap / early-evening scene for women)
 *
 * Mirrors scripts/migrate-static-guides-to-db.ts. Safe to re-run — uses
 * upsert ON CONFLICT (slug) DO NOTHING (ignoreDuplicates).
 *
 * Guides are seeded as status='draft' so they are NOT publicly visible until
 * an editor flips them to 'published' (the public /guides/[slug] page only
 * renders published guides). Every venue named below was pulled from the live
 * `venues` table (top-rated, published) so no venue names are fabricated.
 *
 * Usage:
 *   npx tsx scripts/seed-new-guides.ts
 *
 * Requires in env (or apps/web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// ── env loader (same pattern as migrate-static-guides-to-db.ts) ─────────────

function loadEnvFile(relativePath: string) {
  const filePath = resolve(process.cwd(), relativePath);
  let contents = "";
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile("apps/web/.env.local");
loadEnvFile("apps/web/.env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Set them in apps/web/.env.local."
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

// ── guide data ──────────────────────────────────────────────────────────────

const now = new Date().toISOString();

type GuideRow = {
  slug: string;
  title: string;
  subtitle: string;
  body_md: string;
  city: string;
  tags: string[];
  status: "draft" | "published";
  author_id: null;
  cover_image_url: null;
  published_at: string;
  updated_at: string;
};

const GUIDES: GuideRow[] = [
  {
    slug: "wc-2026-kc-happy-hours",
    title: "Best Happy Hour Deals During KC World Cup 2026",
    subtitle:
      "Where to drink, eat, and watch the matches in Kansas City — June 19-21 and every match weekend.",
    city: "Kansas City",
    tags: [
      "world cup",
      "kansas city",
      "happy hour",
      "kc world cup 2026",
      "mundial 2026",
      "Arrowhead",
    ],
    status: "draft",
    author_id: null,
    cover_image_url: null,
    published_at: now,
    updated_at: now,
    body_md: `Kansas City earned its place on the world stage: the metro is one of the host cities for the 2026 FIFA World Cup, with **six matches** scheduled at GEHA Field at Arrowhead Stadium between mid-June and early July 2026. For a few electric weeks, KC stops being a best-kept secret and becomes a global destination — and the bars, patios, and happy hours that locals have quietly loved for years are about to get very, very busy.

Whether you scored tickets or you are here for the energy, this guide maps the best happy hour deals around the tournament: where to drink and eat before kickoff, which neighborhoods to base yourself in, and where to catch the matches you are not seeing live. Match weekends — starting with the June 19–21 opening stretch — will pack downtown and the entertainment districts, so plan early, arrive early, and use HappiTime to check today's exact deal windows before you head out.

## Westport — The Pre-Game Capital

[Westport](/happy-hour/westport-kansas-city/) is KC's densest cluster of bars and the easiest neighborhood for a World Cup crawl. Start at **Beer Kitchen**, a local favorite (4.6 stars across 2,000+ reviews) with a deep tap list and a patio built for big groups — order a flight and the shareable plates. **Char Bar** brings smoked-meat heaven and a sprawling patio; get the burnt ends and a cold draft. **Harry's Bar & Tables** leans cocktail-forward for a slightly more polished pre-match drink. For the sports-bar faithful, **Dos Lokos Sports Cantina** and **Tin Roof Kansas City** put the matches on every screen with margaritas and shareable apps.

Typical happy hour here runs weekday afternoons (roughly 3–6 PM), but match days will scramble the schedule — confirm live times in the app before you commit to a spot.

## Crossroads Arts District — Craft & Atmosphere

The [Crossroads](/happy-hour/crossroads-kansas-city/) is where to go when you want the match-day buzz without the stadium chaos. **Cafe Corazon** (a stellar 4.8 stars) is the move for Mexican plates and michelada energy — fitting for a tournament with an entire continent watching. **Border Brewing Company** and **City Barrel** pour KC-made beer for under-the-radar pre-game pints. For something more refined, **Tannin Wine Bar & Kitchen** and **Extra Virgin** reward a slower afternoon of small plates and a good glass of red. **The Rockhill Grille** rounds out the district with a big, comfortable room that handles crowds well.

What to order: tacos and a michelada at Corazon, a flight at Border Brewing, or Spanish-style small plates at Extra Virgin.

## Country Club Plaza — Upscale & Open-Air

The [Plaza](/happy-hour/plaza-kansas-city/) is the prettiest place to watch the world arrive. **Gram & Dun** (4.5 stars, 2,200+ reviews) has one of the best patios in the city — ideal for a long, sunny afternoon before an evening match. **Kona Grill** is built for groups, with a huge bar, sushi, and a wraparound patio. **Chaz Restaurant & Lounge** at the Raphael delivers live jazz and craft cocktails for a grown-up pre-game. **O'Dowd's** is the Plaza's go-to Irish pub — and a natural home for soccer supporters who want the match on and a pint in hand. **Stock Hill** is the splurge: a stunning steakhouse for the celebratory dinner after your team wins.

## Power & Light District — The Heart of the Action

Expect the [Power & Light District](/happy-hour/power-light-kansas-city/) to be the unofficial fan zone of the tournament. **Yard House** (4.4 stars, 4,000+ reviews) is purpose-built for this moment — 100+ beers on tap, wall-to-wall screens, and a big bar that turns into a singing, scarf-waving crowd on match days. **BRGR Kitchen and Bar** and **The Quaff Bar & Grill** are reliable, high-capacity spots for burgers, beers, and the game. **Dott Boss** adds a newer, livelier option, and **Bristol Seafood Grill** is there when you want to trade up for oysters and a proper cocktail. The KC Live! block at the center of the district typically hosts large watch events — exactly where you want to be when a stoppage-time goal goes in.

## Before the Match — Daycap Near Arrowhead

GEHA Field at Arrowhead sits east of downtown, so the smart pre-match move is an early-evening "daycap" before you head to the parking lots. KC is a barbecue town, and you will want that to be part of your World Cup story: **Q39** and the legendary **Gates Bar-B-Q** (with multiple Midtown locations) are quick, iconic, and easy to hit on the way to the stadium. For something with a sit-down patio and a drink first, the Crossroads and Midtown spots above are a short drive from the gates. Eat early, hydrate, and save the real celebrating for after the final whistle.

## Getting Around on Match Days

Traffic and parking around Arrowhead will be heavier than a normal Chiefs Sunday, so build in extra time. Many fans will base themselves downtown or in Power & Light and use rideshare or shuttles to the stadium — which is exactly why an early happy hour in a walkable district makes sense. Start your afternoon somewhere you can leave the car, then head to the match. The neighborhoods in this guide are all within a 10–20 minute drive of one another, so you can mix a Crossroads lunch, a Power & Light pre-game, and an Arrowhead match into one day without much friction.

## If You're Not at the Stadium — Watch Parties

Not every match is at Arrowhead, and not everyone has a ticket — KC does watch parties well. The Power & Light District's KC Live! block is the largest open-air option and a lock for big-screen crowds. Sporting Kansas City (and Children's Mercy Park across the state line) typically rallies the local soccer community, and Visit KCK and city tourism boards usually publish official fan-event schedules as the tournament nears. There has also been talk of an official FIFA Fan Fest footprint in host cities. Listings shift, so **check official watch party listings** from FIFA, Visit KC, Visit KCK, and Sporting KC for confirmed locations and times before match day.

For a neighborhood-bar watch instead of a mega-event, the sports-forward spots above — Yard House, O'Dowd's, Tin Roof, Dos Lokos, and The Quaff — will all have the matches on with happy hour energy.

### FAQ

**Q: When is the World Cup in Kansas City?**
**A:** The 2026 FIFA World Cup runs from mid-June through mid-July 2026, with six matches at GEHA Field at Arrowhead Stadium. The opening weekend push for KC begins around June 19–21. Check FIFA's official schedule for exact KC fixture dates.

**Q: What is the best neighborhood for World Cup happy hours in KC?**
**A:** The Power & Light District is the epicenter for big-screen, big-crowd energy. Westport is best for a walkable bar crawl, the Crossroads for craft drinks and a calmer vibe, and the Plaza for upscale patios.

**Q: Where can I watch matches if I do not have tickets?**
**A:** The Power & Light District's KC Live! block hosts large watch parties, and sports bars like Yard House and O'Dowd's show every match. Check official listings from FIFA, Visit KC, and Sporting KC for fan-fest and watch-party details.

**Q: What should I eat during the World Cup in KC?**
**A:** Barbecue is non-negotiable — hit Gates Bar-B-Q or Q39. For match-day grazing, Cafe Corazon's tacos, Beer Kitchen's shareable plates, and Kona Grill's sushi are crowd-pleasers.

**Q: How early should I arrive for happy hour on match days?**
**A:** Earlier than usual. Match weekends will fill patios and bars fast — aim for 3–3:30 PM for weekday deals and confirm exact happy hour windows in the HappiTime app, since match days can shift schedules.

## Plan Your Tournament with HappiTime

The World Cup turns KC into a soccer city for a month — make the most of it. Download HappiTime to see live happy hour deals across every neighborhood, build a match-day itinerary, and get reminders when your favorite spots start their specials. [Browse KC happy hours](/kc/) or get the app and never miss a deal during the biggest sporting event Kansas City has ever hosted.`,
  },

  {
    slug: "daycap-women-kansas-city",
    title: "Where Women Go for Daycap in Kansas City",
    subtitle:
      "The KC happy hour scene reframed for early-evening hangouts, mocktails, and girls' night vibes.",
    city: "Kansas City",
    tags: [
      "daycap",
      "kansas city",
      "happy hour",
      "women",
      "mocktails",
      "girls night",
      "sober curious",
    ],
    status: "draft",
    author_id: null,
    cover_image_url: null,
    published_at: now,
    updated_at: now,
    body_md: `The night out is getting earlier. Across Kansas City — and everywhere a younger generation of women is setting the social calendar — the "daycap" has quietly replaced the late night. Think of it as the opposite of a nightcap: a drink (or a beautiful mocktail) in the late afternoon or early evening, good light for photos, a patio, and your group home before 9 PM. It is the after-work glass of wine, the 5 PM girls' catch-up, the sober-curious Sunday spritz. Same friends, same fun, none of the 1 AM regret.

Daycap culture fits KC perfectly. The city's happy hours already run early, the patios are plentiful, and a growing number of bars and restaurants take non-alcoholic drinks as seriously as their cocktail list. This guide is the KC happy hour scene reframed for the daycap: aesthetic patios worth the photo, places that pour a great mocktail, spots that can handle a big group, and rooms where going solo or on a first date feels easy and safe. Every venue below is a real, currently listed KC spot — check HappiTime for today's exact happy hour window before you go.

## Why the Daycap Works

The daycap is not just a trend; it is a better-designed night out. You catch the best light, you are out while patios are still warm and bars are still calm, and you wake up the next morning without writing off your whole Saturday. It is also more inclusive: friends who do not drink, friends with early mornings, and friends on a budget can all say yes to a 5 PM plan in a way they cannot to a midnight one. That is the whole point — the daycap lowers the barrier to actually seeing each other.

## Aesthetic Patios

If the daycap is partly about the vibe (and the photo), start here. **Cafe Corazon** in the [Crossroads](/happy-hour/crossroads-kansas-city/) is a 4.8-star stunner — string lights, plants, and michelada-and-taco energy that photographs beautifully in golden hour. **Gram & Dun** on the [Plaza](/happy-hour/plaza-kansas-city/) has one of the prettiest patios in the city, all greenery and clean lines — ideal for a long, sunny catch-up. **Brown & Loe** in the [River Market](/happy-hour/river-market-kansas-city/) brings a moody-chic look and a buzzy bar. In [Westport](/happy-hour/westport-kansas-city/), **Char Bar**'s big patio is relaxed and group-friendly, while **City Barrel** in the Crossroads pairs a bright, airy taproom with house-brewed beer.

What to order: a michelada at Corazon, a spritz on Gram & Dun's patio, or a sour beer at City Barrel.

## Mocktail-Friendly Happy Hours

The daycap and the sober-curious movement go hand in hand, and these spots are known for taking drinks — with or without alcohol — seriously. **Tannin Wine Bar & Kitchen** (Crossroads) and **Extra Virgin** are cocktail-and-wine-forward kitchens where bartenders can build a thoughtful no-proof drink to order. **Beer Kitchen** in Westport has the kind of creative bar program that is happy to shake up a zero-proof option. **Stock Hill** on the Plaza brings a polished, special-occasion bar, and **Unforked** at Crown Center is a fresh, health-minded spot that naturally suits a lighter daycap.

A note from our editors: KC's venue data does not yet tag specific non-alcoholic menus, so the venues above are recommended for their strong, made-to-order bar programs rather than a published NA list our editors have confirmed item-by-item. Always ask your bartender for their mocktail or zero-proof options — at these spots, you will be in good hands. (We are working on tagging NA-friendly menus directly in HappiTime.)

## Big-Group Friendly

Going out with the girls means room for everyone. **Kona Grill** on the Plaza is built for groups — a huge bar, sushi, and a wraparound patio that can absorb a birthday crowd. **Yard House** in the [Power & Light District](/happy-hour/power-light-kansas-city/) has 100+ taps, big tables, and screens everywhere. **The Rockhill Grille** in the Crossroads offers a large, comfortable room, while **BRGR Kitchen and Bar** (Power & Light) and **O'Dowd's** (Plaza) are reliable, high-capacity favorites for an easy group reservation.

These are the spots to text the group chat about on a Thursday — they can take a party of eight without a month's notice.

## Solo & Date-Safe

A daycap is also one of the best low-pressure ways to meet up one-on-one — or to treat yourself. **Tannin Wine Bar & Kitchen** is a classic for a reason: a calm bar, an excellent by-the-glass list, and staff who make a solo seat feel comfortable. **Extra Virgin**'s bar is perfect for a relaxed first date over small plates. **Thou Mayest** in the River Market does double duty as a coffee-by-day, cocktails-by-evening spot — a great neutral, well-lit meeting place. **Ragazza Food & Wine** in [Midtown](/happy-hour/midtown-kansas-city/) is cozy and conversation-friendly, and **Chaz Restaurant & Lounge** on the Plaza adds live jazz for an effortlessly romantic early evening.

Early hours, public patios, and busy bars are exactly what make the daycap feel safe — you are out while it is light, in rooms full of people, and home before the late crowd arrives.

## How to Plan the Perfect Daycap

A good daycap is mostly about timing. Aim to arrive around 4:30–5 PM: you will catch the start of happy hour pricing, get first pick of patio seating, and still have golden-hour light for photos. Pick one anchor spot for your group rather than over-planning a crawl — the daycap is meant to be relaxed, not a logistics exercise. If a few friends are not drinking, lead with a mocktail-friendly venue so no one feels like an afterthought, and let the bartender know up front so they can pace the table together. Split a couple of shareable plates instead of committing to full entrees; happy hour appetizers are where the value lives, and grazing keeps the conversation going. Finally, check HappiTime before you leave — deal windows vary by venue and day, and the app shows you which spots are running specials right now so you are not guessing at the door.

### FAQ

**Q: What is a "daycap"?**
**A:** A daycap is the early-evening answer to a nightcap — a drink or mocktail in the late afternoon, usually wrapped up before 9 PM. It is the going-out-with-the-girls hangout reframed around happy hour instead of the late night.

**Q: Where can I get good mocktails in Kansas City?**
**A:** Spots with strong, made-to-order bar programs — like Tannin Wine Bar & Kitchen, Extra Virgin, Beer Kitchen, and Stock Hill — are your best bet. KC menus do not yet tag NA options, so ask your bartender; at these venues you will get a thoughtful zero-proof drink.

**Q: What are the best patios for a daytime hangout in KC?**
**A:** Cafe Corazon in the Crossroads, Gram & Dun on the Plaza, and Brown & Loe in the River Market are among the most photogenic. Char Bar in Westport is the most group-friendly.

**Q: Where can I take a big group for happy hour?**
**A:** Kona Grill and O'Dowd's on the Plaza, Yard House and BRGR Kitchen in Power & Light, and The Rockhill Grille in the Crossroads all handle large parties comfortably.

**Q: Is happy hour a good time to go out solo or on a first date?**
**A:** Absolutely — early, well-lit, public, and low-pressure. Wine bars like Tannin and Extra Virgin, and a coffee-to-cocktails spot like Thou Mayest, are especially easy for a solo seat or a first meet-up.

## Find Your Daycap with HappiTime

The best daycap is the one that fits your night — and your group. Download HappiTime to see live happy hour deals across every KC neighborhood, find the patios and mocktails that match your vibe, and build an early-evening itinerary with the girls. [Browse KC happy hours](/kc/) or get the app and make 5 PM the new going-out.`,
  },
];

// ── run ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding ${GUIDES.length} new guides to Supabase (status=draft)…\n`);

  for (const guide of GUIDES) {
    const words = guide.body_md.split(/\s+/).filter(Boolean).length;
    const { error } = await db
      .from("guides")
      .upsert(guide as any, { onConflict: "slug", ignoreDuplicates: true });

    if (error) {
      console.error(`  ✗ ${guide.slug}:`, error.message);
    } else {
      console.log(`  ✓ ${guide.slug} (${words} words)`);
    }
  }

  console.log("\nDone. Guides are status='draft' — flip to 'published' to go live.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
