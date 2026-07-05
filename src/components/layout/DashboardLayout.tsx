import { ReactNode, useEffect } from 'react';
import { SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation, Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { DocumentSyncBootstrap } from '@/components/shared/DocumentSyncBootstrap';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { TimeDisplayToggle } from '@/components/shared/TimeDisplayToggle';
import { DriverMessages } from '@/components/driver/DriverMessages';
import { Button } from '@/components/ui/button';

const ROUTE_LABELS: Record<string, string> = {
  '/executive-dashboard': 'Executive Dashboard',
  '/dispatcher-dashboard': 'Dispatch Board',
  '/driver-dashboard': 'Driver Dashboard',
  '/trucks': 'Trucks & Equipment',
  '/trailers': 'Trailers',
  '/drivers': 'Driver Roster',
  '/fleet-loads': 'Loads',
  '/agency-loads': 'Agency Loads',
  '/finance': 'Finance & P/L',
  '/insights': 'Company Insights',
  '/ifta': 'IFTA Reporting',
  '/crm': 'Partners',
  '/maintenance': 'Maintenance',
  '/maintenance-home': 'Telematics',
  '/documents': 'Documents',
  '/safety': 'Safety',
  '/incidents': 'Incidents',
  '/driver-performance': 'Driver Performance',
  '/settings': 'Settings',
  '/audit-trail': 'Audit Trail',
  '/driver-stats': 'My Stats',
  '/driver/loads': 'My Loads',
  '/driver/settlements': 'My Settlements',
  '/driver-settings': 'My Settings',
  '/super-admin': 'Super Admin',
};

const ROUTE_GROUPS: Record<string, { label: string; path: string }> = {
  '/trucks': { label: 'Fleet', path: '/trucks' },
  '/trailers': { label: 'Fleet', path: '/trucks' },
  '/drivers': { label: 'Fleet', path: '/drivers' },
  '/fleet-loads': { label: 'Loads', path: '/fleet-loads' },
  '/agency-loads': { label: 'Loads', path: '/fleet-loads' },
  '/finance': { label: 'Financials', path: '/finance' },
  '/insights': { label: 'Financials', path: '/finance' },
  '/ifta': { label: 'Financials', path: '/finance' },
  '/crm': { label: 'Admin', path: '/crm' },
  '/documents': { label: 'Admin', path: '/documents' },
  '/audit-trail': { label: 'Admin', path: '/audit-trail' },
  '/maintenance': { label: 'Fleet', path: '/trucks' },
  '/maintenance-home': { label: 'Fleet', path: '/trucks' },
  '/safety': { label: 'Safety', path: '/safety' },
  '/incidents': { label: 'Safety', path: '/safety' },
  '/driver-performance': { label: 'Drivers', path: '/drivers' },
};

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </SidebarProvider>
  );
}

function DashboardLayoutInner({ children }: { children: ReactNode }) {
  const { toggleSidebar } = useSidebar();
  const location = useLocation();
  const { hasRole } = useAuth();
  const isDriverRole = hasRole('driver');

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
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-12 sm:h-14 items-center gap-4 px-4 lg:px-6">
            <SidebarTrigger className="h-9 w-9" />
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
            <OfflineIndicator />
            <DocumentSyncBootstrap />
            <div className="flex-1" />
            <TimeDisplayToggle />
            {isDriverRole && (
              <ErrorBoundary compact>
                <DriverMessages />
              </ErrorBoundary>
            )}
            <Button
              variant="outline"
              size="sm"
              className="hidden md:inline-flex h-8 gap-2 text-xs text-muted-foreground"
              onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
              aria-label="Open command palette"
            >
              <span>Search…</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                ⌘K
              </kbd>
            </Button>
          </div>
        </header>
        <div className="flex-1 p-2 sm:p-4 lg:p-6 animate-fade-in">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}
