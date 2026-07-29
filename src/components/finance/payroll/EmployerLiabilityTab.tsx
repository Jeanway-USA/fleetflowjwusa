import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/formatters';
import { CURRENT_TAX_YEAR } from '@/lib/payroll/taxTables';
import type { TaxAuditSnapshot } from '@/lib/payroll/types';

interface Bucket {
  employeeFit: number;
  employeeSs: number;
  employeeMed: number;
  employeeAddlMed: number;
  employeeSit: number;
  employerSs: number;
  employerMed: number;
  futa: number;
  suta: number;
}

const EMPTY: Bucket = {
  employeeFit: 0,
  employeeSs: 0,
  employeeMed: 0,
  employeeAddlMed: 0,
  employeeSit: 0,
  employerSs: 0,
  employerMed: 0,
  futa: 0,
  suta: 0,
};

const LINE_TO_BUCKET: Record<string, keyof Bucket> = {
  federal_income_tax: 'employeeFit',
  social_security: 'employeeSs',
  medicare: 'employeeMed',
  additional_medicare: 'employeeAddlMed',
  state_income_tax: 'employeeSit',
  employer_social_security: 'employerSs',
  employer_medicare: 'employerMed',
  futa: 'futa',
  suta: 'suta',
};

/**
 * Employer tax liability, sourced from the audit snapshots written by the
 * shared engine — so the report can never drift from what was actually paid.
 */
export function EmployerLiabilityTab({ taxYear = CURRENT_TAX_YEAR }: { taxYear?: number }) {
  const { orgId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['employer_tax_liability', orgId, taxYear],
    enabled: !!orgId,
    queryFn: async () => {
      const start = `${taxYear}-01-01`;
      const end = `${taxYear}-12-31`;
      const [{ data: settlements }, { data: payroll }] = await Promise.all([
        supabase
          .from('driver_settlements')
          .select('period_end, tax_calculation')
          .eq('org_id', orgId!)
          .is('deleted_at', null)
          .gte('period_end', start)
          .lte('period_end', end),
        supabase
          .from('internal_payroll_ledger')
          .select('period_end, tax_calculation')
          .eq('org_id', orgId!)
          .gte('period_end', start)
          .lte('period_end', end),
      ]);
      return [...(settlements ?? []), ...(payroll ?? [])] as {
        period_end: string;
        tax_calculation: unknown;
      }[];
    },
  });

  const byQuarter = useMemo(() => {
    const map = new Map<string, Bucket>();
    for (const row of data ?? []) {
      const audit = row.tax_calculation as TaxAuditSnapshot | null;
      if (!audit?.lines?.length) continue;
      const month = Number(row.period_end.slice(5, 7));
      const q = `Q${Math.floor((month - 1) / 3) + 1}`;
      if (!map.has(q)) map.set(q, { ...EMPTY });
      const b = map.get(q)!;
      for (const line of audit.lines) {
        const key = LINE_TO_BUCKET[line.key];
        if (key) b[key] += Number(line.amount) || 0;
      }
    }
    return ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => ({ quarter: q, ...(map.get(q) ?? EMPTY) }));
  }, [data]);

  const totals = useMemo(
    () =>
      byQuarter.reduce<Bucket>(
        (acc, q) => {
          (Object.keys(EMPTY) as (keyof Bucket)[]).forEach((k) => {
            acc[k] += q[k];
          });
          return acc;
        },
        { ...EMPTY },
      ),
    [byQuarter],
  );

  const form941 = (b: Bucket) => b.employeeFit + b.employeeSs * 2 + b.employeeMed * 2 + b.employeeAddlMed;

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Form 941 deposits (YTD)" value={form941(totals)} />
        <StatCard label="FUTA (Form 940)" value={totals.futa} />
        <StatCard label="SUTA (state)" value={totals.suta} />
        <StatCard label="State income tax withheld" value={totals.employeeSit} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quarterly employer liability — {taxYear}</CardTitle>
          <CardDescription>
            Built from the tax audit trail on every finalized settlement and payroll run.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarter</TableHead>
                <TableHead className="text-right">FIT withheld</TableHead>
                <TableHead className="text-right">SS (ee + er)</TableHead>
                <TableHead className="text-right">Medicare (ee + er)</TableHead>
                <TableHead className="text-right">Addl Medicare</TableHead>
                <TableHead className="text-right">941 total</TableHead>
                <TableHead className="text-right">FUTA</TableHead>
                <TableHead className="text-right">SUTA</TableHead>
                <TableHead className="text-right">State income tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byQuarter.map((q) => (
                <TableRow key={q.quarter}>
                  <TableCell className="font-medium">{q.quarter}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(q.employeeFit)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(q.employeeSs + q.employerSs)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(q.employeeMed + q.employerMed)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(q.employeeAddlMed)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(form941(q))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(q.futa)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(q.suta)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(q.employeeSit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(value)}</p>
      </CardContent>
    </Card>
  );
}
