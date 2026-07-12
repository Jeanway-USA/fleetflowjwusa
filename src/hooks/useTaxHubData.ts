import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface W2Row {
  driver_id: string;
  first_name: string | null;
  last_name: string | null;
  tax_state: string | null;
  wages_box1: number;
  fit_box2: number;
  ss_wages_box3: number;
  ss_tax_box4: number;
  medicare_wages_box5: number;
  medicare_tax_box6: number;
  state_wages_box16: number;
  state_tax_box17: number;
  has_w4: boolean;
  has_state_tax: boolean;
  has_i9: boolean;
  i9_address: string | null;
  i9_full_name: string | null;
}


export interface Row1099 {
  driver_id: string;
  first_name: string | null;
  last_name: string | null;
  tax_state: string | null;
  legal_name: string | null;
  business_name: string | null;
  tin_last4: string | null;
  address: string | null;
  nonemployee_comp_box1: number;
  fed_tax_withheld_box4: number;
  state_tax_withheld_box5: number;
}

export function useW2Totals(year: number) {
  const { orgId } = useAuth();
  return useQuery<W2Row[]>({
    queryKey: ['w2_totals', orgId, year],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_w2_totals' as never, { _year: year } as never);
      if (error) throw error;
      return ((data as unknown) as W2Row[]) ?? [];
    },
  });
}

export function use1099Totals(year: number) {
  const { orgId } = useAuth();
  return useQuery<Row1099[]>({
    queryKey: ['1099_totals', orgId, year],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_1099_totals' as never, { _year: year } as never);
      if (error) throw error;
      return ((data as unknown) as Row1099[]) ?? [];
    },
  });
}

export interface EmployerInfo {
  name: string | null;
  ein: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export function useEmployerInfo() {
  const { orgId } = useAuth();
  return useQuery<EmployerInfo>({
    queryKey: ['employer_info', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('name, ein, business_address_line1, business_address_line2, business_city, business_state, business_zip' as never)
        .eq('id', orgId!)
        .maybeSingle();
      if (error) throw error;
      const r = (data ?? {}) as any;
      return {
        name: r.name ?? null,
        ein: r.ein ?? null,
        address_line1: r.business_address_line1 ?? null,
        address_line2: r.business_address_line2 ?? null,
        city: r.business_city ?? null,
        state: r.business_state ?? null,
        zip: r.business_zip ?? null,
      };
    },
  });
}
