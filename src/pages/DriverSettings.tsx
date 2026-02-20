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
import { Target, Sun, Moon, DollarSign, Route, Loader2, Fuel, Eye, EyeOff, ShieldCheck, CalendarClock } from 'lucide-react';

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
  const [landstarUsername, setLandstarUsername] = useState('');
  const [landstarPassword, setLandstarPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
      const { data, error } = await (supabase.from('driver_settings' as any) as any)
        .select('weekly_miles_goal, weekly_revenue_goal, pay_week_start_day')
        .eq('driver_id', driver?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  // Fetch credential status via edge function (never returns plaintext password)
  const { data: credentialStatus } = useQuery({
    queryKey: ['landstar-credentials', driver?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-credentials', {
        method: 'GET',
      });
      if (error) throw error;
      return data as { has_credentials: boolean; landstar_username: string };
    },
    enabled: !!driver?.id,
  });

  // Update local state when settings load
  useEffect(() => {
    if (settings) {
      setWeeklyMilesGoal(settings.weekly_miles_goal || 2500);
      setWeeklyRevenueGoal(settings.weekly_revenue_goal || 2000);
      setPayWeekStartDay(settings.pay_week_start_day ?? 0);
    }
  }, [settings]);

  useEffect(() => {
    if (credentialStatus) {
      setLandstarUsername(credentialStatus.landstar_username || '');
      // Never pre-fill password - it's encrypted server-side
    }
  }, [credentialStatus]);

  // Save goals mutation (direct DB update - no sensitive data)
  const saveGoalsMutation = useMutation({
    mutationFn: async (data: { weekly_miles_goal: number; weekly_revenue_goal: number; pay_week_start_day: number }) => {
      if (!driver?.id) throw new Error('Driver not found');

      const { data: existing } = await (supabase.from('driver_settings' as any) as any)
        .select('id')
        .eq('driver_id', driver.id)
        .maybeSingle();

      if (existing) {
        const { error } = await (supabase.from('driver_settings' as any) as any)
          .update({
            weekly_miles_goal: data.weekly_miles_goal,
            weekly_revenue_goal: data.weekly_revenue_goal,
            pay_week_start_day: data.pay_week_start_day,
          })
          .eq('driver_id', driver.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('driver_settings' as any) as any)
          .insert({
            driver_id: driver.id,
            weekly_miles_goal: data.weekly_miles_goal,
            weekly_revenue_goal: data.weekly_revenue_goal,
            pay_week_start_day: data.pay_week_start_day,
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

  // Save credentials via edge function (encrypted server-side)
  const saveCredentialsMutation = useMutation({
    mutationFn: async (data: { landstar_username: string; landstar_password: string }) => {
      const { data: result, error } = await supabase.functions.invoke('manage-credentials', {
        method: 'POST',
        body: data,
      });
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landstar-credentials'] });
      setLandstarPassword(''); // Clear password field after save
      toast.success('Credentials saved securely');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save credentials');
    },
  });

  const handleSaveGoals = () => {
    saveGoalsMutation.mutate({
      weekly_miles_goal: weeklyMilesGoal,
      weekly_revenue_goal: weeklyRevenueGoal,
      pay_week_start_day: payWeekStartDay,
    });
  };

  const handleSaveCredentials = () => {
    if (!landstarUsername && !landstarPassword) {
      toast.error('Please enter at least a username');
      return;
    }
    saveCredentialsMutation.mutate({
      landstar_username: landstarUsername,
      landstar_password: landstarPassword,
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
                className="flex flex-col gap-2 h-auto py-4"
                onClick={() => setTheme('light')}
              >
                <Sun className="h-5 w-5" />
                <span>Light</span>
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                className="flex flex-col gap-2 h-auto py-4"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="milesGoal" className="flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  Weekly Miles Goal
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="milesGoal"
                    type="number"
                    value={weeklyMilesGoal}
                    onChange={(e) => setWeeklyMilesGoal(parseInt(e.target.value) || 0)}
                    min={0}
                    step={100}
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap">miles</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your target miles to drive each week
                </p>
              </div>

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
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Your target earnings each week
                </p>
              </div>
            </div>

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

        {/* Landstar Portal Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fuel className="h-5 w-5" />
              Landstar Portal
            </CardTitle>
            <CardDescription>
              Enter your LandstarOne credentials to access LCAPP fuel discounts in the trip planner
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {credentialStatus?.has_credentials && (
              <div className="flex items-center gap-2 text-sm text-success bg-success/10 rounded-md px-3 py-2">
                <ShieldCheck className="h-4 w-4" />
                Credentials saved and encrypted
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="landstarUsername">Landstar Username</Label>
                <Input
                  id="landstarUsername"
                  type="text"
                  value={landstarUsername}
                  onChange={(e) => setLandstarUsername(e.target.value)}
                  placeholder="Your LandstarOne username"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="landstarPassword">
                  {credentialStatus?.has_credentials ? 'New Password (leave blank to keep current)' : 'Landstar Password'}
                </Label>
                <div className="relative">
                  <Input
                    id="landstarPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={landstarPassword}
                    onChange={(e) => setLandstarPassword(e.target.value)}
                    placeholder={credentialStatus?.has_credentials ? '••••••••' : 'Your LandstarOne password'}
                    autoComplete="off"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your credentials are encrypted before storage and only decrypted server-side when fetching fuel discounts. They are never sent back to your browser.
            </p>

            <Separator />

            <div className="flex justify-end">
              <Button 
                onClick={handleSaveCredentials} 
                disabled={saveCredentialsMutation.isPending}
                className="gradient-gold text-primary-foreground"
              >
                {saveCredentialsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Encrypting & Saving...
                  </>
                ) : (
                  'Save Credentials'
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
                  {driver.pay_type === 'percentage' 
                    ? `${driver.pay_rate}%` 
                    : `$${driver.pay_rate?.toFixed(2)}/mile`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
