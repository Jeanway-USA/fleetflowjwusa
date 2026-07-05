import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Landmark, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { initiateMicroDeposits, verifyBankAccount } from '@/services/gustoCompanyApi';
import { BankDetailsSection } from '@/components/payroll/setup/sections/BankDetailsSection';

/**
 * Bank account step: manual bank details + micro-deposit verification.
 * (Plaid instant path can be added later once PLAID_CLIENT_ID/SECRET are set.)
 */
export function MicroDepositVerifyStep() {
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      const res = await initiateMicroDeposits();
      if (!res.ok) throw new Error(res.error);
      toast.success('Micro-deposits sent to your bank (arrive in 1–2 business days).');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send micro-deposits');
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    const n1 = Number(d1);
    const n2 = Number(d2);
    if (!Number.isFinite(n1) || !Number.isFinite(n2) || n1 <= 0 || n2 <= 0) {
      toast.error('Enter both deposit amounts in dollars (e.g. 0.12)');
      return;
    }
    setVerifying(true);
    try {
      const res = await verifyBankAccount({ deposit1: n1, deposit2: n2 });
      if (!res.ok) throw new Error(res.error);
      toast.success('Bank account verified.');
      setD1('');
      setD2('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      <BankDetailsSection />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" />
            Verify by micro-deposits
          </CardTitle>
          <CardDescription>
            After adding a bank account, Gusto sends two small test deposits. Enter
            the amounts (in dollars) once they arrive to complete verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send test deposits
          </Button>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="micro-d1">Deposit 1 ($)</Label>
              <Input
                id="micro-d1"
                inputMode="decimal"
                placeholder="0.12"
                value={d1}
                onChange={(e) => setD1(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="micro-d2">Deposit 2 ($)</Label>
              <Input
                id="micro-d2"
                inputMode="decimal"
                placeholder="0.34"
                value={d2}
                onChange={(e) => setD2(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={handleVerify} disabled={verifying}>
            {verifying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify deposits
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
