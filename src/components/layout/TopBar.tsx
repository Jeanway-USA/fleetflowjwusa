import { Link, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
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
import { UserMenu } from './UserMenu';
import jwBanner from '@/assets/JW_Banner.png';

const ROUTE_LABELS: Record<string, string> = {
  '/executive-dashboard': 'Today',
  '/dispatcher-dashboard': 'Dispatcher Dashboard',
  '/driver-dashboard': 'Driver Dashboard',
  '/trucks': 'Trucks',
  '/trailers': 'Trailers',
  '/drivers': 'Drivers',
  '/fleet-loads': 'Loads',
  '/agency-loads': 'Agency Loads',
  '/finance': 'Money',
  '/insights': 'Company Insights',
  '/ifta': 'IFTA Reporting',
  '/crm': 'CRM',
  '/shop': 'Shop',
  '/shop/parts': 'Parts room',
  '/shop/planner': 'Service planner',
  '/shop/history': 'Service history',
  '/documents': 'Documents',
  '/safety': 'Safety',
  '/incidents': 'Incidents',
  '/driver-performance': 'Driver Performance',
  '/settings': 'Settings',
  '/driver-stats': 'My Stats',
  '/driver/loads': 'My Loads',
  '/driver-settings': 'My Settings',
  '/archive': 'Archive',
  '/audit-trail': 'Audit Trail',
  '/admin/tax-hub': 'Tax Hub',
};

const ROUTE_GROUPS: Record<string, { label: string; path: string }> = {
  '/trucks': { label: 'Fleet', path: '/trucks' },
  '/trailers': { label: 'Fleet', path: '/trucks' },
  '/drivers': { label: 'Fleet', path: '/drivers' },
  '/fleet-loads': { label: 'Loads', path: '/fleet-loads' },
  '/agency-loads': { label: 'Loads', path: '/fleet-loads' },
  '/finance': { label: 'Money', path: '/finance' },
  '/insights': { label: 'Money', path: '/finance' },
  '/ifta': { label: 'Money', path: '/finance' },
  '/crm': { label: 'Operations', path: '/crm' },
  '/admin/tax-hub': { label: 'Money', path: '/finance' },
  '/shop/parts': { label: 'Shop', path: '/shop' },
  '/shop/planner': { label: 'Shop', path: '/shop' },
  '/shop/history': { label: 'Shop', path: '/shop' },
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
  const isDriverRole = hasRole('driver') && !hasRole('owner') && !hasRole('dispatcher');

  const pathSegment = '/' + location.pathname.split('/')[1];
  const pageLabel = ROUTE_LABELS[pathSegment] || ROUTE_LABELS[location.pathname];
  const group = ROUTE_GROUPS[pathSegment] || ROUTE_GROUPS[location.pathname];

  const openSearch = () =>
    window.dispatchEvent(new CustomEvent('open-command-palette'));

  return (
    // Scoped to the dark token set so every control reads correctly on the
    // black brand shell in both themes; portaled menus keep the page theme.
    <header
      className="dark sticky top-0 z-40 border-b border-shell-border bg-shell text-shell-foreground"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-14 items-center gap-1.5 sm:gap-3 px-3 sm:px-4 lg:px-6">
        <SidebarTrigger className="hidden md:inline-flex h-9 w-9 shrink-0 text-shell-muted hover:text-shell-foreground" />
        <Link to="/" className="md:hidden flex items-center shrink-0" aria-label="JeanWay USA home">
          <img src={jwBanner} alt="JeanWay USA" className="h-7 w-auto" />
        </Link>

        {pageLabel && (
          <Breadcrumb className="hidden md:block min-w-0 [&_a]:text-shell-muted [&_a:hover]:text-shell-foreground [&_li]:text-shell-muted">
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
                <BreadcrumbPage className="truncate font-condensed text-base font-semibold text-shell-foreground">{pageLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        )}

        <OfflineIndicator />
        <DocumentSyncBootstrap />


        <div className="flex-1" />

        {/* Global search */}
        <button
          type="button"
          onClick={openSearch}
          aria-label="Search everything"
          className="hidden md:inline-flex items-center gap-2 h-9 w-64 lg:w-80 px-3 rounded-md border border-shell-border bg-shell-active/60 hover:bg-shell-active transition-colors text-sm text-shell-muted"
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
          className="md:hidden h-10 w-10"
          onClick={openSearch}
          aria-label="Search"
        >
          <Search className="h-4 w-4" />
        </Button>

        <div className="hidden lg:block"><TimeDisplayToggle /></div>
        <ThemeToggle className="h-10 w-10 md:h-9 md:w-9" />

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
