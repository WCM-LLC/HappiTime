// test/contributor-leaderboard-rpc.test.mjs
//
// The public read path. contributor_scores exposes per-user activity across
// venues and is revoked from anon and authenticated for the same reason
// toastmaker_scores was in 20260811173852. This function is its only reader,
// and it is the security boundary — so what it returns IS the public surface.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, "..", "supabase/migrations");
const FILE = "20260919120000_contributor_leaderboard_rpc.sql";
const sql = readFileSync(join(MIGRATIONS, FILE), "utf8");

test("the migration replays after the view it reads", () => {
  // A language-sql body is validated at create time, so this function cannot
  // be created before contributor_scores exists. The plan's original
  // 20260814 timestamp would have broken a clean replay.
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
  assert.ok(
    files.indexOf(FILE) > files.indexOf("20260910130000_contributor_scores.sql"),
    "must sort after 20260910130000_contributor_scores.sql",
  );
});

test("the function never returns user_id", () => {
  // A handle is public because the user chose one. A user id is a join key
  // into every other table. The boundary must not hand one out.
  const returns = sql.slice(sql.indexOf("returns table"), sql.indexOf("language sql"));
  assert.doesNotMatch(returns, /\buser_id\b/, "user_id must not be in the return signature");
  assert.match(returns, /handle\s+text/);
});

test("it is security definer and granted to anon", () => {
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public/);
  assert.match(sql, /grant execute on function public\.contributor_leaderboard\(int\) to anon/);
});

test("it does not re-grant the scoring view", () => {
  // The whole point: contributor_scores stays locked; only this door opens.
  assert.doesNotMatch(sql, /grant [^;]* on public\.contributor_scores/i);
});

test("only public profiles with a handle and a positive score are listed", () => {
  // The definer bypasses user_profiles RLS, which gates anon reads on
  // is_public. The function has to apply that gate itself.
  assert.match(sql, /p\.handle is not null/);
  assert.match(sql, /p\.is_public/);
  assert.match(sql, /t\.score > 0/);
});

test("ties share a rank", () => {
  // rank() would leave gaps and row_number() would break ties arbitrarily,
  // putting two identical contributors in a false order.
  assert.match(sql, /dense_rank\(\) over/);
});

test("the limit is clamped so anon cannot page the whole table", () => {
  assert.match(sql, /least\(greatest\(coalesce\(p_limit, 10\), 1\), 50\)/);
});

test("the Toastmaker badge uses the writer's own quarter expression", () => {
  // ratify in 20260610220000_toastmaker.sql writes `YYYY-Q#` computed in UTC.
  // A mismatch here would silently never match, and with an empty table
  // nobody would notice.
  assert.match(
    sql,
    /to_char\(\(now\(\) at time zone 'utc'\),'YYYY'\) \|\| '-Q' \|\| extract\(quarter from \(now\(\) at time zone 'utc'\)\)::int/,
  );
});
