import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatters';
import { computeAmortization } from '@/lib/amortization';
import { Calculator } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  truck: {
    id: string;
    original_loan_amount?: number | null;
    down_payment?: number | null;
    financing_fees?: number | null;
    interest_rate?: number | null;
    monthly_payment?: number | null;
    loan_term_months?: number | null;
    loan_start_date?: string | null;
    lender_name?: string | null;
  };
}

export function AmortizationCard({ truck }: Props) {
  const { data: totalPaid = 0 } = useQuery({
    queryKey: ['truck_loan_payments_sum', truck.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('truck_loan_payments')
        .select('amount')
        .eq('truck_id', truck.id);
      if (error) throw error;
      return (data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    },
  });

  const equipmentCost = Number(truck.original_loan_amount ?? 0);
  const downPayment = Number(truck.down_payment ?? 0);
  const fees = Number(truck.financing_fees ?? 0);
  const principal = Math.max(0, equipmentCost - downPayment + fees);
  const monthlyPayment = Number(truck.monthly_payment ?? 0);
  const termMonths = Number(truck.loan_term_months ?? 0);
  const annualRatePct = Number(truck.interest_rate ?? 0);
  const hasEnoughData = principal > 0 && monthlyPayment > 0 && termMonths > 0 && !!truck.loan_start_date;

  if (!hasEnoughData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Amortization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Fill in Equipment Cost, Monthly Payment, Loan Term and Loan Start Date to see live amortization.
          </p>
        </CardContent>
      </Card>
    );
  }

  const a = computeAmortization({
    principal,
    annualRatePct,
    monthlyPayment,
    termMonths,
    loanStartDate: truck.loan_start_date!,
    actualPaidToDate: totalPaid,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Amortization
          </span>
          <Badge variant="secondary" className="font-mono">
            {formatCurrency(a.remainingPrincipal, { maximumFractionDigits: 0 })} remaining
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Financed Principal</p>
            <p className="font-medium">{formatCurrency(principal, { maximumFractionDigits: 0 })}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Payments Made</p>
            <p className="font-medium">{formatCurrency(a.actualPaidToDate, { maximumFractionDigits: 0 })}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Scheduled To Date</p>
            <p className="font-medium">{formatCurrency(a.scheduledPaidToDate, { maximumFractionDigits: 0 })}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Monthly Payment</p>
            <p className="font-medium">{formatCurrency(monthlyPayment)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Rate</p>
            <p className="font-medium">{annualRatePct.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Payoff Date</p>
            <p className="font-medium">
              {a.estimatedPayoffDate ? format(a.estimatedPayoffDate, 'MMM yyyy') : '—'}
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${a.payoffProgressPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {a.payoffProgressPct.toFixed(1)}% paid down · {a.scheduledPaymentsElapsed} of {termMonths} scheduled months elapsed
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
