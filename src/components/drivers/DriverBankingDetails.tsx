import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Banknote, Eye, EyeOff, ShieldCheck, FileText, ExternalLink, Paperclip, Pencil, X, Save, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  driverId: string;
}

function getExt(path: string): string {
  const clean = path.split('?')[0];
  return clean.split('.').pop()?.toLowerCase() || '';
}

export function DriverBankingDetails({ driverId }: Props) {
  const { isOwner, hasRole } = useAuth();
  const canView = isOwner || hasRole('payroll_admin');
  const canEdit = canView;
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({
    bank_name: '',
    account_type: '' as '' | 'checking' | 'savings',
    routing_number: '',
    account_number: '',
  });
  const qc = useQueryClient();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['driver_banking_meta', driverId] }),
        qc.invalidateQueries({ queryKey: ['driver_banking', driverId] }),
        qc.invalidateQueries({ queryKey: ['driver_dd_attachment', driverId] }),
      ]);
      toast.success('Banking info refreshed');
    } finally {
      setRefreshing(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['driver_banking', driverId, revealed],
    enabled: canView && !!driverId && revealed,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_driver_banking', {
        _driver_id: driverId,
      });
      if (error) {
        toast.error(error.message);
        throw error;
      }
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    },
  });

  const { data: meta } = useQuery({
    queryKey: ['driver_banking_meta', driverId],
    enabled: canView && !!driverId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_banking_info')
        .select('bank_name, account_type, account_number_last4, updated_at')
        .eq('driver_id', driverId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: attachment } = useQuery({
    queryKey: ['driver_dd_attachment', driverId],
    enabled: canView && !!driverId,
    queryFn: async () => {
      const { data: drv, error: drvErr } = await supabase
        .from('drivers')
        .select('direct_deposit_attachment_url')
        .eq('id', driverId)
        .maybeSingle();
      if (drvErr) throw drvErr;
      const path = (drv?.direct_deposit_attachment_url as string | null) || null;
      if (!path) return null;
      const { data: signed, error: signErr } = await supabase.storage
        .from('signed-documents')
        .createSignedUrl(path, 300);
      return { path, url: signErr ? null : signed.signedUrl };
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const routing = form.routing_number.replace(/\D/g, '');
      const account = form.account_number.replace(/\D/g, '');
      if (!form.bank_name.trim()) throw new Error('Bank name is required');
      if (!form.account_type) throw new Error('Account type is required');
      if (routing.length !== 9) throw new Error('Routing number must be 9 digits');
      if (account.length < 4) throw new Error('Account number must be at least 4 digits');
      const { error } = await supabase.rpc('upsert_driver_banking', {
        _driver_id: driverId,
        _bank_name: form.bank_name.trim(),
        _account_type: form.account_type,
        _routing_number: routing,
        _account_number: account,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Banking info saved');
      setEditing(false);
      setForm({ bank_name: '', account_type: '', routing_number: '', account_number: '' });
      qc.invalidateQueries({ queryKey: ['driver_banking_meta', driverId] });
      qc.invalidateQueries({ queryKey: ['driver_banking', driverId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save banking info'),
  });

  if (!canView) return null;

  const startEdit = () => {
    setForm({
      bank_name: meta?.bank_name || '',
      account_type: (meta?.account_type as 'checking' | 'savings') || '',
      routing_number: '',
      account_number: '',
    });
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Edit banking (encrypted on save)
          </div>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saveMutation.isPending}>
            <X className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
        </div>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="dd-bank-name">Bank name</Label>
            <Input
              id="dd-bank-name"
              value={form.bank_name}
              onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
              placeholder="e.g. Chase"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Account type</Label>
            <Select
              value={form.account_type}
              onValueChange={(v) => setForm((f) => ({ ...f, account_type: v as 'checking' | 'savings' }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checking">Checking</SelectItem>
                <SelectItem value="savings">Savings</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dd-routing">Routing number</Label>
            <Input
              id="dd-routing"
              inputMode="numeric"
              maxLength={9}
              value={form.routing_number}
              onChange={(e) => setForm((f) => ({ ...f, routing_number: e.target.value.replace(/\D/g, '') }))}
              placeholder="9 digits"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dd-account">Account number</Label>
            <Input
              id="dd-account"
              inputMode="numeric"
              maxLength={20}
              value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value.replace(/\D/g, '') }))}
              placeholder="Account number"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-1.5 h-4 w-4" />
            {saveMutation.isPending ? 'Saving…' : 'Save banking'}
          </Button>
        </div>
      </div>
    );
  }

  if (!meta && !attachment) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          <Banknote className="mx-auto mb-2 h-5 w-5 opacity-60" />
          No banking info on file yet.
        </div>
        {canEdit && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCcw className={`mr-1.5 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Enter banking
            </Button>
          </div>
        )}
      </div>
    );
  }

  const ext = attachment?.path ? getExt(attachment.path) : '';
  const isPdf = ext === 'pdf';
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Banking · owner/payroll only
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={refreshing} title="Refresh">
            <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="mr-1.5 h-4 w-4" />
              {meta ? 'Edit' : 'Enter'}
            </Button>
          )}
          <Button
            size="sm"
            variant={revealed ? 'secondary' : 'outline'}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
            {revealed ? 'Hide' : 'Reveal'}
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Bank</dt>
        <dd className="font-medium">{meta?.bank_name || '—'}</dd>

        <dt className="text-muted-foreground">Account type</dt>
        <dd className="font-medium capitalize">{meta?.account_type || '—'}</dd>

        <dt className="text-muted-foreground">Routing</dt>
        <dd className="font-mono">
          {revealed ? (isLoading ? '…' : data?.routing_number || '—') : '•••••••••'}
        </dd>

        <dt className="text-muted-foreground">Account</dt>
        <dd className="font-mono">
          {revealed
            ? isLoading
              ? '…'
              : data?.account_number || '—'
            : meta?.account_number_last4
            ? `••••${meta.account_number_last4}`
            : '—'}
        </dd>
      </dl>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            Driver-provided attachment
            {ext && (
              <Badge variant="outline" className="uppercase text-[10px]">
                {ext}
              </Badge>
            )}
          </div>
          {attachment?.url && (
            <Button size="sm" variant="outline" asChild>
              <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open
              </a>
            </Button>
          )}
        </div>

        {!attachment && (
          <p className="text-xs text-muted-foreground">No attachment provided.</p>
        )}

        {attachment && !attachment.url && (
          <p className="text-xs text-destructive">Unable to load attachment (access denied).</p>
        )}

        {attachment?.url && isPdf && (
          <iframe
            src={attachment.url}
            title="Direct deposit attachment"
            className="h-64 w-full rounded border bg-muted"
          />
        )}

        {attachment?.url && isImage && (
          <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={attachment.url}
              alt="Direct deposit attachment"
              className="max-h-64 w-full rounded border object-contain bg-muted"
            />
          </a>
        )}

        {attachment?.url && !isPdf && !isImage && (
          <div className="flex items-center gap-2 rounded border bg-muted/40 p-3 text-xs text-muted-foreground">
            <FileText className="h-4 w-4" />
            Preview not available for this file type. Use Open to view.
          </div>
        )}
      </div>
    </div>
  );
}
