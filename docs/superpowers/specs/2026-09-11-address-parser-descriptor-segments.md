# Address-Review Accept Prefill Mis-parses Google Descriptor Segments — Finding

**Status:** Open finding. Not fixed; the fix needs a decision (see *Why this is not a one-liner*).
**Date:** 2026-09-11
**Component:** `apps/web/src/utils/parse-formatted-address.mjs`
**Surfaces in:** `/admin/address-review` → Accept (`AddressReviewActions.tsx`)

## Provenance

Logged in the body of PR #95 on 2026-06-17 and never tracked anywhere else. It stayed
unfixed for three months because a PR description is only durable if the PR merges — #95
sat open. Recorded here so it stops depending on that. Issues are disabled on this repo;
dated docs are the record.

## The finding

Google Places sometimes returns a `formattedAddress` carrying a leading descriptor segment
that is not part of the street address. Two known cases, both in the address-review queue:

- Belfry — `"… E 16th St entrance, …"`
- No Other Pub — `"Located in the, 1370 Grand Blvd, …"`

`parseFormattedAddress` splits on commas, requires the last segment to match `STATE ZIP`,
takes the second-to-last as `city`, and joins **everything before that** into `address`.
So the descriptor lands in the address field. Verified against `master` today:

```
"Located in the, 1370 Grand Blvd, Kansas City, MO 64106, USA"
  => address: "Located in the, 1370 Grand Blvd"   city: "Kansas City"  MO 64106

"1121 E 16th St entrance, Kansas City, MO 64108, USA"
  => address: "1121 E 16th St entrance"           city: "Kansas City"  MO 64108
```

The original note said the descriptor may end up "in the city field". That is not what
happens — `city` is correct in both cases. The damage is confined to `address`.

## Impact, stated accurately

`AddressReviewActions.tsx:18-22` seeds **editable form state** from the parse:

```ts
const parsed = parseFormattedAddress(googleAddress);
const [address, setAddress] = useState(parsed.address);
```

So this is a bad prefill in a visible, editable input — not a silent write. An admin who
reads the field will catch it. The risk is a fast pass over a long queue: `"Located in the,
1370 Grand Blvd"` is exactly the kind of value that survives skimming, and Accept then
writes it to the venue as the corrected address.

It has not bitten yet because Google's `formattedAddress` is **not stored** — it is fetched
live from `/api/places/details` when the review row is rendered — and the queue is unworked
(45 venues flagged as of 2026-09-11). The exposure begins the moment someone works it.

## Why this is not a one-liner

A leading extra segment is not distinguishable by structure from a legitimate one:

```
"51 E 14th St, Ste 200, Kansas City, MO 64106, USA"      => address: "51 E 14th St, Ste 200"   ✅
"Located in the, 1370 Grand Blvd, Kansas City, MO 64106" => address: "Located in the, 1370 Grand Blvd"  ❌
```

Identical shape, identical handling, opposite correctness. `test/parse-formatted-address.test.mjs`
already pins suite retention (`keeps a suite in the street segment`), so a rule that simply
drops leading extras would break a case the suite is deliberately protecting.

Any fix therefore needs a rule for what a *street* segment looks like, and the obvious
candidates each have a cost:

1. **Keep only the segment that starts with a house number.** Handles both known cases; drops
   legitimate segments for addresses with no house number (a named building).
2. **Blocklist known descriptor prefixes** (`Located in`, `… entrance`). Precise and safe, but
   only ever covers what has already been seen.
3. **Use `addressComponents` instead of `formattedAddress`.** The Places call at
   `apps/web/src/app/api/places/details/route.ts:15` already requests `addressComponents`,
   which is structured (`street_number`, `route`, …) and needs no parsing. Largest change,
   but it removes the parser from this path instead of patching it.

Option 3 looks right and the data is already being fetched. Not decided.

## Next step

Pick a rule, then add the descriptor cases to `test/parse-formatted-address.test.mjs`
alongside the existing suite test so the two stay pinned against each other.
