import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, Trophy } from 'lucide-react';

export function CompanyTab() {
  const { orgId, orgName, refreshOrgData, isDemoMode } = useAuth();
  const queryClient = useQueryClient();

  // Company name
  const [companyName, setCompanyName] = useState(orgName || '');
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (orgName) setCompanyName(orgName);
  }, [orgName]);

  const handleSaveName = async () => {
    if (!companyName.trim() || !orgId) return;
    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name: companyName.trim() })
        .eq('id', orgId);
      if (error) throw error;
      await refreshOrgData();
      toast.success('Company name updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update company name');
    } finally {
      setIsSavingName(false);
    }
  };

  // Monthly bonus goal
  const [bonusGoalMiles, setBonusGoalMiles] = useState('12000');
  const [isSavingBonusGoal, setIsSavingBonusGoal] = useState(false);

  const { data: bonusGoalSetting } = useQuery({
    queryKey: ['company-setting', 'monthly_bonus_miles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('setting_key', 'monthly_bonus_miles')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (bonusGoalSetting?.setting_value) {
      setBonusGoalMiles(bonusGoalSetting.setting_value);
    }
  }, [bonusGoalSetting]);

  const handleSaveBonusGoal = async () => {
    const miles = Number(bonusGoalMiles);
    if (!miles || miles <= 0) {
      toast.error('Please enter a valid number of miles');
      return;
    }
    setIsSavingBonusGoal(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert(
          {
            setting_key: 'monthly_bonus_miles',
            setting_value: String(miles),
            description: 'Monthly miles goal for driver bonus',
            org_id: orgId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'setting_key,org_id' }
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['company-setting', 'monthly_bonus_miles'] });
      toast.success('Bonus goal updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save bonus goal');
    } finally {
      setIsSavingBonusGoal(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Company Information
          </CardTitle>
          <CardDescription>Update your company details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <div className="flex gap-2">
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company Name"
                disabled={isDemoMode}
              />
              <Button
                onClick={handleSaveName}
                disabled={isSavingName || isDemoMode || companyName.trim() === orgName}
                className="gradient-gold text-primary-foreground shrink-0"
              >
                {isSavingName ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select defaultValue="america-chicago">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="america-new_york">Eastern Time (ET)</SelectItem>
                <SelectItem value="america-chicago">Central Time (CT)</SelectItem>
                <SelectItem value="america-denver">Mountain Time (MT)</SelectItem>
                <SelectItem value="america-los_angeles">Pacific Time (PT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date Format</Label>
            <Select defaultValue="mm-dd-yyyy">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mm-dd-yyyy">MM/DD/YYYY</SelectItem>
                <SelectItem value="dd-mm-yyyy">DD/MM/YYYY</SelectItem>
                <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Driver Incentives
          </CardTitle>
          <CardDescription>Configure bonus goals for drivers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bonus-goal-miles">Monthly Bonus Goal (Miles)</Label>
            <Input
              id="bonus-goal-miles"
              type="number"
              min="1000"
              step="500"
              value={bonusGoalMiles}
              onChange={(e) => setBonusGoalMiles(e.target.value)}
              placeholder="12000"
              disabled={isDemoMode}
            />
            <p className="text-xs text-muted-foreground">
              Drivers who reach this mileage goal in a month unlock the $0.05/mile bonus
            </p>
          </div>
          <Button
            onClick={handleSaveBonusGoal}
            disabled={isSavingBonusGoal || isDemoMode}
            className="gradient-gold text-primary-foreground"
          >
            {isSavingBonusGoal ? 'Saving...' : 'Save Goal'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
