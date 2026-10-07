import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-dark text-dark-foreground',
        brand: 'bg-brand-subtle text-brand-dark-alt',
        secondary: 'bg-background text-muted border border-border',
        // `-ink` not the mid tone: success/warning on their own grounds measure
        // 4.08:1 and 2.14:1, both under the AA floor for this 12px caption.
        success: 'bg-success-light text-success-ink',
        error: 'bg-error-light text-error',
        warning: 'bg-warning-light text-warning-ink',
        outline: 'border border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
