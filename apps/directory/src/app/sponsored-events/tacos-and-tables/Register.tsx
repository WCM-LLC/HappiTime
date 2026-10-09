"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EVENT, REGISTRATION_ENDPOINT } from "./event";

type Entry = "team" | "solo";
type Errors = Partial<Record<string, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = (v: string) => v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const prettyPhone = (v: string) => {
  const d = digits(v);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v;
};

const payHandles = [
  EVENT.pay.cashapp && { label: "Cash App", value: EVENT.pay.cashapp },
  EVENT.pay.venmo && { label: "Venmo", value: EVENT.pay.venmo },
  EVENT.pay.zelle && { label: "Zelle", value: EVENT.pay.zelle },
].filter(Boolean) as { label: string; value: string }[];

export function Register() {
  const [entry, setEntry] = useState<Entry>("team");
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [done, setDone] = useState<null | { first: string; last: string; amount: number; recorded: boolean; entry: Entry; partner: string }>(null);
  // Decided on the client so server and first paint agree.
  const [closed, setClosed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClosed(Date.now() >= Date.parse(EVENT.registrationCloses));
  }, []);

  useEffect(() => {
    if (done && doneRef.current) {
      doneRef.current.focus({ preventScroll: true });
      doneRef.current.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [done]);

  const amount = entry === "team" ? EVENT.entryFee * 2 : EVENT.entryFee;

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
    if (!EMAIL.test(v("email"))) next.email = "Enter an email like name@example.com.";
    if (digits(v("phone")).length !== 10) next.phone = "Enter a 10-digit mobile number.";
    if (entry === "team") {
      if (!v("partnerFirst")) next.partnerFirst = "Add your partner's first name.";
      if (!v("partnerLast")) next.partnerLast = "Add your partner's last name.";
      if (v("partnerPhone") && digits(v("partnerPhone")).length !== 10)
        next.partnerPhone = "Enter a 10-digit number, or leave it blank.";
    }
    if (!fd.get("ageAck")) next.ageAck = `Confirm everyone playing is ${EVENT.ageMin} or older.`;
    if (!fd.get("rulesAck")) next.rulesAck = "Confirm you've read the rules.";
    setErrors(next);
    const firstBad = Object.keys(next)[0];
    if (firstBad) {
      (form.elements.namedItem(firstBad) as HTMLElement | null)?.focus();
      return;
    }

    const partner = entry === "team" ? `${v("partnerFirst")} ${v("partnerLast")}` : "";
    const data = {
      event: "Tacos & Tables with Good Company — Spades Tournament (2026-10-13)",
      entry_type: entry,
      team_name: entry === "team" ? v("teamName") : "",
      first: v("first"),
      last: v("last"),
      email: v("email"),
      phone: prettyPhone(v("phone")),
      partner_first: entry === "team" ? v("partnerFirst") : "",
      partner_last: entry === "team" ? v("partnerLast") : "",
      partner_phone: entry === "team" ? prettyPhone(v("partnerPhone")) : "",
      instagram: v("instagram"),
      players: entry === "team" ? 2 : 1,
      amount_due: amount,
      age_ack: true,
      rules_ack: true,
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
    setDone({ first: data.first, last: data.last, amount, recorded, entry, partner });
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
        onInput={() => clear(name)}
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
          Registration ended Monday, October 12. If a table opens up, walk-ups are taken at
          the door from {EVENT.doors}, cash or Cash App, first come first served.
        </p>
        {EVENT.contactPhone && (
          <p className="lede">
            Text <a href={`sms:${EVENT.contactPhone.replace(/\D/g, "")}`}>{EVENT.contactPhone}</a>{" "}
            to ask if there's room.
          </p>
        )}
      </div>
    );
  }

  if (done) {
    return (
      <div className="panel done" id="register" ref={doneRef} tabIndex={-1}>
        <h2>You&rsquo;re in, {done.first}</h2>
        <p className="lede">
          {done.entry === "team"
            ? `You and ${done.partner} are registered as a team.`
            : "You're registered as a solo player. We'll pair you with a partner at check-in."}
        </p>

        <div className="pay">
          <h3>Lock your spot: send ${done.amount}</h3>
          {payHandles.length ? (
            <>
              <ul>
                {payHandles.map((h) => (
                  <li key={h.label}>
                    <span>{h.label}</span>
                    <code>{h.value}</code>
                  </li>
                ))}
              </ul>
              <p>
                Put <strong>Spades {done.last}</strong> in the note so we can match it.
                Your spot is confirmed once the payment lands. Unpaid registrations are
                released after October 12. Non-members of {EVENT.venue} pay ${EVENT.nonMemberEntry}{" "}
                entry at the door.
              </p>
            </>
          ) : (
            <p>
              Watch your phone: payment instructions are on the way by text. Your spot
              is confirmed once the ${done.amount} lands. Unpaid registrations are released
              after October 12.
            </p>
          )}
        </div>

        <div className="ticket" aria-hidden="true">
          <div>
            <b>
              {done.first} {done.last}
            </b>
            <span>{done.entry === "team" ? `with ${done.partner}` : "solo, paired at check-in"}</span>
            <span>
              {EVENT.dateLabel}, doors {EVENT.doors}
            </span>
            <span>{EVENT.venue}, {EVENT.area}</span>
          </div>
          <div className="stub">
            <small>Oct</small>
            <strong>13</strong>
          </div>
        </div>

        <div className="getapp">
          <h3>Check in with the HappiTime app</h3>
          <p>
            Download it before Tuesday. At the door you&rsquo;ll get a code to check in
            with; it&rsquo;s how we seat the bracket.
          </p>
          <div className="stores">
            <a href={EVENT.appStore} target="_blank" rel="noopener">
              App Store
            </a>
            <a href={EVENT.googlePlay} target="_blank" rel="noopener">
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
        <p>Closes Monday, October 12</p>
      </div>

      <form ref={formRef} onSubmit={onSubmit} noValidate>
        <fieldset>
          <legend>How are you playing?</legend>
          <div className="seg">
            <label>
              <input
                type="radio"
                name="entry"
                value="team"
                checked={entry === "team"}
                onChange={() => setEntry("team")}
              />
              Team of two
              <small>${EVENT.entryFee * 2}, you bring your partner</small>
            </label>
            <label>
              <input
                type="radio"
                name="entry"
                value="solo"
                checked={entry === "solo"}
                onChange={() => setEntry("solo")}
              />
              Solo
              <small>${EVENT.entryFee}, we pair you at check-in</small>
            </label>
          </div>
        </fieldset>

        <div className="row">
          {field("first", "First name", { autoComplete: "given-name", required: true })}
          {field("last", "Last name", { autoComplete: "family-name", required: true })}
        </div>
        <div className="row">
          {field("email", "Email", { type: "email", autoComplete: "email", inputMode: "email", required: true })}
          {field("phone", "Mobile", {
            type: "tel",
            autoComplete: "tel",
            inputMode: "tel",
            placeholder: "(816) 555-0123",
            required: true,
            onBlur: (e) => (e.currentTarget.value = prettyPhone(e.currentTarget.value)),
          })}
        </div>

        {entry === "team" && (
          <div className="partner">
            <div className="row">
              {field("partnerFirst", "Partner's first name", { autoComplete: "off", required: true })}
              {field("partnerLast", "Partner's last name", { autoComplete: "off", required: true })}
            </div>
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

        {field("instagram", "Instagram", { placeholder: "@yourhandle", autoCapitalize: "off", spellCheck: false }, true)}

        <div className={`check${errors.ageAck ? " invalid" : ""}`}>
          <label>
            <input type="checkbox" name="ageAck" onChange={() => clear("ageAck")} />
            <span>
              Everyone playing is {EVENT.ageMin} or older. {EVENT.venue} checks ID at the door.
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
            <small>Plus ${EVENT.nonMemberEntry} per non-member at the door</small>
          </span>
          <strong>${amount}</strong>
        </div>

        <div className="err" aria-live="polite">{sendError}</div>
        <button className="submit" type="submit" disabled={sending}>
          {sending ? "Sending…" : "Register"}
        </button>
        <p className="fine">
          Your details go to HappiTime and the night&rsquo;s hosts to run the bracket and
          match your payment. Spots are confirmed when the entry fee lands; unpaid
          registrations are released after October 12.
        </p>
      </form>
    </div>
  );
}
