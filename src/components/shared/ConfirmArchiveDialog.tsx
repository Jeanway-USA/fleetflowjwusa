import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useDemoGuard } from '@/hooks/useDemoGuard';

interface ConfirmArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemName?: string;
  entityLabel?: string;
  warnings?: string[];
  isArchiving?: boolean;
}

export function ConfirmArchiveDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  itemName,
  entityLabel = 'record',
  warnings = [],
  isArchiving = false,
}: ConfirmArchiveDialogProps) {
  const { isDemoMode, guard } = useDemoGuard();

  const defaultDescription = itemName
    ? `Archive "${itemName}"? You can restore it from the Archive page.`
    : `Archive this ${entityLabel}? You can restore it from the Archive page.`;

  const handleConfirm = () => {
    if (guard('Archiving items')) return;
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title || `Archive ${entityLabel}`}</AlertDialogTitle>
          <AlertDialogDescription>
            {isDemoMode
              ? 'Archiving is disabled in demo mode. Sign up for a real account to manage your data.'
              : description || defaultDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {warnings.length > 0 && !isDemoMode && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-warning">Active associations detected</p>
                <ul className="list-disc list-inside text-muted-foreground text-xs">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isArchiving || isDemoMode}
          >
            {isArchiving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Archiving...
              </>
            ) : (
              'Archive'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
