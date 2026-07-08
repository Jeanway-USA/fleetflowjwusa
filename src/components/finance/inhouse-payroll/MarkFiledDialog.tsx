import { useState } from 'react';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const schema = z.object({
  confirmation_reference: z.string().trim().min(1, 'Required').max(100),
  filed_on: z.string().min(1, 'Required'),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formKey: string;
  formLabel: string;
}

export function MarkFiledDialog({ open, onOpenChange, formKey, formLabel }: Props) {
  const qc = useQueryClient();
  const { orgId, user } = useAuth();
  const [ref, setRef] = useState('');
  const [filedOn, setFiledOn] = useState(format(new Date(), 'yyyy-MM-dd'));

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse({ confirmation_reference: ref, filed_on: filedOn });
      if (!parsed.success) throw new Error(parsed.error.errors[0].message);
      if (!orgId) throw new Error('No organization');
      const { error } = await supabase.from('tax_filing_completions').insert({
        org_id: orgId,
        form_key: formKey,
        confirmation_reference: parsed.data.confirmation_reference,
        filed_on: parsed.data.filed_on,
        filed_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Filing recorded');
      qc.invalidateQueries({ queryKey: ['tax_filing_completions'] });
      onOpenChange(false);
      setRef('');
    },
    onError: (e: Error) => toast.error(e.message ?? 'Failed to record filing'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Filed & Paid</DialogTitle>
          <DialogDescription>{formLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="ref">Confirmation reference</Label>
            <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. IRS-EFTPS-9932" maxLength={100} className="font-mono" />
          </div>
          <div>
            <Label htmlFor="filed">Filed on</Label>
            <Input id="filed" type="date" value={filedOn}
              onChange={(e) => setFiledOn(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => submit.mutate()} disabled={submit.isPending || !ref.trim()}>
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirm & Lock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
