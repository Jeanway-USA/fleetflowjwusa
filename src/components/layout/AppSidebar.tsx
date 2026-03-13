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
  ShieldCheck,
  ChevronsUpDown,
  Plus,
  ChevronRight,
  LucideIcon
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { SubscriptionTier } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useState, useEffect, useCallback, useMemo } from 'react';
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

type AppRole = Database['public']['Enums']['app_role'];

interface NavItem {
  title: string;
  icon: LucideIcon;
  path: string;
  roles: AppRole[];
  feature?: string;
  tourId?: string;
}

const TIER_FEATURES: Record<SubscriptionTier, Set<string>> = {
  open_beta: new Set([
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'dvir', 'fuel_planner', 'crm_basic',
    'drivers', 'dispatch', 'settlements', 'fleet_analytics',
    'gps_tracking', 'payroll', 'driver_performance', 'maintenance_full',
    'trucks', 'trailers', 'incidents', 'safety', 'executive_dashboard',
    'agency_loads', 'commissions', 'crm', 'insights',
  ]),
  solo_bco: new Set([
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'dvir', 'fuel_planner', 'crm_basic',
  ]),
  fleet_owner: new Set([
    'loads', 'ifta', 'maintenance_basic', 'documents', 'profit_loss',
    'dvir', 'fuel_planner', 'crm_basic',
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
    'dvir', 'fuel_planner', 'crm_basic',
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
  onNavigate: (path: string) => void;
}

function CollapsibleNavGroup({ groupKey, label, items, isOpen, onToggle, currentPath, onNavigate }: CollapsibleNavGroupProps) {
  if (items.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={(open) => onToggle(groupKey, open)}>
      <SidebarGroup className="py-0">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group">
          <span>{label}</span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = currentPath === item.path || currentPath.startsWith(item.path + '/');
                return (
                  <SidebarMenuItem key={item.path} {...(item.tourId ? { 'data-tour': item.tourId } : {})}>
                    <SidebarMenuButton
                      isActive={active}
                      onClick={() => onNavigate(item.path)}
                      className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

// --- Main sidebar ---

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, roles, user, hasRole, isOwner, setSimulatedRole, isSimulating, simulatedRole, subscriptionTier, bannerUrl, logoUrl, isSuperAdmin } = useAuth();
  const { theme } = useTheme();
  const actuallyIsOwner = roles.includes('owner');
  const { url: signedBannerUrl } = useSignedUrl('branding-assets', bannerUrl || null);
  const { url: signedLogoUrl } = useSignedUrl('branding-assets', logoUrl || null);
  const hasOrgBranding = !!(signedBannerUrl || signedLogoUrl);
  const bannerSrc = signedBannerUrl || signedLogoUrl || null;
  const currentPath = location.pathname;

  const tierFeatures = TIER_FEATURES[subscriptionTier] || TIER_FEATURES.all_in_one;

  const filterByRoleAndTier = useCallback((items: NavItem[]) => items.filter(item => {
    const roleMatch = item.roles.some(role => hasRole(role));
    const tierMatch = !item.feature || tierFeatures.has(item.feature);
    return roleMatch && tierMatch;
  }), [hasRole, tierFeatures]);

  // --- Dashboard items (non-collapsible) ---
  const dashboardNavItems: NavItem[] = actuallyIsOwner ? [
    { title: 'Executive View', icon: Crown, path: '/executive-dashboard', roles: ['owner'] },
    { title: 'Dispatcher View', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['owner'] },
    { title: 'Driver View', icon: Truck, path: '/driver-dashboard', roles: ['owner'] },
  ] : [
    { title: 'My Dashboard', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['dispatcher'] },
    { title: 'My Dashboard', icon: Truck, path: '/driver-dashboard', roles: ['driver'] },
  ];

  const pathToRole: Record<string, 'owner' | 'dispatcher' | 'driver'> = {
    '/executive-dashboard': 'owner',
    '/dispatcher-dashboard': 'dispatcher',
    '/driver-dashboard': 'driver',
  };

  // --- 3 collapsible groups ---
  const operationsItems: NavItem[] = [
    { title: 'Trucks', icon: Truck, path: '/trucks', roles: ['owner', 'dispatcher', 'safety'], feature: 'trucks' },
    { title: 'Trailers', icon: Container, path: '/trailers', roles: ['owner', 'dispatcher', 'safety'], feature: 'trailers' },
    { title: 'Drivers', icon: Users, path: '/drivers', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety'], feature: 'drivers' },
    { title: 'Fleet Loads', icon: Package, path: '/fleet-loads', roles: ['owner', 'dispatcher', 'safety', 'driver'], feature: 'loads', tourId: 'nav-fleet-loads' },
    { title: 'Agency Loads', icon: Building2, path: '/agency-loads', roles: ['owner', 'dispatcher'], feature: 'agency_loads' },
    { title: 'CRM', icon: Contact, path: '/crm', roles: ['owner', 'dispatcher', 'safety', 'driver'], feature: 'crm' },
    { title: 'Maintenance', icon: Wrench, path: '/maintenance', roles: ['owner', 'safety'], feature: 'maintenance_full' },
  ];

  const safetyItems: NavItem[] = [
    { title: 'Safety', icon: Shield, path: '/safety', roles: ['owner', 'safety'], feature: 'safety' },
    { title: 'Incidents', icon: AlertTriangle, path: '/incidents', roles: ['owner', 'safety', 'dispatcher'], feature: 'incidents' },
    { title: 'Driver Performance', icon: Award, path: '/driver-performance', roles: ['owner', 'safety', 'dispatcher'], feature: 'driver_performance' },
    { title: 'Documents', icon: FileText, path: '/documents', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety', 'driver'], feature: 'documents' },
  ];

  const backOfficeItems: NavItem[] = [
    { title: 'Finance & P/L', icon: TrendingUp, path: '/finance', roles: ['owner', 'payroll_admin'], feature: 'profit_loss', tourId: 'nav-finance' },
    { title: 'Company Insights', icon: BarChart3, path: '/insights', roles: ['owner', 'payroll_admin'], feature: 'insights' },
    { title: 'IFTA Reporting', icon: Fuel, path: '/ifta', roles: ['owner', 'payroll_admin'], feature: 'ifta' },
  ];

  const filteredOps = useMemo(() => filterByRoleAndTier(operationsItems), [filterByRoleAndTier]);
  const filteredSafety = useMemo(() => filterByRoleAndTier(safetyItems), [filterByRoleAndTier]);
  const filteredBackOffice = useMemo(() => filterByRoleAndTier(backOfficeItems), [filterByRoleAndTier]);

  // Settings goes in back office only for owners
  const backOfficeWithSettings = useMemo(() => {
    if (actuallyIsOwner && !isSimulating) {
      return [...filteredBackOffice, { title: 'Settings', icon: Settings, path: '/settings', roles: ['owner'] as AppRole[], feature: undefined }];
    }
    return filteredBackOffice;
  }, [filteredBackOffice, actuallyIsOwner, isSimulating]);

  const collapsibleGroups = useMemo(() => [
    { key: 'operations', label: 'Operations', items: filteredOps },
    { key: 'safety', label: 'Safety & Compliance', items: filteredSafety },
    { key: 'backoffice', label: 'Back Office', items: backOfficeWithSettings },
  ], [filteredOps, filteredSafety, backOfficeWithSettings]);

  // --- Collapsible state with localStorage + auto-expand ---
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => {
    const saved = loadGroupState();
    const defaults: Record<string, boolean> = { operations: true, safety: true, backoffice: true };
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

  const handleDashboardSwitch = (path: string, role: 'owner' | 'dispatcher' | 'driver') => {
    if (actuallyIsOwner) {
      if (role === 'owner') {
        setSimulatedRole(null);
      } else {
        setSimulatedRole(role);
      }
    }
    navigate(path);
  };

  const filteredDashboards = actuallyIsOwner ? dashboardNavItems : dashboardNavItems.filter(item => item.roles.some(r => hasRole(r)));

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4 space-y-2">
        <div className="flex items-center justify-center">
          {bannerSrc ? (
            <img src={bannerSrc} alt="Company Logo" className="h-12 w-auto object-contain" />
          ) : (
            <div className="text-center">
              <span className="text-lg font-extrabold text-gradient-gold tracking-tight">Fleet Flow TMS</span>
              <p className="text-[10px] text-muted-foreground -mt-0.5">by JeanWayUSA</p>
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
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                        onClick={() => {
                          if (actuallyIsOwner && pathToRole[item.path]) {
                            handleDashboardSwitch(item.path, pathToRole[item.path]);
                          } else {
                            navigate(item.path);
                          }
                        }}
                        className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary"
                      >
                        <item.icon className="h-4 w-4" />
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
            onNavigate={(path) => navigate(path)}
          />
        ))}

        {/* Driver account section */}
        {hasRole('driver') && (
          <SidebarGroup className="py-0">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">My Account</div>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={currentPath === '/driver-stats'} onClick={() => navigate('/driver-stats')} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary">
                    <BarChart className="h-4 w-4" />
                    <span>My Stats</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={currentPath === '/driver-settings'} onClick={() => navigate('/driver-settings')} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary">
                    <Settings className="h-4 w-4" />
                    <span>My Settings</span>
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
                  <SidebarMenuButton isActive={currentPath === '/super-admin'} onClick={() => navigate('/super-admin')} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Super Admin</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
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
