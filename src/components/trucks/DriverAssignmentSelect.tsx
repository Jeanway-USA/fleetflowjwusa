import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export type DriverComplianceCheck = {
  driverId: string;
  compliant: boolean;
  reasons: string[];
};

type DriverRow = {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  license_expiry: string | null;
  medical_card_expiry: string | null;
  credentials_review_status: string | null;
};

const isFutureDate = (iso: string | null): boolean => {
  if (!iso) return false;
  return new Date(iso + 'T00:00:00').getTime() > Date.now();
};

export function evaluateDriverCompliance(d: DriverRow): DriverComplianceCheck {
  const reasons: string[] = [];
  if (d.status !== 'active') reasons.push('Not active');
  if (!isFutureDate(d.license_expiry)) reasons.push('CDL expired/missing');
  if (!isFutureDate(d.medical_card_expiry)) reasons.push('Medical card expired/missing');
  if (d.credentials_review_status !== 'approved') reasons.push('Compliance docs not approved');
  return { driverId: d.id, compliant: reasons.length === 0, reasons };
}

interface Props {
  value: string | null | undefined;
  onChange: (driverId: string | null) => void;
  onComplianceChange?: (check: DriverComplianceCheck | null) => void;
}

export function DriverAssignmentSelect({ value, onChange, onComplianceChange }: Props) {
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-with-compliance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, status, license_expiry, medical_card_expiry, credentials_review_status')
        .order('first_name');
      if (error) throw error;
      return (data ?? []) as DriverRow[];
    },
  });

  const complianceMap = useMemo(() => {
    const m = new Map<string, DriverComplianceCheck>();
    drivers.forEach((d) => m.set(d.id, evaluateDriverCompliance(d)));
    return m;
  }, [drivers]);

  const selectedCheck = value ? complianceMap.get(value) ?? null : null;

  const handleChange = (v: string) => {
    const next = v === 'none' ? null : v;
    onChange(next);
    onComplianceChange?.(next ? complianceMap.get(next) ?? null : null);
  };

  return (
    <div className="space-y-2">
      <Select value={value || 'none'} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a driver" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No driver assigned</SelectItem>
          {drivers.map((d) => {
            const check = complianceMap.get(d.id);
            return (
              <SelectItem key={d.id} value={d.id}>
                <span className="flex items-center gap-2">
                  {d.first_name} {d.last_name}
                  {check?.compliant ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" />
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {selectedCheck && !selectedCheck.compliant && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 p-2 text-xs space-y-1">
          <div className="flex items-center gap-1 font-medium text-yellow-700 dark:text-yellow-500">
            <AlertTriangle className="h-3.5 w-3.5" /> Compliance blocks this assignment:
          </div>
          <ul className="list-disc pl-5 text-muted-foreground">
            {selectedCheck.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {selectedCheck?.compliant && (
        <p className="text-xs text-green-700 dark:text-green-500 flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> CDL, medical card, and compliance docs are current.
        </p>
      )}
    </div>
  );
}
