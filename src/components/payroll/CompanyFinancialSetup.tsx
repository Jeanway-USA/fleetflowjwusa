import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Landmark, Percent, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  createBankAccount,
  upsertFederalTaxDetails,
  upsertStateTaxes,
  verifyBankAccount,
} from '@/services/gustoCompanyApi';
import { RequiredLabel, RequiredLegend } from './setup/RequiredLabel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { US_STATES } from '@/lib/us-states';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEin(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

const digitsOnly = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

function isValidRoutingNumber(rtn: string): boolean {
  if (!/^\d{9}$/.test(rtn)) return false;
  const d = rtn.split('').map(Number);
  const sum =
    3 * (d[0] + d[3] + d[6]) +
    7 * (d[1] + d[4] + d[7]) +
    1 * (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

// ---------------------------------------------------------------------------
// Tax Configuration
// ---------------------------------------------------------------------------

const stateTaxSchema = z.object({
  state: z.string().min(2, 'State is required'),
  withholdingAccountId: z.string().trim().min(4, 'Withholding ID required').max(30),
  suiAccountId: z.string().trim().min(4, 'SUI account required').max(30),
  suiRate: z
    .number({ invalid_type_error: 'SUI rate required' })
    .min(0, 'Cannot be negative')
    .max(20, 'Seems too high'),
});

const taxSchema = z
  .object({
    legalName: z.string().trim().min(1, 'Legal company name is required').max(100),
    ein: z.string().regex(/^\d{2}-\d{7}$/, 'EIN must be formatted XX-XXXXXXX'),
    filingForm: z.enum(['941', '944']),
    taxableAsScorp: z.boolean(),
    states: z.array(stateTaxSchema).min(1, 'Add at least one state'),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    val.states.forEach((s, i) => {
      if (seen.has(s.state)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['states', i, 'state'],
          message: 'Duplicate state',
        });
      }
      seen.add(s.state);
    });
  });

type TaxFormValues = z.infer<typeof taxSchema>;

