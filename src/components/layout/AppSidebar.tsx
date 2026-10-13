import { 
  LayoutDashboard, 
  Truck, 
  Package, 
  Users, 
  DollarSign, 
  FileText, 
  Wrench, 
  Settings,
  LogOut,
  Shield,
  Building2,
  TrendingUp,
  BarChart3,
  Crown,
  Container,
  Contact,
  AlertTriangle,
  Award,
  Fuel,
  BarChart,
  Receipt,
  Archive,
  ShieldCheck,
  ChevronRight,
  LucideIcon,
  Tablet,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAreaAccess } from '@/hooks/useAreaAccess';
import { useAuth } from '@/contexts/AuthContext';
import type { SubscriptionTier } from '@/contexts/AuthContext';
import { useOrganizationMode, type TmsMode } from '@/hooks/useOrganizationMode';
import { useTheme } from '@/contexts/ThemeContext';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import type { Database } from '@/integrations/supabase/types';
import jwBanner from '@/assets/JW_Banner.png';
import jwIcon from '@/assets/JW_Icon.png';

type AppRole = Database['public']['Enums']['app_role'];

interface NavItem {
  title: string;
  icon: LucideIcon;
  path: string;
  roles: AppRole[];
  feature?: string;
  tourId?: string;
  tmsMode?: TmsMode;
}

const TIER_FEATURES: Record<SubscriptionTier, Set<string>> = {
  open_beta: new Set([
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'crm_basic',
    'drivers', 'dispatch', 'settlements', 'fleet_analytics',
    'gps_tracking', 'payroll', 'driver_performance', 'maintenance_full',
    'trucks', 'trailers', 'incidents', 'safety', 'executive_dashboard',
    'agency_loads', 'commissions', 'crm', 'insights',
  ]),
  solo_bco: new Set([
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'crm_basic',
  ]),
  fleet_owner: new Set([
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'crm_basic',
    'drivers', 'dispatch', 'settlements', 'fleet_analytics',
    'gps_tracking', 'payroll', 'driver_performance', 'maintenance_full',
    'trucks', 'trailers', 'incidents', 'safety', 'executive_dashboard',
    'insights',
  ]),
  agency: new Set([
    'agency_loads', 'commissions', 'crm', 'documents', 'insights',
  ]),
  all_in_one: new Set([
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'crm_basic',
    'drivers', 'dispatch', 'settlements', 'fleet_analytics',
    'gps_tracking', 'payroll', 'driver_performance', 'maintenance_full',
    'trucks', 'trailers', 'incidents', 'safety', 'executive_dashboard',
    'agency_loads', 'commissions', 'crm', 'insights',
  ]),
};

// Super admin check moved to server-side RPC via useAuth()

const STORAGE_KEY = 'sidebar-groups';

