'use client';

import { useId, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * A form whose submit is gated behind a real confirmation dialog.
 *
 * Replaces `window.confirm`, which blocks the main thread, cannot be styled,
 * and is the accessibility defect tracked in BACKLOG.md and TODO.md. Four
 * identical copies of the old guard existed — in ConfirmDeleteForm, and as a
 * local `ConfirmingForm` in the guides table, the guide review controls, and
 * the super-users table.
 *
 * Built on native `<dialog>` + showModal(), which supplies the focus trap,
 * Escape-to-close, background inerting and top-layer placement that a
 * hand-rolled modal has to reimplement and usually gets wrong.
 *
 * The submit path is unchanged: on confirm the component calls
 * `requestSubmit()` on the same form, so the bound server action, redirect and
 * revalidation all run exactly as a normal submit would. A ref flag lets that
 * second submit through rather than re-opening the dialog.
 */
export default function ConfirmForm({
  action,
  message,
  title = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'destructive',
  className,
  style,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** What the operator is about to do, and what it costs. */
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Set only for the programmatic submit that follows a confirmation.
  const confirmed = useRef(false);
  // Tables render one of these per row, so the labelling ids must be unique
  // per instance or every dialog on the page claims the same heading.
  const id = useId();

  function handleConfirm() {
    confirmed.current = true;
    dialogRef.current?.close();
    formRef.current?.requestSubmit();
  }

  const confirmCls =
    tone === 'destructive'
      ? 'bg-error text-white hover:bg-error/90'
      : 'bg-dark text-dark-foreground hover:bg-dark/90';

  return (
    <>
      <form
        ref={formRef}
        action={action}
        className={className}
        style={style}
        onSubmit={(event) => {
          if (confirmed.current) {
            confirmed.current = false;
            return;
          }
          event.preventDefault();
          dialogRef.current?.showModal();
        }}
      >
        {children}
      </form>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-message`}
        // Native dialog centres itself with auto margins; the rest is the
        // system's modal treatment — shadow-xl is reserved for exactly this.
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-surface p-6 text-foreground shadow-xl backdrop:bg-dark/40"
        onClick={(event) => {
          // Native <dialog> does not close on backdrop click. The dialog
          // element itself is the backdrop, so a click that lands on it rather
          // than on the panel's children is a click outside.
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <h2 id={`${id}-title`} className="text-heading-md font-semibold tracking-tight">
          {title}
        </h2>
        <p id={`${id}-message`} className="mt-2 text-body-sm text-muted leading-relaxed">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            // Focus lands on the way out, not the irreversible action.
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface px-4 text-body-sm font-medium text-foreground transition-colors hover:bg-background cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-body-sm font-medium transition-colors cursor-pointer ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
