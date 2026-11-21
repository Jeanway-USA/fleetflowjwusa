import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatOrgDate, toDateFormat, toTimezone, type DateFormatPattern } from '@/lib/display-settings';

export const ORG_DISPLAY_KEY = 'org-display-settings';

export interface OrgDisplaySettings {
  /** The company's IANA time zone (Central until chosen). */
  timezone: string;
  /** The company's date format, a date-fns pattern (US style until chosen). */
  dateFormat: DateFormatPattern;
  /** False when the database does not have the date format column yet; the format then stays US style. */
  dateFormatAvailable: boolean;
  loading: boolean;
  /** An ISO date written in the company's format. */
  formatDate: (date: string | Date | null | undefined) => string;
}

/**
 * The company's time zone and date format, from Settings, Company. One place reads them. If the date format column is missing
 * (the database update has not been applied), the time zone is still read and the format is the default.
 */
export function useOrgDisplaySettings(): OrgDisplaySettings {
  const { orgId } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: [ORG_DISPLAY_KEY, orgId],
    enabled: !!orgId,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<{ timezone: unknown; dateFormat: unknown; dateFormatAvailable: boolean }> => {
      const both = await supabase.from('organizations').select('company_timezone, date_format').eq('id', orgId as string).maybeSingle();
      if (!both.error) return { timezone: both.data?.company_timezone, dateFormat: both.data?.date_format, dateFormatAvailable: true };
      const zoneOnly = await supabase.from('organizations').select('company_timezone').eq('id', orgId as string).maybeSingle();
      return { timezone: zoneOnly.data?.company_timezone, dateFormat: null, dateFormatAvailable: false };
    },
  });
  return useMemo(() => {
    const dateFormat = toDateFormat(data?.dateFormat);
    return {
      timezone: toTimezone(data?.timezone),
      dateFormat,
      dateFormatAvailable: data?.dateFormatAvailable ?? false,
      loading: !!orgId && isLoading,
      formatDate: (date) => formatOrgDate(date, dateFormat),
    };
  }, [data, isLoading, orgId]);
}
