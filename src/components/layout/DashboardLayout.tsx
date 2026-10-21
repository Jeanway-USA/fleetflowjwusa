import { ReactNode, useEffect, useRef, useCallback } from 'react';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { MobileTabBar } from './MobileTabBar';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { DemoControls } from '@/components/demo/DemoControls';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ProductTour } from '@/components/shared/ProductTour';
import { useProductTour } from '@/hooks/useProductTour';
import { getTourForRoute } from '@/lib/tour-steps';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isDemoMode, signOut } = useAuth();

  return (
    <SidebarProvider>
      <DashboardLayoutInner isDemoMode={isDemoMode} signOut={signOut}>
        {children}
      </DashboardLayoutInner>
    </SidebarProvider>
  );
}

function DashboardLayoutInner({ children, isDemoMode, signOut }: {
  children: ReactNode;
  isDemoMode: boolean;
  signOut: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const location = useLocation();
  const tourDef = getTourForRoute(location.pathname);
  const tour = useProductTour({ tourId: tourDef?.id || 'none', totalSteps: tourDef?.steps.length || 0 });
  const { user } = useAuth();
  const autoStartedRef = useRef(false);

  // Persist tour completion server-side so it doesn't re-trigger on other devices.
  const persistTourCompletion = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('profiles')
      .update({ has_completed_onboarding_tour: true } as any)
      .eq('user_id', user.id);
  }, [user]);

  const handleTourSkip = useCallback(() => {
    tour.skipTour();
    void persistTourCompletion();
  }, [tour, persistTourCompletion]);

  const handleTourNext = useCallback(() => {
    const isLast = tour.currentStep >= (tourDef?.steps.length ?? 0) - 1;
    tour.nextStep();
    if (isLast) void persistTourCompletion();
  }, [tour, tourDef, persistTourCompletion]);

  // The guided tour starts on its own only right after a new driver finishes
  // onboarding. Everyone else can replay it from the user menu.
  useEffect(() => {
    if (autoStartedRef.current || !tourDef || tour.isActive) return;

    const stateSaysStart = (location.state as any)?.startTour === true;
    let pendingFlag = false;
    try { pendingFlag = localStorage.getItem('pending_driver_tour') === '1'; } catch { /* ignore */ }
    if (!stateSaysStart && !pendingFlag) return;

    autoStartedRef.current = true;
    tour.resetTour();
    tour.startTour();
    try { localStorage.removeItem('pending_driver_tour'); } catch { /* ignore */ }
    if (stateSaysStart) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [tourDef, tour, location.state, location.pathname, navigate]);

  // Keyboard shortcut: Ctrl/Cmd + B to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSidebar]);

  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-screen min-w-0">
        {isDemoMode && (
          <div className="bg-accent/20 border-b border-accent/40 px-4 py-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Demo mode with sample data</span>
            </div>
            <Button
              size="sm"
              className="h-8"
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
            >
              Exit demo
            </Button>
          </div>
        )}
        <TopBar onReplayTour={() => tour.startTour()} hasTour={!!tourDef} />

        <div className="flex-1 px-3 pt-4 pb-tabbar sm:px-4 md:pb-6 lg:px-6 lg:pt-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
      <MobileTabBar />
      {isDemoMode && <DemoControls />}
      <CommandPalette />
      {tourDef && (
        <ProductTour
          steps={tourDef.steps}
          currentStep={tour.currentStep}
          isActive={tour.isActive}
          onNext={handleTourNext}
          onPrev={tour.prevStep}
          onSkip={handleTourSkip}
        />
      )}
    </div>
  );
}
