---
name: HappiTime tier model decisions
description: Tier/plan model schema decisions and features that are explicitly free
type: project
---

Tier model is schema-only (no enforcement yet). Tables: venue_subscriptions, user_plans.

Venue plans: free / pro / business
Consumer plans: free / power

**Why:** Foundation migration added 2026-04-24. All existing rows default to 'free' via fail-open helpers.

**Explicitly FREE for all users — do not gate these:**
- Shared/public itineraries (`is_shared: true`) — drives virality
- Group check-in — drives social engagement and network effects

**How to apply:** Never suggest gating shared itineraries or group check-in behind any paid plan. These are permanent free features by owner decision.
