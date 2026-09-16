# Push policy

Every notification goes through `supabase/functions/_shared/notify.ts`. Inbox rows (`user_notifications`) are **always** written; only the Expo push can be suppressed. Two guards, defined in `_shared/push-policy.ts`, sit between the inbox insert and Expo:

| Guard | Default | Env override (edge-function secret, no deploy) |
| --- | --- | --- |
| Daily cap | 4 pushes per user per America/Chicago calendar day | `PUSH_DAILY_CAP=<integer>` (`0` disables push entirely) |
| Quiet hours | no pushes in [22:00, 09:00) Chicago local | `PUSH_QUIET_HOURS=22-9` or `off` |

Malformed values log a warning and fall back to the defaults. Rows that were pushed get `user_notifications.pushed_at` stamped; the cap counts rows with `pushed_at >= midnight Chicago`. Bookkeeping failures fail open (push still sent). Each call logs `[notify] type=<type> inserted=N pushed=N quiet=N capped=N`.

Added 2026-09-15 after consumer pushes were opened to every published venue (`_shared/push-gate.ts`). Tests: `deno test --no-config supabase/functions/_shared/push-policy.test.ts`.
