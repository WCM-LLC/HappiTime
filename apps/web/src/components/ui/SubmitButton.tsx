'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useFormPending } from './FormPending';

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingLabel?: string;
  className?: string;
}

export function SubmitButton({ children, pendingLabel, className, disabled, formAction, form, ...props }: SubmitButtonProps) {
  const { pending, action } = useFormStatus();

  // A button attached to a form by id (`form={someId}`) is NOT inside that
  // form, so useFormStatus reports the wrong form or none at all and its
  // spinner would never appear. Those read their form's status from the
  // pending context instead, published by a FormPendingReporter inside the
  // form. See FormPending.tsx.
  const detachedPending = useFormPending(form);
  const isAttachedById = typeof form === 'string' && form.length > 0;

  // Disable every submit button while the form is in flight (prevents
  // double-submits / duplicate drafts). But only show the spinner on the button
  // whose action is actually running — important when one <form> has multiple
  // submit buttons (e.g. Save vs Submit), so the right button reflects work.
  const isDisabled = (isAttachedById ? detachedPending : pending) || disabled;
  const showPending = isAttachedById
    ? detachedPending
    : pending && (typeof formAction !== 'function' || action === formAction);

  return (
    <button
      {...props}
      form={form}
      formAction={formAction}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={showPending}
      className={className}
    >
      {showPending ? (
        <>
          <Loader2 className="inline-block h-4 w-4 animate-spin mr-1.5 align-middle" />
          {pendingLabel ?? children}
        </>
      ) : children}
    </button>
  );
}
