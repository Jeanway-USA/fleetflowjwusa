import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CalendarDays, Package, Wallet, Menu, Receipt, Gauge, Wrench, CalendarClock, Truck, LucideIcon } from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { getRoleHomePath } from '@/lib/role-home';
import { cn } from '@/lib/utils';

interface Tab {
  label: string;
  icon: LucideIcon;
  path: string;
  /** Other routes that count as this tab being active. */
  match?: string[];
  /** For pages with in-page tabs (?tab=), the values that belong to this tab; null = no ?tab. */
  tabs?: (string | null)[];
}

/**
 * Phone navigation: the owner's three jobs (what we made, where loads stand,
 * this week's settlement) one tap away, everything else under More. The shop
 * gets its own set: in the maintenance section, or for a maintenance login.
 */
export function MobileTabBar() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { setOpenMobile, openMobile } = useSidebar();
  const { roles, hasRole, subscriptionTier } = useAuth();

  const isDriverOnly = hasRole('driver') && !hasRole('owner') && !hasRole('dispatcher');
  // hasRole('owner') is false while the owner is "viewing as" maintenance.
  const isMaintenanceOnly = hasRole('maintenance') && !hasRole('owner') && !hasRole('dispatcher');
  const inShopSection = location.pathname === '/shop' || location.pathname.startsWith('/shop/');
  const home = getRoleHomePath(roles, subscriptionTier);

  const tabs: Tab[] = isMaintenanceOnly || inShopSection
    ? [
        { label: 'Board', icon: Gauge, path: '/shop', match: ['/shop/jobs'] },
        { label: 'Parts', icon: Wrench, path: '/shop/parts' },
        { label: 'Planner', icon: CalendarClock, path: '/shop/planner', match: ['/shop/history'] },
        { label: 'Trucks', icon: Truck, path: '/trucks', match: ['/trailers'] },
      ]
    : isDriverOnly
    ? [
        { label: 'Today', icon: CalendarDays, path: '/driver-dashboard' },
        { label: 'Loads', icon: Package, path: '/driver/loads' },
        { label: 'Pay', icon: Receipt, path: '/driver/settlements' },
      ]
    : [
        { label: 'Today', icon: CalendarDays, path: home, match: ['/executive-dashboard', '/dispatcher-dashboard'] },
        { label: 'Loads', icon: Package, path: '/fleet-loads', match: ['/agency-loads'] },
        { label: 'Money', icon: Wallet, path: '/finance', match: ['/admin/tax-hub', '/ifta', '/insights'] },
      ];

  const isActive = (tab: Tab) => {
    const basePath = tab.path.split('?')[0];
    const onRoute = [basePath, ...(tab.match ?? [])].some(
      (p) => location.pathname === p || location.pathname.startsWith(p + '/'),
    );
    if (!onRoute) return false;
    return !tab.tabs || tab.tabs.includes(searchParams.get('tab'));
  };
  const anyTabActive = tabs.some(isActive);

  const itemClass = (active: boolean) =>
    cn(
      'relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-2 pb-1.5 min-h-[56px] text-xs font-semibold  transition-colors',
      active ? 'text-shell-foreground' : 'text-shell-muted active:text-shell-foreground',
    );

  // Gold tick over the current tab, like the day marked on a log page.
  const tick = <span aria-hidden className="absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-b bg-carbon" />;

  return (
    <nav
      aria-label="Main"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-shell-border bg-shell"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {tabs.map((tab) => {
          const active = isActive(tab);
          return (
            <Link key={tab.label} to={tab.path} className={itemClass(active)} aria-current={active ? 'page' : undefined}>
              {active && tick}
              <tab.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpenMobile(!openMobile)}
          className={itemClass(!anyTabActive || openMobile)}
          aria-label="More pages"
          aria-expanded={openMobile}
        >
          {(!anyTabActive || openMobile) && tick}
          <Menu className="h-[22px] w-[22px]" strokeWidth={1.75} />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
