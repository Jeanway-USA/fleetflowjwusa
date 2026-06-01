import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  LayoutDashboard, Truck, Package, Users, TrendingUp, FileText,
  Wrench, Settings, Shield, Building2, BarChart3, Crown, Container,
  Contact, AlertTriangle, Award, Fuel, Plus, Upload, UserCheck,
  RefreshCw, Search, MapPin, Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { SubscriptionTier } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';
import type { LucideIcon } from 'lucide-react';

type AppRole = Database['public']['Enums']['app_role'];

interface PaletteItem {
  label: string;
  icon: LucideIcon;
  path?: string;
  action?: () => void;
  roles: AppRole[];
  feature?: string;
  shortcut?: string;
}

const TIER_FEATURES: Record<SubscriptionTier, Set<string>> = {
  open_beta: new Set(['loads','ifta','maintenance_basic','documents','profit_loss','dvir','crm_basic','drivers','dispatch','settlements','fleet_analytics','gps_tracking','payroll','driver_performance','maintenance_full','trucks','trailers','incidents','safety','executive_dashboard','agency_loads','commissions','crm','insights']),
  solo_bco: new Set(['loads','ifta','maintenance_basic','documents','profit_loss','dvir','crm_basic']),
  fleet_owner: new Set(['loads','ifta','maintenance_basic','documents','profit_loss','dvir','crm_basic','drivers','dispatch','settlements','fleet_analytics','gps_tracking','payroll','driver_performance','maintenance_full','trucks','trailers','incidents','safety','executive_dashboard','insights']),
  agency: new Set(['agency_loads','commissions','crm','documents','insights']),
  all_in_one: new Set(['loads','ifta','maintenance_basic','documents','profit_loss','dvir','crm_basic','drivers','dispatch','settlements','fleet_analytics','gps_tracking','payroll','driver_performance','maintenance_full','trucks','trailers','incidents','safety','executive_dashboard','agency_loads','commissions','crm','insights']),
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

const TYPE_ICON: Record<string, LucideIcon> = {
  broker: Building2,
  agent: UserCheck,
  shipper: Package,
  receiver: MapPin,
  vendor: Wrench,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  assigned: 'bg-blue-500/10 text-blue-600',
  in_transit: 'bg-amber-500/10 text-amber-600',
  delivered: 'bg-green-500/10 text-green-600',
  cancelled: 'bg-destructive/10 text-destructive',
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const navigate = useNavigate();
  const { hasRole, subscriptionTier } = useAuth();

  const tierFeatures = TIER_FEATURES[subscriptionTier] || TIER_FEATURES.all_in_one;

  // Cmd/Ctrl+K and external open events
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    const externalOpen = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('open-command-palette', externalOpen);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('open-command-palette', externalOpen);
    };
  }, []);

  // Reset query when closed
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [open]);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Parse broker: prefix
  const brokerOnly = debouncedQuery.toLowerCase().startsWith('broker:');
  const searchTerm = brokerOnly ? debouncedQuery.slice(7).trim() : debouncedQuery;
  const isSearching = searchTerm.length >= 2;

  // Combined search: CRM contacts + active fleet loads
  const { data: results, isFetching } = useQuery({
    queryKey: ['palette-search', searchTerm, brokerOnly],
    enabled: isSearching,
    staleTime: 30_000,
    queryFn: async () => {
      const like = `%${searchTerm}%`;

      let contactsQuery = supabase
        .from('crm_contacts')
        .select('id, company_name, contact_name, contact_type, city, state')
        .eq('is_active', true)
        .or(`company_name.ilike.${like},contact_name.ilike.${like},email.ilike.${like}`)
        .limit(8);
      if (brokerOnly) contactsQuery = contactsQuery.eq('contact_type', 'broker');

      const loadsPromise = brokerOnly
        ? Promise.resolve({ data: [], error: null })
        : supabase
            .from('fleet_loads')
            .select('id, landstar_load_id, origin, destination, status')
            .not('status', 'in', '(delivered,cancelled)')
            .or(`origin.ilike.${like},destination.ilike.${like},landstar_load_id.ilike.${like}`)
            .limit(8);

      const [contactsRes, loadsRes] = await Promise.all([contactsQuery, loadsPromise]);
      return {
        contacts: (contactsRes.data ?? []) as Array<{ id: string; company_name: string; contact_name: string | null; contact_type: string; city: string | null; state: string | null }>,
        loads: (loadsRes.data ?? []) as Array<{ id: string; landstar_load_id: string | null; origin: string; destination: string; status: string }>,
      };
    },
  });

  // Quick actions (dispatcher-focused)
  const QUICK_ACTIONS: PaletteItem[] = useMemo(() => [
    { label: 'New Load', icon: Plus, path: '/fleet-loads?action=new-load', roles: ['owner', 'dispatcher'], feature: 'loads', shortcut: 'N' },
    { label: 'Assign Driver', icon: UserCheck, path: '/dispatcher-dashboard#assign-driver', roles: ['owner', 'dispatcher'] },
    { label: 'Change Load Status', icon: RefreshCw, path: '/fleet-loads?action=bulk-status', roles: ['owner', 'dispatcher'], feature: 'loads' },
    { label: 'Search Broker', icon: Search, action: () => setQuery('broker:'), roles: ['owner', 'dispatcher', 'safety'], feature: 'crm' },
    { label: 'Upload Expense Report', icon: Upload, path: '/finance?action=new-expense', roles: ['owner', 'payroll_admin'], feature: 'profit_loss' },
    { label: 'New Maintenance Request', icon: Wrench, path: '/maintenance?action=new-work-order', roles: ['owner', 'safety'], feature: 'maintenance_full' },
  ], []);

  const filter = (items: PaletteItem[]) =>
    items.filter(item => {
      const roleMatch = item.roles.some(r => hasRole(r));
      const tierMatch = !item.feature || tierFeatures.has(item.feature);
      return roleMatch && tierMatch;
    });

  const navItems = filter(NAV_ITEMS);
  const quickActions = filter(QUICK_ACTIONS);

  const close = () => setOpen(false);
  const handleNavigate = (path: string) => { close(); navigate(path); };
  const runAction = (item: PaletteItem) => {
    if (item.action) item.action();
    else if (item.path) handleNavigate(item.path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={!isSearching}>
      <CommandInput
        placeholder="Search loads, contacts, pages…  (Try 'broker:acme')"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isSearching && isFetching && (
          <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        )}

        {!isFetching && <CommandEmpty>No results found.</CommandEmpty>}

        {isSearching && results && results.contacts.length > 0 && (
          <CommandGroup heading={brokerOnly ? 'Brokers' : 'Contacts'}>
            {results.contacts.map(c => {
              const Icon = TYPE_ICON[c.contact_type] || Contact;
              const sub = [c.contact_name, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
              return (
                <CommandItem
                  key={`contact-${c.id}`}
                  value={`contact-${c.id}-${c.company_name}`}
                  onSelect={() => handleNavigate(`/crm?contactId=${c.id}`)}
                >
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{c.company_name}</span>
                    {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
                  </div>
                  <CommandShortcut className="capitalize">{c.contact_type}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {isSearching && results && results.loads.length > 0 && (
          <>
            {results.contacts.length > 0 && <CommandSeparator />}
            <CommandGroup heading="Active Loads">
              {results.loads.map(l => {
                const ref = l.landstar_load_id || `#${l.id.slice(0, 8)}`;
                return (
                  <CommandItem
                    key={`load-${l.id}`}
                    value={`load-${l.id}-${ref}-${l.origin}-${l.destination}`}
                    onSelect={() => handleNavigate(`/fleet-loads?loadId=${l.id}`)}
                  >
                    <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">
                        <span className="font-medium">{ref}</span>
                        <span className="text-muted-foreground"> · {l.origin} → {l.destination}</span>
                      </span>
                    </div>
                    <CommandShortcut className={`px-2 py-0.5 rounded text-[10px] uppercase ${STATUS_COLORS[l.status] || 'bg-muted'}`}>
                      {l.status.replace('_', ' ')}
                    </CommandShortcut>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {quickActions.length > 0 && (
          <>
            {isSearching && results && (results.contacts.length > 0 || results.loads.length > 0) && <CommandSeparator />}
            <CommandGroup heading="Quick Actions">
              {quickActions.map(item => (
                <CommandItem
                  key={`action-${item.label}`}
                  value={`action-${item.label}`}
                  onSelect={() => runAction(item)}
                >
                  <item.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {item.label}
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {!isSearching && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              {navItems.map(item => (
                <CommandItem
                  key={item.path}
                  value={`nav-${item.label}`}
                  onSelect={() => item.path && handleNavigate(item.path)}
                >
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
