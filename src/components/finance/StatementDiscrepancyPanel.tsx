import { AlertTriangle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { SettlementDiscrepancy } from '@/hooks/useSettlementDiscrepancies';

interface Props {
  discrepancies: SettlementDiscrepancy[];
  title?: string;
  canResolve?: boolean;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const reasonLabel = (code: string) => {
  switch (code) {
    case 'trip_rate_mismatch': return 'Trip rate mismatch';
    case 'no_load_match': return 'Trip not found in dispatch';
    case 'period_total_mismatch': return 'Period total mismatch';
    default: return code;
  }
};

export function StatementDiscrepancyPanel({ discrepancies, title = 'Statement Discrepancies', canResolve = false }: Props) {
  const queryClient = useQueryClient();
  const unresolved = discrepancies.filter(d => !d.resolved_at);

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from('settlement_discrepancies')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Discrepancy marked resolved');
    queryClient.invalidateQueries({ queryKey: ['settlement-discrepancies'] });
    queryClient.invalidateQueries({ queryKey: ['active-loads-dispatcher'] });
  };

  if (discrepancies.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-destructive" />
        <p className="text-sm font-semibold text-destructive">{title}</p>
        <Badge variant="destructive" className="ml-auto">
          {unresolved.length} unresolved
        </Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trip</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Statement</TableHead>
            <TableHead className="text-right">Δ</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {discrepancies.map(d => (
            <TableRow key={d.id} className={d.resolved_at ? 'opacity-60' : ''}>
              <TableCell className="font-mono text-xs">{d.trip_number || '—'}</TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1 text-xs">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  {reasonLabel(d.reason_code)}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{formatCurrency(Number(d.expected_amount))}</TableCell>
              <TableCell className="text-right font-mono text-xs">{formatCurrency(Number(d.actual_amount))}</TableCell>
              <TableCell className={`text-right font-mono text-xs font-semibold ${Number(d.delta_amount) >= 0 ? 'text-destructive' : 'text-amber-600'}`}>
                {Number(d.delta_amount) >= 0 ? '+' : ''}{formatCurrency(Number(d.delta_amount))}
              </TableCell>
              <TableCell className="text-right">
                {d.resolved_at ? (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3 w-3" /> resolved
                  </span>
                ) : canResolve ? (
                  <Button size="sm" variant="outline" className="h-7" onClick={() => resolve(d.id)}>
                    Mark resolved
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
