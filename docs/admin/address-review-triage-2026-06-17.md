# Address-Review Triage — 2026-06-17

Snapshot of the **43 venues** flagged `needs_address_review` at the time the
`/admin/address-review` surface went live (PR #94). All 43 are **genuine,
persistent mismatches** (latest match-score ≤ 0.65, threshold 0.70) — the hourly
`validate-venue-places` cron will keep re-flagging them until a human resolves
each one. They do **not** auto-clear.

Links are relative to the admin console: `/orgs/{org}/venues/{venue}?from=admin`.
Resolve each in the **Address Review** queue (Accept Google's / Keep ours).

- **Accept** = our stored address is wrong → overwrite with Google's (stays in
  rotation; auto-confirms next cron run).
- **Dismiss** ("Keep ours") = our address is right, Google's `place_id` points
  elsewhere → keep ours, stop re-flagging (sticky).

---

## Group 1 · ZIP-only drift — 10 → **likely ACCEPT**
Street number + name match Google; only the ZIP (sometimes city/state) is stale.

- [ ] [Empanada Madness](/orgs/e071aa7c-add1-4af2-adf5-264b5b3e4420/venues/2575db3b-bb14-4727-b49f-c147c30e070f?from=admin) — ZIP `66101` → `64108`
- [ ] [Novel](/orgs/0327c1b3-a01b-455b-9765-26fe6fcacb73/venues/373d95a5-835e-4170-b894-cef0b1d96d66?from=admin) — ZIP `66223` → `64108`
- [ ] [Ponak's Mexican Kitchen](/orgs/0200c056-c9d5-40ac-b43f-0e91fe885c37/venues/c1f238a0-b9a7-4f6f-ab9c-7db3945e40f7?from=admin) — `KS 66103` → `MO 64108` (state + ZIP)
- [ ] [Niecie's Restaurant](/orgs/68ef670b-8adf-4c69-a1b7-3b7fef2949cc/venues/f7ddfb28-f59e-4dff-9829-0860abcd4250?from=admin) — ZIP `64108` → `64131`
- [ ] [John's Big Deck](/orgs/b76bfb53-7e15-4fdf-8c52-69691943e147/venues/c19b08db-ebef-4e5e-ad1c-55df8cf4d09f?from=admin) — ZIP `64108` → `64105`
- [ ] [Chartroose Caboose](/orgs/ab9b0781-c493-4742-9989-4b33ecbe4530/venues/c10346c4-b21b-407c-96d7-b800d11ac916?from=admin) — `Kansas City, MO 64111` → `Overland Park, KS 66212` (**city + state + ZIP all wrong**)
- [ ] [Knub's Pub](/orgs/7e9eb3fc-7c15-449e-bb85-b6f59f3bb256/venues/2dc5692a-a519-4309-b6e7-640fcab73703?from=admin) — ZIP `66216` → `66226` (Shawnee)
- [ ] [Vivilore](/orgs/7175cb82-09b6-457f-8f5f-ff5e37b5ac90/venues/68284b94-6536-414a-90c3-d3b327e35cb8?from=admin) — ZIP `64050` → `64052` (Independence)
- [ ] [The Brick](/orgs/d6e59e50-2d5b-412f-9819-140fcd505d0c/venues/07538946-0a9d-48ba-b1b2-86ec737c0956?from=admin) — ZIP `64105` → `64108`
- [ ] ⚠️ [Belfry](/orgs/95120963-cc49-4c85-ad5e-c3e906a2edc8/venues/4d973a91-8108-461f-9511-2aaa8676626d?from=admin) — ZIP `64116` → `64108`. **Check the Accept prefill** — Google's address has an extra `"E 16th St entrance"` segment that the parser may put in the city field.

---

## Group 2 · Different street entirely — 22 → **VERIFY, likely DISMISS**
Score 0–0.5: Google's `place_id` points to a different street/building than ours.
If our stored address is correct, **Keep ours**. The five **Red Door Grill** rows
look like `place_id`s crossed between locations.

- [ ] [Big Back Eatery KC](/orgs/b69f74c6-280f-42f7-9a7f-20d5d57959b4/venues/e380ca6f-89c4-4610-85b5-724acce7148b?from=admin) — `5912 Blue Pkwy` vs `3027 Monroe Ave` (0.00)
- [ ] [Brookside Sushi](/orgs/a0c0c008-f5a7-419c-aef3-563ff6432a37/venues/606f031b-680c-4083-b17c-0f2eefb94110?from=admin) — `6324 Brookside Plaza` vs `408 E 63rd St` (0.00)
- [ ] [Pearl Tavern](/orgs/ceadc5f6-9830-4b4d-bd95-5d7573b578e6/venues/bde331f9-dbc3-4349-8348-e3c62dc9e3b3?from=admin) — `22 SE 3rd St` vs `1672 NW Chipman Rd` (0.00)
- [ ] [Red Door Grill – Lee's Summit](/orgs/fbc22063-a45b-4df6-8062-35a408aa5887/venues/d0419bd7-086d-4a53-91b9-7b732d550128?from=admin) — `550 SE Melody Ln` vs `2061 NW Lowenstein Dr` (0.00)
- [ ] [Red Door Grill – Liberty](/orgs/2920bfdd-f963-4f8a-aa1d-0de1f2be6d18/venues/e9a80172-d022-4350-9f6d-2d73b947aaa3?from=admin) — `9 S Leonard St, Liberty` vs `9703 N Ash Ave, KC 64157` (0.00)
- [ ] [T-Shotz Golf and Entertainment Venue](/orgs/43ba1a23-eac2-409a-9853-f289d6f3ee76/venues/fd2eb68c-9e97-47ff-b1e1-807f06167aee?from=admin) — `9540 N Skyview Ave` vs `660 NW Metro N Dr` (0.09)
- [ ] [Cru Bistro & Bottles](/orgs/1532ce60-c715-4c2f-a0c8-e29d3012d85a/venues/f3662cd3-29e3-4f06-82d6-bdd9b53dd2ff?from=admin) — `3936 Wyoming St` vs `128 W 63rd St` (0.12)
- [ ] [Martin City Tavern – South Plaza](/orgs/d8be6f3f-7cfe-4439-a1bd-e19528683480/venues/1d1e82db-c303-4569-8cf3-0a09db113924?from=admin) — `410 W 75th St` vs `4950 Main St` (0.12)
- [ ] [Cliff's Taphouse](/orgs/5fde74e9-bea8-43da-b1b1-262faf967dbe/venues/2666604d-8a8b-4aef-a74b-2108eba7b9cf?from=admin) — `512 Armour Rd` vs `3044 Gillham Rd` (0.15)
- [ ] [Red Door Grill – Overland Park](/orgs/7a9f6496-e277-46bf-8b24-e8527022504f/venues/ce697f73-3ebf-4c6c-8b3f-b5853e1ee2d6?from=admin) — `6940 W 105th St` vs `8001 W 159th St` (0.20)
- [ ] [Blanc Champagne Bar](/orgs/12c41921-0b3e-45ca-9305-7b59eb08f63f/venues/aec2032c-1dac-4cc0-826f-d9c16a6b3ab0?from=admin) — `1715 Main St` vs `3835 Main St` (0.30)
- [ ] [Prime Sushi On Main](/orgs/d45a2947-9b23-43d3-aa4b-ff4b4237b753/venues/f613b757-f49a-4651-b329-0d02446e0a7f?from=admin) — `3935 Main St` vs `4980 Main St` (0.30)
- [ ] [Society Burgers](/orgs/0ab5e720-6f34-4544-a1cb-f095aa00922c/venues/cbb31500-d3ab-4b91-863e-b2f4e56de84a?from=admin) — `4700 Broadway Blvd` vs `3951 Broadway Blvd` (0.30)
- [ ] [54th Street Grill & Bar – Downtown](/orgs/02d443b1-77ac-495b-b5d3-09f647a6de99/venues/acd3b331-d73f-4729-b92a-9fcaa479b8a9?from=admin) — `2450 Grand Blvd` vs `1580 Main St` (0.35)
- [ ] [Crossroads Cantina](/orgs/13d7f725-d715-416c-8256-05ed2cc8f0f8/venues/3d304415-f955-4860-b537-5e3e5eebc1ef?from=admin) — `7 W 20th St` vs `1925 Baltimore Ave` (0.35) — *same ZIP; possible corner/two-frontage building, map-check*
- [ ] [Farina](/orgs/5b5ce232-4b38-41e9-8d5b-69061bf1abcd/venues/111e0eee-1180-4ecc-aaa4-321a5be1f40c?from=admin) — `19 W 19th St` vs `1901 Baltimore Ave` (0.35) — *same ZIP; possible corner/two-frontage building, map-check*
- [ ] [Kokoro Maki House](/orgs/a235326c-7cdd-45f1-859d-e81e8417396c/venues/dfa4c6cf-b058-488a-bf66-d861ca8f3601?from=admin) — `7945 State Line Rd` vs `340 W 75th St` (0.35)
- [ ] [Ocean Prime](/orgs/9d9cc3fd-9b9b-4851-9976-aa2bbc050f4e/venues/3e2b6d6e-4626-4ace-96e5-7caeeb71c380?from=admin) — `700 W 47th St` vs `4622 Pennsylvania Ave #300` (0.35)
- [ ] [Red Door Grill – Lenexa](/orgs/7e694982-e3e3-45a4-b8aa-f18f31548512/venues/f11aa4cc-1e87-43f9-ae77-3dfb96a39d16?from=admin) — `8600 Penrose Ln` vs `15918 W 88th St` (0.35)
- [ ] [Urban on Troost](/orgs/41fb21d2-05cf-4e6b-a3f3-d188e9b049d5/venues/45b2e80a-c62e-4f7c-ab65-1e32d1f78904?from=admin) — `1020 E Armour Blvd` vs `3420 Troost Ave` (0.35)
- [ ] [54th Street Grill & Bar – Zona Rosa](/orgs/02d443b1-77ac-495b-b5d3-09f647a6de99/venues/63475252-8df5-4f05-884d-a38ffaa75203?from=admin) — `8625 NW Prairie View Rd` vs `7200 NW 86th Terrace` (0.44)
- [ ] [Lilico's Taverna](/orgs/298972da-c69e-4588-8441-6258cd99a4b0/venues/ff736b48-b147-423d-818e-c757dbdc1b1d?from=admin) — `1717 Walnut St` vs `1615 Oak St` (0.50)

---

## Group 2b · Same street, off house number — 5 → **EYEBALL** (Accept *or* Dismiss)
Score 0.65; street name matches, number differs slightly — real correction or rooftop offset.

- [ ] [Green Dirt on Oak](/orgs/5ba7b5c0-0c6e-4304-b135-fd6d2ea0e0bd/venues/4be45eb7-fc77-4381-a499-4caabb2fcb25?from=admin) — `1745 Oak St` vs `1601 Oak St`
- [ ] [Jerusalem Cafe](/orgs/59af751b-acc7-41dc-8711-ed7f22c13a10/venues/ad742148-c179-4c5d-b3e3-1a07bf03de6d?from=admin) — `431 Westport Rd` vs `515 Westport Rd`
- [ ] [Laney's Get Down](/orgs/502144b0-de31-429b-b468-75b6719c1024/venues/167fba61-4b1a-4424-92c8-a4fb286c944e?from=admin) — `4116 Pennsylvania Ave` vs `4057 Pennsylvania Ave`
- [ ] [Red Door Woodfire Grill](/orgs/9f77d3c4-d652-4ac3-a809-fa77f8211334/venues/ef9226f2-280f-4dba-860a-aa2d452693b6?from=admin) — `6361 Brookside Plaza` vs `6324 Brookside Plaza`
- [ ] [The Ship](/orgs/bc4c7ec6-2cb9-4776-9027-b61a7ff7637b/venues/9980af26-636b-4500-85d1-6e50f56e8571?from=admin) — `1217 Union Ave` vs `1221 Union Ave` (**stored field is malformed — full address doubled**)

---

## Group 3/4 · Data-quality / edge cases — 6
- [ ] [Bristol Seafood Grill – Leawood](/orgs/ba897636-e0c3-46e0-bff9-cc2ed121ba0e/venues/c0546e46-3a74-469b-8763-084a7a514ab2?from=admin) — **ACCEPT.** Our `address` field holds the whole address and city wrongly = Leawood; Google: `51 E 14th St, KC 64106`.
- [ ] [Tokoyo Japanese Steakhouse](/orgs/1f70d25d-1f10-431c-95e7-22537e310592/venues/fb7d49d0-b036-493b-a0ff-092a7302e06d?from=admin) — **VERIFY.** Our street has no house number and reads `NE Barry Rd`; Google: `7 NW Barry Rd, 64155` (note NE vs NW). Confirm which is the real location.
- [ ] [Thou Mayest](/orgs/e6394740-5c05-493c-be20-2af964b65590/venues/4fa202a4-85c3-4476-b8b2-c5105b38bba2?from=admin) — **ACCEPT (or leave).** Near-match: `412 Delaware St, 64106` vs `412 Delaware St B, 64105` — only suite + ZIP. Scored 0.59, just under threshold.
- [ ] [No Other Pub by Sporting KC](/orgs/8b13632c-982a-48b0-972c-3e76865d691e/venues/5ee28fa5-9dc4-40dd-930f-39b79d72077d?from=admin) — **DISMISS / fine.** Same number + ZIP (`1370 Grand Blvd, 64106`); flagged only because Google's address is prefixed `"Located in the,"` — a formatting artifact. ⚠️ same parser-quirk class as Belfry.
- [ ] [Osteria Il Centro](/orgs/d6da8f3d-6302-49a4-abec-b760169c3efe/venues/ef5413e9-26b3-47d8-b482-3593c0969d1a?from=admin) — **VERIFY.** `5101 W 119th St (OP)` vs `5101 Main St, 64112 (Plaza)` — different locations, same number.
- [ ] [Conrad's Restaurant & Alehouse](/orgs/66915660-1de5-43dd-8826-e167f1a1a032/venues/15ae5dc1-de11-4604-9677-33c83558fc4e?from=admin) — **VERIFY.** `210 N State Route 291`: our `KC 64119` vs Google `Liberty 64068`. Conrad's has both — which location is this `place_id`?

---

## Summary
| Bucket | Count | Default action |
|---|---|---|
| Group 1 · ZIP-only drift | 10 | Accept |
| Group 2 · different street | 22 | Verify → Dismiss |
| Group 2b · off house number | 5 | Eyeball |
| Group 3/4 · edge cases | 6 | Mixed (3 Accept-leaning, 3 verify) |
| **Total** | **43** | |

**Parser finding (for the team):** Google `formattedAddress` values with an extra
leading/middle descriptor segment — `"…, E 16th St entrance, …"` (Belfry),
`"Located in the, 1370 Grand Blvd, …"` (No Other Pub) — break the simple
comma-split in `parse-formatted-address.mjs`, mis-mapping fields in the Accept
prefill. Worth hardening the parser to skip non-address lead segments.
