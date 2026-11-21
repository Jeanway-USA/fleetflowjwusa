import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { LANDSTAR_WEEK_END_DAY, toWeekDay, weekdayName, weekStartsOnFor, type WeekDay } from '@/lib/settlement-week';

export const SETTLEMENT_WEEK_KEY = 'settlement-week-end-day';

export interface SettlementWeekSetting {
  /** The day the settlement week ends on (0 = Sunday ... 6 = Saturday). Wednesday until a company chooses otherwise. */
  endDay: WeekDay;
  /** The day it starts on: the day after it ends. Pass this to settlementWeek() and date-fns weekStartsOn. */
  startsOn: WeekDay;
  endName: string;
  startName: string;
  /** True until the saved value has loaded. Queries that depend on the week should wait for it. */
  loading: boolean;
  /** False when the database does not have the setting yet; every company then keeps the Landstar week. */
  available: boolean;
  isDefault: boolean;
}

/**
 * The company's settlement week, from Settings, Company. One place reads it, so every weekly view in the app agrees.
 * An unset, unreadable or out-of-range value is the Landstar week (ends Wednesday, starts Thursday), and a company whose
 * database has not been updated yet simply keeps that week.
 */
export function useSettlementWeekSetting(): SettlementWeekSetting {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: [SETTLEMENT_WEEK_KEY, orgId],
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<{ value: unknown; available: boolean }> => {
      const { data: row, error } = await (supabase as any).from('organizations').select('settlement_week_end_day').eq('id', orgId).maybeSingle();
      if (error) return { value: null, available: false };
      return { value: row?.settlement_week_end_day ?? null, available: true };
    },
  });
  return useMemo(() => {
    const endDay = toWeekDay(data?.value);
    const startsOn = weekStartsOnFor(endDay);
    return {
      endDay, startsOn, endName: weekdayName(endDay), startName: weekdayName(startsOn),
      loading: !!orgId && isLoading, available: data?.available ?? false, isDefault: endDay === LANDSTAR_WEEK_END_DAY,
    };
  }, [data, isLoading, orgId]);
}
