import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Building2, CalendarRange } from 'lucide-react';
import { SETTLEMENT_WEEK_KEY, useSettlementWeekSetting } from '@/hooks/useSettlementWeekSetting';
import { LANDSTAR_WEEK_END_DAY, toWeekDay, WEEKDAY_NAMES, weekdayName, weekStartsOnFor } from '@/lib/settlement-week';
import { ORG_DISPLAY_KEY, useOrgDisplaySettings } from '@/hooks/useOrgDisplaySettings';
import { DATE_FORMATS, formatOrgDate, timezoneOptions, toDateFormat, toTimezone } from '@/lib/display-settings';
import { todayLocal } from '@/lib/datetime';

export function CompanyTab() {
  const { orgId, orgName, refreshOrgData } = useAuth();
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
            <Badge variant="default">Landstar BCO</Badge>
            <span>Operating under Landstar's authority, so DOT and MC numbers are managed by Landstar.</span>
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
    </div>
  );
}
