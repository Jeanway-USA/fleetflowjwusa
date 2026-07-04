import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/formatters';
import { toast } from 'sonner';
import { Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

type Payment = {
  id: string;
  truck_id: string;
  payment_date: string;
  amount: number;
  note: string | null;
  created_at: string;
};

interface Props {
  truckId: string;
  loanBalance: number | null;
  originalLoanAmount: number | null;
}

export function TruckLoanPaymentsSection({ truckId, loanBalance, originalLoanAmount }: Props) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');

  const { data: payments = [] } = useQuery({
    queryKey: ['truck_loan_payments', truckId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('truck_loan_payments')
        .select('*')
        .eq('truck_id', truckId)
        .order('payment_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Payment[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['truck_loan_payments', truckId] });
    qc.invalidateQueries({ queryKey: ['trucks'] });
  };

  const addPayment = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error('Enter a payment amount greater than 0');
      const { error } = await (supabase as any).from('truck_loan_payments').insert({
        truck_id: truckId,
        amount: amt,
        payment_date: paymentDate,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Loan payment recorded');
      setAmount('');
      setNote('');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || 'Failed to record payment'),
  });

  const deletePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('truck_loan_payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Payment removed');
      invalidate();
    },
    onError: (e: any) => toast.error(e.message || 'Failed to remove payment'),
  });

  const isPaidOff = loanBalance != null && loanBalance <= 0 && (originalLoanAmount ?? 0) > 0;
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const originalDisplay = originalLoanAmount ?? (loanBalance ?? 0) + totalPaid;
  const effectiveBalance = loanBalance ?? originalLoanAmount ?? 0;
  const progress = originalDisplay > 0
    ? Math.min(100, Math.max(0, (1 - effectiveBalance / originalDisplay) * 100))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Loan Balance</span>
          {isPaidOff ? (
            <Badge className="bg-green-600/10 text-green-700 border border-green-600/20 hover:bg-green-600/10">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Paid Off
            </Badge>
          ) : (
            <Badge variant="secondary" className="font-mono">
              {formatCurrency(effectiveBalance, { maximumFractionDigits: 0 })} Remaining
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Original Loan Amount</p>
            <p className="font-medium">{originalLoanAmount ? formatCurrency(originalLoanAmount) : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Remaining Balance</p>
            <p className="font-medium">{isPaidOff ? '$0.00' : formatCurrency(effectiveBalance)}</p>
          </div>
        </div>
        {originalDisplay > 0 && (
          <div className="space-y-1">
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full ${isPaidOff ? 'bg-green-600' : 'bg-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{progress.toFixed(1)}% paid down</p>
          </div>
        )}

        {!isPaidOff && (
          <div className="rounded-md border p-3 space-y-3">
            <p className="text-sm font-medium">Log Loan Payment</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="loan_payment_amount" className="text-xs">Amount ($)</Label>
                <Input
                  id="loan_payment_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loan_payment_date" className="text-xs">Payment Date</Label>
                <Input
                  id="loan_payment_date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="loan_payment_note" className="text-xs">Note (optional)</Label>
                <Input
                  id="loan_payment_note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Aug installment"
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => addPayment.mutate()}
              disabled={addPayment.isPending || !amount}
            >
              <Plus className="h-4 w-4 mr-1" /> Record Payment
            </Button>
          </div>
        )}

        {payments.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">Recent Payments</p>
            <div className="border rounded-md divide-y">
              {payments.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{formatCurrency(Number(p.amount))}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(p.payment_date + 'T00:00:00'), 'MMM d, yyyy')}
                      {p.note ? ` · ${p.note}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => deletePayment.mutate(p.id)}
                    disabled={deletePayment.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
