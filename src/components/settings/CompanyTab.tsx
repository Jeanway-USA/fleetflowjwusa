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
import { Building2, Banknote } from 'lucide-react';
import { ORG_DISPLAY_KEY, useOrgDisplaySettings } from '@/hooks/useOrgDisplaySettings';
import { DATE_FORMATS, formatOrgDate, timezoneOptions, toDateFormat, toTimezone } from '@/lib/display-settings';
import { todayLocal } from '@/lib/datetime';

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

  // Time zone and date format
  const display = useOrgDisplaySettings();
  const [timezone, setTimezone] = useState<string>(display.timezone);
  const [dateFormat, setDateFormat] = useState<string>(display.dateFormat);
  const [isSavingRegional, setIsSavingRegional] = useState(false);
  useEffect(() => { setTimezone(display.timezone); }, [display.timezone]);
  useEffect(() => { setDateFormat(display.dateFormat); }, [display.dateFormat]);
  const regionalChanged = timezone !== display.timezone || (display.dateFormatAvailable && dateFormat !== display.dateFormat);

  const handleSaveRegional = async () => {
    if (!orgId) return;
    setIsSavingRegional(true);
    try {
      // The date format is only written when the database has the column, so the time zone can still be saved before the update.
      const update: { company_timezone: string; date_format?: string } = { company_timezone: toTimezone(timezone) };
      if (display.dateFormatAvailable) update.date_format = toDateFormat(dateFormat);
      const { error } = await supabase.from('organizations').update(update).eq('id', orgId);
      if (error) throw error;
      await refreshOrgData();
      // Dates and times all over the app read these, so refresh everything that is on screen.
      await queryClient.invalidateQueries({ queryKey: [ORG_DISPLAY_KEY] });
      await queryClient.invalidateQueries();
      toast.success('Time zone and date format saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save time zone and date format');
    } finally {
      setIsSavingRegional(false);
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="company-timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone} disabled={isSavingRegional}>
                <SelectTrigger id="company-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions(display.timezone).map((z) => (
                    <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Default zone for company-level dates and when a stop has no timezone.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-date-format">Date Format</Label>
              <Select value={dateFormat} onValueChange={setDateFormat} disabled={isSavingRegional || !display.dateFormatAvailable}>
                <SelectTrigger id="company-date-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How dates appear in lists, settlements, and reports. Today would read {formatOrgDate(todayLocal(), toDateFormat(dateFormat))}.
              </p>
              {!display.dateFormatAvailable && (
                <p className="text-xs text-warning">The date format is not switched on yet. The database update for it has not been applied.</p>
              )}
            </div>
          </div>
          <Button
            onClick={handleSaveRegional}
            disabled={isSavingRegional || !regionalChanged}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isSavingRegional ? 'Saving...' : 'Save Time Zone & Date Format'}
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
