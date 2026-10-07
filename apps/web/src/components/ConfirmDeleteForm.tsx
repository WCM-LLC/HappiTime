'use client';

import type { CSSProperties, ReactNode } from 'react';
import ConfirmForm from '@/components/ui/ConfirmForm';

type ConfirmDeleteFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

/**
 * Destructive submit with a confirmation step.
 *
 * The API is unchanged; only the confirmation is. It used to be
 * `window.confirm`, which blocks the main thread and cannot be styled or
 * focus-managed. ConfirmForm supplies a real dialog.
 */
export default function ConfirmDeleteForm({
  action,
  message,
  className,
  style,
  children,
}: ConfirmDeleteFormProps) {
  return (
    <ConfirmForm
      action={action}
      message={message}
      title="Delete this?"
      confirmLabel="Delete"
      tone="destructive"
      className={className}
      style={style}
    >
      {children}
    </ConfirmForm>
  );
}
