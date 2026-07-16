import { Link, useLocation } from 'react-router-dom';
import { Search, Sparkles } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { OfflineIndicator } from '@/components/shared/OfflineIndicator';
import { DocumentSyncBootstrap } from '@/components/shared/DocumentSyncBootstrap';
import { TimeDisplayToggle } from '@/components/shared/TimeDisplayToggle';
import { NotificationCenter } from '@/components/shared/NotificationCenter';
import { DriverMessages } from '@/components/driver/DriverMessages';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionTier } from '@/hooks/useSubscriptionTier';
import { UserMenu } from './UserMenu';

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
  '/driver/loads': 'My Loads',
  '/driver-settings': 'My Settings',
  '/super-admin': 'Super Admin',
  '/archive': 'Archive',
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

interface TopBarProps {
  onReplayTour?: () => void;
  hasTour?: boolean;
}

export function TopBar({ onReplayTour, hasTour }: TopBarProps) {
  const location = useLocation();
  const { hasRole } = useAuth();
  const { tier } = useSubscriptionTier();
  const isDriverRole = hasRole('driver') && !hasRole('owner') && !hasRole('dispatcher');

  const pathSegment = '/' + location.pathname.split('/')[1];
  const pageLabel = ROUTE_LABELS[pathSegment] || ROUTE_LABELS[location.pathname];
  const group = ROUTE_GROUPS[pathSegment];

  const openSearch = () =>
    window.dispatchEvent(new CustomEvent('open-command-palette'));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-12 sm:h-14 items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6">
        <SidebarTrigger className="h-9 w-9 shrink-0" />

        {pageLabel && (
          <Breadcrumb className="hidden sm:block min-w-0">
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
                <BreadcrumbPage className="truncate">{pageLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )}

        <OfflineIndicator />
        <DocumentSyncBootstrap />

        {tier === 'open_beta' && (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/15 to-yellow-500/15 border border-amber-500/30">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Beta Member
            </span>
          </div>
        )}

        <div className="flex-1" />

        {/* Global search */}
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search everything"
          className="hidden md:inline-flex items-center gap-2 h-9 w-64 lg:w-80 px-3 rounded-md border border-input bg-muted/40 hover:bg-muted transition-colors text-sm text-muted-foreground"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search drivers, trucks, loads…</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium">
            ⌘K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9"
          onClick={openSearch}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>

        <TimeDisplayToggle />
        <ThemeToggle />

        {isDriverRole ? (
          <ErrorBoundary compact>
            <DriverMessages />
          </ErrorBoundary>
        ) : (
          <ErrorBoundary compact>
            <NotificationCenter />
          </ErrorBoundary>
        )}

        <UserMenu onReplayTour={onReplayTour} hasTour={hasTour} />
      </div>
    </header>
  );
}
