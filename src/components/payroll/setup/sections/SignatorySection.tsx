import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Eye, EyeOff, UserCheck } from 'lucide-react';
import { toast } from 'sonner';

import { PayrollSetupSectionCard } from '../PayrollSetupSectionCard';
import { RequiredLabel, RequiredLegend } from '../RequiredLabel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { cn } from '@/lib/utils';

const SSN_REGEX = /^\d{3}-?\d{2}-?\d{4}$/;

const signatorySchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(50),
  lastName: z.string().trim().min(1, 'Last name is required').max(50),
  title: z.string().trim().min(1, 'Title is required').max(100),
  dateOfBirth: z
    .date({ required_error: 'Date of birth is required' })
    .refine((d) => d < new Date(), { message: 'Date of birth must be in the past' })
    .refine(
      (d) => {
        const today = new Date();
        const age =
          today.getFullYear() -
          d.getFullYear() -
          (today <
          new Date(today.getFullYear(), d.getMonth(), d.getDate())
            ? 1
            : 0);
        return age >= 18;
      },
      { message: 'Signatory must be at least 18 years old' },
    ),
  ssn: z
    .string()
    .trim()
    .regex(SSN_REGEX, 'SSN must be 9 digits (XXX-XX-XXXX)'),
});

type SignatoryFormValues = z.infer<typeof signatorySchema>;

function formatSsn(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function SignatorySection() {
  const [showSsn, setShowSsn] = useState(false);

  const form = useForm<SignatoryFormValues>({
    resolver: zodResolver(signatorySchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      title: '',
      ssn: '',
    },
  });

  const onSubmit = (values: SignatoryFormValues) => {
    // TODO: POST /v1/companies/{company_id}/signatories via Gusto edge function
    console.log('[signatory] submit', {
      ...values,
      dateOfBirth: format(values.dateOfBirth, 'yyyy-MM-dd'),
      ssn: '***-**-****',
    });
    toast.success('Signatory saved', {
      description: 'Gusto API wiring pending.',
    });
  };

  return (
    <PayrollSetupSectionCard
      icon={UserCheck}
      title="Signatory"
      description="Designate and verify the authorized signatory who will sign federal and state payroll forms on the company's behalf."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><RequiredLabel>First name</RequiredLabel></FormLabel>
                  <FormControl>
                    <Input autoComplete="given-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><RequiredLabel>Last name</RequiredLabel></FormLabel>
                  <FormControl>
                    <Input autoComplete="family-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel><RequiredLabel>Title</RequiredLabel></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Owner, CEO, President" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel><RequiredLabel>Date of birth</RequiredLabel></FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            'justify-start text-left font-normal',
                            !field.value && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, 'PPP') : 'Pick a date'}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        captionLayout="dropdown-buttons"
                        fromYear={1930}
                        toYear={new Date().getFullYear()}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        className={cn('p-3 pointer-events-auto')}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ssn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><RequiredLabel>SSN</RequiredLabel></FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        type={showSsn ? 'text' : 'password'}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="XXX-XX-XXXX"
                        maxLength={11}
                        onChange={(e) => field.onChange(formatSsn(e.target.value))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSsn((v) => !v)}
                        className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                        aria-label={showSsn ? 'Hide SSN' : 'Show SSN'}
                      >
                        {showSsn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
              Save signatory
            </Button>
          </div>
        </form>
      </Form>
    </PayrollSetupSectionCard>
  );
}
