import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Target, Sun, Moon, DollarSign, Route, Loader2 } from 'lucide-react';

export default function DriverSettings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  
  const [weeklyMilesGoal, setWeeklyMilesGoal] = useState(2500);
  const [weeklyRevenueGoal, setWeeklyRevenueGoal] = useState(2000);

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

  // Fetch driver settings
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['driver-settings', driver?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('driver_settings' as any) as any)
        .select('*')
        .eq('driver_id', driver?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!driver?.id,
  });

  // Update local state when settings load
  useEffect(() => {
    if (settings) {
      setWeeklyMilesGoal(settings.weekly_miles_goal || 2500);
      setWeeklyRevenueGoal(settings.weekly_revenue_goal || 2000);
    }
  }, [settings]);

  // Save settings mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { weekly_miles_goal: number; weekly_revenue_goal: number }) => {
      if (!driver?.id) throw new Error('Driver not found');

      const settingsData = {
        driver_id: driver.id,
        weekly_miles_goal: data.weekly_miles_goal,
        weekly_revenue_goal: data.weekly_revenue_goal,
      };

      if (settings) {
        // Update existing settings
        const { error } = await (supabase.from('driver_settings' as any) as any)
          .update({
            weekly_miles_goal: data.weekly_miles_goal,
            weekly_revenue_goal: data.weekly_revenue_goal,
          })
          .eq('driver_id', driver.id);
        if (error) throw error;
      } else {
        // Insert new settings
        const { error } = await (supabase.from('driver_settings' as any) as any)
          .insert(settingsData);
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
    saveMutation.mutate({
      weekly_miles_goal: weeklyMilesGoal,
      weekly_revenue_goal: weeklyRevenueGoal,
    });
  };

  const isLoading = driverLoading || settingsLoading;

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageHeader title="Settings" description="Manage your preferences and goals" />
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!driver) {
    return (
      <DashboardLayout>
        <PageHeader title="Settings" description="Manage your preferences and goals" />
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Driver profile not found. Please contact an administrator.
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
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

            <Separator />

            <div className="flex justify-end">
              <Button 
                onClick={handleSaveGoals} 
                disabled={saveMutation.isPending}
                className="gradient-gold text-primary-foreground"
              >
                {saveMutation.isPending ? (
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
                  {driver.pay_type === 'percentage' 
                    ? `${driver.pay_rate}%` 
                    : `$${driver.pay_rate?.toFixed(2)}/mile`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
