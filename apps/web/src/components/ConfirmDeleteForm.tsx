'use client';

import type { CSSProperties, ReactNode } from 'react';

type ConfirmDeleteFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export default function ConfirmDeleteForm({
  action,
  message,
  className,
  style,
  children,
}: ConfirmDeleteFormProps) {
  return (
    <form
      action={action}
      className={className}
      style={style}
      onSubmit={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}
