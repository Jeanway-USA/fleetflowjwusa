import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';
import { getCompany, upsertPrimaryLocation } from '@/services/gustoCompanyApi';

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

const INDUSTRY_OPTIONS: { code: string; label: string }[] = [
  { code: '484121', label: 'General Freight Trucking, Long-Distance, Truckload' },
  { code: '484122', label: 'General Freight Trucking, Long-Distance, Less Than Truckload' },
  { code: '484110', label: 'General Freight Trucking, Local' },
  { code: '484230', label: 'Specialized Freight (except Used Goods) Trucking, Long-Distance' },
  { code: '484220', label: 'Specialized Freight (except Used Goods) Trucking, Local' },
  { code: '492110', label: 'Couriers and Express Delivery Services' },
  { code: '493110', label: 'General Warehousing and Storage' },
  { code: '488490', label: 'Other Support Activities for Road Transportation' },
  { code: 'OTHER', label: 'Other' },
];

const companySchema = z.object({
  legalName: z.string().trim().min(1, 'Legal company name is required').max(200),
  street1: z.string().trim().min(1, 'Street address is required').max(200),
  street2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().min(2, 'State is required'),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'ZIP must be 5 digits or ZIP+4'),
  phoneNumber: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, '').length >= 10, {
      message: 'Enter a valid 10-digit phone number',
    }),
  industryCode: z.string().min(1, 'Industry is required'),
});

type CompanyFormValues = z.infer<typeof companySchema>;

export function CompanyIndustrySection() {
  const qc = useQueryClient();
  const { data: remote, isLoading } = useQuery({
    queryKey: ['gusto-company'],
    queryFn: async () => {
      const res = await getCompany();
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
    retry: false,
    staleTime: 60_000,
  });

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      legalName: '',
      street1: '',
      street2: '',
      city: '',
      state: '',
      zip: '',
      phoneNumber: '',
      industryCode: '',
    },
  });

  useEffect(() => {
    if (!remote) return;
    const loc = remote.primary_location ?? {};
    form.reset({
      legalName: remote.legal_name ?? '',
      street1: (loc.street_1 as string) ?? '',
      street2: (loc.street_2 as string) ?? '',
      city: (loc.city as string) ?? '',
      state: (loc.state as string) ?? '',
      zip: (loc.zip as string) ?? '',
      phoneNumber: (loc.phone_number as string) ?? '',
      industryCode: remote.naics_code ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote]);


  const onSubmit = async (values: CompanyFormValues) => {
    const res = await upsertPrimaryLocation({
      legalName: values.legalName,
      street1: values.street1,
      street2: values.street2,
      city: values.city,
      state: values.state,
      zip: values.zip,
      phoneNumber: values.phoneNumber,
      industryCode: values.industryCode,
    });
    if (res.ok) {
      toast.success('Company info saved', { description: 'Synced to Gusto.' });
    } else {
      toast.error('Failed to save company info', {
        description: res.error ?? 'Please try again.',
      });
    }
  };

  return (
    <PayrollSetupSectionCard
      icon={Building2}
      title="Company & Industry"
      description="Confirm your legal company details, primary business address, and NAICS industry classification. Gusto requires these before running payroll."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="legalName"
            render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Legal company name</RequiredLabel></FormLabel>
                <FormControl>
                  <Input autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="street1"
            render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Street address</RequiredLabel></FormLabel>
                <FormControl>
                  <Input autoComplete="address-line1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="street2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Address line 2{' '}
                  <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    autoComplete="address-line2"
                    placeholder="Suite, unit, etc."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem className="sm:col-span-3">
                  <FormLabel><RequiredLabel>City</RequiredLabel></FormLabel>
                  <FormControl>
                    <Input autoComplete="address-level2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem className="sm:col-span-1">
                  <FormLabel><RequiredLabel>State</RequiredLabel></FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
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
              name="zip"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel><RequiredLabel>ZIP</RequiredLabel></FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="postal-code"
                      inputMode="numeric"
                      placeholder="00000"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Business phone</RequiredLabel></FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="(555) 555-5555"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />


          <FormField
            control={form.control}
            name="industryCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel><RequiredLabel>Industry (NAICS)</RequiredLabel></FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an industry" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.code} value={opt.code}>
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          {opt.code}
                        </span>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <RequiredLegend />
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={form.formState.isSubmitting}
            >
              Save company info
            </Button>
          </div>
        </form>
      </Form>
    </PayrollSetupSectionCard>
  );
}
