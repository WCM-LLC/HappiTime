"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { trackOutcome } from "@/lib/heycatch";
import { HandleField, type HandleStatus } from "@/components/HandleField";
import { normalizeHandle } from "@/lib/handleCheck";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/storeLinks";
import { EVENT, REGISTRATION_ENDPOINT } from "./event";

type Entry = "team" | "solo" | "spectator";
type Errors = Partial<Record<string, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = (v: string) => v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const prettyPhone = (v: string) => {
  const d = digits(v);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v;
};

/**
 * The form keeps a draft in this browser so a player who leaves to install the
 * app and claim a handle comes back to everything they typed. Cleared on
 * successful submit.
 */
const DRAFT_KEY = `happitime:event-draft:${EVENT.slug}`;
const DRAFT_FIELDS = ["first", "last", "phone", "email", "partnerFirst", "partnerLast", "partnerPhone", "teamName"] as const;

type Draft = {
  entry: Entry;
  member: boolean;
  handle: string;
  partnerHandle: string;
  fields: Partial<Record<(typeof DRAFT_FIELDS)[number], string>>;
};

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* private mode, quota — the draft is a convenience */
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function amountFor(entry: Entry, member: boolean): number {
  if (entry === "spectator") return member ? EVENT.spectator.member : EVENT.spectator.nonMember;
  const per = member ? EVENT.fee.member : EVENT.fee.nonMember;
  return entry === "team" ? per * 2 : per;
}

/** A handle the form will accept: confirmed, or the check itself was down. */
const accepted = (s: HandleStatus | undefined) => s?.kind === "found" || s?.kind === "unavailable";

