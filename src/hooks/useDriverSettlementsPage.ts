import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SettlementRow {
  id: string;
  period_start: string;
  period_end: string;
  payment_date: string | null;
  gross_pay: number;
  deductions: number;
  reimbursements: number;
  escrow_credited_amount: number;
  net_pay: number | null;
  status: string;
  org_id: string;
  driver_id: string;
  ytd_gross: number;
  ytd_net: number;
  ytd_deductions: number;
  ytd_reimbursements: number;
}

export interface SettlementItem {
  id: string;
  item_type: string;
  amount: number;
  description: string | null;
  is_escrow: boolean;
  load_id: string | null;
}

export interface PeriodLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string | null;
  destination: string | null;
  rate: number | null;
  booked_miles: number | null;
  actual_miles: number | null;
  delivery_date: string | null;
  pickup_date: string | null;
  status: string | null;
}

export interface PeriodAccessorial {
  id: string;
  accessorial_type: string;
  amount: number;
  load_id: string;
}

const SETTLEMENT_KEYS_BUCKETS = {
  fuelAdvance: /fuel\s*card|fuel\s*adv|comdata|efs|wex/i,
  trailer: /trailer/i,
  escrow: /escrow|maint(enance)?\s*reserve/i,
  insurance: /insur|bobtail|occ.?acc/i,
  agency: /agency|brokerage|truck\s*split|company\s*split|dispatch\s*fee/i,
};

export function bucketDeduction(desc: string | null) {
  const s = (desc ?? '').trim();
  if (SETTLEMENT_KEYS_BUCKETS.fuelAdvance.test(s)) return 'fuel_advance' as const;
  if (SETTLEMENT_KEYS_BUCKETS.trailer.test(s)) return 'trailer' as const;
  if (SETTLEMENT_KEYS_BUCKETS.escrow.test(s)) return 'escrow' as const;
  if (SETTLEMENT_KEYS_BUCKETS.insurance.test(s)) return 'insurance' as const;
  if (SETTLEMENT_KEYS_BUCKETS.agency.test(s)) return 'agency' as const;
  return 'other' as const;
}

const FSC_RE = /fsc|fuel\s*surcharge/i;
const DETENTION_RE = /detention|lumper|stop\s*pay|wait/i;

export function useDriverIdForUser() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['driver-page/driver-id', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, pay_type, pay_rate')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 15 * 60 * 1000,
  });
}

