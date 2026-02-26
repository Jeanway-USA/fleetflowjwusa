import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Calculator, RefreshCw } from 'lucide-react';
import { calculateRevenue, type RevenueSettings } from '@/lib/revenue-calculator';

interface CompensationSettingsTabProps {
  getSetting: (key: string, defaultValue?: string) => string;
}

export function CompensationSettingsTab({ getSetting }: CompensationSettingsTabProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [recalculating, setRecalculating] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from('company_settings')
        .update({ setting_value: value })
        .eq('setting_key', key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_settings'] });
      toast.success('Settings updated');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const startEdit = () => {
    setForm({
      gross_percentage: getSetting('gross_percentage', '100'),
      truck_percentage: getSetting('truck_percentage', '65'),
      trailer_percentage: getSetting('trailer_percentage', '7'),
      power_only_percentage: getSetting('power_only_percentage', '5'),
      advance_percentage: getSetting('advance_percentage', '30'),
      owns_trailer: getSetting('owns_trailer', 'false'),
    });
    setEditing(true);
  };

  const handleSave = () => {
    Object.entries(form).forEach(([key, value]) => {
      if (value !== getSetting(key)) {
        updateMutation.mutate({ key, value: String(value) });
      }
    });
    setEditing(false);
  };

  const handleRecalculateAll = async () => {
    setRecalculating(true);
    try {
      const settings: RevenueSettings = {
        truckPct: parseFloat(getSetting('truck_percentage', '65')) / 100,
        trailerPct: parseFloat(getSetting('trailer_percentage', '7')) / 100,
        advancePct: parseFloat(getSetting('advance_percentage', '30')) / 100,
        ownsTrailer: getSetting('owns_trailer', 'false') === 'true',
      };

      // Fetch all loads
      const { data: loads, error: loadsError } = await supabase
        .from('fleet_loads')
        .select('*');
      if (loadsError) throw loadsError;
      if (!loads || loads.length === 0) {
        toast.info('No loads to recalculate');
        return;
      }

      // Fetch all accessorials
      const { data: allAccessorials, error: accError } = await supabase
        .from('load_accessorials')
        .select('*');
      if (accError) throw accError;

      let updated = 0;
      for (const load of loads) {
        const loadAccs = (allAccessorials || []).filter((a: any) => a.load_id === load.id);
        const accessorialsTotal = loadAccs.reduce(
          (sum: number, acc: any) => sum + ((acc.amount || 0) * ((acc.percentage || 0) / 100)),
          0
        );

        const result = calculateRevenue(
          {
            rate: load.rate || 0,
            fuel_surcharge: load.fuel_surcharge || 0,
            lumper: load.lumper || 0,
            advance_taken: load.advance_taken || 0,
            is_power_only: load.is_power_only || false,
            start_miles: load.start_miles,
            end_miles: load.end_miles,
            accessorialsTotal,
          },
          settings
        );

        const { error: updateError } = await supabase
          .from('fleet_loads')
          .update({
            gross_revenue: result.gross_revenue,
            truck_revenue: result.truck_revenue,
            trailer_revenue: result.trailer_revenue,
            net_revenue: result.net_revenue,
            settlement: result.settlement,
            advance_available: result.advance_available,
            actual_miles: result.actual_miles,
            accessorials: result.accessorials,
          })
          .eq('id', load.id);

        if (!updateError) updated++;
      }

      toast.success(`Recalculated ${updated} of ${loads.length} loads`);
      queryClient.invalidateQueries({ queryKey: ['fleet_loads'] });
    } catch (err: any) {
      toast.error(`Recalculation failed: ${err.message}`);
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Compensation Package
          </CardTitle>
          <CardDescription>Configure your revenue split percentages and advance rates</CardDescription>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Gross Percentage (%)</Label>
                  <Input type="number" value={form.gross_percentage || ''} onChange={(e) => setForm({ ...form, gross_percentage: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Truck Percentage</Label>
                  <Input type="number" value={form.truck_percentage || ''} onChange={(e) => setForm({ ...form, truck_percentage: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Trailer Percentage</Label>
                  <Input type="number" value={form.trailer_percentage || ''} onChange={(e) => setForm({ ...form, trailer_percentage: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Power Only Percentage</Label>
                  <Input type="number" value={form.power_only_percentage || ''} onChange={(e) => setForm({ ...form, power_only_percentage: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Advance Percentage</Label>
                  <Input type="number" value={form.advance_percentage || ''} onChange={(e) => setForm({ ...form, advance_percentage: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Owns Trailer</Label>
                  <Select value={form.owns_trailer || 'false'} onValueChange={(v) => setForm({ ...form, owns_trailer: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} className="gradient-gold text-primary-foreground">Save Changes</Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Gross Percentage</p>
                  <p className="text-2xl font-bold">{getSetting('gross_percentage', '100')}%</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Truck Percentage</p>
                  <p className="text-2xl font-bold">{getSetting('truck_percentage', '65')}%</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Trailer Percentage</p>
                  <p className="text-2xl font-bold">{getSetting('trailer_percentage', '7')}%</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Power Only</p>
                  <p className="text-2xl font-bold">{getSetting('power_only_percentage', '5')}%</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Advance Rate</p>
                  <p className="text-2xl font-bold">{getSetting('advance_percentage', '30')}%</p>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">Owns Trailer</p>
                  <p className="text-2xl font-bold">{getSetting('owns_trailer', 'false') === 'true' ? 'Yes' : 'No'}</p>
                </div>
              </div>
              <Button onClick={startEdit} variant="outline">Edit Settings</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-elevated border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Recalculate All Loads
          </CardTitle>
          <CardDescription>
            Re-run the current compensation formula on every existing load. Use this after changing your percentages to update all stored revenue values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleRecalculateAll}
            disabled={recalculating}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculating...' : 'Recalculate All Loads'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
