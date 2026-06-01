import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Target, Sun, Moon, DollarSign, Route, Loader2, CalendarClock, Flag } from 'lucide-react';
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
      <>
        <PageHeader title="Settings" description="Manage your preferences and goals" />
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </>
    );
  }

  if (!driver) {
    return (
      <>
        <PageHeader title="Settings" description="Manage your preferences and goals" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Driver profile not found. Please contact an administrator.
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Manage your preferences and goals" />
      
      <div className="space-y-6">
        {/* Appearance Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5" />
              Appearance
            </CardTitle>
            <CardDescription>
              Customize how the app looks on your device
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Theme</Label>
                <p className="text-sm text-muted-foreground">
                  Choose between light, dark, or system theme
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                className="flex flex-col items-center justify-center gap-2 h-auto min-h-[72px] px-4 py-4"
                onClick={() => setTheme('light')}
              >
                <Sun className="h-5 w-5" />
                <span>Light</span>
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                className="flex flex-col items-center justify-center gap-2 h-auto min-h-[72px] px-4 py-4"
                onClick={() => setTheme('dark')}
              >
                <Moon className="h-5 w-5" />
                <span>Dark</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Goals Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Weekly Goals
            </CardTitle>
            <CardDescription>
              Set your personal weekly targets to track your progress
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isFlatRate ? (
              <div className="space-y-2">
                <Label htmlFor="targetMiles" className="flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  Weekly Mileage Target
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="targetMiles"
                    type="number"
                    value={targetMiles}
                    onChange={(e) => setTargetMiles(parseInt(e.target.value) || 0)}
                    min={0}
                    step={100}
                    className="w-full sm:w-64"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">miles</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pace yourself to hit 2,500 safe miles per week to ensure you unlock your 10,000-mile monthly safety bonus.
                </p>
              </div>
            ) : (
              <>
                {/* Goal Type */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    Primary Goal Type
                  </Label>
                  <Select value={goalType} onValueChange={(val) => setGoalType(val as 'financial' | 'mileage')}>
                    <SelectTrigger className="w-full sm:w-64">
                      <SelectValue placeholder="Select goal type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financial">Financial (Revenue)</SelectItem>
                      <SelectItem value="mileage">Mileage</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose which goal drives the progress bar on your dashboard.
                  </p>
                </div>

                {goalType === 'mileage' ? (
                  <div className="space-y-2">
                    <Label htmlFor="targetMiles" className="flex items-center gap-2">
                      <Route className="h-4 w-4" />
                      Weekly Mileage Target
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="targetMiles"
                        type="number"
                        value={targetMiles}
                        onChange={(e) => setTargetMiles(parseInt(e.target.value) || 0)}
                        min={0}
                        step={100}
                        className="w-full sm:w-64"
                      />
                      <span className="text-sm text-muted-foreground whitespace-nowrap">miles</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your target miles to drive each week.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="revenueGoal" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Weekly Revenue Goal
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">$</span>
                      <Input
                        id="revenueGoal"
                        type="number"
                        value={weeklyRevenueGoal}
                        onChange={(e) => setWeeklyRevenueGoal(parseInt(e.target.value) || 0)}
                        min={0}
                        step={100}
                        className="w-full sm:w-64"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your target earnings each week.
                    </p>
                  </div>
                )}
              </>
            )}


            {/* Pay Week Start Day */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                Pay Week Start Day (Scan Day)
              </Label>
              <Select
                value={String(payWeekStartDay)}
                onValueChange={(val) => setPayWeekStartDay(Number(val))}
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Select scan day" />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Set this to your Landstar scan day so the weekly progress in the dashboard matches your settlement cycle.
              </p>
            </div>

            <Separator />

            <div className="flex justify-end">
              <Button 
                onClick={handleSaveGoals} 
                disabled={saveGoalsMutation.isPending}
                className="gradient-gold text-primary-foreground"
              >
                {saveGoalsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Goals'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>


        {/* Profile Info (Read-only) */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Your driver profile details (contact admin to update)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-muted-foreground">Name</Label>
                <p className="font-medium">{driver.first_name} {driver.last_name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{driver.email || user?.email || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Phone</Label>
                <p className="font-medium">{driver.phone || '-'}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Pay Rate</Label>
                <p className="font-medium">
                  {formatPayRate(driver.pay_type, driver.pay_rate)}
                </p>

              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
