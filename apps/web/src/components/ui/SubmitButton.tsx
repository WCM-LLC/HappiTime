'use client';

import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pendingLabel?: string;
  className?: string;
}

export function SubmitButton({ children, pendingLabel, className, disabled, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button {...props} disabled={isDisabled} aria-disabled={isDisabled} className={className}>
      {pending ? (
        <>
          <Loader2 className="inline-block h-4 w-4 animate-spin mr-1.5 align-middle" />
          {pendingLabel ?? children}
        </>
      ) : children}
    </button>
  );
}
