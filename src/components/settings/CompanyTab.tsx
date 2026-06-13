import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
import { Building2, Landmark, Banknote } from 'lucide-react';

export function CompanyTab() {
  const { orgId, orgName, refreshOrgData, isDemoMode } = useAuth();
  const { tmsMode, isLandstar, isIndependent } = useOrganizationMode();
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

  // DOT/MC state for independent mode
  const [dotNumber, setDotNumber] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [isSavingAuthority, setIsSavingAuthority] = useState(false);

  const { data: orgDetails } = useQuery({
    queryKey: ['org-details', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('dot_number, mc_number, factoring_enabled, factoring_fee_percentage, factoring_provider_name, factoring_remit_address')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId && isIndependent,
  });

  // Factoring state
  const [factoringEnabled, setFactoringEnabled] = useState(false);
  const [factoringFee, setFactoringFee] = useState('');
  const [factoringProvider, setFactoringProvider] = useState('');
  const [factoringRemitAddress, setFactoringRemitAddress] = useState('');
  const [isSavingFactoring, setIsSavingFactoring] = useState(false);

  useEffect(() => {
    if (orgDetails) {
      setDotNumber(orgDetails.dot_number || '');
      setMcNumber(orgDetails.mc_number || '');
      setFactoringEnabled(orgDetails.factoring_enabled || false);
      setFactoringFee(orgDetails.factoring_fee_percentage?.toString() || '');
      setFactoringProvider(orgDetails.factoring_provider_name || '');
      setFactoringRemitAddress(orgDetails.factoring_remit_address || '');
    }
  }, [orgDetails]);

  const handleSaveFactoring = async () => {
    if (!orgId) return;
    setIsSavingFactoring(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          factoring_enabled: factoringEnabled,
          factoring_fee_percentage: factoringFee ? parseFloat(factoringFee) : null,
          factoring_provider_name: factoringProvider.trim() || null,
          factoring_remit_address: factoringRemitAddress.trim() || null,
        } as any)
        .eq('id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['org-details', orgId] });
      toast.success('Factoring settings saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save factoring settings');
    } finally {
      setIsSavingFactoring(false);
    }
  };

  const handleSaveAuthority = async () => {
    if (!orgId) return;
    setIsSavingAuthority(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ dot_number: dotNumber.trim() || null, mc_number: mcNumber.trim() || null })
        .eq('id', orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['org-details', orgId] });
      toast.success('Authority details updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update authority details');
    } finally {
      setIsSavingAuthority(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* TMS Mode Badge */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            TMS Mode
          </CardTitle>
          <CardDescription>Your organization's operating mode</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant={isLandstar ? 'default' : 'secondary'} className="text-sm px-3 py-1">
            {isLandstar ? 'Landstar BCO' : 'Independent Owner-Operator'}
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">
            {isLandstar
              ? 'Operating under Landstar\'s authority. DOT/MC numbers are managed by Landstar.'
              : 'Operating under your own DOT/MC authority.'}
          </p>
        </CardContent>
      </Card>

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

          {isIndependent && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>DOT Number</Label>
                  <Input
                    value={dotNumber}
                    onChange={(e) => setDotNumber(e.target.value)}
                    placeholder="1234567"
                    disabled={isDemoMode}
                  />
                </div>
                <div className="space-y-2">
                  <Label>MC Number</Label>
                  <Input
                    value={mcNumber}
                    onChange={(e) => setMcNumber(e.target.value)}
                    placeholder="MC-123456"
                    disabled={isDemoMode}
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveAuthority}
                disabled={isSavingAuthority || isDemoMode}
                className="gradient-gold text-primary-foreground"
              >
                {isSavingAuthority ? 'Saving...' : 'Save Authority Details'}
              </Button>
            </>
          )}

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

      {/* Factoring Settings - Independent Only */}
      {isIndependent && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              Factoring Settings
            </CardTitle>
            <CardDescription>Configure invoice factoring for faster payments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Factoring</Label>
                <p className="text-xs text-muted-foreground">Submit invoices to a factoring company for quick funding</p>
              </div>
              <Switch
                checked={factoringEnabled}
                onCheckedChange={setFactoringEnabled}
                disabled={isDemoMode}
              />
            </div>

            {factoringEnabled && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Factoring Company Name</Label>
                    <Input
                      value={factoringProvider}
                      onChange={(e) => setFactoringProvider(e.target.value)}
                      placeholder="e.g. RTS Financial, OTR Solutions"
                      disabled={isDemoMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Factoring Fee %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={factoringFee}
                      onChange={(e) => setFactoringFee(e.target.value)}
                      placeholder="e.g. 3.0"
                      disabled={isDemoMode}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notice of Assignment / Remit To Address</Label>
                  <Textarea
                    value={factoringRemitAddress}
                    onChange={(e) => setFactoringRemitAddress(e.target.value)}
                    placeholder="This text will appear on all generated invoices..."
                    rows={3}
                    disabled={isDemoMode}
                  />
                  <p className="text-xs text-muted-foreground">
                    This notice will be appended to all invoices when factoring is enabled.
                  </p>
                </div>
              </>
            )}

            <Button
              onClick={handleSaveFactoring}
              disabled={isSavingFactoring || isDemoMode}
              className="gradient-gold text-primary-foreground"
            >
              {isSavingFactoring ? 'Saving...' : 'Save Factoring Settings'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
