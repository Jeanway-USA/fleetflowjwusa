import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { invokeWithAuth } from '@/lib/invoke-with-auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instance: {
    id: string;
    org_id?: string | null;
    title: string;
    signatory_roles: string[];
    current_step: number;
    status: string;
  };
  onReopened?: () => void;
}

interface OrgUserRow {
  user_id: string;
  role: string;
  full_name: string | null;
}

export function ReopenDocumentDialog({ open, onOpenChange, instance, onReopened }: Props) {
  const qc = useQueryClient();
  const [fromStep, setFromStep] = useState(0);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setFromStep(0);
      setReassignTo('');
      setReason('');
    }
  }, [open, instance.id]);

  const targetRole = instance.signatory_roles[fromStep] ?? '';

  const { data: orgUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['reopen-org-users', instance.org_id, targetRole],
    enabled: open && !!instance.org_id && !!targetRole,
    queryFn: async () => {
      const { data: roleRows, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('org_id', instance.org_id!)
        .eq('role', targetRole as any);
      if (error) throw error;
      const ids = (roleRows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [] as OrgUserRow[];
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ids);
      if (pErr) throw pErr;
      const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      return (roleRows ?? []).map((r) => ({
        user_id: r.user_id,
        role: r.role,
        full_name: nameById.get(r.user_id) ?? null,
      })) as OrgUserRow[];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeWithAuth<{ ok: boolean; error?: string }>(
        'reopen-document-instance',
        {
          body: {
            instance_id: instance.id,
            from_step: fromStep,
            reassign_to: reassignTo || null,
            reason: reason.trim(),
          },
        },
      );
      if (error) throw error;
      if (data && (data as any).error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Document sent back to Action Required');
      qc.invalidateQueries({ queryKey: ['document_instances'] });
      qc.invalidateQueries({ queryKey: ['document_signatures_mine'] });
      qc.invalidateQueries({ queryKey: ['document_instance', instance.id] });
      onReopened?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to reopen document'),
  });

  const canSubmit = reason.trim().length >= 3 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Reopen for re-signing
          </DialogTitle>
          <DialogDescription>
            Send "{instance.title}" back to Action Required so the correct signer can complete it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Rewind to step</Label>
            <Select value={String(fromStep)} onValueChange={(v) => { setFromStep(Number(v)); setReassignTo(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {instance.signatory_roles.map((role, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    Step {idx + 1} · {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reassign to specific user (optional)</Label>
            <Select value={reassignTo || 'any'} onValueChange={(v) => setReassignTo(v === 'any' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder={usersLoading ? 'Loading…' : `Anyone with role: ${targetRole}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Anyone with role: {targetRole}</SelectItem>
                {orgUsers.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name ?? u.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong driver signed the agreement."
              rows={3}
            />
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>This will discard signatures</AlertTitle>
            <AlertDescription>
              All signatures at step {fromStep + 1} and later will be removed. If a signed PDF exists it will be deleted.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send back to Action Required
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