function loadGroupState(): Record<string, boolean> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveGroupState(state: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// --- Collapsible nav group sub-component ---

interface CollapsibleNavGroupProps {
  groupKey: string;
  label: string;
  items: NavItem[];
  isOpen: boolean;
  onToggle: (key: string, open: boolean) => void;
  currentPath: string;
}

// Shared classes for menu buttons (active pill + left accent bar)
const NAV_BUTTON_CLASS =
  "relative h-10 gap-3 rounded-md text-[15px] text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground " +
  "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:font-semibold " +
  "data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-2 data-[active=true]:before:bottom-2 " +
  "data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-r data-[active=true]:before:bg-sidebar-primary " +
  "[&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:text-sidebar-foreground/60 data-[active=true]:[&>svg]:text-sidebar-primary";

const GROUP_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50";

function CollapsibleNavGroup({ groupKey, label, items, isOpen, onToggle, currentPath }: CollapsibleNavGroupProps) {
  if (items.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={(open) => onToggle(groupKey, open)}>
      <SidebarGroup className="py-0">
        <CollapsibleTrigger className={`flex w-full items-center justify-between px-3 pt-5 pb-1.5 ${GROUP_LABEL_CLASS} hover:text-sidebar-foreground transition-colors group group-data-[collapsible=icon]:hidden`}>
          <span>{label}</span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="group-data-[collapsible=icon]:!hidden">
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = currentPath === item.path || currentPath.startsWith(item.path + '/');
                return (
                  <SidebarMenuItem key={item.path} {...(item.tourId ? { 'data-tour': item.tourId } : {})}>
                    <SidebarMenuButton asChild isActive={active} className={NAV_BUTTON_CLASS}>
                      <Link to={item.path}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
        {/* Icon-rail mode: render items flat without the collapsible header */}
        <SidebarGroupContent className="hidden group-data-[collapsible=icon]:block">
          <SidebarMenu>
            {items.map((item) => {
              const active = currentPath === item.path || currentPath.startsWith(item.path + '/');
              return (
                <SidebarMenuItem key={`icon-${item.path}`}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.title} className={NAV_BUTTON_CLASS}>
                    <Link to={item.path}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// --- Main sidebar ---

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, roles, user, hasRole, isOwner, setSimulatedRole, isSimulating, simulatedRole, subscriptionTier, bannerUrl, logoUrl, isSuperAdmin, orgName } = useAuth();
  const { tmsMode: currentTmsMode } = useOrganizationMode();
  const { theme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();
  const actuallyIsOwner = roles.includes('owner');
  const { url: signedBannerUrl } = useSignedUrl('branding-assets', bannerUrl || null);
  const { url: signedLogoUrl } = useSignedUrl('branding-assets', logoUrl || null);
  const hasOrgBranding = !!(signedBannerUrl || signedLogoUrl);
  const bannerSrc = signedBannerUrl || signedLogoUrl || null;
  const currentPath = location.pathname;
  const simulationSwitchTimerRef = useRef<number | null>(null);

  // Auto-close the mobile drawer whenever the route changes so tapping
  // a nav item on phones dismisses the sheet instead of covering the page.
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, isMobile]);

  const tierFeatures = TIER_FEATURES[subscriptionTier] || TIER_FEATURES.all_in_one;

  const { allowsFeature } = useAreaAccess();

  const filterByRoleAndTier = useCallback((items: NavItem[]) => items.filter(item => {
    // Owners see every nav item (unless they're simulating a lower role,
    // in which case hasRole('owner') is false and normal filtering applies).
    const roleMatch = hasRole('owner') || item.roles.some(role => hasRole(role));
    const tierMatch = !item.feature || tierFeatures.has(item.feature);
    const modeMatch = !item.tmsMode || item.tmsMode === currentTmsMode;
    return roleMatch && tierMatch && modeMatch && allowsFeature(item.feature);
  }), [hasRole, tierFeatures, currentTmsMode, allowsFeature]);

  // --- Dashboard items (non-collapsible) ---
  const dashboardNavItems: NavItem[] = actuallyIsOwner ? [
    { title: 'Today', icon: Crown, path: '/executive-dashboard', roles: ['owner'] },
    { title: 'Dispatcher View', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['owner'] },
    { title: 'Driver View', icon: Truck, path: '/driver-dashboard', roles: ['owner'] },
    { title: 'Shop', icon: Wrench, path: '/shop', roles: ['owner'], feature: 'maintenance_full' },
    { title: 'Shop Floor', icon: Tablet, path: '/shop/floor', roles: ['owner'], feature: 'maintenance_full' },
  ] : [
    { title: 'My Dashboard', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['dispatcher'] },
    { title: 'My Dashboard', icon: Truck, path: '/driver-dashboard', roles: ['driver'] },
    { title: 'Shop Floor', icon: Tablet, path: '/shop/floor', roles: ['maintenance'], feature: 'maintenance_full' },
    { title: 'Shop Board', icon: Wrench, path: '/shop', roles: ['maintenance'], feature: 'maintenance_full' },
  ];

  const pathToRole: Record<string, 'owner' | 'dispatcher' | 'driver' | 'maintenance'> = {
    '/executive-dashboard': 'owner',
    '/dispatcher-dashboard': 'dispatcher',
    '/driver-dashboard': 'driver',
    '/shop': 'maintenance',
    '/shop/floor': 'maintenance',
  };

  // --- Collapsible groups ---
  const operationsItems: NavItem[] = [
    { title: 'Loads', icon: Package, path: '/fleet-loads', roles: ['owner', 'dispatcher', 'safety'], feature: 'loads', tourId: 'nav-fleet-loads' },
    { title: 'Agency Loads', icon: Building2, path: '/agency-loads', roles: ['owner', 'dispatcher'], feature: 'agency_loads' },
    { title: 'Drivers', icon: Users, path: '/drivers', roles: ['owner', 'payroll_admin'], feature: 'drivers' },
    { title: 'Trucks', icon: Truck, path: '/trucks', roles: ['owner', 'safety', 'maintenance'], feature: 'trucks' },
    { title: 'Trailers', icon: Container, path: '/trailers', roles: ['owner', 'safety', 'maintenance'], feature: 'trailers' },
  ];

  const financeItems: NavItem[] = [
    { title: 'Money', icon: TrendingUp, path: '/finance', roles: ['owner', 'payroll_admin'], feature: 'profit_loss', tourId: 'nav-finance' },
    { title: 'Tax Hub', icon: Receipt, path: '/admin/tax-hub', roles: ['owner', 'payroll_admin'], feature: 'profit_loss' },
    { title: 'IFTA Reporting', icon: Fuel, path: '/ifta', roles: ['owner', 'payroll_admin'], feature: 'ifta', tmsMode: 'independent' as TmsMode },
  ];

  const complianceItems: NavItem[] = [
    { title: 'Safety', icon: Shield, path: '/safety', roles: ['owner', 'safety'], feature: 'safety' },
    { title: 'Incidents', icon: AlertTriangle, path: '/incidents', roles: ['owner', 'safety'], feature: 'incidents' },
    { title: 'Driver Performance', icon: Award, path: '/driver-performance', roles: ['owner', 'safety'], feature: 'driver_performance' },
    { title: 'Documents', icon: FileText, path: '/documents', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety'], feature: 'documents' },
    { title: 'Document Signing', icon: FileText, path: '/documents/signing', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety', 'driver', 'maintenance'] },
  ];

  const crmItems: NavItem[] = [
    { title: currentTmsMode === 'independent' ? 'Broker CRM' : 'Agent CRM', icon: currentTmsMode === 'independent' ? Building2 : Contact, path: '/crm', roles: ['owner', 'dispatcher'], feature: 'crm' },
  ];

  const reportsItems: NavItem[] = [
    { title: 'Company Insights', icon: BarChart3, path: '/insights', roles: ['owner', 'payroll_admin'], feature: 'insights' },
    { title: 'Audit Trail', icon: ShieldCheck, path: '/audit-trail', roles: ['owner', 'payroll_admin'] },
    { title: 'Archive', icon: Archive, path: '/archive', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety', 'maintenance'] },
  ];

  const filteredOps = useMemo(() => filterByRoleAndTier(operationsItems), [filterByRoleAndTier]);
  const filteredFinance = useMemo(() => filterByRoleAndTier(financeItems), [filterByRoleAndTier]);
  const filteredCompliance = useMemo(() => filterByRoleAndTier(complianceItems), [filterByRoleAndTier]);
  const filteredCrm = useMemo(() => filterByRoleAndTier(crmItems), [filterByRoleAndTier]);
  const filteredReports = useMemo(() => filterByRoleAndTier(reportsItems), [filterByRoleAndTier]);

  // Settings & Admin — owners only, and not while simulating another role
  const adminItems = useMemo<NavItem[]>(() => {
    if (actuallyIsOwner && !isSimulating) {
      return [{ title: 'Settings', icon: Settings, path: '/settings', roles: ['owner'] as AppRole[] }];
    }
    return [];
  }, [actuallyIsOwner, isSimulating]);

  const collapsibleGroups = useMemo(() => [
    { key: 'operations', label: 'Operations', items: filteredOps },
    { key: 'finance', label: 'Finance', items: filteredFinance },
    { key: 'compliance', label: 'Compliance & Safety', items: filteredCompliance },
    { key: 'crm', label: 'CRM & Sales', items: filteredCrm },
    { key: 'reports', label: 'Reports & Insights', items: filteredReports },
    { key: 'admin', label: 'Settings & Admin', items: adminItems },
  ], [filteredOps, filteredFinance, filteredCompliance, filteredCrm, filteredReports, adminItems]);

  // --- Collapsible state with localStorage + auto-expand ---
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => {
    const saved = loadGroupState();
    const defaults: Record<string, boolean> = {
      operations: true,
      finance: true,
      compliance: true,
      crm: true,
      reports: false,
      admin: false,
    };
    return { ...defaults, ...saved };
  });

  // Auto-expand group containing the active route
  useEffect(() => {
    for (const group of collapsibleGroups) {
      const hasActive = group.items.some(item => currentPath === item.path || currentPath.startsWith(item.path + '/'));
      if (hasActive && !groupOpen[group.key]) {
        setGroupOpen(prev => {
          const next = { ...prev, [group.key]: true };
          saveGroupState(next);
          return next;
        });
        break;
      }
    }
  }, [currentPath, collapsibleGroups]);

  const handleToggle = useCallback((key: string, open: boolean) => {
    setGroupOpen(prev => {
      const next = { ...prev, [key]: open };
      saveGroupState(next);
      return next;
    });
  }, []);

  const handleSignOut = async () => {
    navigate('/');
    await signOut();
  };

  useEffect(() => {
    return () => {
      if (simulationSwitchTimerRef.current !== null) {
        window.clearTimeout(simulationSwitchTimerRef.current);
      }
    };
  }, []);

  const handleDashboardSwitch = (path: string, role: 'owner' | 'dispatcher' | 'driver' | 'maintenance') => {
    if (actuallyIsOwner) {
      const nextSimulatedRole = role === 'owner' ? null : role;
      // Real owners can access every route regardless of simulation
      // (ProtectedRoute trusts the real owner role), so we can update
      // simulation and navigate together without any timing dance.
      setSimulatedRole(nextSimulatedRole);
      navigate(path);
      return;
    }
    navigate(path);
  };

  const filteredDashboards = actuallyIsOwner ? dashboardNavItems : dashboardNavItems.filter(item => item.roles.some(r => hasRole(r)));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4 group-data-[collapsible=icon]:px-2">
        <Link to="/" className="flex items-center" aria-label="JeanWay USA home">
          {bannerSrc ? (
            <img src={bannerSrc} alt="JeanWay USA" className="h-10 w-auto object-contain" />
          ) : (
            <>
              <img src={jwBanner} alt="JeanWay USA" className="h-9 w-auto group-data-[collapsible=icon]:hidden" />
              <img src={jwIcon} alt="JeanWay USA" className="hidden h-8 w-8 group-data-[collapsible=icon]:block" />
            </>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2" data-tour="sidebar-nav">
        {/* Simulation Mode Banner */}
        {isSimulating && actuallyIsOwner && (
          <div className="mx-2 mt-3 mb-1 p-2 rounded-md bg-sidebar-primary/15 border border-sidebar-primary/40">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-sidebar-primary capitalize">
                Viewing as: {simulatedRole?.replace('_', ' ')}
              </span>
              <Button 
                variant="ghost" size="sm"
                className="h-7 px-2 text-xs text-sidebar-primary hover:bg-sidebar-primary/20"
                onClick={() => { setSimulatedRole(null); navigate('/executive-dashboard'); }}
              >
                Exit
              </Button>
            </div>
          </div>
        )}

        {/* Dashboards — non-collapsible */}
        {filteredDashboards.length > 0 && (
          <SidebarGroup className="py-0 mt-1">
            <div className={`px-3 pt-4 pb-1.5 ${GROUP_LABEL_CLASS} group-data-[collapsible=icon]:hidden`}>
              {actuallyIsOwner ? 'Dashboards' : 'Main'}
            </div>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredDashboards.map((item) => {
                  const active = currentPath === item.path || currentPath.startsWith(item.path + '/');
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.title}
                        onClick={() => {
                          if (actuallyIsOwner && pathToRole[item.path]) {
                            handleDashboardSwitch(item.path, pathToRole[item.path]);
                          } else {
                            navigate(item.path);
                          }
                        }}
                        className={NAV_BUTTON_CLASS}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* 3 collapsible groups */}
        {collapsibleGroups.map((group) => (
          <CollapsibleNavGroup
            key={group.key}
            groupKey={group.key}
            label={group.label}
            items={group.items}
            isOpen={groupOpen[group.key] ?? true}
            onToggle={handleToggle}
            currentPath={currentPath}
          />
        ))}

        {/* Driver account section */}
        {hasRole('driver') && (
          <SidebarGroup className="py-0">
            <div className={`px-3 pt-5 pb-1.5 ${GROUP_LABEL_CLASS} group-data-[collapsible=icon]:hidden`}>My Account</div>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/driver/loads'} tooltip="My Loads" className={NAV_BUTTON_CLASS}>
                    <Link to="/driver/loads"><Package /><span>My Loads</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/driver/settlements'} tooltip="My Settlements" className={NAV_BUTTON_CLASS}>
                    <Link to="/driver/settlements"><Receipt /><span>My Settlements</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/driver-stats'} tooltip="My Stats" className={NAV_BUTTON_CLASS}>
                    <Link to="/driver-stats"><BarChart /><span>My Stats</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/driver-settings'} tooltip="My Settings" className={NAV_BUTTON_CLASS}>
                    <Link to="/driver-settings"><Settings /><span>My Settings</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Super Admin */}
        {isSuperAdmin && (
          <SidebarGroup className="py-0">
            <div className={`px-3 pt-5 pb-1.5 ${GROUP_LABEL_CLASS} group-data-[collapsible=icon]:hidden`}>System</div>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/super-admin'} tooltip="Super Admin" className={NAV_BUTTON_CLASS}>
                    <Link to="/super-admin"><ShieldCheck /><span>Super Admin</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center">
            <span className="text-sm font-semibold text-sidebar-foreground">{user?.email?.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.email}</p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">{roles.length > 0 ? roles.join(', ').replace(/_/g, ' ') : 'No role assigned'}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="w-full h-10 justify-start gap-2 bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-destructive/15 hover:text-destructive hover:border-destructive/50">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