function TaxConfigurationForm() {
  const form = useForm<TaxFormValues>({
    resolver: zodResolver(taxSchema),
    defaultValues: {
      legalName: 'JeanWay LLC',
      ein: '',
      filingForm: '941',
      taxableAsScorp: false,
      states: [
        {
          state: 'TX',
          withholdingAccountId: '',
          suiAccountId: '',
          suiRate: undefined as unknown as number,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'states',
  });

  const onSubmit = async (values: TaxFormValues) => {
    const fed = await upsertFederalTaxDetails({
      ein: values.ein,
      legalName: values.legalName,
      filingForm: values.filingForm,
      taxableAsScorp: values.taxableAsScorp,
    });
    if (!fed.ok) {
      toast.error('Failed to save federal tax details', {
        description: fed.error ?? 'Please try again.',
      });
      return;
    }
    const st = await upsertStateTaxes({ states: values.states });
    if (!st.ok) {
      toast.error('Failed to save state taxes', {
        description: st.error ?? 'Please try again.',
      });
      return;
    }
    toast.success('Tax configuration saved', { description: 'Synced to Gusto.' });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Federal</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="legalName"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>
                    <RequiredLabel>Legal company name</RequiredLabel>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="As registered with the IRS" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ein"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>Federal EIN</RequiredLabel>
                  </FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="XX-XXXXXXX"
                      maxLength={10}
                      {...field}
                      onChange={(e) => field.onChange(formatEin(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="filingForm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>Filing form</RequiredLabel>
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="941">Form 941 (quarterly)</SelectItem>
                      <SelectItem value="944">Form 944 (annual)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="taxableAsScorp"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
                  <div className="space-y-0.5">
                    <FormLabel>Taxable as S-Corp</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      Enable if the company has elected S-Corp tax treatment.
                    </p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">State tax IDs</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  state: '',
                  withholdingAccountId: '',
                  suiAccountId: '',
                  suiRate: undefined as unknown as number,
                })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> Add state
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((f, index) => (
              <div
                key={f.id}
                className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-5"
              >
                <FormField
                  control={form.control}
                  name={`states.${index}.state`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <RequiredLabel>State</RequiredLabel>
                      </FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="State" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-72">
                          {US_STATES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`states.${index}.withholdingAccountId`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <RequiredLabel>Withholding ID</RequiredLabel>
                      </FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`states.${index}.suiAccountId`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <RequiredLabel>SUI account #</RequiredLabel>
                      </FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`states.${index}.suiRate`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <RequiredLabel>SUI rate (%)</RequiredLabel>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          min={0}
                          max={20}
                          placeholder="e.g. 2.700"
                          value={
                            field.value === undefined || Number.isNaN(field.value)
                              ? ''
                              : field.value
                          }
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === '' ? undefined : e.target.valueAsNumber,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    disabled={fields.length <= 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
          <RequiredLegend />
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={form.formState.isSubmitting}
          >
            Save tax configuration
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Bank Accounts
// ---------------------------------------------------------------------------

const bankSchema = z
  .object({
    accountHolder: z.string().trim().min(1, 'Account holder name is required').max(100),
    accountType: z.enum(['checking', 'savings']),
    routingNumber: z
      .string()
      .regex(/^\d{9}$/, 'Routing number must be 9 digits')
      .refine(isValidRoutingNumber, 'Invalid routing number (checksum failed)'),
    accountNumber: z.string().regex(/^\d{4,17}$/, 'Account number must be 4–17 digits'),
    confirmAccountNumber: z.string(),
  })
  .refine((v) => v.accountNumber === v.confirmAccountNumber, {
    message: 'Account numbers do not match',
    path: ['confirmAccountNumber'],
  });

type BankFormValues = z.infer<typeof bankSchema>;

const verifySchema = z.object({
  deposit1: z
    .number({ invalid_type_error: 'Required' })
    .min(0.01, 'Must be at least $0.01')
    .max(0.99, 'Must be less than $1.00'),
  deposit2: z
    .number({ invalid_type_error: 'Required' })
    .min(0.01, 'Must be at least $0.01')
    .max(0.99, 'Must be less than $1.00'),
});

type VerifyFormValues = z.infer<typeof verifySchema>;

function BankAccountsPanel() {
  const [showAcct, setShowAcct] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [bankAccountUuid, setBankAccountUuid] = useState<string | undefined>();

  const bankForm = useForm<BankFormValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      accountHolder: '',
      accountType: 'checking',
      routingNumber: '',
      accountNumber: '',
      confirmAccountNumber: '',
    },
  });

  const verifyForm = useForm<VerifyFormValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      deposit1: undefined as unknown as number,
      deposit2: undefined as unknown as number,
    },
  });

  const onBankSubmit = async (values: BankFormValues) => {
    const res = await createBankAccount({
      accountHolder: values.accountHolder,
      accountType: values.accountType,
      routingNumber: values.routingNumber,
      accountNumber: values.accountNumber,
    });
    if (res.ok) {
      const gusto = (res.data as { gusto?: { uuid?: string } })?.gusto;
      if (gusto?.uuid) setBankAccountUuid(gusto.uuid);
      toast.success('Bank details saved', { description: 'Synced to Gusto.' });
    } else {
      toast.error('Failed to save bank details', {
        description: res.error ?? 'Please try again.',
      });
    }
  };

  const onVerifySubmit = async (values: VerifyFormValues) => {
    const res = await verifyBankAccount({
      deposit1: values.deposit1,
      deposit2: values.deposit2,
      bankAccountUuid,
    });
    if (res.ok) {
      toast.success('Bank account verified', { description: 'Synced to Gusto.' });
    } else {
      toast.error('Verification failed', {
        description: res.error ?? 'Please try again.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Form {...bankForm}>
        <form onSubmit={bankForm.handleSubmit(onBankSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={bankForm.control}
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
              control={bankForm.control}
              name="accountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>Account type</RequiredLabel>
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
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
              control={bankForm.control}
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
              control={bankForm.control}
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
              control={bankForm.control}
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
              disabled={bankForm.formState.isSubmitting}
            >
              Save bank details
            </Button>
          </div>
        </form>
      </Form>

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Micro-deposit verification</h3>
            <p className="text-xs text-muted-foreground">
              Enter the two small deposits Gusto sent to the account (each under $1.00) to
              activate payroll debits.
            </p>
          </div>
        </div>

        <Form {...verifyForm}>
          <form
            onSubmit={verifyForm.handleSubmit(onVerifySubmit)}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={verifyForm.control}
                name="deposit1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <RequiredLabel>Deposit 1 ($)</RequiredLabel>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0.01}
                        max={0.99}
                        placeholder="0.32"
                        value={
                          field.value === undefined || Number.isNaN(field.value)
                            ? ''
                            : field.value
                        }
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === '' ? undefined : e.target.valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={verifyForm.control}
                name="deposit2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <RequiredLabel>Deposit 2 ($)</RequiredLabel>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0.01}
                        max={0.99}
                        placeholder="0.47"
                        value={
                          field.value === undefined || Number.isNaN(field.value)
                            ? ''
                            : field.value
                        }
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === '' ? undefined : e.target.valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="secondary"
                disabled={verifyForm.formState.isSubmitting}
              >
                Verify deposits
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function CompanyFinancialSetup() {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="h-5 w-5 text-primary" />
          Company Financial Setup
        </CardTitle>
        <CardDescription>
          Configure federal & state taxes and connect the bank account Gusto will use for
          payroll debits.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="tax" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
            <TabsTrigger value="tax" className="gap-2">
              <Percent className="h-4 w-4" /> Tax Configuration
            </TabsTrigger>
            <TabsTrigger value="bank" className="gap-2">
              <Landmark className="h-4 w-4" /> Bank Accounts
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tax" className="mt-6">
            <TaxConfigurationForm />
          </TabsContent>
          <TabsContent value="bank" className="mt-6">
            <BankAccountsPanel />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
