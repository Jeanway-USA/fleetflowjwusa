import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Percent } from 'lucide-react';
import { toast } from 'sonner';

import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';
import { upsertFederalTaxDetails } from '@/services/gustoCompanyApi';
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

const taxSchema = z.object({
  ein: z.string().regex(/^\d{2}-\d{7}$/, 'EIN must be formatted XX-XXXXXXX'),
  filingState: z.string().min(2, 'Filing state is required'),
  stateAccountId: z
    .string()
    .trim()
    .min(4, 'State account ID is required')
    .max(20),
  suiAccountId: z
    .string()
    .trim()
    .min(4, 'SUI account number is required')
    .max(20),
  suiRate: z
    .number({ invalid_type_error: 'SUI rate is required' })
    .min(0, 'SUI rate cannot be negative')
    .max(20, 'SUI rate seems too high'),
});

type TaxFormValues = z.infer<typeof taxSchema>;

function formatEin(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function TaxSetupSection() {
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

  const onSubmit = async (values: TaxFormValues) => {
    // TODO: separate call to /v1/companies/{id}/state_taxes for
    // filingState / stateAccountId / suiAccountId / suiRate.
    const res = await upsertFederalTaxDetails({ ein: values.ein });
    if (res.ok) {
      toast.success('Tax setup saved', { description: 'Synced to Gusto.' });
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
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="suiAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <RequiredLabel>State unemployment (SUI) account number</RequiredLabel>
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
