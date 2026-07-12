import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/** Full 9-digit SSN. Only owner + payroll_admin can decrypt (RPC enforces). */
export function useDriverSsn(driverId: string | null | undefined) {
  const { isOwner, hasRole } = useAuth();
  const canView = isOwner || hasRole('payroll_admin');
  return useQuery({
    queryKey: ['driver-ssn', driverId],
    enabled: canView && !!driverId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_driver_ssn' as never, {
        _driver_id: driverId,
      } as never);
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

export interface DecryptedTin {
  tin: string | null;
  tin_type: string | null;
  legal_name: string | null;
  business_name: string | null;
}

/** Full TIN (SSN or EIN) from the driver's W-9. Owner + payroll_admin only. */
export function useDriverTin(driverId: string | null | undefined) {
  const { isOwner, hasRole } = useAuth();
  const canView = isOwner || hasRole('payroll_admin');
  return useQuery({
    queryKey: ['driver-tin', driverId],
    enabled: canView && !!driverId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_driver_tin' as never, {
        _driver_id: driverId,
      } as never);
      if (error) throw error;
      const row = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
      return (row as DecryptedTin | null);
    },
  });
}

export interface DecryptedBanking {
  bank_name: string | null;
  account_type: string | null;
  routing_number: string | null;
  account_number: string | null;
  account_number_last4: string | null;
}

/** Full bank routing + account. Owner + payroll_admin only. */
export function useDriverBankingFull(driverId: string | null | undefined) {
  const { isOwner, hasRole } = useAuth();
  const canView = isOwner || hasRole('payroll_admin');
  return useQuery({
    queryKey: ['driver-banking-full', driverId],
    enabled: canView && !!driverId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_driver_banking', {
        _driver_id: driverId as string,
      });
      if (error) throw error;
      const row = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
      return (row as DecryptedBanking | null);
    },
  });
}

/** Format a raw 9-digit SSN as XXX-XX-XXXX. */
export function formatSsn(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length !== 9) return raw ?? '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** Format a raw TIN based on its type: EIN as XX-XXXXXXX, SSN as XXX-XX-XXXX. */
export function formatTin(raw: string | null | undefined, tinType: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length !== 9) return raw ?? '';
  if ((tinType ?? '').toLowerCase() === 'ein') {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
