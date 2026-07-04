import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, Wallet } from 'lucide-react';
import { formatCurrency, formatDate, getDriverName } from '@/lib/formatters';
import { toast } from 'sonner';
import { downloadW2PayStub } from '@/lib/pdf/generateW2PayStubPdf';
import { RunW2PayrollDialog } from './RunW2PayrollDialog';

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  status: string | null;
  employment_type: string | null;
  tax_state: string | null;
}

export function W2PayrollHistoryCard() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, status, employment_type, tax_state');
      if (error) throw error;
      return (data ?? []) as Driver[];
    },
  });

  const { data: payrolls = [], isLoading } = useQuery({
    queryKey: ['driver_payroll_w2'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_payroll')
        .select('*')
        .eq('employment_type', 'w2_company')
        .order('period_end', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const w2Drivers = useMemo(
    () => drivers.filter((d) => d.employment_type === 'w2_company' && (d.status ?? 'active') === 'active'),
    [drivers],
  );

  const totals = useMemo(() => {
    return payrolls.reduce(
      (acc: any, p: any) => {
        acc.gross += Number(p.gross_pay ?? 0);
        acc.net += Number(p.net_pay ?? 0);
        acc.fica += Number(p.employer_fica_total ?? 0);
        acc.suta += Number(p.fl_suta_tax ?? 0);
        return acc;
      },
      { gross: 0, net: 0, fica: 0, suta: 0 },
    );
  }, [payrolls]);

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadW2PayStub(id);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to generate pay stub');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <>
      <Card className="card-elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" /> W-2 Payroll
            </CardTitle>
            <CardDescription>
              Automated FIT + FICA withholding and state SUTA / State Income Tax per driver's Tax State.
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)}>Run W-2 Payroll</Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Employer liability summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryTile label="Gross Paid" value={formatCurrency(totals.gross)} />
            <SummaryTile label="Net Paid" value={formatCurrency(totals.net)} tone="primary" />
            <SummaryTile
              label="Employer FICA Match (7.65%)"
              value={formatCurrency(totals.fica)}
              tone="amber"
            />
            <SummaryTile label="State Reemployment Tax (SUTA)" value={formatCurrency(totals.suta)} tone="amber" />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">FIT</TableHead>
                  <TableHead className="text-right">SS</TableHead>
                  <TableHead className="text-right">Medicare</TableHead>
                  <TableHead className="text-right">SIT</TableHead>
                  <TableHead className="text-right">Emp FICA</TableHead>
                  <TableHead className="text-right">SUTA</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : payrolls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                      No W-2 payroll runs yet. Click "Run W-2 Payroll" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  payrolls.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{getDriverName(p.driver_id, drivers)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(p.period_start)} – {formatDate(p.period_end)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(p.gross_pay ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(p.federal_income_tax ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(Number(p.social_security_tax ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(
                          Number(p.medicare_tax ?? 0) + Number(p.additional_medicare_tax ?? 0),
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(Number(p.employer_fica_total ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatCurrency(Number(p.fl_suta_tax ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-primary">
                        {formatCurrency(Number(p.net_pay ?? 0))}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDownload(p.id)}
                          disabled={downloadingId === p.id}
                          title="Generate & download pay stub"
                        >
                          {downloadingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RunW2PayrollDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        drivers={w2Drivers}
        onCompleted={() => qc.invalidateQueries({ queryKey: ['driver_payroll_w2'] })}
      />
    </>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'primary' | 'amber';
}) {
  const cls =
    tone === 'primary'
      ? 'bg-primary/5 text-primary'
      : tone === 'amber'
        ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
        : 'bg-muted/40';
  return (
    <div className={`border rounded-md p-3 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
