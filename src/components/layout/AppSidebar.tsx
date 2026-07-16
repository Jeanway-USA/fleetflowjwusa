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
  ChevronsUpDown,
  Plus,
  ChevronRight,
  LucideIcon
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Database } from '@/integrations/supabase/types';
import logoIcon from '@/assets/Logo.png';
import textLogo from '@/assets/Text_Logo.png';

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
  "relative h-9 gap-2.5 rounded-md text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-foreground " +
  "data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium " +
  "data-[active=true]:before:absolute data-[active=true]:before:left-0 data-[active=true]:before:top-1.5 data-[active=true]:before:bottom-1.5 " +
  "data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-primary " +
  "[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-primary";

function CollapsibleNavGroup({ groupKey, label, items, isOpen, onToggle, currentPath }: CollapsibleNavGroupProps) {
  if (items.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={(open) => onToggle(groupKey, open)}>
      <SidebarGroup className="py-0 border-t border-sidebar-border/50 first:border-t-0 group-data-[collapsible=icon]:border-t-0">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-foreground transition-colors group group-data-[collapsible=icon]:hidden">
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
  const hideDiscord = orgName?.toLowerCase().includes('jeanway') ?? false;
  const { tmsMode: currentTmsMode } = useOrganizationMode();
  const { theme } = useTheme();
  const actuallyIsOwner = roles.includes('owner');
  const { url: signedBannerUrl } = useSignedUrl('branding-assets', bannerUrl || null);
  const { url: signedLogoUrl } = useSignedUrl('branding-assets', logoUrl || null);
  const hasOrgBranding = !!(signedBannerUrl || signedLogoUrl);
  const bannerSrc = signedBannerUrl || signedLogoUrl || null;
  const currentPath = location.pathname;
  const simulationSwitchTimerRef = useRef<number | null>(null);

  const tierFeatures = TIER_FEATURES[subscriptionTier] || TIER_FEATURES.all_in_one;

  const filterByRoleAndTier = useCallback((items: NavItem[]) => items.filter(item => {
    // Owners see every nav item (unless they're simulating a lower role,
    // in which case hasRole('owner') is false and normal filtering applies).
    const roleMatch = hasRole('owner') || item.roles.some(role => hasRole(role));
    const tierMatch = !item.feature || tierFeatures.has(item.feature);
    const modeMatch = !item.tmsMode || item.tmsMode === currentTmsMode;
    return roleMatch && tierMatch && modeMatch;
  }), [hasRole, tierFeatures, currentTmsMode]);

  // --- Dashboard items (non-collapsible) ---
  const dashboardNavItems: NavItem[] = actuallyIsOwner ? [
    { title: 'Executive View', icon: Crown, path: '/executive-dashboard', roles: ['owner'] },
    { title: 'Dispatcher View', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['owner'] },
    { title: 'Driver View', icon: Truck, path: '/driver-dashboard', roles: ['owner'] },
    { title: 'Maintenance View', icon: Wrench, path: '/maintenance-home', roles: ['owner'], feature: 'maintenance_full' },
  ] : [
    { title: 'My Dashboard', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['dispatcher'] },
    { title: 'My Dashboard', icon: Truck, path: '/driver-dashboard', roles: ['driver'] },
    { title: 'My Dashboard', icon: Wrench, path: '/maintenance-home', roles: ['maintenance'], feature: 'maintenance_full' },
  ];

  const pathToRole: Record<string, 'owner' | 'dispatcher' | 'driver' | 'maintenance'> = {
    '/executive-dashboard': 'owner',
    '/dispatcher-dashboard': 'dispatcher',
    '/driver-dashboard': 'driver',
    '/maintenance-home': 'maintenance',
    '/maintenance': 'maintenance',
  };

  // --- Collapsible groups ---
  const operationsItems: NavItem[] = [
    { title: 'Fleet Loads', icon: Package, path: '/fleet-loads', roles: ['owner', 'dispatcher', 'safety'], feature: 'loads', tourId: 'nav-fleet-loads' },
    { title: 'Agency Loads', icon: Building2, path: '/agency-loads', roles: ['owner', 'dispatcher'], feature: 'agency_loads' },
    { title: 'Drivers', icon: Users, path: '/drivers', roles: ['owner', 'payroll_admin'], feature: 'drivers' },
    { title: 'Trucks', icon: Truck, path: '/trucks', roles: ['owner', 'safety', 'maintenance'], feature: 'trucks' },
    { title: 'Trailers', icon: Container, path: '/trailers', roles: ['owner', 'safety', 'maintenance'], feature: 'trailers' },
  ];

  const financeItems: NavItem[] = [
    { title: 'Finance & P/L', icon: TrendingUp, path: '/finance', roles: ['owner', 'payroll_admin'], feature: 'profit_loss', tourId: 'nav-finance' },
    { title: 'Tax Hub', icon: Receipt, path: '/admin/tax-hub', roles: ['owner', 'payroll_admin'], feature: 'profit_loss' },
    { title: 'IFTA Reporting', icon: Fuel, path: '/ifta', roles: ['owner', 'payroll_admin'], feature: 'ifta', tmsMode: 'independent' as TmsMode },
  ];

  const complianceItems: NavItem[] = [
    { title: 'Safety', icon: Shield, path: '/safety', roles: ['owner', 'safety'], feature: 'safety' },
    { title: 'Incidents', icon: AlertTriangle, path: '/incidents', roles: ['owner', 'safety'], feature: 'incidents' },
    { title: 'Driver Performance', icon: Award, path: '/driver-performance', roles: ['owner', 'safety'], feature: 'driver_performance' },
    { title: 'Maintenance', icon: Wrench, path: '/maintenance', roles: ['owner', 'maintenance'], feature: 'maintenance_full' },
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
      <SidebarHeader className="border-b border-sidebar-border p-4 space-y-2">
        <div className="flex items-center justify-center">
          {bannerSrc ? (
            <img src={bannerSrc} alt="Company Logo" className="h-12 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-2">
              <img src={logoIcon} alt="" className="h-8 w-auto" />
              <img src={textLogo} alt="FleetFlow TMS by JeanWay USA" className="h-8 w-auto" />
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors">
              <span className="font-medium truncate">{user?.email?.split('@')[0] || 'Workspace'}</span>
              <ChevronsUpDown className="h-3 w-3 text-muted-foreground shrink-0 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem disabled className="opacity-100 font-medium">
              <span className="truncate">{user?.email?.split('@')[0] || 'Workspace'}</span>
              <Badge variant="outline" className="ml-auto text-[10px] px-1">Active</Badge>
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="text-muted-foreground">
              <Plus className="h-3.5 w-3.5 mr-2" />
              Add Workspace
              <Badge variant="secondary" className="ml-auto text-[10px] px-1">Soon</Badge>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="px-2" data-tour="sidebar-nav">
        {/* Simulation Mode Banner */}
        {isSimulating && actuallyIsOwner && (
          <div className="mx-2 mt-2 mb-1 p-2 rounded-md bg-warning/10 border border-warning/30">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-warning capitalize">
                Viewing as: {simulatedRole?.replace('_', ' ')}
              </span>
              <Button 
                variant="ghost" size="sm"
                className="h-6 px-2 text-xs text-warning hover:bg-warning/20"
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
            <div className="px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
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
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My Account</div>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/driver/loads'} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary">
                    <Link to="/driver/loads">
                      <Package className="h-4 w-4" />
                      <span>My Loads</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/driver/settlements'} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary">
                    <Link to="/driver/settlements">
                      <Receipt className="h-4 w-4" />
                      <span>My Settlements</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/driver-stats'} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary">
                    <Link to="/driver-stats">
                      <BarChart className="h-4 w-4" />
                      <span>My Stats</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/driver-settings'} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary">
                    <Link to="/driver-settings">
                      <Settings className="h-4 w-4" />
                      <span>My Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Super Admin */}
        {isSuperAdmin && (
          <SidebarGroup className="py-0">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">System</div>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={currentPath === '/super-admin'} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary">
                    <Link to="/super-admin">
                      <ShieldCheck className="h-4 w-4" />
                      <span>Super Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!hideDiscord && (
          <a
            href="https://discord.gg/HAQA8fACan"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors mb-3"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            <span>Community & Support</span>
          </a>
        )}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <span className="text-sm font-medium text-muted-foreground">{user?.email?.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.email}</p>
            <p className="text-xs text-muted-foreground capitalize">{roles.length > 0 ? roles.join(', ').replace(/_/g, ' ') : 'No role assigned'}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleSignOut} className="w-full justify-start gap-2 border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50">
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
