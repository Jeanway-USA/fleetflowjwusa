import { ReactNode, useEffect, useRef, useState, useCallback } from 'react';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { WelcomeBetaModal } from '@/components/shared/WelcomeBetaModal';
import { Button } from '@/components/ui/button';
import { DemoControls } from '@/components/demo/DemoControls';
import { useTheme } from '@/contexts/ThemeContext';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { BetaFeedbackWidget } from '@/components/shared/BetaFeedbackWidget';
import { DiscordBanner } from '@/components/shared/DiscordBanner';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ProductTour } from '@/components/shared/ProductTour';
import { useProductTour } from '@/hooks/useProductTour';
import { getTourForRoute } from '@/lib/tour-steps';

interface DashboardLayoutProps {
  children: ReactNode;
}


export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isDemoMode, signOut, primaryColor, simulatedOrgId, simulatedOrgName, clearOrgSimulation } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();

  // Apply org brand color as CSS custom properties
  useEffect(() => {
    if (!primaryColor) return;
    const root = document.documentElement;
    const vars = ['--primary', '--accent', '--ring', '--sidebar-primary', '--sidebar-ring'];
    
    // Parse HSL and adjust for dark mode
    const parts = primaryColor.split(' ');
    let lightHsl = primaryColor;
    let darkHsl = primaryColor;
    if (parts.length >= 3) {
      const l = parseInt(parts[2]);
      lightHsl = `${parts[0]} ${parts[1]} ${l}%`;
      darkHsl = `${parts[0]} ${parts[1]} ${Math.min(l + 5, 60)}%`;
    }

    const hsl = theme === 'dark' ? darkHsl : lightHsl;
    vars.forEach(v => root.style.setProperty(v, hsl));

    return () => {
      // Clean up inline styles on unmount so CSS cascade takes over
      vars.forEach(v => root.style.removeProperty(v));
    };
  }, [primaryColor, theme]);

  return (
    <SidebarProvider>
      <DashboardLayoutInner isDemoMode={isDemoMode} signOut={signOut} simulatedOrgId={simulatedOrgId} simulatedOrgName={simulatedOrgName} clearOrgSimulation={clearOrgSimulation}>
        {children}
      </DashboardLayoutInner>
    </SidebarProvider>
  );
}

function DashboardLayoutInner({ children, isDemoMode, signOut, simulatedOrgId, simulatedOrgName, clearOrgSimulation }: {
  children: ReactNode;
  isDemoMode: boolean;
  signOut: () => Promise<void>;
  simulatedOrgId: string | null;
  simulatedOrgName: string | null;
  clearOrgSimulation: () => void;
}) {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const location = useLocation();
  const { tier } = useSubscriptionTier();
  const tourDef = getTourForRoute(location.pathname);
  const tour = useProductTour({ tourId: tourDef?.id || 'none', totalSteps: tourDef?.steps.length || 0 });
  const [showWelcome, setShowWelcome] = useState(false);
  const [tourFlagLoaded, setTourFlagLoaded] = useState(false);
  const [hasSeenTour, setHasSeenTour] = useState<boolean | null>(null);
  const { user, hasRole } = useAuth();
  const isDriverRole = hasRole('driver');
  const autoStartedRef = useRef(false);

  // Persist tour completion server-side so it doesn't re-trigger on other devices.
  const persistTourCompletion = useCallback(async () => {
    if (!user) return;
    setHasSeenTour(true);
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

  // Load the has_seen_tour flag once per user.
  useEffect(() => {
    if (!user || isDemoMode) {
      setTourFlagLoaded(true);
      return;
    }
    supabase
      .from('profiles')
      .select('has_completed_onboarding_tour')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        const seen = !!(data as any)?.has_completed_onboarding_tour;
        setHasSeenTour(seen);
        // NOTE: intentionally do NOT mirror the global server flag into the
        // per-tour localStorage key. The server flag is shared across every
        // tour (driver, dispatcher, BCO) and would otherwise permanently
        // suppress tours the user has never actually seen.
        // Only show the legacy welcome modal on routes that don't have an auto-tour.
        if (!seen && !tourDef) setShowWelcome(true);
        setTourFlagLoaded(true);
      });
  }, [user, isDemoMode, tourDef]);

  // Auto-start tour: (A) explicit signal from /driver/onboarding (via location
  // state OR persistent localStorage flag — survives ProtectedRoute redirects),
  // or (B) server-side has_completed_onboarding_tour === false.
  // Explicit onboarding signal ALWAYS wins, even if localStorage marks the
  // tour completed from a prior test run.
  useEffect(() => {
    if (autoStartedRef.current || !tourDef || tour.isActive) return;

    const stateSaysStart = (location.state as any)?.startTour === true;
    let pendingFlag = false;
    try { pendingFlag = localStorage.getItem('pending_driver_tour') === '1'; } catch { /* ignore */ }
    const fromOnboarding = stateSaysStart || pendingFlag;

    if (fromOnboarding) {
      autoStartedRef.current = true;
      tour.resetTour();      // clear stale completion so welcome restarts cleanly
      tour.startTour();
      try { localStorage.removeItem('pending_driver_tour'); } catch { /* ignore */ }
      if (stateSaysStart) {
        navigate(location.pathname, { replace: true, state: {} });
      }
      return;
    }

    if (tour.hasCompleted()) {
      autoStartedRef.current = true;
      return;
    }

    const flagSaysStart = tourFlagLoaded && hasSeenTour === false;
    if (!flagSaysStart) return;
    autoStartedRef.current = true;
    tour.startTour();
  }, [tourDef, tour, tourFlagLoaded, hasSeenTour, location.state, location.pathname, navigate]);



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
      <main className="flex-1 flex flex-col min-h-screen">
        {simulatedOrgId && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => { clearOrgSimulation(); navigate('/super-admin'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { clearOrgSimulation(); navigate('/super-admin'); } }}
            className="sticky top-0 z-50 bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-center gap-3 text-sm cursor-pointer hover:bg-destructive/90 transition-colors"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive-foreground/75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive-foreground" />
            </span>
            <ShieldAlert className="h-4 w-4" />
            <span className="font-semibold">Viewing as {simulatedOrgName} — Click to Exit</span>
          </div>
        )}
        {isDemoMode && (
          <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" />
              <span className="font-medium">You're in Demo Mode</span>
              <span className="text-muted-foreground hidden sm:inline">— exploring with sample data</span>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs gradient-gold text-primary-foreground"
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
            >
              Start Your Beta Account
            </Button>
          </div>
        )}
        <TopBar onReplayTour={() => tour.startTour()} hasTour={!!tourDef} />

        <DiscordBanner />
        <div className="flex-1 p-2 sm:p-4 lg:p-6 animate-fade-in">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
      {isDemoMode && <DemoControls />}
      <CommandPalette />
      <BetaFeedbackWidget />
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
      {user && (
        <WelcomeBetaModal
          open={showWelcome}
          userId={user.id}
          onStartTour={tour.startTour}
          onClose={() => setShowWelcome(false)}
        />
      )}
    </div>
  );
}
