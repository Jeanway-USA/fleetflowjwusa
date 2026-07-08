import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Lock, Loader2, Landmark } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';

export function TruistAchStagingTab() {
  const qc = useQueryClient();
  const { orgId, user } = useAuth();
  const [codes, setCodes] = useState<Record<string, string>>({});

  const { data: ledgers = [], isLoading } = useQuery({
    queryKey: ['inhouse_ledgers_all', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('internal_payroll_ledger')
        .select('*')
        .eq('org_id', orgId!)
        .order('period_end', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ledgerIds = ledgers.map((l) => l.id);

  const { data: withholdings = [] } = useQuery({
    queryKey: ['tax_withholding_ledger_all', ledgerIds],
    enabled: ledgerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tax_withholding_ledger')
        .select('*')
        .in('ledger_id', ledgerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ['truist_payout_logs', ledgerIds],
    enabled: ledgerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('truist_payout_logs')
        .select('*')
        .in('ledger_id', ledgerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const withholdingMap = useMemo(() => {
    const m = new Map<string, (typeof withholdings)[number]>();
    withholdings.forEach((w) => m.set(w.ledger_id, w));
    return m;
  }, [withholdings]);

  const payoutMap = useMemo(() => {
    const m = new Map<string, (typeof payouts)[number]>();
    payouts.forEach((p) => m.set(p.ledger_id, p));
    return m;
  }, [payouts]);

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers_min', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .eq('org_id', orgId!);
      return data ?? [];
    },
  });
  const driverName = (id: string) => {
    const d = drivers.find((x) => x.id === id);
    return d ? `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() : id.slice(0, 8);
  };

  const finalize = useMutation({
    mutationFn: async ({ ledgerId, net }: { ledgerId: string; net: number }) => {
      const code = (codes[ledgerId] ?? '').trim();
      if (!code) throw new Error('Truist ACH Entry Code is required');
      const { error: payoutErr } = await supabase.from('truist_payout_logs').insert({
        org_id: orgId!,
        ledger_id: ledgerId,
        truist_ach_ref_code: code,
        net_payout_amount: net,
        processed_by: user?.id,
      });
      if (payoutErr) throw payoutErr;
      const { error: updErr } = await supabase
        .from('internal_payroll_ledger')
        .update({
          status: 'finalized',
          finalized_at: new Date().toISOString(),
          finalized_by: user?.id,
        })
        .eq('id', ledgerId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      toast.success('Settlement finalized and locked');
      qc.invalidateQueries({ queryKey: ['inhouse_ledgers_all'] });
      qc.invalidateQueries({ queryKey: ['truist_payout_logs'] });
      qc.invalidateQueries({ queryKey: ['internal_payroll_ledger'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Finalize failed'),
  });

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" /> Truist ACH Staging
        </CardTitle>
        <CardDescription>
          After executing the direct deposit manually from your Truist business portal,
          paste the bank's transaction reference code and click Finalize Settlement.
          Finalizing locks the row for audit integrity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Net Payout</TableHead>
                <TableHead>Truist ACH Entry Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin inline" />
                </TableCell></TableRow>
              )}
              {!isLoading && ledgers.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  No payroll batches yet. Generate one from the Active Batch tab.
                </TableCell></TableRow>
              )}
              {ledgers.map((r) => {
                const w = withholdingMap.get(r.id);
                const eeTax = (w?.ee_social_security ?? 0)
                  + (w?.ee_medicare ?? 0)
                  + (w?.federal_income_withholding ?? 0);
                const net = Number(r.gross_taxable_pay) - eeTax + Number(r.pass_through_fsc);
                const payout = payoutMap.get(r.id);
                const locked = r.status === 'finalized';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{driverName(r.driver_id)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(parseISO(r.period_start), 'MMM d')} – {format(parseISO(r.period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(net)}</TableCell>
                    <TableCell>
                      {locked ? (
                        <span className="font-mono text-sm">{payout?.truist_ach_ref_code ?? '—'}</span>
                      ) : (
                        <Input
                          value={codes[r.id] ?? ''}
                          placeholder="e.g. TRU-4432891"
                          onChange={(e) => setCodes((c) => ({ ...c, [r.id]: e.target.value }))}
                          className="h-8 w-40 font-mono"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {locked
                        ? <Badge className="gap-1"><Lock className="h-3 w-3" /> Finalized</Badge>
                        : <Badge variant="secondary">Draft</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {!locked && (
                        <Button
                          size="sm"
                          onClick={() => finalize.mutate({ ledgerId: r.id, net })}
                          disabled={finalize.isPending || !(codes[r.id] ?? '').trim()}
                        >
                          Finalize Settlement
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
