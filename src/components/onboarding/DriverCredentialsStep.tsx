import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, startOfDay } from 'date-fns';
import { CalendarIcon, IdCard } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const ENDORSEMENT_OPTIONS = [
  { value: 'H', label: 'H — Hazardous Materials' },
  { value: 'P', label: 'P — Passenger' },
  { value: 'T', label: 'T — Double/Triple Trailers' },
  { value: 'N', label: 'N — Tank Vehicle' },
  { value: 'S', label: 'S — School Bus' },
  { value: 'X', label: 'X — Hazmat & Tank Combination' },
] as const;

const today = () => startOfDay(new Date());

const schema = z
  .object({
    licenseNumber: z
      .string()
      .trim()
      .min(4, 'License number must be at least 4 characters')
      .max(30, 'License number must be under 30 characters'),
    phoneNumber: z
      .string()
      .trim()
      .max(20, 'Phone number must be under 20 characters')
      .optional()
      .or(z.literal('')),
    emergencyContactName: z
      .string()
      .trim()
      .min(1, 'Emergency contact name is required')
      .max(100, 'Must be under 100 characters'),
    emergencyContactRelationship: z
      .string()
      .trim()
      .min(1, 'Relationship is required')
      .max(60, 'Must be under 60 characters'),
    emergencyContactPhone: z
      .string()
      .trim()
      .min(1, 'Emergency contact phone is required')
      .max(20, 'Phone number must be under 20 characters'),
    licenseExpiry: z
      .date({ required_error: 'License expiry date is required' })
      .refine((d) => d >= today(), 'License must not be expired'),
    medicalCardExpiry: z
      .date({ required_error: 'Medical card expiry date is required' })
      .refine((d) => d >= today(), 'Medical card must not be expired'),
    endorsements: z.array(z.enum(['H', 'P', 'T', 'N', 'S', 'X'])).default([]),
    hazmatExpiry: z.date().optional(),
    hasTwic: z.enum(['yes', 'no'], { required_error: 'Please select an option' }),
    twicExpiry: z.date().optional(),
    fastCardPassportExpiry: z.date().optional(),
    dodClearanceLevel: z
      .enum(['None', 'Interim Secret', 'Secret'])
      .default('None'),
    landstarOperatorId: z
      .string()
      .trim()
      .max(30, 'Must be under 30 characters')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((val, ctx) => {
    if (val.phoneNumber && val.phoneNumber.replace(/\D/g, '').length < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['phoneNumber'],
        message: 'Enter a valid phone number (at least 10 digits)',
      });
    }
    if (val.emergencyContactPhone.replace(/\D/g, '').length < 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['emergencyContactPhone'],
        message: 'Enter a valid phone number (at least 10 digits)',
      });
    }
    const hasHazmat = val.endorsements.includes('H') || val.endorsements.includes('X');
    if (hasHazmat) {
      if (!val.hazmatExpiry) {
        ctx.addIssue({
          code: 'custom',
          path: ['hazmatExpiry'],
          message: 'HAZMAT expiry date is required',
        });
      } else if (val.hazmatExpiry < today()) {
        ctx.addIssue({
          code: 'custom',
          path: ['hazmatExpiry'],
          message: 'HAZMAT certification must not be expired',
        });
      }
    }
    if (val.hasTwic === 'yes') {
      if (!val.twicExpiry) {
        ctx.addIssue({
          code: 'custom',
          path: ['twicExpiry'],
          message: 'TWIC expiry date is required',
        });
      } else if (val.twicExpiry < today()) {
        ctx.addIssue({
          code: 'custom',
          path: ['twicExpiry'],
          message: 'TWIC card must not be expired',
        });
      }
    }
  });

export type DriverCredentialsValues = z.infer<typeof schema>;

export interface DriverCredentialsPayload {
  license_number: string;
  phone: string | null;
  license_expiry: string;
  medical_card_expiry: string;
  endorsements: string[];
  hazmat_expiry: string | null;
  has_twic: boolean;
  twic_expiry: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  fast_card_passport_expiry: string | null;
  dod_clearance_level: 'None' | 'Interim Secret' | 'Secret';
  landstar_operator_id: string | null;
}

export interface DriverCredentialsStepHandle {
  submit: () => Promise<DriverCredentialsPayload | null>;
  isValid: boolean;
}

