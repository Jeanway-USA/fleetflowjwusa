import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Loader2, Percent } from 'lucide-react';
import { toast } from 'sonner';

import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';
import {
  getFederalTaxDetails,
  upsertFederalTaxDetails,
  upsertStateTaxes,
} from '@/services/gustoCompanyApi';

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
import { US_STATES } from '@/lib/us-states';

// States that do not levy a wage-based state income tax. NH & TN only tax
// investment income, so no employer withholding account is issued for wages.
const NO_SIT_STATES = ['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY'];

const taxSchema = z
  .object({
    ein: z.string().regex(/^\d{2}-\d{7}$/, 'EIN must be formatted XX-XXXXXXX'),
    filingState: z.string().min(2, 'Filing state is required'),
    stateAccountId: z.string().trim().max(20).optional().or(z.literal('')),
    suiAccountId: z
      .string()
      .trim()
      .min(4, 'SUI account number is required')
      .max(20),
    suiRate: z
      .number({ invalid_type_error: 'SUI rate is required' })
      .min(0, 'SUI rate cannot be negative')
      .max(20, 'SUI rate seems too high'),
  })
  .superRefine((val, ctx) => {
    if (!NO_SIT_STATES.includes(val.filingState)) {
      const v = (val.stateAccountId ?? '').trim();
      if (v.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['stateAccountId'],
          message: 'State account ID is required',
        });
      }
    }
  });

type TaxFormValues = z.infer<typeof taxSchema>;

function formatEin(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function TaxSetupSection() {
  const qc = useQueryClient();
  const { data: remote, isLoading } = useQuery({
    queryKey: ['gusto-federal-tax'],
    queryFn: async () => {
      const res = await getFederalTaxDetails();
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    retry: false,
    staleTime: 60_000,
  });

  const form = useForm<TaxFormValues>({
    resolver: zodResolver(taxSchema),
    defaultValues: {
      ein: '',
      filingState: '',
      stateAccountId: '',
      suiAccountId: '',
      suiRate: undefined as unknown as number,
    },
  });

  useEffect(() => {
    const ftd = remote?.federal_tax_details;
    if (!ftd?.ein) return;
    form.reset({
      ...form.getValues(),
      ein: ftd.ein,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);

  const filingState = form.watch('filingState');
  const stateRequiresWithholding = !!filingState && !NO_SIT_STATES.includes(filingState);

  useEffect(() => {
    if (filingState && !stateRequiresWithholding) {
      const current = form.getValues('stateAccountId');
      if (current) form.setValue('stateAccountId', '', { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filingState, stateRequiresWithholding]);

  const onSubmit = async (values: TaxFormValues) => {
    // TODO: separate call to /v1/companies/{id}/state_taxes for
    // filingState / stateAccountId / suiAccountId / suiRate.
    // stateAccountId is only sent when the state levies income tax.
    const _stateWithholding = stateRequiresWithholding
      ? (values.stateAccountId ?? '').trim()
      : null;
    const res = await upsertFederalTaxDetails({ ein: values.ein });
    if (res.ok) {
      toast.success('Tax setup saved', { description: 'Synced to Gusto.' });
      qc.invalidateQueries({ queryKey: ['gusto-federal-tax'] });
      qc.invalidateQueries({ queryKey: ['gusto-onboarding-steps'] });
    } else {
      toast.error('Failed to save tax setup', {
        description: res.error ?? 'Please try again.',
      });
    }
  };

  return (
    <PayrollSetupSectionCard
      icon={Percent}
      title="Tax Setup"
      description="Provide federal and state tax IDs, deposit schedules, and unemployment rates so Gusto can file and remit payroll taxes."
    >
      {isLoading ? (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved values…
        </div>
      ) : null}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              name="filingState"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>Primary filing state</RequiredLabel>
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
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

            {stateRequiresWithholding ? (
              <FormField
                control={form.control}
                name="stateAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <RequiredLabel>State withholding account ID</RequiredLabel>
                    </FormLabel>
                    <FormControl>
                      <Input
                        autoComplete="off"
                        placeholder="Format varies by state"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : filingState ? (
              <FormItem>
                <FormLabel className="text-muted-foreground">
                  State withholding account ID
                </FormLabel>
                <div className="flex h-10 items-center rounded-md border border-dashed border-border/60 bg-muted/30 px-3 text-xs text-muted-foreground">
                  {filingState} has no state income tax — no withholding account required.
                </div>
              </FormItem>
            ) : null}

            <FormField
              control={form.control}
              name="suiAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>State unemployment (SUI) account number</RequiredLabel>
                  </FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="suiRate"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
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
          </div>

          <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <RequiredLegend />
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={form.formState.isSubmitting}
            >
              Save tax setup
            </Button>
          </div>
        </form>
      </Form>
    </PayrollSetupSectionCard>
  );
}
