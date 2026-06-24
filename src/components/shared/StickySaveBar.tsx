import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  visible: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  saving?: boolean;
  disabled?: boolean;
  message?: string;
  className?: string;
}

/**
 * Bottom-sticky bar that appears when a form is dirty.
 * Respects iOS safe-area on mobile.
 */
export function StickySaveBar({
  visible,
  onSave,
  onDiscard,
  saving,
  disabled,
  message = 'Unsaved changes',
  className,
}: Props) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'sticky bottom-0 left-0 right-0 z-30 -mx-4 sm:-mx-6 mt-4',
        'border-t border-border bg-card/95 backdrop-blur',
        'px-4 sm:px-6 py-3',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        'flex items-center justify-between gap-3',
        'animate-in slide-in-from-bottom-2 duration-150',
        className,
      )}
      role="region"
      aria-label="Unsaved changes"
    >
      <span className="text-sm text-muted-foreground truncate">{message}</span>
      <div className="flex items-center gap-2 shrink-0">
        {onDiscard && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
            className="h-10"
          >
            Discard
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={disabled || saving}
          className="h-10 min-w-[88px]"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}
