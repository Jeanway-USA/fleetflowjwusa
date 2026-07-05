import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { CalendarIcon, CalendarClock, CheckCircle2, Loader2, Users } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import {
  assignEmployeePaySchedule,
  createPaySchedule,
  type GustoPaySchedule,
  type PayScheduleFrequency,
} from '@/services/gustoCompanyApi';
import { cn } from '@/lib/utils';

import { RequiredLabel, RequiredLegend } from './setup/RequiredLabel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const FREQUENCIES: PayScheduleFrequency[] = [
  'Every week',
  'Every other week',
  'Twice per month',
  'Monthly',
];

const scheduleSchema = z
  .object({
    frequency: z.enum([
      'Every week',
      'Every other week',
      'Twice per month',
      'Monthly',
    ]),
    anchorPayDate: z.date({ required_error: 'Anchor pay date is required' }),
    anchorEndOfPayPeriod: z.date({
      required_error: 'Anchor end of pay period is required',
    }),
    customName: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.anchorEndOfPayPeriod <= v.anchorPayDate, {
    message: 'End of pay period must be on or before anchor pay date',
    path: ['anchorEndOfPayPeriod'],
  });

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

interface SyncedDriverRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  gusto_employee_id: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PayScheduleManager() {
  const qc = useQueryClient();
  const [schedules, setSchedules] = useState<GustoPaySchedule[]>([]);
  const [activeScheduleUuid, setActiveScheduleUuid] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [assigned, setAssigned] = useState<Record<string, boolean>>({});
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      frequency: 'Every other week',
      customName: '',
    },
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ['pay-schedule-manager', 'synced-w2-drivers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, gusto_employee_id, employment_type')
        .eq('employment_type', 'w2_company')
        .not('gusto_employee_id', 'is', null)
        .order('last_name');
      if (error) throw error;
      return (data ?? []) as SyncedDriverRow[];
    },
  });

  const activeSchedule = useMemo(
    () => schedules.find((s) => s.uuid === activeScheduleUuid) ?? null,
    [schedules, activeScheduleUuid],
  );

  const onSubmit = async (values: ScheduleFormValues) => {
    const res = await createPaySchedule({
      frequency: values.frequency,
      anchorPayDate: values.anchorPayDate,
      anchorEndOfPayPeriod: values.anchorEndOfPayPeriod,
      customName: values.customName,
    });
    if (!res.ok || !res.data?.gusto) {
      toast.error('Failed to create pay schedule', {
        description: res.error ?? 'Please try again.',
      });
      return;
    }
    const created = res.data.gusto;
    setSchedules((prev) => [created, ...prev.filter((s) => s.uuid !== created.uuid)]);
    setActiveScheduleUuid(created.uuid);
    toast.success('Pay schedule created', { description: 'Synced to Gusto.' });
    qc.invalidateQueries({ queryKey: ['gusto-onboarding-steps'] });
    form.reset({
      frequency: values.frequency,
      customName: '',
      anchorPayDate: undefined as unknown as Date,
      anchorEndOfPayPeriod: undefined as unknown as Date,
    });
  };

  const assignOne = async (driver: SyncedDriverRow, scheduleUuid: string) => {
    setRowLoading((p) => ({ ...p, [driver.id]: true }));
    try {
      const res = await assignEmployeePaySchedule({
        employeeUuid: driver.gusto_employee_id,
        payScheduleUuid: scheduleUuid,
      });
      if (!res.ok) return { ok: false as const, error: res.error };
      setAssigned((p) => ({ ...p, [driver.id]: true }));
      return { ok: true as const };
    } finally {
      setRowLoading((p) => ({ ...p, [driver.id]: false }));
    }
  };

  const handleAssignRow = async (driver: SyncedDriverRow) => {
    if (!activeScheduleUuid) return;
    const res = await assignOne(driver, activeScheduleUuid);
    if (res.ok) {
      toast.success(`Assigned ${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim());
    } else {
      toast.error('Assignment failed', { description: res.error ?? 'Please try again.' });
    }
  };

  const runBulk = async (targets: SyncedDriverRow[]) => {
    if (!activeScheduleUuid || targets.length === 0) return;
    setBulkLoading(true);
    let ok = 0;
    let fail = 0;
    for (const d of targets) {
      // eslint-disable-next-line no-await-in-loop
      const res = await assignOne(d, activeScheduleUuid);
      if (res.ok) ok += 1;
      else fail += 1;
    }
    setBulkLoading(false);
    if (fail === 0) {
      toast.success(`Assigned ${ok} driver${ok === 1 ? '' : 's'} to pay schedule`);
    } else {
      toast.warning(`Assigned ${ok}, failed ${fail}`, {
        description: 'Retry the failed rows individually.',
      });
    }
  };

  const selectedDrivers = drivers.filter((d) => selected[d.id]);
  const allSelected = drivers.length > 0 && selectedDrivers.length === drivers.length;

  const hasSchedule = !!activeScheduleUuid;

  return (
    <TooltipProvider>
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-primary" />
            Pay Schedule Manager
          </CardTitle>
          <CardDescription>
            Create a company pay schedule and assign it to your synced W-2 drivers to clear the
            required-pay-schedule blockers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* ------------------------------- Form ------------------------------ */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <RequiredLabel>Frequency</RequiredLabel>
                      </FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {FREQUENCIES.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
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
                  name="customName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom name (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Drivers biweekly" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="anchorPayDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        <RequiredLabel>Anchor pay date</RequiredLabel>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
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
                  name="anchorEndOfPayPeriod"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        <RequiredLabel>Anchor end of pay period</RequiredLabel>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
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

              <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <RequiredLegend />
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create pay schedule
                </Button>
              </div>
            </form>
          </Form>

          {/* --------------------------- Recent schedules --------------------- */}
          {schedules.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Active:</span>
              {schedules.map((s) => {
                const isActive = s.uuid === activeScheduleUuid;
                return (
                  <button
                    key={s.uuid}
                    type="button"
                    onClick={() => setActiveScheduleUuid(s.uuid)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      isActive
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {s.custom_name || s.frequency}
                    <span className="ml-2 text-[10px] uppercase tracking-wide opacity-70">
                      {s.frequency}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ---------------------------- Driver list ------------------------- */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Synced W-2 drivers</h3>
                <Badge variant="secondary">{drivers.length}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!hasSchedule || selectedDrivers.length === 0 || bulkLoading}
                        onClick={() => runBulk(selectedDrivers)}
                      >
                        {bulkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Assign selected ({selectedDrivers.length})
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasSchedule && (
                    <TooltipContent>Create a pay schedule first.</TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!hasSchedule || drivers.length === 0 || bulkLoading}
                        onClick={() => runBulk(drivers)}
                      >
                        {bulkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Assign all synced
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!hasSchedule && (
                    <TooltipContent>Create a pay schedule first.</TooltipContent>
                  )}
                </Tooltip>
              </div>
            </div>

            {driversLoading ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading drivers…
              </div>
            ) : drivers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  No synced W-2 drivers yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground/80">
                  Sync employees on the Payroll dashboard first, then return here to assign them
                  to a pay schedule.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const next: Record<string, boolean> = {};
                              drivers.forEach((d) => (next[d.id] = true));
                              setSelected(next);
                            } else {
                              setSelected({});
                            }
                          }}
                          aria-label="Select all drivers"
                        />
                      </TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead className="hidden md:table-cell">Gusto employee ID</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drivers.map((d) => {
                      const isAssigned = !!assigned[d.id];
                      const isLoading = !!rowLoading[d.id];
                      return (
                        <TableRow key={d.id}>
                          <TableCell>
                            <Checkbox
                              checked={!!selected[d.id]}
                              onCheckedChange={(checked) =>
                                setSelected((p) => ({ ...p, [d.id]: !!checked }))
                              }
                              aria-label={`Select ${d.first_name ?? ''} ${d.last_name ?? ''}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {`${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || 'Unnamed'}
                          </TableCell>
                          <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                            {d.gusto_employee_id}
                          </TableCell>
                          <TableCell className="text-right">
                            {isAssigned ? (
                              <Badge variant="secondary" className="gap-1">
                                <CheckCircle2 className="h-3 w-3 text-primary" /> Assigned
                              </Badge>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={!hasSchedule || isLoading}
                                      onClick={() => handleAssignRow(d)}
                                    >
                                      {isLoading && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      )}
                                      Assign
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                {!hasSchedule && (
                                  <TooltipContent>Create a pay schedule first.</TooltipContent>
                                )}
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {activeSchedule && (
              <p className="text-xs text-muted-foreground">
                Assignments target{' '}
                <span className="font-medium text-foreground">
                  {activeSchedule.custom_name || activeSchedule.frequency}
                </span>{' '}
                ({activeSchedule.frequency}).
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
