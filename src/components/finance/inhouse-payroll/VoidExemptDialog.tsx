import { useState } from 'react';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const schema = z.object({
  exempt_reason: z.string().trim().min(1, 'Reason is required').max(300),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formKey: string;
  formLabel: string;
}

export function VoidExemptDialog({ open, onOpenChange, formKey, formLabel }: Props) {
  const qc = useQueryClient();
  const { orgId, user } = useAuth();
  const [reason, setReason] = useState('No W-2 employees during this period');

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({ exempt_reason: reason });
      if (!parsed.success) throw new Error(parsed.error.errors[0].message);
      if (!orgId) throw new Error('No organization');
      const { error } = await supabase.from('tax_filing_completions').insert({
        org_id: orgId,
        form_key: formKey,
        is_exempt: true,
        exempt_reason: parsed.data.exempt_reason,
        filed_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Filing marked exempt');
      qc.invalidateQueries({ queryKey: ['tax_filing_completions'] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message ?? 'Failed to mark exempt'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void / Exempt Filing</DialogTitle>
          <DialogDescription>{formLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" value={reason} maxLength={300}
              rows={3} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">
              Records why this filing is not applicable for audit purposes.
              Exempt filings move to the archived index and stop triggering overdue alerts.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => submit.mutate()}
            disabled={submit.isPending || !reason.trim()}>
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Mark Exempt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
