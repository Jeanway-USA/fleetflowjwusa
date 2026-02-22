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
  LucideIcon
} from 'lucide-react';
import jwBannerLight from '@/assets/JW_Banner.png';
import jwBannerDark from '@/assets/JW_Banner_Dark.png';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { SubscriptionTier } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
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
  /** Feature key for tier gating. If undefined, always shown when role matches. */
  feature?: string;
}

// Maps tier to the set of feature keys it unlocks
const TIER_FEATURES: Record<SubscriptionTier, Set<string>> = {
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

const SUPER_ADMIN_EMAILS = ['andrew@jeanwayusa.com', 'siadrak@jeanwayusa.com'];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, roles, user, hasRole, isOwner, setSimulatedRole, isSimulating, simulatedRole, subscriptionTier, bannerUrl } = useAuth();
  const { theme } = useTheme();
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '');
  
  // Check if user is actually an owner (not simulated)
  const actuallyIsOwner = roles.includes('owner');
  
  // Dynamic banner: use org's custom banner if available, otherwise defaults
  const { url: signedBannerUrl } = useSignedUrl('branding-assets', bannerUrl || null);
  
  // Use dark banner on light backgrounds, light banner on dark backgrounds
  const defaultBannerSrc = theme === 'dark' ? jwBannerLight : jwBannerDark;
  const bannerSrc = signedBannerUrl || defaultBannerSrc;

  const handleSignOut = async () => {
    // Navigate immediately so the user sees the auth screen even if sign-out takes a moment.
    navigate('/');
    await signOut();
  };

  const handleDashboardSwitch = (path: string, role: 'owner' | 'dispatcher' | 'driver') => {
    if (actuallyIsOwner) {
      // For owners, set simulation mode when switching to non-owner dashboards
      if (role === 'owner') {
        setSimulatedRole(null); // Exit simulation
      } else {
        setSimulatedRole(role);
      }
    }
    navigate(path);
  };

  // Dashboard items - owners can see all, others only see their own
  const dashboardNavItems: NavItem[] = actuallyIsOwner ? [
    { title: 'Executive View', icon: Crown, path: '/executive-dashboard', roles: ['owner'] },
    { title: 'Dispatcher View', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['owner'] },
    { title: 'Driver View', icon: Truck, path: '/driver-dashboard', roles: ['owner'] },
  ] : [
    { title: 'My Dashboard', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['dispatcher'] },
    { title: 'My Dashboard', icon: Truck, path: '/driver-dashboard', roles: ['driver'] },
  ];

  // Map paths to roles for simulation
  const pathToRole: Record<string, 'owner' | 'dispatcher' | 'driver'> = {
    '/executive-dashboard': 'owner',
    '/dispatcher-dashboard': 'dispatcher',
    '/driver-dashboard': 'driver',
  };

  const fleetNavItems: NavItem[] = [
    { title: 'Trucks', icon: Truck, path: '/trucks', roles: ['owner', 'dispatcher', 'safety'], feature: 'trucks' },
    { title: 'Trailers', icon: Container, path: '/trailers', roles: ['owner', 'dispatcher', 'safety'], feature: 'trailers' },
    { title: 'Drivers', icon: Users, path: '/drivers', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety'], feature: 'drivers' },
  ];

  const loadsNavItems: NavItem[] = [
    { title: 'Fleet Loads', icon: Package, path: '/fleet-loads', roles: ['owner', 'dispatcher', 'safety', 'driver'], feature: 'loads' },
    { title: 'Agency Loads', icon: Building2, path: '/agency-loads', roles: ['owner', 'dispatcher'], feature: 'agency_loads' },
  ];

  const financeNavItems: NavItem[] = [
    { title: 'Finance & P/L', icon: TrendingUp, path: '/finance', roles: ['owner', 'payroll_admin'], feature: 'profit_loss' },
    { title: 'Company Insights', icon: BarChart3, path: '/insights', roles: ['owner', 'payroll_admin'], feature: 'insights' },
    { title: 'IFTA Reporting', icon: Fuel, path: '/ifta', roles: ['owner', 'payroll_admin'], feature: 'ifta' },
  ];

  const operationsNavItems: NavItem[] = [
    { title: 'CRM', icon: Contact, path: '/crm', roles: ['owner', 'dispatcher', 'safety', 'driver'], feature: 'crm' },
    { title: 'Maintenance', icon: Wrench, path: '/maintenance', roles: ['owner', 'safety'], feature: 'maintenance_full' },
    { title: 'Documents', icon: FileText, path: '/documents', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety', 'driver'], feature: 'documents' },
    { title: 'Safety', icon: Shield, path: '/safety', roles: ['owner', 'safety'], feature: 'safety' },
    { title: 'Incidents', icon: AlertTriangle, path: '/incidents', roles: ['owner', 'safety', 'dispatcher'], feature: 'incidents' },
    { title: 'Driver Performance', icon: Award, path: '/driver-performance', roles: ['owner', 'safety', 'dispatcher'], feature: 'driver_performance' },
  ];

  const tierFeatures = TIER_FEATURES[subscriptionTier] || TIER_FEATURES.all_in_one;

  const filterByRoleAndTier = (items: NavItem[]) => items.filter(item => {
    const roleMatch = item.roles.some(role => hasRole(role));
    const tierMatch = !item.feature || tierFeatures.has(item.feature);
    return roleMatch && tierMatch;
  });

  const renderNavGroup = (label: string, items: NavItem[], isDashboardGroup: boolean = false) => {
    const filteredItems = isDashboardGroup && actuallyIsOwner 
      ? items // Show all dashboard items for actual owners
      : filterByRoleAndTier(items);
    if (filteredItems.length === 0) return null;

    return (
      <SidebarGroup>
        <SidebarGroupLabel className="text-muted-foreground uppercase text-xs tracking-wider">{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {filteredItems.map((item) => (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={location.pathname === item.path}
                  onClick={() => {
                    if (isDashboardGroup && actuallyIsOwner && pathToRole[item.path]) {
                      handleDashboardSwitch(item.path, pathToRole[item.path]);
                    } else {
                      navigate(item.path);
                    }
                  }}
                  className="hover:bg-sidebar-accent data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4 space-y-2">
        <div className="flex items-center justify-center">
          <img 
            src={bannerSrc} 
            alt="JeanWay USA - Gets You There" 
            className="h-12 w-auto object-contain"
          />
        </div>
        {/* Workspace Switcher Placeholder */}
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

      <SidebarContent className="px-2">
        {/* Simulation Mode Banner */}
        {isSimulating && actuallyIsOwner && (
          <div className="mx-2 mt-2 mb-1 p-2 rounded-md bg-warning/10 border border-warning/30">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-warning capitalize">
                Viewing as: {simulatedRole?.replace('_', ' ')}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs text-warning hover:bg-warning/20"
                onClick={() => {
                  setSimulatedRole(null);
                  navigate('/executive-dashboard');
                }}
              >
                Exit
              </Button>
            </div>
          </div>
        )}

        {(() => {
          const groups = [
            { label: actuallyIsOwner ? 'Dashboards' : 'Main', items: dashboardNavItems, isDashboard: true },
            { label: 'Fleet', items: fleetNavItems, isDashboard: false },
            { label: 'Loads', items: loadsNavItems, isDashboard: false },
            { label: 'Finance', items: financeNavItems, isDashboard: false },
            { label: 'Operations', items: operationsNavItems, isDashboard: false },
          ];
          
          const visibleGroups = groups.filter(g => 
            g.isDashboard && actuallyIsOwner 
              ? g.items.length > 0 
              : filterByRoleAndTier(g.items).length > 0
          );
          
          return visibleGroups.map((group, index) => (
            <div key={group.label}>
              {index > 0 && <SidebarSeparator />}
              {renderNavGroup(group.label, group.items, group.isDashboard)}
            </div>
          ));
        })()}
        
        {actuallyIsOwner && !isSimulating && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground uppercase text-xs tracking-wider">Admin</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={location.pathname === '/settings'} onClick={() => navigate('/settings')} className="hover:bg-sidebar-accent">
                      <Settings className="h-4 w-4" />
                      <span>Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
        
        {hasRole('driver') && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground uppercase text-xs tracking-wider">My Account</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={location.pathname === '/driver-stats'} onClick={() => navigate('/driver-stats')} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/10 data-[active=true]:text-primary">
                      <BarChart className="h-4 w-4" />
                      <span>My Stats</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton isActive={location.pathname === '/driver-settings'} onClick={() => navigate('/driver-settings')} className="hover:bg-sidebar-accent data-[active=true]:bg-primary/10 data-[active=true]:text-primary">
                      <Settings className="h-4 w-4" />
                      <span>My Settings</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {isSuperAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground uppercase text-xs tracking-wider">System</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={location.pathname === '/super-admin'}
                      onClick={() => navigate('/super-admin')}
                      className="hover:bg-sidebar-accent data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      <span>Super Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
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
