import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent?: () => void;
}

interface DriverRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  user_id: string | null;
}

interface TemplateRow {
  id: string;
  document_type: string;
  name: string | null;
  signatory_roles: string[] | null;
  is_active: boolean;
}

export function SendDocumentDialog({ open, onOpenChange, onSent }: Props) {
  const { orgId, user } = useAuth();
  const [templateId, setTemplateId] = useState<string>('');
  const [driverId, setDriverId] = useState<string>('');
  const [title, setTitle] = useState('');

  const { data: templates = [] } = useQuery({
    queryKey: ['send-doc-templates', orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, document_type, name, signatory_roles, is_active')
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .order('document_type');
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['send-doc-drivers', orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, user_id')
        .eq('org_id', orgId!)
        .order('first_name');
      if (error) throw error;
      return (data ?? []) as DriverRow[];
    },
  });

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  useEffect(() => {
    if (selectedTemplate && !title) {
      setTitle(selectedTemplate.name || selectedTemplate.document_type);
    }
  }, [selectedTemplate, title]);

  const send = useMutation({
    mutationFn: async () => {
      if (!orgId || !user) throw new Error('Not authenticated');
      if (!selectedTemplate) throw new Error('Pick a template');
      const roles = (selectedTemplate.signatory_roles && selectedTemplate.signatory_roles.length > 0)
        ? selectedTemplate.signatory_roles
        : ['driver'];

      const firstRole = roles[0];
      let assigned: string | null = null;
      let dId: string | null = null;
      if (firstRole === 'driver') {
        if (!driverId) throw new Error('Pick a driver');
        const d = drivers.find((x) => x.id === driverId);
        assigned = d?.user_id ?? null;
        dId = driverId;
      }

      const { error } = await supabase.from('document_instances').insert({
        org_id: orgId,
        template_id: selectedTemplate.id,
        title: title || selectedTemplate.name || selectedTemplate.document_type,
        status: 'pending_signatures',
        signatory_roles: roles,
        current_step: 0,
        assigned_to_user: assigned,
        driver_id: dId,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Document sent');
      setTemplateId('');
      setDriverId('');
      setTitle('');
      onSent?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const firstRole = selectedTemplate?.signatory_roles?.[0] ?? 'driver';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a document for signature</DialogTitle>
          <DialogDescription>
            Pick a template and (if the first signer is a driver) which driver receives it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name || t.document_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTemplate && (
            <div className="text-xs text-muted-foreground rounded-md border p-3 bg-muted/30">
              Signing order: <strong>{(selectedTemplate.signatory_roles ?? ['driver']).join(' → ')}</strong>
            </div>
          )}

          {firstRole === 'driver' && (
            <div className="space-y-2">
              <Label>Driver</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Choose a driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {[d.first_name, d.last_name].filter(Boolean).join(' ') || 'Driver'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Title (shown on the dashboard)</Label>
            <Input
              className="h-12 pl-4 sm:pl-3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026 Driver Agreement — Mike Johnson"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !templateId || (firstRole === 'driver' && !driverId)}
          >
            {send.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
