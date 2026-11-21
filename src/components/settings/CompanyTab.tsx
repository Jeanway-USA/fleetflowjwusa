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
import { Building2, Banknote, CalendarRange } from 'lucide-react';
import { SETTLEMENT_WEEK_KEY, useSettlementWeekSetting } from '@/hooks/useSettlementWeekSetting';
import { LANDSTAR_WEEK_END_DAY, toWeekDay, WEEKDAY_NAMES, weekdayName, weekStartsOnFor } from '@/lib/settlement-week';

export function CompanyTab() {
  const { orgId, orgName, refreshOrgData } = useAuth();
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

  // Settlement week
  const weekSetting = useSettlementWeekSetting();
  const [weekEndDay, setWeekEndDay] = useState<string>(String(LANDSTAR_WEEK_END_DAY));
  const [isSavingWeek, setIsSavingWeek] = useState(false);
  useEffect(() => { setWeekEndDay(String(weekSetting.endDay)); }, [weekSetting.endDay]);

  const handleSaveWeek = async () => {
    if (!orgId) return;
    const day = toWeekDay(weekEndDay);
    setIsSavingWeek(true);
    try {
      const { error } = await (supabase as any).from('organizations').update({ settlement_week_end_day: day }).eq('id', orgId);
      if (error) throw error;
      // Every weekly view works from this one value, so refresh them all.
      await queryClient.invalidateQueries({ queryKey: [SETTLEMENT_WEEK_KEY] });
      await queryClient.invalidateQueries();
      toast.success(`Settlement week now runs ${weekdayName(weekStartsOnFor(day))} to ${weekdayName(day)}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save the settlement week');
    } finally {
      setIsSavingWeek(false);
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
      <Card className="bg-card border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Company Information
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            Your company details.
            <Badge variant={isLandstar ? 'default' : 'secondary'}>{isLandstar ? 'Landstar BCO' : 'Independent owner-operator'}</Badge>
            <span>{isLandstar ? "Operating under Landstar's authority, so DOT and MC numbers are managed by Landstar." : 'Operating under your own DOT and MC authority.'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <div className="flex gap-2">
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company Name"
              />
              <Button
                onClick={handleSaveName}
                disabled={isSavingName || companyName.trim() === orgName}
                className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
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
                  />
                </div>
                <div className="space-y-2">
                  <Label>MC Number</Label>
                  <Input
                    value={mcNumber}
                    onChange={(e) => setMcNumber(e.target.value)}
                    placeholder="MC-123456"
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveAuthority}
                disabled={isSavingAuthority}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
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

      {/* Settlement week */}
      <Card className="bg-card border border-border rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-primary" />
            Settlement Week
          </CardTitle>
          <CardDescription>The seven-day week your settlements and weekly numbers are counted in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="settlement-week-end">Settlement week ends on</Label>
            <Select value={weekEndDay} onValueChange={setWeekEndDay} disabled={!weekSetting.available || isSavingWeek}>
              <SelectTrigger id="settlement-week-end">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_NAMES.map((name, i) => (
                  <SelectItem key={name} value={String(i)}>{name}{i === LANDSTAR_WEEK_END_DAY ? ' (Landstar)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Today the week runs {weekSetting.startName} to {weekSetting.endName}.
              {weekEndDay !== String(weekSetting.endDay) && <> It will run {weekdayName(weekStartsOnFor(toWeekDay(weekEndDay)))} to {weekdayName(toWeekDay(weekEndDay))} once you save.</>}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Controls the weekly settlement periods, pay runs for drivers, the logbook columns, the weekly P&amp;L and revenue views, and the week Landstar
            statements are checked against. Landstar BCOs use Wednesday, so only change this if your settlements end on a different day. Settlements
            you already saved are not changed.
          </p>
          {!weekSetting.available && (
            <p className="text-xs text-warning">This setting is not switched on yet. The database update for it has not been applied.</p>
          )}
          <Button
            onClick={handleSaveWeek}
            disabled={isSavingWeek || !weekSetting.available || weekEndDay === String(weekSetting.endDay)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSavingWeek ? 'Saving...' : 'Save Settlement Week'}
          </Button>
        </CardContent>
      </Card>

      {/* Factoring Settings - Independent Only */}
      {isIndependent && (
        <Card className="bg-card border border-border rounded-lg">
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
                  />
                  <p className="text-xs text-muted-foreground">
                    This notice will be appended to all invoices when factoring is enabled.
                  </p>
                </div>
              </>
            )}

            <Button
              onClick={handleSaveFactoring}
              disabled={isSavingFactoring}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSavingFactoring ? 'Saving...' : 'Save Factoring Settings'}
            </Button>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