export function Register() {
  const [entry, setEntry] = useState<Entry>("team");
  const [member, setMember] = useState(false);
  const [handle, setHandle] = useState("");
  const [partnerHandle, setPartnerHandle] = useState("");
  const [handleStatus, setHandleStatus] = useState<HandleStatus>();
  const [partnerStatus, setPartnerStatus] = useState<HandleStatus>();
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [done, setDone] = useState<null | {
    first: string;
    last: string;
    amount: number;
    recorded: boolean;
    entry: Entry;
    member: boolean;
    partner: string;
    handle: string;
  }>(null);
  // Decided on the client so server and first paint agree.
  const [closed, setClosed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClosed(Date.now() >= Date.parse(EVENT.registrationCloses));
    const d = readDraft();
    if (d) {
      setEntry(d.entry);
      setMember(d.member);
      setHandle(d.handle ?? "");
      setPartnerHandle(d.partnerHandle ?? "");
    }
    setHydrated(true);
  }, []);

  // Restore plain inputs once the form exists (after hydration + entry type set).
  useEffect(() => {
    if (!hydrated || !formRef.current) return;
    const d = readDraft();
    if (!d) return;
    for (const k of DRAFT_FIELDS) {
      const el = formRef.current.elements.namedItem(k) as HTMLInputElement | null;
      if (el && d.fields[k] != null && !el.value) el.value = d.fields[k] ?? "";
    }
  }, [hydrated, entry]);

  function saveDraft() {
    const form = formRef.current;
    const fields: Draft["fields"] = {};
    if (form) {
      for (const k of DRAFT_FIELDS) {
        const el = form.elements.namedItem(k) as HTMLInputElement | null;
        if (el) fields[k] = el.value;
      }
    }
    writeDraft({ entry, member, handle, partnerHandle, fields });
  }

  useEffect(() => {
    if (hydrated) saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, member, handle, partnerHandle]);

  useEffect(() => {
    if (done && doneRef.current) {
      doneRef.current.focus({ preventScroll: true });
      doneRef.current.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [done]);

  const amount = amountFor(entry, member);

  function clear(name: string) {
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const v = (k: string) => String(fd.get(k) ?? "").trim();

    const next: Errors = {};
    if (!v("first")) next.first = "Add your first name.";
    if (!v("last")) next.last = "Add your last name.";
    if (digits(v("phone")).length !== 10) next.phone = "Enter a 10-digit mobile number.";
    if (v("email") && !EMAIL.test(v("email"))) next.email = "Enter an email like name@example.com.";

    // The app gate: every player's handle has to resolve to a real account.
    if (!normalizeHandle(handle)) next.handle = "Add your HappiTime handle. You need the app and an account to play.";
    else if (handleStatus?.kind === "checking") next.handle = "Hang on, still checking that handle.";
    else if (!accepted(handleStatus)) next.handle = "That handle doesn't match a HappiTime account yet. Create one, then check again.";

    if (entry === "team") {
      if (!v("partnerFirst")) next.partnerFirst = "Add your partner's first name.";
      if (!v("partnerLast")) next.partnerLast = "Add your partner's last name.";
      if (v("partnerPhone") && digits(v("partnerPhone")).length !== 10)
        next.partnerPhone = "Enter a 10-digit number, or leave it blank.";
      if (!normalizeHandle(partnerHandle)) next.partnerHandle = "Add your partner's HappiTime handle. Both of you need the app to play.";
      else if (partnerStatus?.kind === "checking") next.partnerHandle = "Hang on, still checking that handle.";
      else if (!accepted(partnerStatus)) next.partnerHandle = "That handle doesn't match a HappiTime account yet.";
      else if (normalizeHandle(partnerHandle) === normalizeHandle(handle)) next.partnerHandle = "Your partner needs their own account.";
    }
    if (!fd.get("ageAck")) next.ageAck = `Confirm everyone attending is ${EVENT.ageMin} or older.`;
    if (!fd.get("rulesAck")) next.rulesAck = "Confirm you've read the rules.";
    if (entry !== "spectator" && !fd.get("noShowAck")) next.noShowAck = "Confirm you understand the no-show policy.";
    setErrors(next);
    const firstBad = Object.keys(next)[0];
    if (firstBad) {
      (form.elements.namedItem(firstBad) as HTMLElement | null)?.focus();
      return;
    }

    const partner = entry === "team" ? `${v("partnerFirst")} ${v("partnerLast")}` : "";
    const data = {
      event: `Spades Night at The Blakk Co. — The Inaugural (${EVENT.dateLong})`,
      entry_type: entry,
      blakk_member: member,
      team_name: entry === "team" ? v("teamName") : "",
      first: v("first"),
      last: v("last"),
      email: v("email"),
      phone: prettyPhone(v("phone")),
      handle: normalizeHandle(handle),
      handle_verified: handleStatus?.kind === "found",
      partner_first: entry === "team" ? v("partnerFirst") : "",
      partner_last: entry === "team" ? v("partnerLast") : "",
      partner_phone: entry === "team" ? prettyPhone(v("partnerPhone")) : "",
      partner_handle: entry === "team" ? normalizeHandle(partnerHandle) : "",
      partner_handle_verified: entry === "team" ? partnerStatus?.kind === "found" : "",
      players: entry === "team" ? 2 : entry === "solo" ? 1 : 0,
      amount_due: amount,
      age_ack: true,
      rules_ack: true,
      noshow_ack: entry !== "spectator",
      happitime_optin: !!fd.get("optin"),
      submitted_at: new Date().toISOString(),
    };

    let recorded = false;
    setSendError("");
    if (REGISTRATION_ENDPOINT) {
      setSending(true);
      try {
        const r = await fetch(REGISTRATION_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(data),
        });
        const j = await r.json().catch(() => ({ ok: r.ok }));
        if (!r.ok || j.ok === false) throw new Error("send failed");
        recorded = true;
      } catch {
        setSendError(
          "Your registration didn't go through. Check your connection and try again" +
            (EVENT.contactPhone ? `, or text ${EVENT.contactPhone}.` : "."),
        );
        setSending(false);
        return;
      }
      setSending(false);
    }
    if (recorded) {
      trackOutcome("event_registration_completed", {
        event: EVENT.slug,
        entry_type: entry,
        players: data.players,
        amount_due: amount,
        blakk_member: member,
      });
      clearDraft();
    }
    setDone({ first: data.first, last: data.last, amount, recorded, entry, member, partner, handle: data.handle });
  }

  const field = (
    name: string,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
    optional = false,
  ) => (
    <div className={`field${errors[name] ? " invalid" : ""}`}>
      <label htmlFor={name}>
        {label}
        {optional && <span className="opt">optional</span>}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        onInput={() => {
          clear(name);
          saveDraft();
        }}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `${name}-err` : undefined}
        {...props}
      />
      <div className="err" id={`${name}-err`} aria-live="polite">
        {errors[name]}
      </div>
    </div>
  );

  if (closed) {
    return (
      <div className="panel" id="register">
        <h2>Registration is closed</h2>
        <p className="lede">
          Registration ended {EVENT.closesLabel}. If a table opens up, walk-ups are taken at
          the door from {EVENT.doors}, first come first served. You&rsquo;ll still need the
          HappiTime app to check in.
        </p>
        {EVENT.contactPhone && (
          <p className="lede">
            Text <a href={`sms:${EVENT.contactPhone.replace(/\D/g, "")}`}>{EVENT.contactPhone}</a>{" "}
            to ask if there&apos;s room.
          </p>
        )}
      </div>
    );
  }

  if (done) {
    const playing = done.entry !== "spectator";
    return (
      <div className="panel done" id="register" ref={doneRef} tabIndex={-1}>
        <h2>
          {playing ? "You're in" : "See you there"}, {done.first}
        </h2>
        <p className="lede">
          {done.entry === "team"
            ? `You and ${done.partner} are registered as a team.`
            : done.entry === "solo"
              ? "You're registered as a solo player. We'll pair you with a partner at check-in."
              : done.member
                ? "You're on the list as a Blakk Co. member spectator. No charge."
                : "You're on the spectator list. Spectator spots open once the bracket fills; we'll text you a payment link when they do."}
        </p>

        {done.amount > 0 && done.entry !== "spectator" && (
          <div className="pay">
            <h3>Lock your spot: pay ${done.amount} to The Blakk Co.</h3>
            {EVENT.pay.url ? (
              <>
                <a className="paylink" href={EVENT.pay.url} target="_blank" rel="noopener">
                  {EVENT.pay.label} &rarr;
                </a>
                <p>
                  Use the same name and email you registered with so we can match it. Your spot
                  is confirmed once the payment lands and we&rsquo;ll let you know by email or
                  text. Unpaid registrations are released after {EVENT.closesShort}.
                </p>
              </>
            ) : (
              <p>
                Watch your phone: The Blakk Co. handles payment and the link is on its way by
                text. Your spot is confirmed once the ${done.amount} lands. Unpaid registrations
                are released after {EVENT.closesShort}.
              </p>
            )}
          </div>
        )}

        <div className="ticket" aria-hidden="true">
          <div>
            <b>
              {done.first} {done.last}
            </b>
            <span>@{done.handle}</span>
            <span>
              {done.entry === "team"
                ? `with ${done.partner}`
                : done.entry === "solo"
                  ? "solo, paired at check-in"
                  : "spectator"}
            </span>
            <span>
              {EVENT.dateLabel}, doors {EVENT.doors}
            </span>
            <span>
              {EVENT.venue}, {EVENT.area}
            </span>
          </div>
          <div className="stub">
            <small>{EVENT.monthShort}</small>
            <strong>{EVENT.dayNumber}</strong>
          </div>
        </div>

        <div className="getapp">
          <h3>Check in with the HappiTime app</h3>
          <p>
            Signed in as <strong>@{done.handle}</strong>. At the door, scan the Blakk Co. QR in
            the app to check in; that&rsquo;s how we seat the bracket
            {playing ? " and how winnings are paid" : ""}.
          </p>
          <div className="stores">
            <a href={APP_STORE_URL} target="_blank" rel="noopener">
              App Store
            </a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noopener">
              Google Play
            </a>
          </div>
        </div>

        {!done.recorded && (
          <p className="preview-note">
            Preview only: this registration was not recorded. The form starts saving once it
            is connected.
          </p>
        )}
        <button type="button" className="link-btn" onClick={() => setDone(null)}>
          Edit my registration
        </button>
      </div>
    );
  }

  return (
    <div className="panel" id="register">
      <div className="panel-head">
        <h2>Register</h2>
        <p>Closes {EVENT.closesLabel}</p>
      </div>

      <form ref={formRef} onSubmit={onSubmit} noValidate>
        <fieldset>
          <legend>How are you coming?</legend>
          <div className="seg seg-3">
            <label>
              <input type="radio" name="entry" value="team" checked={entry === "team"} onChange={() => setEntry("team")} />
              Team of two
              <small>You bring your partner</small>
            </label>
            <label>
              <input type="radio" name="entry" value="solo" checked={entry === "solo"} onChange={() => setEntry("solo")} />
              Solo
              <small>We pair you at check-in</small>
            </label>
            <label>
              <input
                type="radio"
                name="entry"
                value="spectator"
                checked={entry === "spectator"}
                onChange={() => setEntry("spectator")}
              />
              Spectator
              <small>Watch, drink, talk trash</small>
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Are you a member of The Blakk Co.?</legend>
          <div className="seg">
            <label>
              <input type="radio" name="member" value="yes" checked={member} onChange={() => setMember(true)} />
              Yes, I&rsquo;m a member
              <small>
                ${EVENT.fee.member} a player{entry === "spectator" ? ", free to watch" : ""}
              </small>
            </label>
            <label>
              <input type="radio" name="member" value="no" checked={!member} onChange={() => setMember(false)} />
              Not a member
              <small>
                ${EVENT.fee.nonMember} a player
                {entry === "spectator" ? `, $${EVENT.spectator.nonMember} to watch once the bracket fills` : ""}
              </small>
            </label>
          </div>
          {member && (
            <p className="fine">Membership is verified by The Blakk Co. when you pay. City Pass is available at the door.</p>
          )}
        </fieldset>

        <div className="row">
          {field("first", "First name", { autoComplete: "given-name", required: true })}
          {field("last", "Last name", { autoComplete: "family-name", required: true })}
        </div>
        <div className="row">
          {field("phone", "Mobile", {
            type: "tel",
            autoComplete: "tel",
            inputMode: "tel",
            placeholder: "(816) 555-0123",
            required: true,
            onBlur: (e) => (e.currentTarget.value = prettyPhone(e.currentTarget.value)),
          })}
          {field("email", "Email", { type: "email", autoComplete: "email", inputMode: "email" }, true)}
        </div>

        <HandleField
          name="handle"
          label="Your HappiTime handle"
          value={handle}
          onChange={(v) => {
            setHandle(v);
            clear("handle");
          }}
          onStatus={setHandleStatus}
          error={errors.handle}
          owner="you"
        />

        {entry === "team" && (
          <div className="partner">
            <div className="row">
              {field("partnerFirst", "Partner's first name", { autoComplete: "off", required: true })}
              {field("partnerLast", "Partner's last name", { autoComplete: "off", required: true })}
            </div>
            <HandleField
              name="partnerHandle"
              label="Partner's HappiTime handle"
              value={partnerHandle}
              onChange={(v) => {
                setPartnerHandle(v);
                clear("partnerHandle");
              }}
              onStatus={setPartnerStatus}
              error={errors.partnerHandle}
              owner="partner"
              placeholder="@theirhandle"
            />
            <div className="row">
              {field("teamName", "Team name", { autoComplete: "off", placeholder: "Shown on the bracket" }, true)}
              {field(
                "partnerPhone",
                "Partner's mobile",
                {
                  type: "tel",
                  inputMode: "tel",
                  autoComplete: "off",
                  onBlur: (e) => (e.currentTarget.value = prettyPhone(e.currentTarget.value)),
                },
                true,
              )}
            </div>
          </div>
        )}

        <div className={`check${errors.ageAck ? " invalid" : ""}`}>
          <label>
            <input type="checkbox" name="ageAck" onChange={() => clear("ageAck")} />
            <span>
              Everyone attending is {EVENT.ageMin} or older. {EVENT.venue} checks ID at the door.
            </span>
          </label>
          <div className="err" aria-live="polite">{errors.ageAck}</div>
        </div>
        <div className={`check${errors.rulesAck ? " invalid" : ""}`}>
          <label>
            <input type="checkbox" name="rulesAck" onChange={() => clear("rulesAck")} />
            <span>
              I&rsquo;ve read the <a href="#rules-title">tournament rules</a> and I&rsquo;m good
              with them.
            </span>
          </label>
          <div className="err" aria-live="polite">{errors.rulesAck}</div>
        </div>
        {entry !== "spectator" && (
          <div className={`check${errors.noShowAck ? " invalid" : ""}`}>
            <label>
              <input type="checkbox" name="noShowAck" onChange={() => clear("noShowAck")} />
              <span>
                I understand first deal is {EVENT.firstDeal} sharp, a team not checked in by then
                forfeits its spot, and entry fees are not refunded for no-shows.
              </span>
            </label>
            <div className="err" aria-live="polite">{errors.noShowAck}</div>
          </div>
        )}
        <div className="check">
          <label>
            <input type="checkbox" name="optin" />
            <span>
              Send me HappiTime&rsquo;s weekly picks for Kansas City happy hours. Unsubscribe
              anytime.
            </span>
          </label>
        </div>

        <div className="total">
          <span>
            Due after you register
            <small>
              {entry === "spectator" && !member
                ? "Charged once the bracket fills"
                : `Paid to The Blakk Co. · ${member ? "member" : "non-member"} rate`}
            </small>
          </span>
          <strong>${amount}</strong>
        </div>

        <div className="err" aria-live="polite">{sendError}</div>
        <button className="submit" type="submit" disabled={sending}>
          {sending ? "Sending…" : entry === "spectator" ? "Save my spot" : "Register"}
        </button>
        <p className="fine">
          Your details go to HappiTime and The Blakk Co. to run the bracket and match your
          payment. Spots are confirmed when the entry fee lands; unpaid registrations are
          released after {EVENT.closesShort}.
        </p>
      </form>
    </div>
  );
}
