import { ReactNode, Suspense, lazy, useEffect, useRef, useCallback, useState } from 'react';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { MobileTabBar } from './MobileTabBar';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useProductTour } from '@/hooks/useProductTour';
import { getTourForRoute } from '@/lib/tour-steps';

// The search palette and the guided tour are used occasionally, so they are not part of the first download. The palette
// loads a moment after the page is up (or the instant someone asks for it); the tour only when a tour is running.
const loadCommandPalette = () => import('@/components/shared/CommandPalette').then((m) => ({ default: m.CommandPalette }));
const CommandPalette = lazy(loadCommandPalette);
const ProductTour = lazy(() => import('@/components/shared/ProductTour').then((m) => ({ default: m.ProductTour })));

function DeferredCommandPalette() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const schedule: (cb: () => void) => number =
      typeof window.requestIdleCallback === 'function' ? (cb) => window.requestIdleCallback(cb, { timeout: 4000 }) : (cb) => window.setTimeout(cb, 2500);
    const cancel: (id: number) => void = typeof window.cancelIdleCallback === 'function' ? window.cancelIdleCallback.bind(window) : window.clearTimeout.bind(window);
    const idleId = schedule(() => { void loadCommandPalette().then(() => setReady(true)); });

    // Asked for before it has loaded: load it, then open it.
    const openWhenLoaded = () => {
      if (ready) return;
      void loadCommandPalette().then(() => {
        setReady(true);
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('open-command-palette')), 80);
      });
    };
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openWhenLoaded(); } };
    window.addEventListener('open-command-palette', openWhenLoaded);
    document.addEventListener('keydown', onKey);
    return () => {
      cancel(idleId);
      window.removeEventListener('open-command-palette', openWhenLoaded);
      document.removeEventListener('keydown', onKey);
    };
  }, [ready]);

  return ready ? <Suspense fallback={null}><CommandPalette /></Suspense> : null;
}

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { signOut } = useAuth();

  return (
    <SidebarProvider>
      <DashboardLayoutInner signOut={signOut}>
        {children}
      </DashboardLayoutInner>
    </SidebarProvider>
  );
}

function DashboardLayoutInner({ children, signOut }: {
  children: ReactNode;
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
        <TopBar onReplayTour={() => tour.startTour()} hasTour={!!tourDef} />

        <div className="flex-1 px-3 pt-4 pb-tabbar sm:px-4 md:pb-6 lg:px-6 lg:pt-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
      <MobileTabBar />
      <DeferredCommandPalette />
      {tourDef && tour.isActive && (
        <Suspense fallback={null}>
          <ProductTour
            steps={tourDef.steps}
            currentStep={tour.currentStep}
            isActive={tour.isActive}
            onNext={handleTourNext}
            onPrev={tour.prevStep}
            onSkip={handleTourSkip}
          />
        </Suspense>
      )}
    </div>
  );
}
