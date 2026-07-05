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
  Container,
  Contact,
  AlertTriangle,
  Award,
  Fuel,
  BarChart,
  Receipt,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  ClipboardList,
  Handshake,
  Radio,
  LucideIcon,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

interface NavItem {
  title: string;
  icon: LucideIcon;
  path: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Admin operational groups — the daily-ops focus for JeanWay staff.
const ADMIN_GROUPS: NavGroup[] = [
  {
    label: 'Dispatch & Loads',
    items: [
      { title: 'Load Board', icon: LayoutDashboard, path: '/dispatcher-dashboard' },
      { title: 'Loads', icon: Package, path: '/fleet-loads' },
      { title: 'Agency Loads', icon: Handshake, path: '/agency-loads' },
    ],
  },
  {
    label: 'Fleet & Maintenance',
    items: [
      { title: 'Trucks & Equipment', icon: Truck, path: '/trucks' },
      { title: 'Trailers', icon: Container, path: '/trailers' },
      { title: 'Maintenance', icon: Wrench, path: '/maintenance' },
      { title: 'Telematics', icon: Radio, path: '/maintenance-home' },
    ],
  },
  {
    label: 'Drivers & Payroll',
    items: [
      { title: 'Driver Roster', icon: Users, path: '/drivers' },
      { title: 'Driver Performance', icon: Award, path: '/driver-performance' },
      { title: 'Payroll Setup', icon: Receipt, path: '/settings/payroll-setup' },
    ],
  },
  {
    label: 'Financials',
    items: [
      { title: 'Finance & P/L', icon: TrendingUp, path: '/finance' },
      { title: 'Company Insights', icon: BarChart3, path: '/insights' },
      { title: 'IFTA', icon: Fuel, path: '/ifta' },
    ],
  },
  {
    label: 'Safety & Compliance',
    items: [
      { title: 'Safety', icon: Shield, path: '/safety' },
      { title: 'Incidents', icon: AlertTriangle, path: '/incidents' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { title: 'Partners (CRM)', icon: Contact, path: '/crm' },
      { title: 'Documents', icon: FileText, path: '/documents' },
      { title: 'Audit Trail', icon: ShieldCheck, path: '/audit-trail' },
      { title: 'Settings', icon: Settings, path: '/settings' },
    ],
  },
];

// Driver portal — restricted to the driver's own view.
const DRIVER_ITEMS: NavItem[] = [
  { title: 'My Dashboard', icon: LayoutDashboard, path: '/driver-dashboard' },
  { title: 'My Loads', icon: Package, path: '/driver/loads' },
  { title: 'My Settlements', icon: Receipt, path: '/driver/settlements' },
  { title: 'My Stats', icon: BarChart, path: '/driver-stats' },
  { title: 'My Settings', icon: Settings, path: '/driver-settings' },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, hasRole, isSuperAdmin } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const currentPath = location.pathname;

  const isDriverOnly = hasRole('driver') && !hasRole('owner');

  const handleSignOut = async () => {
    navigate('/');
    await signOut();
  };

  const renderItem = (item: NavItem) => {
    const isActive =
      currentPath === item.path || currentPath.startsWith(item.path + '/');
    return (
      <SidebarMenuItem key={item.path}>
        <SidebarMenuButton
          asChild
          isActive={isActive}
          tooltip={collapsed ? item.title : undefined}
          className="hover:bg-sidebar-accent data-[active=true]:bg-primary/15 data-[active=true]:text-primary data-[active=true]:font-semibold data-[active=true]:border-l-2 data-[active=true]:border-primary"
        >
          <NavLink to={item.path} className="flex items-center gap-2">
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.title}</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight tracking-tight">JeanWay TMS</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Fleet Operations
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {isDriverOnly ? (
          <SidebarGroup>
            <SidebarGroupLabel>Driver Portal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{DRIVER_ITEMS.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          ADMIN_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))

        )}

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>System</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {renderItem({ title: 'Super Admin', icon: ShieldCheck, path: '/super-admin' })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-sm font-medium text-muted-foreground">
                {user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.email}</p>
              <p className="text-[10px] text-muted-foreground">
                {isDriverOnly ? 'Driver' : 'Admin'}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="w-full justify-start gap-2 border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
