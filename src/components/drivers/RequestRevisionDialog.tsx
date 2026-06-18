import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemLabel: string;
  onConfirm: (notes: string) => Promise<void> | void;
  initialNotes?: string;
}

export function RequestRevisionDialog({ open, onOpenChange, itemLabel, onConfirm, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = notes.trim();
    if (trimmed.length < 5) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
      setNotes('');
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request revision — {itemLabel}</DialogTitle>
          <DialogDescription>
            Explain what the driver needs to fix. They'll see this message at the top of the step.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="revision-notes">Reason</Label>
          <Textarea
            id="revision-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            placeholder="e.g., Direct deposit routing number is illegible — please re-upload a clearer photo."
            rows={5}
            autoFocus
          />
          <p className="text-xs text-muted-foreground text-right">{notes.length}/500</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || notes.trim().length < 5}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Send revision request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
