import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { SaveBar } from '@/components/settings/SaveBar';

export function InBondFeeCard() {
  const { orgId } = useAuth();
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

  const saved = typeof data === 'string' ? data : '100';
  const dirty = fee.trim() !== saved.trim();

  const handleSave = async () => {
    if (!orgId) return;
    const n = parseFloat(fee);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Enter a fee of zero or more');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert({ org_id: orgId, setting_key: 'in_bond_fee', setting_value: String(n) }, { onConflict: 'org_id,setting_key' });
      if (error) throw error;
      toast.success('In-bond fee saved');
      await qc.invalidateQueries({ queryKey: ['company_settings'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save the in-bond fee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          In-bond (Landstar Rule 480)
        </CardTitle>
        <CardDescription>
          A flat fee added as a Company accessorial (not driver pay) whenever a load is flagged in-bond or international and a CF 7512 number is on file.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="max-w-xs space-y-1.5 px-6 pb-4">
              <Label htmlFor="in_bond_fee">Default fee ($)</Label>
              <Input id="in_bond_fee" type="number" inputMode="decimal" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} className="h-10 tabular-nums" />
            </div>
            <SaveBar changes={dirty ? 1 : 0} saving={saving} onSave={handleSave} onDiscard={() => setFee(saved)} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
