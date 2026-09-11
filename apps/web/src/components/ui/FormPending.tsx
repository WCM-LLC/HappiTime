'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useFormStatus } from 'react-dom';

/**
 * Pending state for DETACHED forms.
 *
 * `useFormStatus` reports the status of a component's ANCESTOR <form>. Parts of
 * this console deliberately render an empty form with an id —
 * `<form id={menuFormId} action={saveMenu} />` — and scatter its inputs and
 * buttons across the surrounding markup with the `form` attribute, because the
 * controls sit inside table rows and cards where a wrapping <form> would
 * either break the layout or nest illegally.
 *
 * A button attached that way has no ancestor form, so `useFormStatus` reports
 * `pending: false` forever and its spinner never renders. On 2026-08-13 that
 * was true of 12 of the 48 SubmitButtons in the console — 7 on the org
 * dashboard and 5 in the venue menu manager, which is why saving a menu
 * appeared to do nothing at all.
 *
 * The fix routes pending state through context: a reporter rendered INSIDE
 * each detached form (where useFormStatus does work) publishes that form's
 * status by id, and buttons elsewhere read it back.
 */

type FormPendingValue = {
  pendingIds: ReadonlySet<string>;
  report: (formId: string, pending: boolean) => void;
};

const FormPendingContext = createContext<FormPendingValue | null>(null);

export function FormPendingProvider({ children }: { children: React.ReactNode }) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());

  // Stable across renders so the reporter's effect does not re-fire on every
  // state change — otherwise publishing one form's status would re-run every
  // other reporter's effect.
  const report = useCallback((formId: string, pending: boolean) => {
    setPendingIds((prev) => {
      if (pending === prev.has(formId)) return prev; // no-op keeps the identity
      const next = new Set(prev);
      if (pending) next.add(formId);
      else next.delete(formId);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ pendingIds, report }), [pendingIds, report]);
  return <FormPendingContext.Provider value={value}>{children}</FormPendingContext.Provider>;
}

/** Is the named form currently submitting? False when unknown or unwrapped. */
export function useFormPending(formId?: string): boolean {
  const ctx = useContext(FormPendingContext);
  if (!formId || !ctx) return false;
  return ctx.pendingIds.has(formId);
}

/**
 * Publishes its ancestor form's pending state under `id`.
 *
 * MUST be rendered as a child of the form it names — that is the only position
 * from which useFormStatus can observe it. Renders nothing.
 */
export function FormPendingReporter({ id }: { id: string }) {
  const { pending } = useFormStatus();
  const ctx = useContext(FormPendingContext);
  const report = ctx?.report;

  useEffect(() => {
    if (!report) return;
    report(id, pending);
    // On unmount, clear the flag so a removed form cannot leave a button
    // stuck in its disabled/spinning state.
    return () => report(id, false);
  }, [report, id, pending]);

  return null;
}
