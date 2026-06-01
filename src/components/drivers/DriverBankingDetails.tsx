import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  driverId: string;
}

export function DriverBankingDetails({ driverId }: Props) {
  const { isOwner, hasRole } = useAuth();
  const canView = isOwner || hasRole('payroll_admin');
  const [revealed, setRevealed] = useState(false);

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

  // Lightweight metadata read (last 4 only) — uses table RLS, no decrypt
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

  if (!canView) return null;

  if (!meta) {
    return (
      <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
        <Banknote className="mx-auto mb-2 h-5 w-5 opacity-60" />
        No banking info on file yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Banking · owner/payroll only
        </div>
        <Button
          size="sm"
          variant={revealed ? 'secondary' : 'outline'}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
          {revealed ? 'Hide' : 'Reveal'}
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Bank</dt>
        <dd className="font-medium">{meta.bank_name || '—'}</dd>

        <dt className="text-muted-foreground">Account type</dt>
        <dd className="font-medium capitalize">{meta.account_type || '—'}</dd>

        <dt className="text-muted-foreground">Routing</dt>
        <dd className="font-mono">
          {revealed
            ? isLoading
              ? '…'
              : data?.routing_number || '—'
            : '•••••••••'}
        </dd>

        <dt className="text-muted-foreground">Account</dt>
        <dd className="font-mono">
          {revealed
            ? isLoading
              ? '…'
              : data?.account_number || '—'
            : meta.account_number_last4
            ? `••••${meta.account_number_last4}`
            : '—'}
        </dd>
      </dl>
    </div>
  );
}
