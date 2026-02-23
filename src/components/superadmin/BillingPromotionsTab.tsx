import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, Tag, TrendingUp, Pencil, Plus, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const TIER_LABELS: Record<string, string> = {
  solo_bco: 'Solo BCO',
  fleet_owner: 'Fleet Owner',
  agency: 'Agency',
  all_in_one: 'All-in-One',
};

// --- Schemas ---
const pricingSchema = z.object({
  base_price_monthly: z.coerce.number().min(0, 'Must be >= 0'),
  base_price_annual: z.coerce.number().min(0, 'Must be >= 0'),
});

const promoSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  discount_type: z.enum(['percentage', 'amount']),
  discount_value: z.coerce.number().min(0.01, 'Must be > 0'),
  valid_from: z.string().min(1, 'Required'),
  valid_until: z.string().min(1, 'Required'),
  max_uses: z.coerce.number().int().min(0).optional().or(z.literal('')),
  description: z.string().optional(),
});

type PricingForm = z.infer<typeof pricingSchema>;
type PromoForm = z.infer<typeof promoSchema>;

export function BillingPromotionsTab() {
  const queryClient = useQueryClient();

  // --- Queries ---
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans' as any)
        .select('*')
        .order('base_price_monthly', { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: promos, isLoading: promosLoading } = useQuery({
    queryKey: ['promo-codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promo_codes' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: orgs } = useQuery({
    queryKey: ['super-admin-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('super_admin_organizations' as any)
        .select('*');
      if (error) throw error;
      return data as any[];
    },
  });

  // --- KPI Calculations ---
  const estimatedMRR = (() => {
    if (!orgs || !plans) return 0;
    const priceMap: Record<string, number> = {};
    plans.forEach((p: any) => { priceMap[p.tier] = p.base_price_monthly; });
    return orgs
      .filter((o: any) => o.is_active && !o.is_complimentary)
      .reduce((sum: number, o: any) => sum + (priceMap[o.subscription_tier] || 0), 0);
  })();

  const activePromos = promos?.filter((p: any) => {
    const now = new Date();
    return new Date(p.valid_from) <= now && new Date(p.valid_until) >= now && (!p.max_uses || p.times_used < p.max_uses);
  }).length || 0;

  const totalRedemptions = promos?.reduce((sum: number, p: any) => sum + (p.times_used || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Estimated MRR" value={`$${estimatedMRR.toLocaleString()}`} icon={<TrendingUp className="h-5 w-5" />} loading={plansLoading} />
        <KPICard title="Active Promos" value={String(activePromos)} icon={<Tag className="h-5 w-5" />} loading={promosLoading} />
        <KPICard title="Total Redemptions" value={String(totalRedemptions)} icon={<DollarSign className="h-5 w-5" />} loading={promosLoading} />
      </div>

      {/* Section A: Plan Pricing */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Plan Pricing Management</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plansLoading
            ? [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40 w-full" />)
            : plans?.map((plan: any) => (
                <PlanCard key={plan.id} plan={plan} queryClient={queryClient} />
              ))}
        </div>
      </div>

      {/* Section B: Promo Code Engine */}
      <PromoCodeSection promos={promos || []} loading={promosLoading} queryClient={queryClient} />

      {/* Section C: Global Event Sales */}
      <GlobalEventSection promos={promos || []} queryClient={queryClient} />
    </div>
  );
}

// --- KPI Card ---
function KPICard({ title, value, icon, loading }: { title: string; value: string; icon: React.ReactNode; loading: boolean }) {
  return (
    <Card className="glow-gold">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-primary">{icon}</div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-20" /> : <p className="text-3xl font-bold">{value}</p>}
      </CardContent>
    </Card>
  );
}

// --- Plan Card with Edit Dialog ---
function PlanCard({ plan, queryClient }: { plan: any; queryClient: any }) {
  const [open, setOpen] = useState(false);
  const form = useForm<PricingForm>({
    resolver: zodResolver(pricingSchema),
    defaultValues: {
      base_price_monthly: plan.base_price_monthly,
      base_price_annual: plan.base_price_annual,
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: PricingForm) => {
      const { error } = await supabase
        .from('subscription_plans' as any)
        .update({
          base_price_monthly: values.base_price_monthly,
          base_price_annual: values.base_price_annual,
        } as any)
        .eq('id', plan.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      setOpen(false);
      toast.success('Pricing updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{TIER_LABELS[plan.tier] || plan.tier}</CardTitle>
        <Badge variant={plan.is_active ? 'default' : 'secondary'}>{plan.is_active ? 'Active' : 'Inactive'}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Monthly</span>
          <span className="font-semibold">${plan.base_price_monthly}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Annual</span>
          <span className="font-semibold">${plan.base_price_annual}</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="w-full mt-2">
              <Pencil className="h-3 w-3 mr-1" /> Edit Pricing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit {TIER_LABELS[plan.tier]} Pricing</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((v) => toast.promise(mutation.mutateAsync(v), { loading: 'Saving...', success: 'Saved!', error: 'Failed' }))} className="space-y-4">
              <div>
                <Label>Monthly Price ($)</Label>
                <Input type="number" step="0.01" {...form.register('base_price_monthly')} />
                {form.formState.errors.base_price_monthly && <p className="text-xs text-destructive mt-1">{form.formState.errors.base_price_monthly.message}</p>}
              </div>
              <div>
                <Label>Annual Price ($)</Label>
                <Input type="number" step="0.01" {...form.register('base_price_annual')} />
                {form.formState.errors.base_price_annual && <p className="text-xs text-destructive mt-1">{form.formState.errors.base_price_annual.message}</p>}
              </div>
              <Button type="submit" disabled={mutation.isPending} className="w-full">Save Changes</Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// --- Promo Code Section ---
function PromoCodeSection({ promos, loading, queryClient }: { promos: any[]; loading: boolean; queryClient: any }) {
  const [open, setOpen] = useState(false);
  const form = useForm<PromoForm>({
    resolver: zodResolver(promoSchema),
    defaultValues: {
      code: '',
      discount_type: 'percentage',
      discount_value: 10,
      valid_from: new Date().toISOString().slice(0, 10),
      valid_until: '',
      max_uses: '',
      description: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: PromoForm) => {
      const payload: any = {
        code: values.code.toUpperCase(),
        valid_from: new Date(values.valid_from).toISOString(),
        valid_until: new Date(values.valid_until).toISOString(),
        description: values.description || null,
        max_uses: values.max_uses ? Number(values.max_uses) : null,
        discount_percentage: values.discount_type === 'percentage' ? values.discount_value : null,
        discount_amount: values.discount_type === 'amount' ? values.discount_value : null,
      };
      const { error } = await supabase.from('promo_codes' as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      setOpen(false);
      form.reset();
      toast.success('Promo code created');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const getStatus = (p: any) => {
    const now = new Date();
    if (p.max_uses && p.times_used >= p.max_uses) return 'Exhausted';
    if (new Date(p.valid_until) < now) return 'Expired';
    if (new Date(p.valid_from) > now) return 'Scheduled';
    return 'Active';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Promo Code Engine</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Create Promo Code</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Promo Code</DialogTitle></DialogHeader>
            <form onSubmit={form.handleSubmit((v) => toast.promise(createMutation.mutateAsync(v), { loading: 'Creating...', success: 'Created!', error: 'Failed' }))} className="space-y-4">
              <div>
                <Label>Code</Label>
                <Input placeholder="e.g. FREIGHT20" {...form.register('code')} />
                {form.formState.errors.code && <p className="text-xs text-destructive mt-1">{form.formState.errors.code.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Discount Type</Label>
                  <Select value={form.watch('discount_type')} onValueChange={(v: any) => form.setValue('discount_type', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                      <SelectItem value="amount">Flat Amount ($)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Value</Label>
                  <Input type="number" step="0.01" {...form.register('discount_value')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valid From</Label>
                  <Input type="date" {...form.register('valid_from')} />
                </div>
                <div>
                  <Label>Valid Until</Label>
                  <Input type="date" {...form.register('valid_until')} />
                  {form.formState.errors.valid_until && <p className="text-xs text-destructive mt-1">{form.formState.errors.valid_until.message}</p>}
                </div>
              </div>
              <div>
                <Label>Max Uses (optional)</Label>
                <Input type="number" {...form.register('max_uses')} placeholder="Unlimited" />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Textarea {...form.register('description')} placeholder="Internal note about this promo" />
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full">Create Promo Code</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : promos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No promo codes yet</p>
          ) : (
            <div className="overflow-hidden rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Code</TableHead>
                    <TableHead className="font-semibold">Discount</TableHead>
                    <TableHead className="font-semibold">Valid Dates</TableHead>
                    <TableHead className="font-semibold">Usage</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promos.map((p: any) => {
                    const status = getStatus(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono font-semibold">{p.code}</TableCell>
                        <TableCell>{p.discount_percentage ? `${p.discount_percentage}%` : `$${p.discount_amount}`}</TableCell>
                        <TableCell className="text-xs">
                          {format(new Date(p.valid_from), 'MMM d, yyyy')} — {format(new Date(p.valid_until), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>{p.times_used}{p.max_uses ? ` / ${p.max_uses}` : ''}</TableCell>
                        <TableCell>
                          <Badge variant={status === 'Active' ? 'default' : status === 'Scheduled' ? 'secondary' : 'destructive'}>{status}</Badge>
                        </TableCell>
                        <TableCell>{p.is_global_event && <Badge variant="outline"><Globe className="h-3 w-3 mr-1" />Global</Badge>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Global Event Sales ---
function GlobalEventSection({ promos, queryClient }: { promos: any[]; queryClient: any }) {
  const globalEvent = promos.find((p: any) => p.is_global_event && new Date(p.valid_until) >= new Date());
  const [enabled, setEnabled] = useState(!!globalEvent);
  const [eventName, setEventName] = useState(globalEvent?.description || '');
  const [discount, setDiscount] = useState(globalEvent?.discount_percentage || 20);
  const [validUntil, setValidUntil] = useState(globalEvent ? globalEvent.valid_until.slice(0, 10) : '');

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!enabled) {
        // Deactivate: set valid_until to now for any active global events
        if (globalEvent) {
          const { error } = await supabase
            .from('promo_codes' as any)
            .update({ valid_until: new Date().toISOString() } as any)
            .eq('id', globalEvent.id);
          if (error) throw error;
        }
        return;
      }
      const payload: any = {
        code: 'GLOBAL_EVENT',
        discount_percentage: discount,
        discount_amount: null,
        valid_from: new Date().toISOString(),
        valid_until: new Date(validUntil).toISOString(),
        is_global_event: true,
        description: eventName || 'Site-wide sale',
      };
      if (globalEvent) {
        const { error } = await supabase.from('promo_codes' as any).update(payload as any).eq('id', globalEvent.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('promo_codes' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] });
      toast.success(enabled ? 'Global event saved' : 'Global event deactivated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Global Event Sales</h3>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Site-Wide Discount
              </CardTitle>
              <CardDescription>When active, this discount applies automatically to all new signups</CardDescription>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardHeader>
        {enabled && (
          <CardContent className="space-y-4">
            <div>
              <Label>Event Name</Label>
              <Input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. End of Month Sale" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discount (%)</Label>
                <Input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} />
              </div>
              <div>
                <Label>Valid Until</Label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
              </div>
            </div>
            <Button
              onClick={() => toast.promise(upsertMutation.mutateAsync(), { loading: 'Saving...', success: 'Saved!', error: 'Failed' })}
              disabled={upsertMutation.isPending}
            >
              Save Global Event
            </Button>
            {/* NOTE: The Landing Page (/landing) and Pricing Page (/pricing) should be updated
                to fetch active global events from promo_codes where is_global_event = true
                and display the discount dynamically. */}
          </CardContent>
        )}
        {!enabled && globalEvent && (
          <CardContent>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => toast.promise(upsertMutation.mutateAsync(), { loading: 'Deactivating...', success: 'Deactivated', error: 'Failed' })}
              disabled={upsertMutation.isPending}
            >
              Deactivate Current Event
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
