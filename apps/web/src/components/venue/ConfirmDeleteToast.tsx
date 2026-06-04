'use client';

import { useRef, type ReactNode } from 'react';
import { toast } from 'sonner';

/**
 * ConfirmDeleteToast — a destructive submit that asks for confirmation through
 * the app's sonner toast (with Confirm / Cancel actions) instead of the native
 * `window.confirm` dialog. On confirm it submits a self-contained hidden form
 * that calls the bound server `action`, so the existing redirect/revalidate
 * path runs exactly as a normal form submit would.
 */
export default function ConfirmDeleteToast({
  action,
  hiddenFields,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="button"
        className={className}
        onClick={() =>
          toast(message, {
            action: {
              label: confirmLabel,
              onClick: () => formRef.current?.requestSubmit(),
            },
            cancel: { label: cancelLabel, onClick: () => {} },
          })
        }
      >
        {children}
      </button>
    </form>
  );
}
