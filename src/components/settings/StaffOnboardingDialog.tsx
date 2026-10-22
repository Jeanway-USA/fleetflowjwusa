import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, FileText, Loader2, Minus, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  name: string;
}

interface SignedDoc {
  id: string;
  document_type: string;
  file_path: string;
  admin_file_path: string | null;
  signed_at: string;
}

const FORM_LABELS: Record<string, string> = {
  w9: 'Form W-9',
  w4: 'Federal W-4',
  i9: 'Form I-9',
  state_tax: 'State tax withholding',
  direct_deposit_form: 'Direct deposit authorization',
};

/**
 * What a staff member (not a driver) has completed in onboarding, the documents their position requires, and the
 * signed paperwork. For the owner and payroll admins.
 */
export function StaffOnboardingDialog({ open, onOpenChange, userId, name }: Props) {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const askAgain = async () => {
    if (!userId) return;
    setResetting(true);
    const { error } = await supabase.rpc('reset_staff_onboarding' as never, { _user_id: userId } as never);
    setResetting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('They will be asked to complete onboarding again. Nothing they signed is deleted.');
    await queryClient.invalidateQueries({ queryKey: ['staff-onboarding-admin', userId] });
  };
  const { data, isLoading } = useQuery({
    queryKey: ['staff-onboarding-admin', userId],
    enabled: open && !!userId,
    queryFn: async () => {
      const [emp, profile, assignment] = await Promise.all([
        supabase.from('employees' as never).select('id, employment_type, status, phone, emergency_contact_name').eq('user_id', userId!).is('archived_at', null).maybeSingle(),
        supabase.from('profiles').select('requires_onboarding, onboarding_completed').eq('user_id', userId!).maybeSingle(),
        supabase.from('position_assignments').select('positions(name, required_documents)').eq('user_id', userId!).order('effective_start', { ascending: false }).limit(1),
      ]);
      const employee = (emp.data ?? null) as { id: string; employment_type: string; status: string; phone: string | null; emergency_contact_name: string | null } | null;
      let docs: SignedDoc[] = [];
      if (employee) {
        const { data: d } = await supabase.from('employee_signed_documents' as never).select('id, document_type, file_path, admin_file_path, signed_at').eq('employee_id', employee.id).order('signed_at', { ascending: false });
        docs = (d ?? []) as unknown as SignedDoc[];
      }
      const pos = (assignment.data?.[0] as { positions: { name: string; required_documents: Array<{ key: string; label: string }> | null } | null } | undefined)?.positions ?? null;
      return {
        employee,
        completed: !!profile.data?.onboarding_completed,
        required: !!profile.data?.requires_onboarding,
        position: pos,
        docs,
      };
    },
  });

  const open_ = async (path: string) => {
    const { data: signed, error } = await supabase.storage.from('signed-documents').createSignedUrl(path, 60);
    if (error || !signed?.signedUrl) {
      toast.error(error?.message ?? 'Could not open that document.');
      return;
    }
    window.open(signed.signedUrl, '_blank', 'noopener');
  };

  const signedTypes = new Set((data?.docs ?? []).map((d) => d.document_type));
  const requiredDocs = data?.position?.required_documents ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Onboarding</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 overflow-y-auto px-6 pb-6 text-sm">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !data?.employee ? (
            <p className="text-muted-foreground">No staff record yet. One is created when the person is invited or first opens onboarding.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={data.completed ? 'default' : 'outline'}>{data.completed ? 'Onboarding complete' : data.required ? 'Onboarding pending' : 'Not required'}</Badge>
                <Badge variant="outline">{data.employee.employment_type === '1099' ? '1099 contractor' : 'W-2 employee'}</Badge>
                {data.position && <Badge variant="outline">{data.position.name}</Badge>}
              </div>

              <section>
                <h3 className="mb-1.5 font-semibold">Required by their position</h3>
                {requiredDocs.length === 0 ? (
                  <p className="text-muted-foreground">Their position lists no required documents.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {requiredDocs.map((d) => (
                      <li key={d.key} className="flex min-h-11 items-center justify-between gap-3 px-3">
                        <span>{d.label}</span>
                        {signedTypes.has(d.key) ? <span className="flex items-center gap-1 font-medium text-success"><Check className="h-4 w-4" />Signed</span> : <span className="flex items-center gap-1 text-muted-foreground"><Minus className="h-4 w-4" />Not signed</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold">Signed paperwork</h3>
                {data.docs.length === 0 ? (
                  <p className="text-muted-foreground">Nothing signed yet.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {data.docs.map((d) => (
                      <li key={d.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                        <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{FORM_LABELS[d.document_type] ?? d.document_type}<span className="text-xs text-muted-foreground">{new Date(d.signed_at).toLocaleDateString()}</span></span>
                        <span className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-9" onClick={() => open_(d.file_path)}>View</Button>
                          {d.admin_file_path && <Button size="sm" variant="outline" className="h-9" onClick={() => open_(d.admin_file_path!)}>Payroll copy</Button>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <p className="text-xs text-muted-foreground">Need them to redo it? Their earlier paperwork stays on file.</p>
                <Button size="sm" variant="outline" className="h-9 shrink-0" disabled={resetting} onClick={askAgain}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />Ask them to redo onboarding
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
