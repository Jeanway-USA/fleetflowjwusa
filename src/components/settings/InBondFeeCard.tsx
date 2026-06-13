import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export function InBondFeeCard() {
  const { orgId, isDemoMode } = useAuth();
  const qc = useQueryClient();
  const [fee, setFee] = useState<string>('100');
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['company_settings', orgId, 'in_bond_fee'],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('setting_value')
        .eq('setting_key', 'in_bond_fee')
        .maybeSingle();
      if (error) throw error;
      return data?.setting_value ?? '100';
    },
  });

  useEffect(() => {
    if (typeof data === 'string') setFee(data);
  }, [data]);

  const handleSave = async () => {
    if (isDemoMode || !orgId) return;
    const n = parseFloat(fee);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Enter a valid non-negative fee');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert(
          { org_id: orgId, setting_key: 'in_bond_fee', setting_value: String(n) },
          { onConflict: 'org_id,setting_key' }
        );
      if (error) throw error;
      toast.success('In-Bond fee saved');
      qc.invalidateQueries({ queryKey: ['company_settings'] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save In-Bond fee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          In-Bond (Landstar Rule 480)
        </CardTitle>
        <CardDescription>
          Flat fee added as a <strong>Company</strong> accessorial (not driver pay) whenever a load is flagged
          In-Bond / international and a CF 7512 number is on file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="in_bond_fee">Default Fee ($)</Label>
              <Input
                id="in_bond_fee"
                type="number"
                min={0}
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="pl-4 sm:pl-3 h-12"
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={handleSave} disabled={saving || isDemoMode} className="gradient-gold text-primary-foreground">
                {saving ? 'Saving…' : 'Save In-Bond Fee'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
