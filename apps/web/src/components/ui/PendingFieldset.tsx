'use client';

import { useFormStatus } from 'react-dom';
import { useFormPending } from './FormPending';

/**
 * Dims and locks a whole form while it submits.
 *
 * A spinner on one button is easy to miss on a dense page. Fading the entire
 * group and blocking further input makes it unmistakable that the action was
 * received, and prevents a second submit landing while the first is in flight.
 *
 * `<fieldset disabled>` natively disables every control inside it, which is
 * why this is a fieldset rather than a div. Disabling is safe here: React has
 * already serialised the form data by the time `pending` flips, so nothing is
 * dropped from the submission.
 *
 * Pass `formId` for a detached form (see FormPending.tsx); without it the
 * component reads its own ancestor form via useFormStatus.
 */
export function PendingFieldset({
  children,
  formId,
  className,
}: {
  children: React.ReactNode;
  formId?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const detachedPending = useFormPending(formId);
  const busy = formId ? detachedPending : pending;

  return (
    <fieldset
      disabled={busy}
      aria-busy={busy}
      // min-w-0 and the reset classes keep the fieldset from imposing its
      // default intrinsic width and border on existing flex/grid layouts.
      className={[
        'm-0 min-w-0 border-0 p-0 transition-opacity duration-150',
        busy ? 'pointer-events-none opacity-50' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </fieldset>
  );
}
