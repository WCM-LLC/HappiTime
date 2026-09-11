// test/form-pending-feedback.test.mjs
//
// A SubmitButton that cannot show its spinner is worse than a plain button:
// it looks correct in review and does nothing at runtime.
//
// `useFormStatus` reports the status of the button's ANCESTOR <form>. Parts of
// this console use detached forms — `<form id={menuFormId} action={...} />`
// with no children — and scatter controls across the DOM pointing at them with
// the `form` attribute. That is legal HTML and avoids illegal nested forms,
// but a SubmitButton rendered that way has no ancestor form, so `pending` is
// permanently false.
//
// Measured 2026-08-13 before the fix: 12 of 48 SubmitButtons were inert, 7 on
// the org dashboard and 5 in the venue menu manager — precisely the two
// surfaces where saving appeared to do nothing.
//
// A button is considered wired if EITHER it sits inside a <form>, OR it names
// one with a `form` prop (which SubmitButton resolves through the pending
// context).

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const webSrc = join(repoRoot, "apps/web/src");

function tsxFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (entry.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

/** Read a JSX opening tag starting at `start`, respecting {…} nesting. */
function readTag(src, start) {
  let brace = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") brace++;
    else if (c === "}") brace--;
    else if (c === ">" && brace === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/**
 * Components that render a real <form> around their children. A SubmitButton
 * inside one of these HAS an ancestor form at runtime even though no literal
 * <form> tag appears at the call site. Verified by its own test below, so this
 * list cannot quietly rot into a false negative.
 */
const FORM_WRAPPERS = ["ConfirmDeleteForm"];

/**
 * Every SubmitButton in the tree, with the <form> nesting depth at its
 * position and whether its tag carries a `form` prop.
 */
function submitButtons(src) {
  const found = [];
  let depth = 0;
  let line = 1;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") line++;
    if (src[i] !== "<") continue;
    const rest = src.slice(i, i + 24);
    const wrapperOpen = FORM_WRAPPERS.find((w) => new RegExp(`^<${w}[\\s>]`).test(rest));
    const wrapperClose = FORM_WRAPPERS.find((w) => rest.startsWith(`</${w}>`));
    if (rest.startsWith("</form>") || wrapperClose) depth--;
    else if (/^<form[\s>]/.test(rest) || wrapperOpen) {
      const tag = readTag(src, i);
      // A self-closing <form … /> opens and closes in one tag.
      if (!/\/>\s*$/.test(tag)) depth++;
    } else if (rest.startsWith("<SubmitButton")) {
      const tag = readTag(src, i);
      // Capture the referenced form id, e.g. form={menuFormId}
      const m = tag.match(/\bform=\{([^}]+)\}/);
      found.push({ line, depth, formProp: m ? m[1] : null });
    }
  }
  return found;
}

test("no SubmitButton is inert — each can observe its form's pending state", () => {
  // Being inside a form is enough (useFormStatus sees it). Naming a form with
  // `form={id}` is enough ONLY IF that form publishes its state — i.e. a
  // FormPendingReporter is rendered inside it. A `form` prop alone proved
  // nothing: all 12 inert buttons found on 2026-08-13 had one.
  const offenders = [];
  for (const file of tsxFiles(webSrc)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("<SubmitButton")) continue;

    // Form ids that publish pending state, e.g. <FormPendingReporter id={menuFormId} />
    const published = new Set(
      [...src.matchAll(/<FormPendingReporter[^>]*\bid=\{([^}]+)\}/g)].map((m) => m[1].trim()),
    );

    for (const b of submitButtons(src)) {
      if (b.depth > 0) continue; // inside a form — useFormStatus works
      const named = b.formProp?.trim();
      if (named && published.has(named)) continue; // detached but published
      offenders.push(
        `${relative(repoRoot, file)}:${b.line}` +
          (named ? ` (form={${named}} has no FormPendingReporter)` : " (no form at all)"),
      );
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these SubmitButtons can never show their spinner:\n  ${offenders.join("\n  ")}`,
  );
});

test("every allowlisted form wrapper really does render a form around its children", () => {
  // The allowlist above suppresses inert-button warnings. If one of these ever
  // stopped rendering a <form>, the suppression would hide a real defect —
  // so the claim is checked rather than trusted.
  for (const name of FORM_WRAPPERS) {
    const matches = tsxFiles(webSrc).filter((f) => f.endsWith(`${name}.tsx`));
    assert.equal(matches.length, 1, `expected exactly one ${name}.tsx`);
    const src = readFileSync(matches[0], "utf8");
    assert.match(src, /<form\b/, `${name} must render a <form>`);
    assert.match(src, /\{children\}/, `${name} must render children inside that form`);
  }
});

test("SubmitButton resolves pending through context when given a form prop", () => {
  // Without this branch, a `form`-attributed button falls back to
  // useFormStatus, which reports the wrong form (or none) — the exact defect
  // this suite exists to prevent.
  const src = readFileSync(join(webSrc, "components/ui/SubmitButton.tsx"), "utf8");
  assert.match(src, /useFormPending|FormPendingContext/, "must consult the pending context");
  assert.match(src, /\bform\b/, "must branch on the form prop");
  assert.match(src, /useFormStatus/, "ancestor-form buttons keep working as before");
});

test("every detached form publishes its pending state", () => {
  // A detached form is one with an id whose controls live elsewhere. Each must
  // render a reporter INSIDE itself, because that is the only place
  // useFormStatus can observe it.
  for (const rel of [
    "components/venue/VenueMenusManager.tsx",
    "app/orgs/[orgId]/page.tsx",
  ]) {
    const src = readFileSync(join(webSrc, rel), "utf8");
    const detached = (src.match(/<form\s+id=\{/g) ?? []).length;
    const reporters = (src.match(/<FormPendingReporter/g) ?? []).length;
    assert.ok(
      reporters >= detached,
      `${rel}: ${detached} detached form(s) but ${reporters} reporter(s) — ` +
        `every id'd form needs one or its buttons stay inert`,
    );
  }
});

test("submit-capable buttons in the touched surfaces are SubmitButtons", () => {
  // A plain <button formAction=…> gives no feedback at all. These four files
  // are the ones this change covers; the guard keeps a tenth bare button from
  // appearing later.
  const offenders = [];
  for (const rel of [
    "app/login/page.tsx",
    "components/venue/AccessManager.tsx",
    "components/venue/VenueMenusManager.tsx",
    "app/orgs/[orgId]/venues/[venueId]/page.tsx",
  ]) {
    const src = readFileSync(join(webSrc, rel), "utf8");
    let i = src.indexOf("<button");
    while (i !== -1) {
      const tag = readTag(src, i);
      const submits = /\bformAction=/.test(tag) || /type="submit"/.test(tag);
      if (submits) {
        const line = src.slice(0, i).split("\n").length;
        offenders.push(`${rel}:${line}`);
      }
      i = src.indexOf("<button", i + 1);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `plain buttons that submit without showing pending state:\n  ${offenders.join("\n  ")}`,
  );
});
