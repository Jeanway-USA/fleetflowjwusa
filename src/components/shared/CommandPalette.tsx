import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, Truck, Package, Users, TrendingUp, FileText,
  Wrench, Settings, Shield, Building2, BarChart3, Crown, Container,
  Contact, AlertTriangle, Award, Fuel, Plus, Upload, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import type { SubscriptionTier } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';
import type { LucideIcon } from 'lucide-react';

type AppRole = Database['public']['Enums']['app_role'];

interface PaletteItem {
  label: string;
  icon: LucideIcon;
  path: string;
  roles: AppRole[];
  feature?: string;
}

const TIER_FEATURES: Record<SubscriptionTier, Set<string>> = {
  solo_bco: new Set(['loads','ifta','maintenance_basic','documents','profit_loss','dvir','fuel_planner','crm_basic']),
  fleet_owner: new Set(['loads','ifta','maintenance_basic','documents','profit_loss','dvir','fuel_planner','crm_basic','drivers','dispatch','settlements','fleet_analytics','gps_tracking','payroll','driver_performance','maintenance_full','trucks','trailers','incidents','safety','executive_dashboard','insights']),
  agency: new Set(['agency_loads','commissions','crm','documents','insights']),
  all_in_one: new Set(['loads','ifta','maintenance_basic','documents','profit_loss','dvir','fuel_planner','crm_basic','drivers','dispatch','settlements','fleet_analytics','gps_tracking','payroll','driver_performance','maintenance_full','trucks','trailers','incidents','safety','executive_dashboard','agency_loads','commissions','crm','insights']),
};

const NAV_ITEMS: PaletteItem[] = [
  { label: 'Executive Dashboard', icon: Crown, path: '/executive-dashboard', roles: ['owner'], feature: 'executive_dashboard' },
  { label: 'Dispatcher Dashboard', icon: LayoutDashboard, path: '/dispatcher-dashboard', roles: ['owner', 'dispatcher'] },
  { label: 'Driver Dashboard', icon: Truck, path: '/driver-dashboard', roles: ['owner', 'driver'] },
  { label: 'Trucks', icon: Truck, path: '/trucks', roles: ['owner', 'dispatcher', 'safety'], feature: 'trucks' },
  { label: 'Trailers', icon: Container, path: '/trailers', roles: ['owner', 'dispatcher', 'safety'], feature: 'trailers' },
  { label: 'Drivers', icon: Users, path: '/drivers', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety'], feature: 'drivers' },
  { label: 'Fleet Loads', icon: Package, path: '/fleet-loads', roles: ['owner', 'dispatcher', 'safety', 'driver'], feature: 'loads' },
  { label: 'Agency Loads', icon: Building2, path: '/agency-loads', roles: ['owner', 'dispatcher'], feature: 'agency_loads' },
  { label: 'Finance & P/L', icon: TrendingUp, path: '/finance', roles: ['owner', 'payroll_admin'], feature: 'profit_loss' },
  { label: 'Company Insights', icon: BarChart3, path: '/insights', roles: ['owner', 'payroll_admin'], feature: 'insights' },
  { label: 'IFTA Reporting', icon: Fuel, path: '/ifta', roles: ['owner', 'payroll_admin'], feature: 'ifta' },
  { label: 'CRM', icon: Contact, path: '/crm', roles: ['owner', 'dispatcher', 'safety', 'driver'], feature: 'crm' },
  { label: 'Maintenance', icon: Wrench, path: '/maintenance', roles: ['owner', 'safety'], feature: 'maintenance_full' },
  { label: 'Documents', icon: FileText, path: '/documents', roles: ['owner', 'payroll_admin', 'dispatcher', 'safety', 'driver'], feature: 'documents' },
  { label: 'Safety', icon: Shield, path: '/safety', roles: ['owner', 'safety'], feature: 'safety' },
  { label: 'Incidents', icon: AlertTriangle, path: '/incidents', roles: ['owner', 'safety', 'dispatcher'], feature: 'incidents' },
  { label: 'Driver Performance', icon: Award, path: '/driver-performance', roles: ['owner', 'safety', 'dispatcher'], feature: 'driver_performance' },
  { label: 'Settings', icon: Settings, path: '/settings', roles: ['owner'] },
];

const QUICK_ACTIONS: PaletteItem[] = [
  { label: 'New Load', icon: Plus, path: '/fleet-loads', roles: ['owner', 'dispatcher'], feature: 'loads' },
  { label: 'Upload Expense Report', icon: Upload, path: '/finance', roles: ['owner', 'payroll_admin'], feature: 'profit_loss' },
  { label: 'New Maintenance Request', icon: Wrench, path: '/maintenance', roles: ['owner', 'safety'], feature: 'maintenance_full' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { hasRole, subscriptionTier } = useAuth();

  const tierFeatures = TIER_FEATURES[subscriptionTier] || TIER_FEATURES.all_in_one;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filter = (items: PaletteItem[]) =>
    items.filter(item => {
      const roleMatch = item.roles.some(r => hasRole(r));
      const tierMatch = !item.feature || tierFeatures.has(item.feature);
      return roleMatch && tierMatch;
    });

  const navItems = filter(NAV_ITEMS);
  const quickActions = filter(QUICK_ACTIONS);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          {navItems.map(item => (
            <CommandItem key={item.path} onSelect={() => handleSelect(item.path)}>
              <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {quickActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick Actions">
              {quickActions.map(item => (
                <CommandItem key={`action-${item.label}`} onSelect={() => handleSelect(item.path)}>
                  <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
