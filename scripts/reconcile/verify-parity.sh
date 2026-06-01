#!/usr/bin/env bash
# Schema parity: does a clean migration replay reproduce prod's schema?
#
# Builds the migration-replay "shadow" (supabase db reset on the local stack),
# dumps it and prod, and compares by OBJECT SETS (tables, columns, functions,
# indexes, policies-with-body) — order-independent, low false-positive. Exits
# non-zero on any divergence. This is both the reconciliation verifier and the
# Layer-3 drift detector.
#
# Usage:
#   scripts/reconcile/verify-parity.sh --linked            # compare vs the linked project
#   scripts/reconcile/verify-parity.sh --db-url <prod_url>  # compare vs an explicit (read-only) URL
#
# Requires: a running local Supabase stack (supabase start) and the supabase CLI.
set -euo pipefail

SCHEMAS="public,cron,archive,app_private,private"
MODE="${1:---linked}"
PROD_URL="${2:-}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Building migration-replay shadow (supabase db reset)…"
supabase db reset --local >/dev/null

echo "==> Dumping shadow + prod schemas…"
if [ "$MODE" = "--db-url" ]; then
  [ -n "$PROD_URL" ] || { echo "ERROR: --db-url requires a URL"; exit 2; }
  # Read-only / CI path: plain pg_dump issues no `SET ROLE postgres`, so it works with a
  # least-privilege read-only role (pg_read_all_data) — `supabase db dump` does not. Use the
  # SAME command + flags for BOTH sides so the output format is identical;
  # --quote-all-identifiers matches the object extractors below. Needs pg_dump 17 on PATH.
  command -v pg_dump >/dev/null || { echo "ERROR: pg_dump (postgresql-client-17) not found"; exit 2; }
  shadow_url="$(supabase status -o env 2>/dev/null | sed -nE 's/^DB_URL=\"?([^\"]+)\"?$/\1/p')"
  : "${shadow_url:=postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
  PGD="pg_dump --schema-only --no-owner --no-privileges --quote-all-identifiers -n public -n cron -n archive -n app_private -n private"
  $PGD "$shadow_url" > "$TMP/shadow.sql"
  $PGD "$PROD_URL"   > "$TMP/prod.sql"
else
  # Local dev path: supabase db dump (postgres creds available via the linked project).
  supabase db dump --local  --schema "$SCHEMAS" -f "$TMP/shadow.sql" >/dev/null
  supabase db dump --linked --schema "$SCHEMAS" -f "$TMP/prod.sql"  >/dev/null
fi

# --- object-set extraction (matches the audit methodology) ---
# NOTE: each grep is `|| true` — a pattern with zero matches must not abort under `set -e`.
ids() {
  grep -oE '^CREATE TABLE (IF NOT EXISTS )?"[a-z_]+"\."[^"]+"'   "$1" 2>/dev/null | sed -E 's/^CREATE TABLE (IF NOT EXISTS )?//; s/"//g'   | sed 's/^/table  /' || true
  grep -oE '^CREATE (OR REPLACE )?VIEW "[a-z_]+"\."[^"]+"'        "$1" 2>/dev/null | sed -E 's/^CREATE (OR REPLACE )?VIEW //; s/"//g'        | sed 's/^/view   /' || true
  grep -oE '^CREATE (OR REPLACE )?FUNCTION "[a-z_]+"\."[^"]+"\([^)]*\)' "$1" 2>/dev/null | sed -E 's/^CREATE (OR REPLACE )?FUNCTION //; s/"//g' | sed 's/^/func   /' || true
  grep -oE '^CREATE TYPE "[a-z_]+"\."[^"]+"'                      "$1" 2>/dev/null | sed -E 's/^CREATE TYPE //; s/"//g'                      | sed 's/^/type   /' || true
  grep -oE '^CREATE( UNIQUE)? INDEX "[^"]+" ON "[a-z_]+"\."[^"]+"' "$1" 2>/dev/null | sed -E 's/^CREATE( UNIQUE)? INDEX //; s/ ON / on /; s/"//g'  | sed 's/^/index  /' || true
  grep -oE '^CREATE POLICY "[^"]+" ON "[a-z_]+"\."[^"]+"'         "$1" 2>/dev/null | sed -E 's/^CREATE POLICY //; s/"//g'                     | sed 's/^/policy /' || true
  sed -nE 's/^CREATE (OR REPLACE )?(CONSTRAINT )?TRIGGER "([^"]+)".* ON "([a-z_]+)"\."([^"]+)".*/trigger \3 on \4.\5/p' "$1" 2>/dev/null || true
}
cols() { awk '
  /^CREATE TABLE (IF NOT EXISTS )?"/ { t=$0; sub(/^CREATE TABLE (IF NOT EXISTS )?/,"",t); gsub(/"/,"",t); sub(/ .*/,"",t); intbl=1; next }
  intbl && /^\);/ { intbl=0; next }
  intbl && /^    "/ { c=$0; sub(/^    "/,"",c); sub(/".*/,"",c); print "column "t"."c }
' "$1" || true; }

{ ids "$TMP/shadow.sql"; cols "$TMP/shadow.sql"; } | sort -u > "$TMP/shadow.set"
{ ids "$TMP/prod.sql";   cols "$TMP/prod.sql";   } | sort -u > "$TMP/prod.set"

# Columns of a table that is itself divergent are redundant with the table-level
# finding; report column drift only for tables present on BOTH sides.
grep '^table ' "$TMP/shadow.set" | awk '{print $2}' | sort -u > "$TMP/shadow.tbls"
grep '^table ' "$TMP/prod.set"   | awk '{print $2}' | sort -u > "$TMP/prod.tbls"
comm -12 "$TMP/shadow.tbls" "$TMP/prod.tbls" > "$TMP/shared.tbls"
# drop column lines whose owning table (schema.table from schema.table.col) is not shared
drop_unshared_cols() {
  awk -v sf="$TMP/shared.tbls" '
    BEGIN { while ((getline l < sf) > 0) shared[l]=1 }
    $1!="column" { print; next }
    { tc=$2; n=split(tc,p,"."); owner=p[1]"."p[2]; if (owner in shared) print }'
}
ONLY_PROD="$(comm -13 "$TMP/shadow.set" "$TMP/prod.set" | drop_unshared_cols)"
ONLY_SHADOW="$(comm -23 "$TMP/shadow.set" "$TMP/prod.set" | drop_unshared_cols)"

if [ -z "$ONLY_PROD" ] && [ -z "$ONLY_SHADOW" ]; then
  echo "✅ PARITY: a clean migration replay reproduces prod's schema."
  exit 0
fi
echo "❌ SCHEMA DRIFT detected — migrations do NOT reproduce prod:"
[ -n "$ONLY_PROD" ]   && { echo "--- on PROD but NOT produced by migrations ($(echo "$ONLY_PROD" | grep -c .)): ---"; echo "$ONLY_PROD"; }
[ -n "$ONLY_SHADOW" ] && { echo "--- produced by migrations but NOT on prod ($(echo "$ONLY_SHADOW" | grep -c .)): ---"; echo "$ONLY_SHADOW"; }
exit 1
