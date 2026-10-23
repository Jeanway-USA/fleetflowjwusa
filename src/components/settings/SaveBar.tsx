import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The save row at the foot of a settings card. It says how many changes are waiting, keeps Save off until
 * there is something to save, and offers Discard. Sticks to the bottom of a long card so it is always in reach.
 */
export function SaveBar({
  changes,
  saving,
  onSave,
  onDiscard,
  noun = 'change',
  className,
}: {
  changes: number;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  noun?: string;
  className?: string;
}) {
  return (
    <div className={cn('sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-3', className)}>
      <span className="text-sm text-muted-foreground" aria-live="polite">
        {changes === 0 ? 'No unsaved changes' : `${changes} unsaved ${changes === 1 ? noun : `${noun}s`}`}
      </span>
      <span className="flex gap-2">
        <Button variant="ghost" className="h-11" disabled={changes === 0 || saving} onClick={onDiscard}>
          Discard
        </Button>
        <Button className="h-11" disabled={changes === 0 || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </span>
    </div>
  );
}
