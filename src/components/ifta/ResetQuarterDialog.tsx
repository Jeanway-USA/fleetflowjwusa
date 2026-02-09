import { useState } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

type ResetTarget = 'records' | 'fuel' | 'both';

interface ResetQuarterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (target: ResetTarget) => Promise<void>;
  quarter: string;
}

export function ResetQuarterDialog({ open, onOpenChange, onConfirm, quarter }: ResetQuarterDialogProps) {
  const [target, setTarget] = useState<ResetTarget>('both');
  const [isResetting, setIsResetting] = useState(false);

  const handleConfirm = async () => {
    setIsResetting(true);
    try {
      await onConfirm(target);
    } finally {
      setIsResetting(false);
      onOpenChange(false);
    }
  };

  const labels: Record<ResetTarget, { title: string; desc: string }> = {
    records: { title: 'IFTA Records Only', desc: 'Clear generated mileage/tax report data' },
    fuel: { title: 'Fuel Purchases Only', desc: 'Clear synced and manually-added fuel data' },
    both: { title: 'Everything', desc: 'Clear all IFTA records and fuel purchases' },
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset {quarter} Data</AlertDialogTitle>
          <AlertDialogDescription>
            Choose what to clear for this quarter. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup value={target} onValueChange={(v) => setTarget(v as ResetTarget)} className="space-y-3 my-2">
          {(Object.entries(labels) as [ResetTarget, { title: string; desc: string }][]).map(([key, { title, desc }]) => (
            <div key={key} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50" onClick={() => setTarget(key)}>
              <RadioGroupItem value={key} id={`reset-${key}`} className="mt-0.5" />
              <Label htmlFor={`reset-${key}`} className="cursor-pointer">
                <span className="font-medium block text-sm">{title}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isResetting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isResetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset Data'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
