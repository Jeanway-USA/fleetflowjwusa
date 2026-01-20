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
  BookOpen,
  BarChart3,
  Crown,
  LucideIcon
} from 'lucide-react';
import jwBannerLight from '@/assets/JW_Banner.png';
import jwBannerDark from '@/assets/JW_Banner_Dark.png';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
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
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface NavItem {
  title: string;
  icon: LucideIcon;
  path: string;
  roles: AppRole[];
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, roles, user, hasRole, isOwner } = useAuth();
  const { theme } = useTheme();
  
  // Use dark banner on light backgrounds, light banner on dark backgrounds
  const bannerSrc = theme === 'dark' ? jwBannerLight : jwBannerDark;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const mainNavItems: NavItem[] = [
    { title: 'Executive View', icon: Crown, path: '/executive-dashboard', roles: ['owner'] },
    { title: 'My Dashboard', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['dispatcher'] },
    { title: 'My Dashboard', icon: Truck, path: '/driver-dashboard', roles: ['driver'] },
  ];

  const fleetNavItems: NavItem[] = [
    { title: 'Trucks', icon: Truck, path: '/trucks', roles: ['owner', 'dispatcher', 'safety'] },
    { title: 'Drivers', icon: Users, path: '/drivers', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety'] },
  ];

  const loadsNavItems: NavItem[] = [
    { title: 'Fleet Loads', icon: Package, path: '/fleet-loads', roles: ['owner', 'dispatcher', 'safety', 'driver'] },
    { title: 'Agency Loads', icon: Building2, path: '/agency-loads', roles: ['owner', 'dispatcher'] },
  ];

  const financeNavItems: NavItem[] = [
    { title: 'Finance & P/L', icon: TrendingUp, path: '/finance', roles: ['owner', 'payroll_admin'] },
    { title: 'Company Insights', icon: BarChart3, path: '/insights', roles: ['owner', 'payroll_admin'] },
  ];

  const operationsNavItems: NavItem[] = [
    { title: 'Resources', icon: BookOpen, path: '/resources', roles: ['owner', 'dispatcher', 'safety', 'driver'] },
    { title: 'Maintenance', icon: Wrench, path: '/maintenance', roles: ['owner', 'safety'] },
    { title: 'Documents', icon: FileText, path: '/documents', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety', 'driver'] },
    { title: 'Safety', icon: Shield, path: '/safety', roles: ['owner', 'safety'] },
  ];

  const filterByRole = (items: NavItem[]) => items.filter(item => item.roles.some(role => hasRole(role)));

  const renderNavGroup = (label: string, items: NavItem[]) => {
    const filteredItems = filterByRole(items);
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
                  onClick={() => navigate(item.path)}
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
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center justify-center">
          <img 
            src={bannerSrc} 
            alt="JeanWay USA - Gets You There" 
            className="h-12 w-auto object-contain"
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {(() => {
          const groups = [
            { label: 'Main', items: mainNavItems },
            { label: 'Fleet', items: fleetNavItems },
            { label: 'Loads', items: loadsNavItems },
            { label: 'Finance', items: financeNavItems },
            { label: 'Operations', items: operationsNavItems },
          ];
          
          const visibleGroups = groups.filter(g => filterByRole(g.items).length > 0);
          
          return visibleGroups.map((group, index) => (
            <div key={group.label}>
              {index > 0 && <SidebarSeparator />}
              {renderNavGroup(group.label, group.items)}
            </div>
          ));
        })()}
        
        {isOwner && (
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
              <SidebarGroupLabel className="text-muted-foreground uppercase text-xs tracking-wider">Settings</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
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
