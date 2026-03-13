import { ReactNode, useEffect } from 'react';
import { SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { AlertTriangle, CircleHelp, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoControls } from '@/components/demo/DemoControls';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubscriptionTier } from '@/hooks/useSubscriptionTier';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { BetaFeedbackWidget } from '@/components/shared/BetaFeedbackWidget';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ProductTour } from '@/components/shared/ProductTour';
import { useProductTour } from '@/hooks/useProductTour';
import { getTourForRoute } from '@/lib/tour-steps';

const ROUTE_LABELS: Record<string, string> = {
  '/executive-dashboard': 'Executive Dashboard',
  '/dispatcher-dashboard': 'Dispatcher Dashboard',
  '/driver-dashboard': 'Driver Dashboard',
  '/trucks': 'Trucks',
  '/trailers': 'Trailers',
  '/drivers': 'Drivers',
  '/fleet-loads': 'Fleet Loads',
  '/agency-loads': 'Agency Loads',
  '/finance': 'Finance & P/L',
  '/insights': 'Company Insights',
  '/ifta': 'IFTA Reporting',
  '/crm': 'CRM',
  '/maintenance': 'Maintenance',
  '/documents': 'Documents',
  '/safety': 'Safety',
  '/incidents': 'Incidents',
  '/driver-performance': 'Driver Performance',
  '/settings': 'Settings',
  '/driver-stats': 'My Stats',
  '/driver-settings': 'My Settings',
  '/super-admin': 'Super Admin',
};

const ROUTE_GROUPS: Record<string, { label: string; path: string }> = {
  '/trucks': { label: 'Fleet', path: '/trucks' },
  '/trailers': { label: 'Fleet', path: '/trucks' },
  '/drivers': { label: 'Fleet', path: '/drivers' },
  '/fleet-loads': { label: 'Loads', path: '/fleet-loads' },
  '/agency-loads': { label: 'Loads', path: '/fleet-loads' },
  '/finance': { label: 'Finance', path: '/finance' },
  '/insights': { label: 'Finance', path: '/finance' },
  '/ifta': { label: 'Finance', path: '/finance' },
  '/crm': { label: 'Operations', path: '/crm' },
  '/maintenance': { label: 'Operations', path: '/maintenance' },
  '/documents': { label: 'Operations', path: '/documents' },
  '/safety': { label: 'Operations', path: '/safety' },
  '/incidents': { label: 'Operations', path: '/incidents' },
  '/driver-performance': { label: 'Operations', path: '/driver-performance' },
};

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
      <DashboardLayoutInner isDemoMode={isDemoMode} signOut={signOut} simulatedOrgId={simulatedOrgId} simulatedOrgName={simulatedOrgName} clearOrgSimulation={clearOrgSimulation} navigate={navigate}>
        {children}
      </DashboardLayoutInner>
    </SidebarProvider>
  );
}

function DashboardLayoutInner({ children, isDemoMode, signOut, simulatedOrgId, simulatedOrgName, clearOrgSimulation, navigate }: {
  children: ReactNode;
  isDemoMode: boolean;
  signOut: () => Promise<void>;
  simulatedOrgId: string | null;
  simulatedOrgName: string | null;
  clearOrgSimulation: () => void;
  navigate: (path: string) => void;
}) {
  const { toggleSidebar } = useSidebar();
  const location = useLocation();
  const { tier } = useSubscriptionTier();
  const tourDef = getTourForRoute(location.pathname);
  const tour = useProductTour({ tourId: tourDef?.id || 'none', totalSteps: tourDef?.steps.length || 0 });

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

  // Breadcrumb generation
  const pathSegment = '/' + location.pathname.split('/')[1];
  const pageLabel = ROUTE_LABELS[pathSegment] || ROUTE_LABELS[location.pathname];
  const group = ROUTE_GROUPS[pathSegment];

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
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-12 sm:h-14 items-center gap-4 px-4 lg:px-6">
            <SidebarTrigger className="lg:hidden h-10 w-10" />
            {pageLabel && (
              <Breadcrumb>
                <BreadcrumbList>
                  {group && (
                    <>
                      <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                          <Link to={group.path}>{group.label}</Link>
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                    </>
                  )}
                  <BreadcrumbItem>
                    <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
            {tier === 'open_beta' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/15 to-yellow-500/15 border border-amber-500/30">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Beta Member</span>
              </div>
            )}
            <div className="flex-1" />
          </div>
        </header>
        <div className="flex-1 p-2 sm:p-4 lg:p-6 animate-fade-in">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </div>
      </main>
      {isDemoMode && <DemoControls />}
      <CommandPalette />
      <BetaFeedbackWidget />
    </div>
  );
}