interface Props {
  defaultValues?: Partial<DriverCredentialsValues>;
  onValidityChange?: (valid: boolean) => void;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  // Per project convention: append T00:00:00 to avoid timezone drift
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const buildDefaultValues = (
  row?: {
    license_number?: string | null;
    phone?: string | null;
    license_expiry?: string | null;
    medical_card_expiry?: string | null;
    endorsements?: string[] | null;
    hazmat_expiry?: string | null;
    has_twic?: boolean | null;
    twic_expiry?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
    emergency_contact_relationship?: string | null;
    fast_card_passport_expiry?: string | null;
    dod_clearance_level?: string | null;
    landstar_operator_id?: string | null;
  } | null,
): Partial<DriverCredentialsValues> => ({
  licenseNumber: row?.license_number ?? '',
  phoneNumber: row?.phone ?? '',
  licenseExpiry: parseDate(row?.license_expiry),
  medicalCardExpiry: parseDate(row?.medical_card_expiry),
  endorsements:
    (row?.endorsements?.filter((e): e is 'H' | 'P' | 'T' | 'N' | 'S' | 'X' =>
      ['H', 'P', 'T', 'N', 'S', 'X'].includes(e),
    ) as DriverCredentialsValues['endorsements']) ?? [],
  hazmatExpiry: parseDate(row?.hazmat_expiry),
  hasTwic: row?.has_twic === true ? 'yes' : row?.has_twic === false ? 'no' : undefined,
  twicExpiry: parseDate(row?.twic_expiry),
  emergencyContactName: row?.emergency_contact_name ?? '',
  emergencyContactPhone: row?.emergency_contact_phone ?? '',
  emergencyContactRelationship: row?.emergency_contact_relationship ?? '',
  fastCardPassportExpiry: parseDate(row?.fast_card_passport_expiry),
  dodClearanceLevel:
    row?.dod_clearance_level === 'Interim Secret' ||
    row?.dod_clearance_level === 'Secret'
      ? row.dod_clearance_level
      : 'None',
  landstarOperatorId: row?.landstar_operator_id ?? '',
});

export const DriverCredentialsStep = forwardRef<DriverCredentialsStepHandle, Props>(
  function DriverCredentialsStep({ defaultValues, onValidityChange }, ref) {
    const form = useForm<DriverCredentialsValues>({
      resolver: zodResolver(schema),
      mode: 'onChange',
      defaultValues: {
        licenseNumber: '',
        phoneNumber: '',
        endorsements: [],
        emergencyContactName: '',
        emergencyContactPhone: '',
        emergencyContactRelationship: '',
        dodClearanceLevel: 'None',
        landstarOperatorId: '',
        ...defaultValues,
      },
    });

    const hasTwic = form.watch('hasTwic');
    const watchedEndorsements = form.watch('endorsements');
    const showHazmatExpiry =
      watchedEndorsements?.includes('H') || watchedEndorsements?.includes('X');
    const isValid = form.formState.isValid;

    useEffect(() => {
      onValidityChange?.(isValid);
    }, [isValid, onValidityChange]);

    useImperativeHandle(ref, () => ({
      isValid: form.formState.isValid,
      submit: async () => {
        const ok = await form.trigger();
        if (!ok) return null;
        const v = form.getValues();
        return {
          license_number: v.licenseNumber.trim(),
          phone: v.phoneNumber?.trim() ? v.phoneNumber.trim() : null,
          license_expiry: format(v.licenseExpiry, 'yyyy-MM-dd'),
          medical_card_expiry: format(v.medicalCardExpiry, 'yyyy-MM-dd'),
          endorsements: v.endorsements,
          hazmat_expiry:
            (v.endorsements.includes('H') || v.endorsements.includes('X')) && v.hazmatExpiry
              ? format(v.hazmatExpiry, 'yyyy-MM-dd')
              : null,
          has_twic: v.hasTwic === 'yes',
          twic_expiry:
            v.hasTwic === 'yes' && v.twicExpiry ? format(v.twicExpiry, 'yyyy-MM-dd') : null,
          emergency_contact_name: v.emergencyContactName.trim(),
          emergency_contact_phone: v.emergencyContactPhone.trim(),
          emergency_contact_relationship: v.emergencyContactRelationship.trim(),
          fast_card_passport_expiry: v.fastCardPassportExpiry
            ? format(v.fastCardPassportExpiry, 'yyyy-MM-dd')
            : null,
          dod_clearance_level: v.dodClearanceLevel ?? 'None',
          landstar_operator_id: v.landstarOperatorId?.trim() ? v.landstarOperatorId.trim() : null,
        };
      },
    }));

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <IdCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Driver Profile & Credentials</h3>
            <p className="text-sm text-muted-foreground">
              Provide your CDL, medical card, and TWIC details to continue.
            </p>
          </div>
        </div>

        <Form {...form}>
          <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
            <FormField
              control={form.control}
              name="licenseNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>License Number *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. D1234567"
                      autoComplete="off"
                      className="pl-4 sm:pl-3"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="e.g. (555) 123-4567"
                      className="pl-4 sm:pl-3"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
              <h4 className="font-medium text-sm">Emergency Contact</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="emergencyContactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input className="pl-4 sm:pl-3" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergencyContactRelationship"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Relationship *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Spouse"
                          className="pl-4 sm:pl-3"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emergencyContactPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone *</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          inputMode="tel"
                          placeholder="(555) 123-4567"
                          className="pl-4 sm:pl-3"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>


            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="licenseExpiry"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>License Expiry Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'h-12 w-full justify-start pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground',
                            )}
                          >
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(d) => d < today()}
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
                name="medicalCardExpiry"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>DOT Medical Card Expiry *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'h-12 w-full justify-start pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground',
                            )}
                          >
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(d) => d < today()}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="endorsements"
              render={() => (
                <FormItem>
                  <FormLabel>Endorsements</FormLabel>
                  <FormDescription>Select all that apply to your CDL.</FormDescription>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {ENDORSEMENT_OPTIONS.map((opt) => (
                      <FormField
                        key={opt.value}
                        control={form.control}
                        name="endorsements"
                        render={({ field }) => {
                          const checked = field.value?.includes(opt.value);
                          return (
                            <FormItem className="flex flex-row items-center gap-3 rounded-md border border-border p-3">
                              <FormControl>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(c) => {
                                    const next = new Set(field.value ?? []);
                                    if (c) next.add(opt.value);
                                    else next.delete(opt.value);
                                    field.onChange(Array.from(next));
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="!mt-0 cursor-pointer text-sm font-normal">
                                {opt.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showHazmatExpiry && (
              <FormField
                control={form.control}
                name="hazmatExpiry"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>HAZMAT Certification Expiration Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'h-12 w-full justify-start pl-3 text-left font-normal sm:w-[280px]',
                              !field.value && 'text-muted-foreground',
                            )}
                          >
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(d) => d < today()}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}


            <FormField
              control={form.control}
              name="hasTwic"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Do you have a TWIC Card? *</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-4"
                    >
                      <FormItem className="flex flex-1 items-center gap-3 rounded-md border border-border p-3">
                        <FormControl>
                          <RadioGroupItem value="yes" id="twic-yes" />
                        </FormControl>
                        <FormLabel htmlFor="twic-yes" className="!mt-0 cursor-pointer font-normal">
                          Yes
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex flex-1 items-center gap-3 rounded-md border border-border p-3">
                        <FormControl>
                          <RadioGroupItem value="no" id="twic-no" />
                        </FormControl>
                        <FormLabel htmlFor="twic-no" className="!mt-0 cursor-pointer font-normal">
                          No
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hasTwic === 'yes' && (
              <FormField
                control={form.control}
                name="twicExpiry"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>TWIC Card Expiration Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'h-12 w-full justify-start pl-3 text-left font-normal sm:w-[280px]',
                              !field.value && 'text-muted-foreground',
                            )}
                          >
                            {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(d) => d < today()}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
              <h4 className="font-medium text-sm">Border & Security Credentials</h4>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="fastCardPassportExpiry"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>FAST Card / Passport Expiry</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                'h-12 w-full justify-start pl-3 text-left font-normal',
                                !field.value && 'text-muted-foreground',
                              )}
                            >
                              {field.value ? format(field.value, 'PPP') : <span>Pick a date</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            initialFocus
                            className={cn('p-3 pointer-events-auto')}
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>Optional</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dodClearanceLevel"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>DoD Security Clearance</FormLabel>
                      <Select
                        value={field.value ?? 'None'}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="h-12">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          <SelectItem value="Interim Secret">Interim Secret</SelectItem>
                          <SelectItem value="Secret">Secret</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="landstarOperatorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Landstar Operator ID</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 123456"
                      className="pl-4 sm:pl-3"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>Optional — leave blank if not yet assigned.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </div>
    );
  },
);