export function useDriverSettlementsList(driverId: string | null | undefined) {
  return useQuery({
    queryKey: ['driver-page/settlements', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlements')
        .select(
          'id, period_start, period_end, payment_date, gross_pay, deductions, reimbursements, escrow_credited_amount, net_pay, status, org_id, driver_id, ytd_gross, ytd_net, ytd_deductions, ytd_reimbursements',
        )
        .eq('driver_id', driverId!)
        .is('deleted_at', null)
        .order('period_end', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SettlementRow[];
    },
    enabled: !!driverId,
  });
}

export function useSettlementDetail(settlement: SettlementRow | null) {
  return useQuery({
    queryKey: ['driver-page/settlement-detail', settlement?.id],
    queryFn: async () => {
      if (!settlement) return null;
      const [itemsRes, loadsRes] = await Promise.all([
        supabase
          .from('driver_settlement_items')
          .select('id, item_type, amount, description, is_escrow, load_id')
          .eq('settlement_id', settlement.id),
        supabase
          .from('fleet_loads')
          .select(
            'id, landstar_load_id, origin, destination, rate, booked_miles, actual_miles, delivery_date, pickup_date, status, load_accessorials(id, accessorial_type, amount, load_id)',
          )
          .eq('driver_id', settlement.driver_id)
          .eq('status', 'delivered')
          .gte('delivery_date', settlement.period_start)
          .lte('delivery_date', settlement.period_end),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (loadsRes.error) throw loadsRes.error;
      const loads = (loadsRes.data ?? []) as Array<
        PeriodLoad & { load_accessorials: PeriodAccessorial[] | null }
      >;
      const accessorials: PeriodAccessorial[] = loads.flatMap(
        (l) => l.load_accessorials ?? [],
      );
      return {
        items: (itemsRes.data ?? []) as SettlementItem[],
        loads: loads.map(({ load_accessorials, ...l }) => l) as PeriodLoad[],
        accessorials,
      };
    },
    enabled: !!settlement,
  });
}

/**
 * Sum of booked miles per settlement period for the History list.
 * Single batched query keyed off all settlement ids.
 */
export function usePerSettlementMiles(
  driverId: string | null | undefined,
  settlements: SettlementRow[],
) {
  const periods = useMemo(
    () =>
      settlements.map((s) => ({
        id: s.id,
        start: s.period_start,
        end: s.period_end,
      })),
    [settlements],
  );

  return useQuery({
    queryKey: ['driver-page/per-settlement-miles', driverId, periods.map((p) => p.id)],
    queryFn: async () => {
      if (!driverId || periods.length === 0) return {} as Record<string, number>;
      const min = periods.reduce((m, p) => (p.start < m ? p.start : m), periods[0].start);
      const max = periods.reduce((m, p) => (p.end > m ? p.end : m), periods[0].end);
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('booked_miles, actual_miles, delivery_date')
        .eq('driver_id', driverId)
        .eq('status', 'delivered')
        .gte('delivery_date', min)
        .lte('delivery_date', max);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const p of periods) {
        out[p.id] = (data ?? [])
          .filter(
            (l: any) =>
              l.delivery_date && l.delivery_date >= p.start && l.delivery_date <= p.end,
          )
          .reduce(
            (s: number, l: any) => s + Number(l.booked_miles ?? l.actual_miles ?? 0),
            0,
          );
      }
      return out;
    },
    enabled: !!driverId && periods.length > 0,
  });
}

export function useYtdSnapshot(driverId: string | null | undefined) {
  return useQuery({
    queryKey: ['driver-page/ytd', driverId, new Date().getFullYear()],
    queryFn: async () => {
      const year = new Date().getFullYear();
      const startOfYear = `${year}-01-01`;
      const endOfYear = `${year}-12-31`;
      const [settleRes, loadsRes] = await Promise.all([
        supabase
          .from('driver_settlements')
          .select('gross_pay, net_pay, deductions')
          .eq('driver_id', driverId!)
          .gte('period_start', startOfYear)
          .lte('period_end', endOfYear),
        supabase
          .from('fleet_loads')
          .select('booked_miles, actual_miles, delivery_date')
          .eq('driver_id', driverId!)
          .eq('status', 'delivered')
          .gte('delivery_date', startOfYear)
          .lte('delivery_date', endOfYear),
      ]);
      if (settleRes.error) throw settleRes.error;
      if (loadsRes.error) throw loadsRes.error;
      const grossYtd = (settleRes.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.gross_pay ?? 0),
        0,
      );
      const netYtd = (settleRes.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.net_pay ?? 0),
        0,
      );
      const milesYtd = (loadsRes.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.booked_miles ?? r.actual_miles ?? 0),
        0,
      );
      return { grossYtd, netYtd, milesYtd };
    },
    enabled: !!driverId,
  });
}

/** Realtime refresh: when admin generates/approves a settlement, refetch list & YTD. */
export function useSettlementsRealtimeRefresh(driverId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!driverId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`driver-settlements-page:${driverId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'driver_settlements',
            filter: `driver_id=eq.${driverId}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ['driver-page/settlements', driverId] });
            qc.invalidateQueries({ queryKey: ['driver-page/ytd', driverId] });
          },
        )
        .subscribe();
    } catch {
      // realtime is optional
    }
    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }
    };
  }, [driverId, qc]);
}

export { FSC_RE, DETENTION_RE };

export function netSettlement(s: SettlementRow): number {
  if (s.net_pay != null) return Number(s.net_pay);
  return (
    Number(s.gross_pay ?? 0) -
    Number(s.deductions ?? 0) +
    Number(s.reimbursements ?? 0) +
    Number(s.escrow_credited_amount ?? 0)
  );
}
