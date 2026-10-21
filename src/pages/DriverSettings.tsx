import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

import { DBtn, Note, Panel, PanelHead, Row } from '@/components/driver/ui/driver-ui';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sun, Moon, Loader2 } from 'lucide-react';
import { formatPayRate, payTypeLabel } from '@/lib/pay-format';


const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 pb-6">
      <div className="px-1 pt-1">
        <h1 className="text-2xl font-semibold leading-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your look, your goals, and your details.</p>
      </div>
      {children}
    </div>
  );
}

export default function DriverSettings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  
  const [weeklyMilesGoal, setWeeklyMilesGoal] = useState(2500);
  const [weeklyRevenueGoal, setWeeklyRevenueGoal] = useState(2000);
  const [payWeekStartDay, setPayWeekStartDay] = useState(0);
  const [goalType, setGoalType] = useState<'financial' | 'mileage'>('financial');
  const [targetMiles, setTargetMiles] = useState<number>(2500);

  // Fetch driver profile
  const { data: driver, isLoading: driverLoading } = useQuery({
    queryKey: ['driver-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch driver settings (goals only - credentials handled separately)
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['driver-settings', driver?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('driver_settings_safe' as any) as any)
        .select('weekly_miles_goal, weekly_revenue_goal, pay_week_start_day, goal_type, target_miles')
        .eq('driver_id', driver?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  const isFlatRate = driver?.pay_type === 'flat';

  // Update local state when settings load
  useEffect(() => {
    if (settings) {
      setWeeklyMilesGoal(settings.weekly_miles_goal || 2500);
      setWeeklyRevenueGoal(settings.weekly_revenue_goal || 2000);
      setPayWeekStartDay(settings.pay_week_start_day ?? 0);
      const loadedGoalType = (settings.goal_type as 'financial' | 'mileage') || 'financial';
      setGoalType(isFlatRate ? 'mileage' : loadedGoalType);
      setTargetMiles(settings.target_miles ?? settings.weekly_miles_goal ?? 2500);
    }
  }, [settings, isFlatRate]);

  // Save goals mutation (direct DB update - no sensitive data)
  const saveGoalsMutation = useMutation({
    mutationFn: async (data: {
      weekly_miles_goal: number;
      weekly_revenue_goal: number;
      pay_week_start_day: number;
      goal_type: 'financial' | 'mileage';
      target_miles: number;
    }) => {
      if (!driver?.id) throw new Error('Driver not found');
      if (!driver?.org_id) throw new Error('Driver organization not found');

      const { data: existing } = await (supabase.from('driver_settings_safe' as any) as any)
        .select('id')
        .eq('driver_id', driver.id)
        .maybeSingle();

      if (existing) {
        const { error } = await (supabase.from('driver_settings' as any) as any)
          .update({
            weekly_miles_goal: data.weekly_miles_goal,
            weekly_revenue_goal: data.weekly_revenue_goal,
            pay_week_start_day: data.pay_week_start_day,
            goal_type: data.goal_type,
            target_miles: data.target_miles,
            org_id: driver.org_id,
          })
          .eq('driver_id', driver.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('driver_settings' as any) as any)
          .insert({
            driver_id: driver.id,
            org_id: driver.org_id,
            weekly_miles_goal: data.weekly_miles_goal,
            weekly_revenue_goal: data.weekly_revenue_goal,
            pay_week_start_day: data.pay_week_start_day,
            goal_type: data.goal_type,
            target_miles: data.target_miles,
          });
        if (error) throw error;
      }

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-settings'] });
      toast.success('Goals saved successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save goals');
    },
  });

  const handleSaveGoals = () => {
    const effectiveGoalType: 'financial' | 'mileage' = isFlatRate ? 'mileage' : goalType;
    saveGoalsMutation.mutate({
      weekly_miles_goal: isFlatRate ? targetMiles : weeklyMilesGoal,
      weekly_revenue_goal: weeklyRevenueGoal,
      pay_week_start_day: payWeekStartDay,
      goal_type: effectiveGoalType,
      target_miles: targetMiles,
    });
  };

  const isLoading = driverLoading || settingsLoading;

  if (isLoading) {
    return (
      <Page>
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </Page>
    );
  }

  if (!driver) {
    return (
      <Page>
        <Panel><Note>Driver profile not found. Contact an administrator.</Note></Panel>
      </Page>
    );
  }

  const field = 'h-12 text-base';

  return (
    <Page>
      <Panel>
        <PanelHead title="Appearance" aside="Light or dark" />
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          {([
            { value: 'light', label: 'Light', icon: <Sun /> },
            { value: 'dark', label: 'Dark', icon: <Moon /> },
          ] as const).map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={theme === o.value}
              onClick={() => setTheme(o.value)}
              className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-6 ${theme === o.value ? 'border-carbon bg-carbon/20 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-secondary'}`}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Weekly goals" aside="Shown on your home screen" />
        <div className="space-y-5 px-4 pb-4">
          {isFlatRate ? (
            <div className="space-y-2">
              <Label htmlFor="targetMiles">Weekly mileage target</Label>
              <div className="flex items-center gap-2">
                <Input id="targetMiles" type="number" inputMode="numeric" value={targetMiles} onChange={(e) => setTargetMiles(parseInt(e.target.value) || 0)} min={0} step={100} className={field} />
                <span className="text-sm text-muted-foreground">miles</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {targetMiles > 0
                  ? `Steady weekly progress to your ${targetMiles.toLocaleString()} mile target climbs you to the next safety-bonus tier.`
                  : 'Steady weekly progress climbs you to the next safety-bonus tier.'}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Main goal</Label>
                <Select value={goalType} onValueChange={(val) => setGoalType(val as 'financial' | 'mileage')}>
                  <SelectTrigger className={field}><SelectValue placeholder="Select goal type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="financial">Money earned</SelectItem>
                    <SelectItem value="mileage">Miles driven</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">This is the goal the progress bar on your home screen follows.</p>
              </div>

              {goalType === 'mileage' ? (
                <div className="space-y-2">
                  <Label htmlFor="targetMiles">Weekly mileage target</Label>
                  <div className="flex items-center gap-2">
                    <Input id="targetMiles" type="number" inputMode="numeric" value={targetMiles} onChange={(e) => setTargetMiles(parseInt(e.target.value) || 0)} min={0} step={100} className={field} />
                    <span className="text-sm text-muted-foreground">miles</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="revenueGoal">Weekly earnings goal</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-base text-muted-foreground">$</span>
                    <Input id="revenueGoal" type="number" inputMode="numeric" value={weeklyRevenueGoal} onChange={(e) => setWeeklyRevenueGoal(parseInt(e.target.value) || 0)} min={0} step={100} className={field} />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label>Pay week starts on (your scan day)</Label>
            <Select value={String(payWeekStartDay)} onValueChange={(val) => setPayWeekStartDay(Number(val))}>
              <SelectTrigger className={field}><SelectValue placeholder="Select scan day" /></SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((d) => <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Set this to your Landstar scan day so your weekly progress matches your settlement cycle.</p>
          </div>

          <DBtn tone="primary" size="lg" className="w-full" onClick={handleSaveGoals} disabled={saveGoalsMutation.isPending}>
            {saveGoalsMutation.isPending ? <><Loader2 className="animate-spin" /> Saving</> : 'Save goals'}
          </DBtn>
        </div>
      </Panel>

      <Panel>
        <PanelHead title="Your details" aside="Ask the office to change these" />
        <Row label="Name">{driver.first_name} {driver.last_name}</Row>
        <Row label="Email">{driver.email || user?.email || '-'}</Row>
        <Row label="Phone">{driver.phone || '-'}</Row>
        <Row label="Pay rate">{formatPayRate(driver.pay_type, driver.pay_rate)}</Row>
      </Panel>
    </Page>
  );
}
