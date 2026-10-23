import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { DialogContent } from '@/components/ui/dialog';

/**
 * The driver app's building blocks. A modern phone app: cards on a soft page, one strong card for the load, gold
 * for the one thing to do next, and plain comfortable spacing. Everything reads from the theme tokens, so a driver
 * can switch light and dark and every piece follows.
 */

/** A card. The same 8px corners and hairline edge as the rest of the app, no shadow. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return <section className={cn('overflow-hidden rounded-lg border border-border bg-card text-card-foreground', className)} {...props} />;
}

/** The title line of a card: a name on the left, an action or hint on the right. */
export function PanelHead({ title, aside, className }: { title: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-3 px-4 pt-3', className)}>
      <h2 className="font-condensed text-xl font-bold leading-tight text-foreground">{title}</h2>
      {aside && <div className="min-w-0 text-sm text-muted-foreground">{aside}</div>}
    </div>
  );
}

/** A link-styled action for a card's title line. At least 44px tall to tap. */
export const HeadLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { asChild?: boolean }>(
  ({ className, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : 'a';
    return <Comp ref={ref} className={cn('inline-flex min-h-11 items-center text-sm font-semibold text-primary', className)} {...props} />;
  },
);
HeadLink.displayName = 'HeadLink';

/** A figure with its label above it. The label is plain words, the figure is the point. */
export function Stat({ label, children, className, size = 'md' }: { label: React.ReactNode; children: React.ReactNode; className?: string; size?: 'md' | 'lg' | 'xl' }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 truncate font-semibold tabular-nums text-foreground', size === 'md' && 'text-base', size === 'lg' && 'text-xl', size === 'xl' && 'font-condensed text-4xl leading-tight')}>{children}</p>
    </div>
  );
}

/** A row of figures sharing a card, divided by hairlines. */
export function StatRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-flow-col auto-cols-fr divide-x divide-border border-t border-border', className)}>{children}</div>;
}
export function StatCell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-4 py-3', className)}>{children}</div>;
}

const chip = cva('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[13px] font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-secondary text-secondary-foreground',
      active: 'border border-carbon/60 bg-carbon/20 text-foreground',
      warn: 'bg-warning/15 text-warning',
      good: 'bg-success/15 text-success',
      bad: 'bg-destructive/15 text-destructive',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

/** A small status label. The word is always there; colour only backs it up. */
export function Chip({ tone, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof chip>) {
  return <span className={cn(chip({ tone }), className)} {...props} />;
}

const btn = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        /** The one thing to do next: gold, the marker colour. */
        primary: 'bg-carbon text-carbon-foreground hover:bg-carbon/90',
        secondary: 'border border-border bg-card text-foreground hover:bg-secondary',
        ghost: 'text-foreground hover:bg-secondary',
        danger: 'border border-destructive/50 bg-card text-destructive hover:bg-destructive/10',
      },
      size: {
        lg: 'h-[52px] px-5 text-base',
        md: 'h-11 px-4 text-sm',
        sm: 'h-11 px-3 text-sm',
      },
    },
    defaultVariants: { tone: 'secondary', size: 'md' },
  },
);

export interface DBtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof btn> {
  asChild?: boolean;
}

/** The driver app's button: the app's button corners, 44px minimum, 52px for the main action. */
export const DBtn = React.forwardRef<HTMLButtonElement, DBtnProps>(({ className, tone, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} className={cn(btn({ tone, size }), className)} {...props} />;
});
DBtn.displayName = 'DBtn';

/** A quick-action tile: an icon over a word, a whole-tile tap target. */
export const Tile = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode; label: string }>(
  ({ icon, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex min-h-[72px] w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-secondary active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:size-6',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="text-[13px] font-medium">{label}</span>
    </button>
  ),
);
Tile.displayName = 'Tile';

/** A progress bar: a slim track, filled left to right. The exact numbers are always printed beside it. */
export function Bar({ value, max, label, className, tone = 'gold' }: { value: number; max: number; label: string; className?: string; tone?: 'gold' | 'ink' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(Math.min(value, max))}
      className={cn('h-2 overflow-hidden rounded-full bg-secondary', className)}
    >
      <div className={cn('h-full rounded-full', tone === 'gold' ? 'bg-carbon' : 'bg-foreground')} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A label and its value on one line, divided from the next. */
export function Row({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-3 border-t border-border px-4 first:border-t-0', className)}>
      <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
      <span className="shrink-0 text-right text-sm text-muted-foreground">{children}</span>
    </div>
  );
}

/** A segmented control: a few views side by side, the current one raised. Replaces tabs on phone screens. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-md bg-secondary p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-sm px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 font-mono text-xs tabular-nums text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A quiet line for an empty list. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('px-4 py-6 text-center text-sm text-muted-foreground', className)}>{children}</p>;
}

/** A dialog that is a bottom sheet on a phone and a centered card on a desk. */
export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogContent>,
  React.ComponentPropsWithoutRef<typeof DialogContent>
>(({ className, ...props }, ref) => (
  <DialogContent
    ref={ref}
    className={cn(
      'rounded-lg shadow-lg',
      'max-sm:!bottom-0 max-sm:!left-0 max-sm:!top-auto max-sm:!h-auto max-sm:!max-h-[92dvh] max-sm:!w-screen max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-b-none max-sm:!rounded-t-2xl',
      className,
    )}
    {...props}
  />
));
SheetContent.displayName = 'SheetContent';
