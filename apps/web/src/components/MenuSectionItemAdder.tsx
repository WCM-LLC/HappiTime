'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';

type CreateItemAction = (formData: FormData) => void | Promise<void>;

type MenuSectionItemAdderProps = {
  sectionId: string;
  createItemAction: CreateItemAction;
  addButtonClassName: string;
  okButtonClassName: string;
  deleteButtonClassName: string;
  inputClassName?: string;
  variant?: 'modern' | 'legacy';
};

function OkButton({ className }: { className: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? 'Saving...' : 'OK'}
    </button>
  );
}

export default function MenuSectionItemAdder({
  sectionId,
  createItemAction,
  addButtonClassName,
  okButtonClassName,
  deleteButtonClassName,
  inputClassName,
  variant = 'modern',
}: MenuSectionItemAdderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    await createItemAction(formData);
    setIsOpen(false);
    router.refresh();
  }

  if (!isOpen) {
    return (
      <div
        className={variant === 'modern' ? 'mt-3 flex justify-end' : 'row'}
        style={variant === 'legacy' ? { justifyContent: 'flex-end', marginTop: 10 } : undefined}
      >
        <button type="button" className={addButtonClassName} onClick={() => setIsOpen(true)}>
          Add section item
        </button>
      </div>
    );
  }

  if (variant === 'legacy') {
    return (
      <form action={handleSubmit} className="col" style={{ gap: 8, marginTop: 10 }}>
        <input type="hidden" name="section_id" value={sectionId} />
        <div className="row">
          <input name="item_name" placeholder="Item name" required />
          <input name="item_price" type="number" step="0.01" placeholder="Price (optional)" />
        </div>
        <textarea name="item_description" placeholder="Description (optional)" rows={2} />
        <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
          <label className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="checkbox" name="item_is_happy_hour" />
            <span className="muted">Happy hour item</span>
          </label>
          <div className="row" style={{ gap: 8 }}>
            <OkButton className={okButtonClassName} />
            <button type="button" className={deleteButtonClassName} onClick={() => setIsOpen(false)}>
              Delete Item
            </button>
          </div>
        </div>
      </form>
    );
  }

  const fieldClassName = inputClassName ?? '';

  return (
    <form
      action={handleSubmit}
      className="mt-3 rounded-md border border-dashed border-border-strong bg-background/50 p-4"
    >
      <input type="hidden" name="section_id" value={sectionId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-caption font-medium text-muted block mb-1">Item name</label>
          <input name="item_name" placeholder="Item name" required className={fieldClassName} />
        </div>
        <div>
          <label className="text-caption font-medium text-muted block mb-1">Price</label>
          <input name="item_price" type="number" step="0.01" placeholder="Optional" className={fieldClassName} />
        </div>
      </div>
      <div className="mb-3">
        <label className="text-caption font-medium text-muted block mb-1">Description</label>
        <textarea
          name="item_description"
          placeholder="Optional description"
          rows={2}
          className={fieldClassName + ' h-auto py-2'}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-body-sm text-muted cursor-pointer">
          <input
            type="checkbox"
            name="item_is_happy_hour"
            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
          />
          Happy hour item
        </label>
        <div className="flex items-center gap-2">
          <OkButton className={okButtonClassName} />
          <button type="button" className={deleteButtonClassName} onClick={() => setIsOpen(false)}>
            Delete Item
          </button>
        </div>
      </div>
    </form>
  );
}
