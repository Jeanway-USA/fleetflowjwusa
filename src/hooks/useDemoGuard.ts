import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useDemoGuard() {
  const { isDemoMode } = useAuth();

  const guard = (action?: string) => {
    if (isDemoMode) {
      toast.info(
        action
          ? `${action} is disabled in demo mode`
          : 'This action is disabled in demo mode',
      );
      return true; // blocked
    }
    return false; // allowed
  };

  return { isDemoMode, guard };
}
