import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Truck,
  User,
  Package,
  Wrench,
  Building2,
  PlusCircle,
  LayoutDashboard,
  Banknote,
  Map,
  Shield,
  FileText,
  Settings as SettingsIcon,
  History,
  Users,
  CircleGauge,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useRecents } from '@/hooks/useRecents';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';

type AppRole = string;

interface RouteEntry {
  path: string;
  label: string;
  icon: typeof Truck;
  roles?: AppRole[];
}

const ROUTES: RouteEntry[] = [
  { path: '/executive-dashboard', label: 'Executive Dashboard', icon: LayoutDashboard, roles: ['owner'] },
  { path: '/dispatcher-dashboard', label: 'Dispatcher Dashboard', icon: CircleGauge, roles: ['owner', 'dispatcher'] },
  { path: '/driver-dashboard', label: 'Driver Dashboard', icon: User, roles: ['owner', 'driver'] },
  { path: '/fleet-loads', label: 'Fleet Loads', icon: Package, roles: ['owner', 'dispatcher', 'safety'] },
  { path: '/agency-loads', label: 'Agency Loads', icon: Package, roles: ['owner', 'dispatcher'] },
  { path: '/trucks', label: 'Trucks', icon: Truck, roles: ['owner', 'safety', 'maintenance'] },
  { path: '/trailers', label: 'Trailers', icon: Truck, roles: ['owner', 'safety', 'maintenance'] },
  { path: '/drivers', label: 'Drivers', icon: Users, roles: ['owner', 'payroll_admin'] },
  { path: '/crm', label: 'CRM', icon: Building2, roles: ['owner', 'dispatcher'] },
  { path: '/finance', label: 'Finance', icon: Banknote, roles: ['owner', 'payroll_admin'] },
  { path: '/insights', label: 'Company Insights', icon: CircleGauge, roles: ['owner', 'payroll_admin'] },
  { path: '/ifta', label: 'IFTA', icon: Map, roles: ['owner', 'payroll_admin'] },
  { path: '/maintenance-home', label: 'Maintenance', icon: Wrench, roles: ['owner', 'maintenance'] },
  { path: '/documents', label: 'Documents', icon: FileText },
  { path: '/safety', label: 'Safety', icon: Shield, roles: ['owner', 'safety'] },
  { path: '/incidents', label: 'Incidents', icon: Shield, roles: ['owner', 'safety'] },
  { path: '/performance', label: 'Driver Performance', icon: CircleGauge, roles: ['owner'] },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

const QUICK_ACTIONS = [
  { id: 'new-load', label: 'New Load', icon: PlusCircle, route: '/fleet-loads' },
  { id: 'new-work-order', label: 'New Work Order', icon: PlusCircle, route: '/maintenance-home' },
  { id: 'new-contact', label: 'New CRM Contact', icon: PlusCircle, route: '/crm' },
  { id: 'new-driver', label: 'Invite Driver', icon: PlusCircle, route: '/drivers' },
];

function iconForRecent(type: string) {
  switch (type) {
    case 'load': return Package;
    case 'driver': return User;
    case 'truck': return Truck;
    case 'trailer': return Truck;
    case 'contact': return Building2;
    default: return History;
  }
}

export function CommandPalette() {
  const navigate = useNavigate();
  const { user, orgId, roles } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const recents = useRecents(8);

  const setDebouncedFn = useDebouncedCallback((v: string) => setDebounced(v), 200);
  useEffect(() => { setDebouncedFn(search); }, [search, setDebouncedFn]);

  // Global hotkey
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === '/' && !open) {
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Reset search when closed
  useEffect(() => { if (!open) { setSearch(''); setDebounced(''); } }, [open]);

  const roleSet = useMemo(() => new Set((roles ?? []).map(String)), [roles]);
  const visibleRoutes = useMemo(
    () => ROUTES.filter((r) => !r.roles || r.roles.some((role) => roleSet.has(role))),
    [roleSet],
  );

  // Search across loads/drivers/trucks/contacts
  const { data: searchResults } = useQuery({
    queryKey: ['cmdk-search', orgId, debounced],
    enabled: !!orgId && debounced.length >= 2 && open,
    staleTime: 30_000,
    queryFn: async () => {
      const term = debounced.trim();
      const like = `%${term}%`;
      const [loads, drivers, trucks, contacts] = await Promise.all([
        supabase.from('fleet_loads')
          .select('id, landstar_load_id, agency_code, origin, destination, status')
          .eq('org_id', orgId!)
          .or(`landstar_load_id.ilike.${like},agency_code.ilike.${like},origin.ilike.${like},destination.ilike.${like}`)
          .limit(6),
        supabase.from('drivers')
          .select('id, first_name, last_name')
          .eq('org_id', orgId!)
          .or(`first_name.ilike.${like},last_name.ilike.${like}`)
          .limit(6),
        supabase.from('trucks')
          .select('id, unit_number, make, model')
          .eq('org_id', orgId!)
          .ilike('unit_number', like)
          .limit(6),
        supabase.from('crm_contacts')
          .select('id, company_name, agent_code, contact_type')
          .eq('org_id', orgId!)
          .or(`company_name.ilike.${like},agent_code.ilike.${like}`)
          .limit(6),
      ]);
      return {
        loads: loads.data ?? [],
        drivers: drivers.data ?? [],
        trucks: trucks.data ?? [],
        contacts: contacts.data ?? [],
      };
    },
  });

  const run = (fn: () => void) => { setOpen(false); fn(); };

  const fireQuickAction = (id: string, route: string) => {
    navigate(route);
    // Defer so the destination page can mount and register its listener.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('jw:quick-action', { detail: id }));
    }, 100);
  };

  if (!user || !orgId) return null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search loads, drivers, trucks, contacts… or type a command"
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {recents.length > 0 && !debounced && (
          <CommandGroup heading="Recent">
            {recents.map((r) => {
              const Icon = iconForRecent(r.type);
              return (
                <CommandItem
                  key={`${r.type}:${r.id}`}
                  value={`recent ${r.label}`}
                  onSelect={() => run(() => navigate(r.href))}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  <span className="truncate">{r.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground capitalize">{r.type}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {!debounced && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quick actions">
              {QUICK_ACTIONS.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`action ${a.label}`}
                  onSelect={() => run(() => fireQuickAction(a.id, a.route))}
                >
                  <a.icon className="mr-2 h-4 w-4" />
                  {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Pages">
          {visibleRoutes.map((r) => (
            <CommandItem
              key={r.path}
              value={`page ${r.label} ${r.path}`}
              onSelect={() => run(() => navigate(r.path))}
            >
              <r.icon className="mr-2 h-4 w-4" />
              {r.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {searchResults && (
          <>
            {searchResults.loads.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Loads">
                  {searchResults.loads.map((l: any) => (
                    <CommandItem
                      key={l.id}
                      value={`load ${l.landstar_load_id ?? ''} ${l.origin ?? ''} ${l.destination ?? ''}`}
                      onSelect={() => run(() => navigate(`/fleet-loads?load=${l.id}`))}
                    >
                      <Package className="mr-2 h-4 w-4" />
                      <span className="truncate">
                        {l.landstar_load_id || l.agency_code || 'Load'}
                        <span className="text-muted-foreground"> — {l.origin} → {l.destination}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {searchResults.drivers.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Drivers">
                  {searchResults.drivers.map((d: any) => (
                    <CommandItem
                      key={d.id}
                      value={`driver ${d.first_name ?? ''} ${d.last_name ?? ''}`}
                      onSelect={() => run(() => navigate(`/drivers?id=${d.id}`))}
                    >
                      <User className="mr-2 h-4 w-4" />
                      {(d.first_name || '') + ' ' + (d.last_name || '')}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {searchResults.trucks.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Trucks">
                  {searchResults.trucks.map((t: any) => (
                    <CommandItem
                      key={t.id}
                      value={`truck ${t.unit_number}`}
                      onSelect={() => run(() => navigate(`/trucks?id=${t.id}`))}
                    >
                      <Truck className="mr-2 h-4 w-4" />
                      Unit {t.unit_number}
                      {t.make && <span className="ml-2 text-muted-foreground">{t.make} {t.model}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {searchResults.contacts.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Contacts">
                  {searchResults.contacts.map((c: any) => (
                    <CommandItem
                      key={c.id}
                      value={`contact ${c.company_name} ${c.agent_code ?? ''}`}
                      onSelect={() => run(() => navigate(`/crm?id=${c.id}`))}
                    >
                      <Building2 className="mr-2 h-4 w-4" />
                      <span className="truncate">
                        {c.company_name}
                        {c.agent_code && <span className="text-muted-foreground"> · {c.agent_code}</span>}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
      <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground flex items-center justify-between">
        <span>Tip: press <kbd className="rounded bg-muted px-1">⌘K</kbd> from anywhere</span>
        <span>↵ to select · esc to close</span>
      </div>
    </CommandDialog>
  );
}
