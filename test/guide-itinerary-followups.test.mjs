// test/guide-itinerary-followups.test.mjs
//
// 20261011060000 restates four functions in full to make three small changes.
// A full restatement is where an unrelated edit — or a stale copy — slips in
// unnoticed, so beyond pinning the three changes this file checks that each
// restated function is its predecessor plus exactly the intended lines.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(`../supabase/migrations/${rel}`, import.meta.url), "utf8");
const sql = read("20261011060000_guide_itinerary_followups.sql");
const guards = read("20261011050000_guide_itinerary_guards.sql");
const influence = read("20261011031500_super_user_checkin_influence.sql");

const grab = (src, name) => {
  const start = src.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  return src.slice(start, src.indexOf("$$;", start));
};
const lines = (t) => t.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
/** Lines present in `next` but not in `prev`, and vice versa. */
const diff = (prev, next) => {
  const a = lines(prev), b = lines(next);
  return { added: b.filter((l) => !a.includes(l)), removed: a.filter((l) => !b.includes(l)) };
};
const code = (ls) => ls.filter((l) => !l.trim().startsWith("--"));

test("sync: the only change is a per-guide advisory lock, taken before anything is read", () => {
  const next = grab(sql, "sync_guide_itinerary");
  const { added, removed } = diff(grab(guards, "sync_guide_itinerary"), next);
  assert.deepEqual(removed, []);
  assert.deepEqual(code(added), [
    "  perform pg_advisory_xact_lock(hashtextextended('guide_itinerary:' || p_guide_id::text, 0));",
  ]);
  assert.ok(
    next.indexOf("pg_advisory_xact_lock") < next.indexOf("from public.guides g"),
    "locked before the guide is read, or a waiting sync acts on stale eligibility",
  );
});

test("touch RPC: the only change is that a retired companion earns nothing", () => {
  const { added, removed } = diff(
    grab(influence, "record_itinerary_touch"),
    grab(sql, "record_itinerary_touch"),
  );
  assert.deepEqual(removed, ["         or public.itinerary_shared_with_me(l.id));"]);
  assert.deepEqual(code(added), [
    "         or public.itinerary_shared_with_me(l.id))",
    "    and (l.source_guide_id is null or l.share_token is not null);",
  ]);
  assert.match(sql, /grant execute on function public\.record_itinerary_touch\(uuid, uuid\) to authenticated;/);
  assert.match(sql, /revoke all on function public\.record_itinerary_touch\(uuid, uuid\) from public, anon;/);
});

test("author re-sync: the only change is a stable lock order", () => {
  const { added, removed } = diff(
    grab(guards, "user_profiles_resync_guide_itineraries"),
    grab(sql, "user_profiles_resync_guide_itineraries"),
  );
  assert.deepEqual(removed, ["  for r in select g.id from public.guides g where g.author_id = v_user loop"]);
  assert.deepEqual(added, ["  for r in select g.id from public.guides g where g.author_id = v_user order by g.id loop"]);
});

test("venue re-sync: handles INSERT, keeps the same guide lookup, never reads a row that is not there", () => {
  const prev = grab(guards, "venues_resync_guide_itineraries");
  const next = grab(sql, "venues_resync_guide_itineraries");
  // The lookup that decides WHICH guides re-sync is unchanged.
  const lookup = (t) => t.slice(t.indexOf("select g.id"), t.indexOf("loop", t.indexOf("select g.id"))).replace(/\s+order by g\.id\s+/, "\n  ").replace(/\s+/g, " ").trim();
  assert.equal(lookup(next), lookup(prev));
  assert.match(next, /order by g\.id\s+loop/);
  // OLD is unassigned on INSERT, NEW on DELETE: neither may be touched in DECLARE.
  const declare = next.slice(next.indexOf("declare"), next.indexOf("begin"));
  assert.doesNotMatch(declare, /\b(old|new)\./);
  const insertBranch = next.slice(next.indexOf("if tg_op = 'INSERT' then"), next.indexOf("elsif tg_op = 'UPDATE' then"));
  assert.doesNotMatch(insertBranch, /\bold\./, "INSERT branch reads NEW only");
  const deleteBranch = next.slice(next.indexOf("  else\n"), next.indexOf("end if;"));
  assert.doesNotMatch(deleteBranch, /\bnew\./, "DELETE branch reads OLD only");
  assert.match(next, /exception when others then/, "still cannot fail a venue write");
});

test("a venue born published re-syncs; a draft waits for the existing UPDATE trigger", () => {
  assert.match(
    sql,
    /create trigger venues_resync_guide_itineraries_ins_trg\s+after insert on public\.venues\s+for each row\s+when \(new\.status = 'published'\)/,
  );
});

test("definer functions pin search_path and trigger functions stay uncallable", () => {
  const definers = sql.match(/security definer\s+set search_path = public/g) ?? [];
  assert.equal(definers.length, 4);
  for (const f of ["sync_guide_itinerary(uuid)", "venues_resync_guide_itineraries()", "user_profiles_resync_guide_itineraries()"]) {
    assert.ok(sql.includes(`revoke all on function public.${f} from public, anon, authenticated;`), f);
  }
});
