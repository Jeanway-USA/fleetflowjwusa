import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { CheckCircle2, Eye, EyeOff, Landmark, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';
import { Badge } from '@/components/ui/badge';
import { createBankAccount, listBankAccounts } from '@/services/gustoCompanyApi';
import { RequiredLabel, RequiredLegend } from '../RequiredLabel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function isValidRoutingNumber(rtn: string): boolean {
  if (!/^\d{9}$/.test(rtn)) return false;
  const d = rtn.split('').map(Number);
  const sum =
    3 * (d[0] + d[3] + d[6]) +
    7 * (d[1] + d[4] + d[7]) +
    1 * (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

const bankSchema = z
  .object({
    accountHolder: z
      .string()
      .trim()
      .min(1, 'Account holder name is required')
      .max(100),
    accountType: z.enum(['checking', 'savings'], {
      required_error: 'Account type is required',
    }),
    routingNumber: z
      .string()
      .regex(/^\d{9}$/, 'Routing number must be 9 digits')
      .refine(isValidRoutingNumber, 'Invalid routing number (checksum failed)'),
    accountNumber: z
      .string()
      .regex(/^\d{4,17}$/, 'Account number must be 4–17 digits'),
    confirmAccountNumber: z.string(),
  })
  .refine((v) => v.accountNumber === v.confirmAccountNumber, {
    message: 'Account numbers do not match',
    path: ['confirmAccountNumber'],
  });

type BankFormValues = z.infer<typeof bankSchema>;

const digitsOnly = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

export function BankDetailsSection() {
  const qc = useQueryClient();
  const [showAcct, setShowAcct] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [replace, setReplace] = useState(false);

  const { data: remote, isLoading } = useQuery({
    queryKey: ['gusto-bank-accounts'],
    queryFn: async () => {
      const res = await listBankAccounts();
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    retry: false,
    staleTime: 60_000,
  });

  const existing = remote?.bank_accounts?.[0];

  const form = useForm<BankFormValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      accountHolder: '',
      accountType: 'checking',
      routingNumber: '',
      accountNumber: '',
      confirmAccountNumber: '',
    },
  });


  const onSubmit = async (values: BankFormValues) => {
    const res = await createBankAccount({
      accountHolder: values.accountHolder,
      accountType: values.accountType,
      routingNumber: values.routingNumber,
      accountNumber: values.accountNumber,
    });
    if (res.ok) {
      toast.success('Bank details saved', { description: 'Synced to Gusto.' });
      qc.invalidateQueries({ queryKey: ['gusto-bank-accounts'] });
      qc.invalidateQueries({ queryKey: ['gusto-onboarding-steps'] });
      setReplace(false);
      form.reset();
    } else {
      toast.error('Failed to save bank details', {
        description: res.error ?? 'Please try again.',
      });
    }
  };

  const showForm = !existing || replace;

  return (
    <PayrollSetupSectionCard
      icon={Landmark}
      title="Bank Details"
      description="Connect and verify the company bank account Gusto will debit for payroll and taxes."
    >
      {isLoading ? (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved values…
        </div>
      ) : null}
      {existing ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              {existing.name ?? 'Bank account on file'}
            </div>
            <div className="text-xs text-muted-foreground">
              {(existing.account_type ?? 'Checking')} • ****{(existing.hidden_account_number ?? '').slice(-4)}
              {existing.verification_status ? (
                <Badge variant="outline" className="ml-2">{String(existing.verification_status)}</Badge>
              ) : null}
            </div>
          </div>
          {!replace ? (
            <Button variant="outline" size="sm" type="button" onClick={() => setReplace(true)}>
              Replace account
            </Button>
          ) : (
            <Button variant="ghost" size="sm" type="button" onClick={() => setReplace(false)}>
              Cancel
            </Button>
          )}
        </div>
      ) : null}
      {showForm ? (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="accountHolder"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>
                    <RequiredLabel>Account holder name</RequiredLabel>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="As it appears on the account" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>Account type</RequiredLabel>
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="checking">Checking</SelectItem>
                      <SelectItem value="savings">Savings</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="routingNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>Routing number</RequiredLabel>
                  </FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="9 digits"
                      maxLength={9}
                      {...field}
                      onChange={(e) => field.onChange(digitsOnly(e.target.value, 9))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>Account number</RequiredLabel>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showAcct ? 'text' : 'password'}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="4–17 digits"
                        maxLength={17}
                        onChange={(e) => field.onChange(digitsOnly(e.target.value, 17))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowAcct((v) => !v)}
                        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                        aria-label={showAcct ? 'Hide account number' : 'Show account number'}
                      >
                        {showAcct ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmAccountNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>Confirm account number</RequiredLabel>
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showConfirm ? 'text' : 'password'}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Re-enter account number"
                        maxLength={17}
                        onChange={(e) => field.onChange(digitsOnly(e.target.value, 17))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                        aria-label={showConfirm ? 'Hide account number' : 'Show account number'}
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <RequiredLegend />
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={form.formState.isSubmitting}
            >
              Save bank details
            </Button>
          </div>
        </form>
      </Form>
    </PayrollSetupSectionCard>
  );
}
