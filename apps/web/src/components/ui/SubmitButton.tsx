'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingLabel?: string;
  className?: string;
}

export function SubmitButton({ children, pendingLabel, className, disabled, formAction, ...props }: SubmitButtonProps) {
  const { pending, action } = useFormStatus();

  // Disable every submit button while the form is in flight (prevents
  // double-submits / duplicate drafts). But only show the spinner on the button
  // whose action is actually running — important when one <form> has multiple
  // submit buttons (e.g. Save vs Submit), so the right button reflects work.
  const isDisabled = pending || disabled;
  const showPending = pending && (typeof formAction !== 'function' || action === formAction);

  return (
    <button
      {...props}
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
