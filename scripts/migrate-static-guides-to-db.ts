/**
 * One-time migration: seeds the 5 HappiTime staff-authored static guides into
 * the `guides` table. Safe to re-run — uses ON CONFLICT (slug) DO NOTHING.
 *
 * Usage:
 *   npx tsx scripts/migrate-static-guides-to-db.ts
 *
 * Requires in env (or apps/web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// ── env loader (same pattern as verify-maps.ts) ────────────────────────────

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

// ── guide data ─────────────────────────────────────────────────────────────

type GuideRow = {
  slug: string;
  title: string;
  subtitle: string;
  body_md: string;
  city: string;
  tags: string[];
  status: "published";
  author_id: null;
  published_at: string;
};

const GUIDES: GuideRow[] = [
  {
    slug: "best-happy-hours-kansas-city",
    title: "The 15 Best Happy Hours in Kansas City (2026)",
    subtitle:
      "Our curated list of the 15 best happy hours in Kansas City for 2026 — from Westport dive bars to Power & Light rooftops. Neighborhoods, tips, and deals inside.",
    city: "Kansas City, MO",
    tags: [
      "best happy hours Kansas City",
      "KC happy hour 2026",
      "top happy hours KC",
      "Kansas City drink specials",
      "best bars Kansas City",
      "Westport happy hour",
      "Power and Light happy hour",
      "Crossroads happy hour",
    ],
    status: "published",
    author_id: null,
    published_at: "2026-01-15T12:00:00Z",
    body_md: `Kansas City takes happy hour seriously. Missouri's bar-friendly laws, a booming restaurant scene, and fiercely competitive neighborhoods mean you can find world-class deals every single day of the week. Here are our picks for 2026.

## Westport — The Happy Hour Capital

[Westport](/kc/westport/) has the highest density of happy hour spots in the metro. Within a few walkable blocks you can find $3 wells, half-price craft drafts, and two-for-one cocktails. The neighborhood rewards bar-hoppers: start with a patio beer, move to a speakeasy-style lounge, and finish at a late-night dive — all without needing a ride.

Look for weekday specials starting as early as 2 PM. Several spots also run reverse happy hours after 9 PM, making Westport ideal for both the after-work crowd and night owls.

## Power & Light — Downtown Energy

The [Power & Light District](/kc/power-and-light/) is where after-work KC converges. Two pedestrian-friendly blocks of restaurants and bars deliver everything from rooftop margaritas to bourbon flights at steep discounts. Happy hours here lean upscale — think craft cocktails for $6 instead of $14 — but the savings are real.

Peak time is 4 PM to 6 PM on Thursday and Friday. Arrive early for patio seating during warm-weather months.

## Crossroads Arts District — Creative Cocktails

The [Crossroads](/kc/crossroads/) is KC's most inventive cocktail neighborhood. Happy hour menus here feature seasonal ingredients, house-made syrups, and bartender originals at approachable prices. If you care about craft over volume, this is your district. First Fridays add an extra layer of energy with gallery openings and street vendors.

## Country Club Plaza — Upscale Sips

The [Plaza](/kc/plaza/) delivers a more polished happy hour experience — think wine lists, charcuterie boards, and classic cocktails with a view. It's the go-to for date-night happy hours and client dinners that need to impress without breaking the budget.

## 18th & Vine — History with a Pour

KC's historic [18th & Vine Jazz District](/kc/18th-and-vine/) pairs soul food and live music with no-frills drink specials. Happy hours here feel like stepping into Kansas City's cultural heartbeat — affordable, authentic, and always accompanied by a great soundtrack.

## River Market — Waterfront Patios

The [River Market](/kc/river-market/) district offers brewery taprooms, waterfront patios, and a relaxed vibe that pairs perfectly with a lazy afternoon pour. Saturday farmers-market energy spills into nearby bars, making it a weekend standout.

## Tips for Getting the Most Out of KC Happy Hours

- Most happy hours run Monday through Friday, 3 PM – 6 PM. Arrive by 4 PM for the best seating.
- Westport and the Crossroads have the most walkable bar clusters — plan a crawl instead of committing to one spot.
- Check HappiTime for daily menus — many venues rotate specials by day of the week.
- Late-night reverse happy hours (9 PM+) are a hidden gem, especially midweek.
- Food deals often offer the best value — half-price appetizers can stretch a $20 budget surprisingly far.

## Frequently Asked Questions

**When do happy hours typically start in Kansas City?**

Most start between 3 PM and 5 PM on weekdays. Some Westport and Crossroads spots kick off as early as 2 PM. Weekend happy hours are less common but growing, especially in Power & Light.

**What is the best neighborhood for happy hour?**

Westport tops the list for variety and walkability. Power & Light is best for a downtown vibe, and the Crossroads wins for creative cocktails.

**Are there late-night happy hours in KC?**

Yes — several bars run reverse happy hours starting at 9 or 10 PM, particularly in Westport and Power & Light.

**Does Missouri allow happy hour drink specials?**

Yes. Missouri law permits discounted drink pricing during happy hour, making KC one of the best happy hour cities in the Midwest.`,
  },

  {
    slug: "westport-happy-hour-guide",
    title: "Westport Happy Hour Guide — Best Bars & Deals",
    subtitle:
      "The complete guide to happy hour in Westport, Kansas City. Best bars, cheapest drinks, walkable crawl routes, and daily deal breakdowns — updated for 2026.",
    city: "Kansas City, MO",
    tags: [
      "Westport happy hour",
      "Westport Kansas City bars",
      "Westport drink specials",
      "Westport bar crawl",
      "happy hour Westport KC",
      "best bars Westport",
      "cheap drinks Westport Kansas City",
    ],
    status: "published",
    author_id: null,
    published_at: "2026-01-20T12:00:00Z",
    body_md: `[Westport](/kc/westport/) is Kansas City's original entertainment district and arguably its best happy hour destination. A dense strip of bars, restaurants, and lounges means competitive pricing and an easy walk from one deal to the next.

## Why Westport Wins at Happy Hour

Three things make Westport stand out: walkability, variety, and value. Within a quarter-mile stretch of Westport Road you can find dive bars pouring $3 wells, gastropubs with half-price appetizer menus, and cocktail lounges running $6 signature drinks. No other KC neighborhood packs that much range into so few blocks.

The competition between venues keeps prices honest. When the bar across the street is advertising $4 craft pints, your neighbor can't charge $9. That race to the bottom is a win for anyone with a thirst and a budget.

## When to Go

The classic Westport happy hour window is **3 PM to 6 PM, Monday through Friday**. Tuesdays and Wednesdays tend to be the least crowded — perfect for grabbing a patio seat without a wait. Thursdays pick up fast as the weekend crowd arrives early.

Don't overlook reverse happy hours. Several Westport bars bring specials back from 9 PM to close on weeknights, giving you a second shot at discounted drinks without the after-work rush.

## What to Expect: Drinks & Food

Drink specials typically include $3–$4 domestic drafts, $5–$6 craft beers, and $5–$7 cocktails. Several spots offer half-price wine by the glass. On the food side, look for discounted appetizers, $2–$3 tacos, and shareable plates in the $5–$8 range.

The best strategy is to graze: grab drinks at one spot, split an appetizer at the next, and finish with a nightcap somewhere new. Westport rewards the crawl.

## Sample Westport Happy Hour Crawl

1. **Start at 3 PM** — Grab a patio seat and a cheap draft at one of the dive bars on Westport Road.
2. **4 PM** — Walk east to a gastropub for half-price appetizers and a craft beer.
3. **5 PM** — Head to a cocktail lounge on Pennsylvania for discounted signature drinks.
4. **6 PM+** — Wind down at a neighborhood favorite with live music and a relaxed vibe.

## Frequently Asked Questions

**What time does happy hour start in Westport?**

Most bars start between 3 PM and 5 PM on weekdays. A handful open specials at 2 PM, and reverse happy hours kick in after 9 PM.

**Is Westport walkable for a bar crawl?**

Yes — it is one of the most walkable entertainment districts in KC. You can hit 5–6 bars within a few blocks without needing a car.

**Are there food specials during happy hour?**

Absolutely. Many spots offer half-price appetizers, discounted tacos, and dedicated happy hour food menus from 3–6 PM.`,
  },

  {
    slug: "power-and-light-happy-hour-guide",
    title: "Power & Light District Happy Hour Guide",
    subtitle:
      "Your guide to happy hour in the Power & Light District — rooftop bars, craft cocktails, and downtown KC's best after-work deals. Updated for 2026.",
    city: "Kansas City, MO",
    tags: [
      "Power and Light happy hour",
      "Power & Light District bars",
      "downtown Kansas City happy hour",
      "P&L drink specials",
      "Power and Light restaurants",
      "KC downtown bars",
      "rooftop happy hour Kansas City",
    ],
    status: "published",
    author_id: null,
    published_at: "2026-01-25T12:00:00Z",
    body_md: `The [Power & Light District](/kc/power-and-light/) is downtown Kansas City's premier entertainment block — two pedestrian streets lined with restaurants, bars, and rooftop patios that come alive during happy hour.

## The After-Work Destination

Power & Light sits steps from KC's central business district, making it the natural landing spot when the workday ends. By 4:30 PM on a Thursday, patios are filling up and bartenders are shaking discounted cocktails. The energy is polished but not stuffy — you will find suits loosening ties next to groups in Chiefs jerseys.

The district's layout is its secret weapon. Because the two main blocks are pedestrian-only, you can wander between venues with a drink in hand (within the district boundaries), making it one of the easiest happy hour crawls in the metro.

## Drinks, Food & Pricing

Expect happy hour cocktails in the **$5–$8 range** (down from $12–$16 regular). Draft beers typically drop to $4–$5, and wine by the glass runs $5–$7. Several restaurants pair drink deals with discounted appetizer menus — think half-price flatbreads, $6 sliders, and shareable dips.

The best value play is to combine a drink special with a food deal. A craft cocktail and a half-price app at P&L can come in under $15 — a fraction of the regular dinner check.

## Best Days & Times

- **Monday–Wednesday:** Quieter, easier to snag rooftop seating. Some venues extend happy hour to 7 PM.
- **Thursday:** The most popular after-work night. Arrive by 4 PM for a seat.
- **Friday:** High energy, fast transitions from happy hour to nightlife. Deals often end at 6 PM sharp.
- **Weekends:** Limited happy hour offerings, but brunch drink specials at several restaurants fill the gap.

## Extend Your Evening

Power & Light connects easily to neighboring districts on foot. After happy hour, consider walking to:

- [Crossroads Arts District](/kc/crossroads/) — 10 min walk south for creative cocktails
- [River Market](/kc/river-market/) — 10 min walk north for brewery taprooms
- [Downtown KC](/kc/downtown/) — surrounding blocks with steakhouses and lounges

## Frequently Asked Questions

**What time is happy hour in P&L?**

Most venues run 4 PM to 7 PM on weekdays. Some extend to 7:30 PM Thursday and Friday.

**Is Power & Light good for after-work drinks?**

It is one of the best in KC — walkable from downtown offices with a wide range of venues and price points.

**Are there rooftop happy hours?**

Yes, several venues have rooftop or elevated patios with happy hour pricing. Arrive early in warm months for the best seats.

**How does P&L compare to Westport?**

P&L is more upscale with bigger discounts on premium drinks. [Westport](/kc/westport/) has more variety and lower baseline prices — better for casual crawls.`,
  },

  {
    slug: "best-happy-hour-food-kansas-city",
    title: "Best Happy Hour Food Deals in Kansas City",
    subtitle:
      "The best happy hour food deals in Kansas City — half-price appetizers, dollar tacos, discounted plates, and more across Westport, Power & Light, the Crossroads, and beyond.",
    city: "Kansas City, MO",
    tags: [
      "happy hour food Kansas City",
      "best happy hour appetizers KC",
      "cheap eats Kansas City happy hour",
      "half price appetizers KC",
      "happy hour food deals",
      "Kansas City food specials",
      "dollar tacos Kansas City",
    ],
    status: "published",
    author_id: null,
    published_at: "2026-02-01T12:00:00Z",
    body_md: `Kansas City is a food city first — and that extends to happy hour. Half-price appetizers, dollar tacos, discounted BBQ sliders, and chef-driven small plates are all on the table if you know where to look.

## Why Happy Hour Food Is the Real Deal

Drink specials get the headlines, but food deals deliver the best value. A $14 appetizer at half price is $7 saved — often more than the discount on a single cocktail. Stack two or three discounted plates and you have a full dinner for under $20 per person.

KC restaurants know this, which is why many design dedicated happy hour food menus — not just discounted versions of the regular menu, but purpose-built shareable plates meant to pair with drinks and encourage you to stay longer.

## Best Neighborhoods for Happy Hour Food

### Westport — Casual & Cheap

[Westport](/kc/westport/) bars lean into shareable, no-fuss food: loaded nachos, wings, sliders, and tacos in the $3–$6 range during happy hour. The neighborhood's bar density means you can graze across multiple spots on a single walk.

### Crossroads — Chef-Driven Small Plates

The [Crossroads](/kc/crossroads/) is where KC's creative food scene meets happy hour pricing. Expect seasonal small plates, house-made charcuterie, and inventive snacks you won't find on standard bar menus — often at 40–50% off during the 3–6 PM window.

### Power & Light — Upscale Bites

[Power & Light](/kc/power-and-light/) restaurants offer polished happy hour food — think flatbreads, bruschetta flights, and sushi rolls at $6–$9. The savings are significant when regular appetizer prices run $14–$18.

### Plaza — Wine & Charcuterie

The [Plaza](/kc/plaza/) caters to a more upscale crowd with discounted wine pairings, cheese boards, and oyster deals. It is the go-to for a date-night happy hour where food is the main event.

### 18th & Vine — Soul Food Specials

[18th & Vine](/kc/18th-and-vine/) offers some of the most authentic food in the city during happy hour — think discounted fried catfish, collard greens, and cornbread alongside affordable pours.

## How to Build a Happy Hour Dinner

1. Pick a neighborhood with at least 3–4 happy hour options within walking distance.
2. Start with a drink and one appetizer at your first stop. Do not over-commit.
3. Move to a second venue for another round and a different plate — variety is the point.
4. Budget $18–$25 per person for drinks and food across two to three stops.
5. Use [HappiTime](/kc/) to check which venues have food specials today before you leave.

## Frequently Asked Questions

**Which neighborhood has the best happy hour food?**

Westport and the Crossroads offer the widest variety. The Plaza is best for upscale bites. 18th & Vine stands out for soul food specials.

**Can you get a full meal during happy hour?**

Absolutely. Two or three discounted appetizers easily make a full meal for $12–$18 per person.

**Are there weekend food deals?**

Weekend happy hour food deals are growing, especially Saturday brunch specials in Power & Light and Sunday discounts on the Plaza.`,
  },

  {
    slug: "friday-happy-hours-kansas-city",
    title: "Friday Happy Hours in Kansas City — Where to Go This Weekend",
    subtitle:
      "The best Friday happy hours in Kansas City — early starts, extended deals, and the neighborhoods that do Fridays best. Plan your weekend kickoff with HappiTime.",
    city: "Kansas City, MO",
    tags: [
      "Friday happy hour Kansas City",
      "KC Friday happy hour",
      "Kansas City weekend happy hour",
      "Friday drink specials KC",
      "best Friday bars Kansas City",
      "Friday after work KC",
      "weekend happy hour Kansas City",
    ],
    status: "published",
    author_id: null,
    published_at: "2026-02-10T12:00:00Z",
    body_md: `Friday is the biggest happy hour day in Kansas City. The after-work exodus hits bars across every neighborhood, and the best spots fill up fast. Here is how to make the most of your Friday in KC.

## Why Friday Happy Hour Hits Different

The energy on a Friday is not the same as a Tuesday. Crowds are bigger, patios are louder, and the line between happy hour and nightlife blurs. In KC, Friday happy hour is less of a quick drink and more of an event — the official start to the weekend.

That also means more competition for seating and shorter deal windows. Most venues stick to a hard cutoff at 6 PM on Fridays, so timing matters more than any other day of the week.

## Best Neighborhoods for Friday

### Power & Light — The After-Work Surge

[Power & Light](/kc/power-and-light/) draws the biggest Friday crowd in KC. Office workers pour out of downtown towers into the pedestrian district by 4 PM. Rooftop patios are the first to fill. If you want a seat outdoors, plan to arrive by 3:30 PM.

### Westport — Crawl-Ready

[Westport](/kc/westport/) is the best Friday option if you want to move between bars. The neighborhood's walkability means you can start with cheap drafts on a patio, shift to a cocktail spot, and end up at a live music venue — all within a few blocks.

### Crossroads — First Friday Bonus

The [Crossroads](/kc/crossroads/) shines on the first Friday of every month, when gallery openings and street vendors create a festival atmosphere. Bars and restaurants capitalize with extended specials and special menus. Even on non-First-Friday weeks, the neighborhood's cocktail bars are a strong pick.

### River Market & Midtown — Relaxed Alternatives

If the Friday crowds at P&L and Westport are not your speed, the [River Market](/kc/river-market/) and [Midtown](/kc/midtown/) offer a mellower Friday experience — brewery taprooms, neighborhood bars, and patio seating without the wait.

## Friday Timing Playbook

- **3:00–3:30 PM:** Arrive early to claim patio seating and catch the full deal window.
- **4:00–5:00 PM:** Peak happy hour — bars are full but deals are at their best.
- **5:30–6:00 PM:** Last call on most specials. Order your final round before cutoff.
- **6:00 PM+:** Happy hour ends at most spots, but the energy carries into the evening. Some venues switch to weekend drink menus or live music.
- **Pro tip:** Check [HappiTime](/kc/) before you leave — some venues have extended Friday hours that the crowd does not know about.

## Frequently Asked Questions

**What time should I arrive for Friday happy hour?**

Aim for 3:30–4:00 PM. Popular spots fill fast, and most deals end at 6 PM sharp.

**Do any KC bars extend happy hour on Fridays?**

Some bars in Westport and the Crossroads push to 7 PM, and a few P&L venues go to 7:30 PM. Check HappiTime for specifics.

**Where is the best neighborhood for Friday happy hour?**

Power & Light for the biggest crowd, [Westport](/kc/westport/) for crawl-friendly vibes, and the Crossroads for creative cocktails (especially on First Fridays).

**Can I transition from happy hour into nightlife?**

Absolutely. Both Westport and P&L transition seamlessly — many bars end specials at 6 PM but keep the energy going with DJs and live music.`,
  },
];

// ── run ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Migrating ${GUIDES.length} static guides to Supabase…\n`);

  for (const guide of GUIDES) {
    const { error } = await db
      .from("guides")
      .upsert(guide as any, { onConflict: "slug", ignoreDuplicates: true });

    if (error) {
      console.error(`  ✗ ${guide.slug}:`, error.message);
    } else {
      console.log(`  ✓ ${guide.slug}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
