import { useAuth } from '@/contexts/AuthContext';

/**
 * This deployment is JeanWay USA's Landstar BCO operation only. The mode is fixed: whatever the organization row says (tms_mode is
 * kept in the database because other code still reads it), the app always behaves as Landstar and never offers an independent
 * owner-operator experience. Kept as a thin shim so existing call sites keep working.
 */
export type TmsMode = 'landstar';

export function useOrganizationMode() {
  const { orgLoading } = useAuth();
  return {
    tmsMode: 'landstar' as TmsMode,
    isLandstar: true as const,
    isIndependent: false as const,
    isLoading: orgLoading,
  };
}
