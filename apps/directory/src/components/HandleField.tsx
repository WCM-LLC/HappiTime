"use client";

import { useEffect, useRef, useState } from "react";
import { HANDLE_PATTERN, normalizeHandle, type HandleCheck } from "@/lib/handleCheck";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/storeLinks";

/**
 * A HappiTime @handle input that confirms the account exists before an event
 * form will accept it. Nothing here needs the mobile app to change: the lookup
 * runs through /api/handle-check, and a player without an account is sent to
 * the store (or straight into the app if it's installed) and can come back to
 * the same form, which keeps what they typed.
 *
 * Status is reported to the parent so the form can refuse to submit until the
 * handle resolves. `unavailable` means the check itself failed (outage, rate
 * limit); forms should let that through and verify at the door rather than
 * lose the registration.
 */
export type HandleStatus =
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "checking"; handle: string }
  | { kind: "found"; handle: string; displayName: string | null }
  | { kind: "missing"; handle: string }
  | { kind: "unavailable"; handle: string };

type Props = {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onStatus: (status: HandleStatus) => void;
  /** Validation error from the parent form, shown under the field. */
  error?: string;
  placeholder?: string;
  /** Who the handle belongs to, for the create-account copy ("your partner"). */
  owner?: "you" | "partner";
  autoComplete?: string;
};

const DEBOUNCE_MS = 450;
const APP_DEEP_LINK = "happitime://";

export function HandleField({
  name,
  label,
  value,
  onChange,
  onStatus,
  error,
  placeholder = "@yourhandle",
  owner = "you",
  autoComplete = "off",
}: Props) {
  const [status, setStatus] = useState<HandleStatus>({ kind: "empty" });
  const [attempt, setAttempt] = useState(0);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const handle = normalizeHandle(value);

  useEffect(() => {
    let next: HandleStatus;
    if (!handle) next = { kind: "empty" };
    else if (!HANDLE_PATTERN.test(handle)) next = { kind: "invalid" };
    else next = { kind: "checking", handle };
    setStatus(next);
    onStatusRef.current(next);
    if (next.kind !== "checking") return;

    const ctrl = new AbortController();
    const id = window.setTimeout(async () => {
      let result: HandleStatus;
      try {
        const r = await fetch(`/api/handle-check?handle=${encodeURIComponent(handle)}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        const j = (await r.json()) as HandleCheck;
        if (j.ok && j.found) result = { kind: "found", handle: j.handle, displayName: j.display_name };
        else if (j.ok) result = { kind: "missing", handle: j.handle };
        else if (j.error === "invalid") result = { kind: "invalid" };
        else result = { kind: "unavailable", handle };
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        result = { kind: "unavailable", handle };
      }
      setStatus(result);
      onStatusRef.current(result);
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(id);
      ctrl.abort();
    };
  }, [handle, attempt]);

  const invalid = !!error || status.kind === "invalid";
  const who = owner === "you" ? "You" : "Your partner";

  return (
    <div className={`field handle${invalid ? " invalid" : ""}`}>
      <label htmlFor={name}>{label}</label>
      <div className="handle-wrap">
        <input
          id={name}
          name={name}
          type="text"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          placeholder={placeholder}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          autoComplete={autoComplete}
          inputMode="text"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={`${name}-status`}
        />
        <span className={`handle-state ${status.kind}`} aria-hidden="true">
          {status.kind === "checking" && "…"}
          {status.kind === "found" && "✓"}
          {status.kind === "missing" && "?"}
        </span>
      </div>

      <div id={`${name}-status`} className="handle-status" aria-live="polite">
        {error ? (
          <p className="err">{error}</p>
        ) : status.kind === "invalid" ? (
          <p className="err">Handles are lowercase letters, numbers and underscores only.</p>
        ) : status.kind === "found" ? (
          <p className="handle-ok">
            @{status.handle}
            {status.displayName && <> &middot; {status.displayName}</>}
          </p>
        ) : status.kind === "unavailable" ? (
          <p className="fine">
            Couldn&rsquo;t verify @{status.handle} right now. You can still register; we&rsquo;ll
            confirm it at check-in.
          </p>
        ) : status.kind === "missing" ? (
          <div className="handle-missing">
            <p>
              <strong>No HappiTime account is using @{status.handle}.</strong>{" "}
              {who} need{owner === "you" ? "" : "s"} one to play. It takes about two minutes:
              get the app, sign up, claim the handle, then come back here. Everything typed
              on this form stays put.
            </p>
            <div className="stores">
              <a href={APP_STORE_URL} target="_blank" rel="noopener">
                App Store
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noopener">
                Google Play
              </a>
            </div>
            <p className="fine">
              Already have the app but skipped the handle? Open it, go to{" "}
              <a href={APP_DEEP_LINK}>Profile</a> and claim one, then check again.
            </p>
            <button type="button" className="link-btn" onClick={() => setAttempt((n) => n + 1)}>
              Check @{status.handle} again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
