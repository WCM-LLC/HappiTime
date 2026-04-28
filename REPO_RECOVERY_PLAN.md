# HappiTime — Repo Recovery Plan
_Audit date: 2026-04-28 — all items resolved_

---

## Completed — fixed and pushed to origin

| What | Action |
|---|---|
| 10 × `.DS_Store` tracked | `git rm --cached`; `.DS_Store` added to root `.gitignore` |
| 169 × `.idea/libraries/*.xml` tracked | `git rm --cached -r`; `.idea/` added to `.gitignore` (Gradle-sync-generated) |
| 98 × `.idea/modules/*.iml` tracked | Same as above |
| 12 remaining `.idea/` config files tracked | Removed; all reference the Java scaffold that was deleted |
| `.claude/` local state tracked | `git rm --cached`; `.claude/` gitignored — machine-local state |
| `apps/web/supabase/.temp/*` tracked | `git rm --cached`; `**/supabase/.temp/` gitignored |
| `apps/mobile/package 2.json` | Untracked + deleted from disk — macOS accidental copy with stale Expo 54 deps |
| Gradle Java scaffold at root | `git rm -r app/ build-logic/ list/ utilities/ gradlew gradle/ …` — `gradle init` boilerplate, zero HappiTime code |
| Windows `.ps1` supabase scripts | Removed — CI and macOS dev have no use for them |
| Oracle JDK in history | Oracle JDK commits (8ac080b, 1b23f3b) were **local-only, never pushed**. They became unreachable from HEAD after the upstream merge. `git gc --prune=now` cleaned the local blobs. No filter-repo needed. |
| Corrupted `.git/objects` | 3 macOS " 2" duplicate object files deleted; GC completed cleanly |
| Two remotes (`origin` + `upstream`) | Merged 17 legitimate mvp-stab commits from upstream into local master; force-pushed to `origin` (WCM-LLC); `upstream` remote removed. WCM-LLC is the sole source of truth. |
| `origin` remote missing from `.git/config` | Re-added `https://github.com/WCM-LLC/HappiTime.git`; master tracking branch set |
| `upstream/master` 17 commits ahead of origin | Merged: auth env fix, admin gate canonicalization, shared-api venue queries, feature flags, mobile type fixes, async token fix |

---

## Remaining — stale remote branches on origin

These branches on GitHub (WCM-LLC) are fully merged or abandoned. Safe to delete:

```bash
git push origin --delete \
  claude/affectionate-snyder \
  claude/cool-ptolemy-3c6241 \
  claude/implement-design-system-aG2wO \
  vercel/install-and-configure-vercel-w-g9ymrj \
  vercel/install-vercel-web-analytics-t3pzkc \
  vercel/install-vercel-web-analytics-yp3c35 \
  codex/audit-existing-react-native-app \
  codex/disable-social-login-options-and-update-links \
  codex/fix-500-error-on-contact-us-page
```

Also clean up the local branch that was merged:
```bash
git branch -d codex/investigate-and-fix-login-failure-across-apps
```

---

## Repo hygiene — rules for future contributors

- Never commit `.DS_Store` — root `.gitignore` now covers all depths
- Never commit `.claude/` — Claude Code memory and worktrees are machine-local
- Never commit `.env` or `.env.*` — already gitignored
- Never commit IDE project files — `.idea/` is now fully gitignored
- After IntelliJ/Android Studio Gradle sync, run `git status` to confirm `.idea/` shows nothing staged
- If a secret is ever committed, **rotate it immediately** (see `SECURITY_SECRETS.md`) — rotation is faster than history rewrite
- If a large binary is accidentally committed locally but not yet pushed, just don't push that branch; abandon it or reset, and `git gc --prune=now` cleans the local blobs
