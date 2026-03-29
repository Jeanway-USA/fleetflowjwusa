import { useAuth } from '@/contexts/AuthContext';

export type TmsMode = 'landstar' | 'independent';

export function useOrganizationMode() {
  const { tmsMode, orgLoading } = useAuth();
  return {
    tmsMode: (tmsMode || 'landstar') as TmsMode,
    isLandstar: (tmsMode || 'landstar') === 'landstar',
    isIndependent: tmsMode === 'independent',
    isLoading: orgLoading,
  };
}
