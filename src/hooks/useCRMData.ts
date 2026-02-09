import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

export type CRMContact = Tables<'crm_contacts'>;
export type CRMActivity = Tables<'crm_activities'>;
export type CRMContactLoad = Tables<'crm_contact_loads'>;
export type CompanyResource = Tables<'company_resources'>;
export type Facility = Tables<'facilities'>;
export type ContactType = 'broker' | 'agent' | 'shipper' | 'receiver' | 'vendor';

// Unified shape for display across all data sources
export interface UnifiedContact {
  id: string;
  source: 'crm' | 'resource' | 'facility';
  contact_type: ContactType;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  website: string | null;
  notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  agent_code: string | null;
  agent_status: string | null;
  created_at: string;
  updated_at: string;
  // Facility-specific
  facility_type?: string;
  zip?: string;
  operating_hours?: string;
  dock_info?: string;
  appointment_required?: boolean;
  contact_phone?: string;
  contact_email?: string;
  // Resource-specific
  resource_type?: string;
  service_area?: string;
}

// --- Normalizers ---

function mapResourceType(resourceType: string): ContactType {
  if (resourceType === 'load_agent') return 'agent';
  return 'vendor';
}

function mapFacilityType(facilityType: string): ContactType {
  if (facilityType === 'receiver') return 'receiver';
  return 'shipper'; // shipper, both, warehouse, terminal → shipper
}

export function normalizeCRMContact(c: CRMContact): UnifiedContact {
  return {
    id: c.id,
    source: 'crm',
    contact_type: c.contact_type as ContactType,
    company_name: c.company_name,
    contact_name: c.contact_name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    city: c.city,
    state: c.state,
    website: c.website,
    notes: c.notes,
    tags: c.tags,
    is_active: c.is_active,
    agent_code: c.agent_code,
    agent_status: c.agent_status,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

export function normalizeResource(r: CompanyResource): UnifiedContact {
  return {
    id: r.id,
    source: 'resource',
    contact_type: mapResourceType(r.resource_type),
    company_name: r.name,
    contact_name: null,
    phone: r.phone,
    email: r.email,
    address: r.address,
    city: null,
    state: null,
    website: r.website,
    notes: r.notes,
    tags: null,
    is_active: true,
    agent_code: r.agent_code,
    agent_status: r.agent_status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    resource_type: r.resource_type,
    service_area: r.service_area,
  };
}

export function normalizeFacility(f: Facility): UnifiedContact {
  return {
    id: f.id,
    source: 'facility',
    contact_type: mapFacilityType(f.facility_type),
    company_name: f.name,
    contact_name: f.contact_name,
    phone: f.contact_phone,
    email: f.contact_email,
    address: f.address,
    city: f.city,
    state: f.state,
    website: null,
    notes: f.notes,
    tags: null,
    is_active: true,
    agent_code: null,
    agent_status: null,
    created_at: f.created_at,
    updated_at: f.updated_at,
    facility_type: f.facility_type,
    zip: f.zip,
    operating_hours: f.operating_hours,
    dock_info: f.dock_info,
    appointment_required: f.appointment_required,
    contact_phone: f.contact_phone,
    contact_email: f.contact_email,
  };
}

// Get a display label for vendor sub-types or facility types
export function getSubTypeLabel(contact: UnifiedContact): string | null {
  if (contact.source === 'resource') {
    const labels: Record<string, string> = {
      mechanic: 'Mechanic',
      roadside: 'Roadside',
      truck_wash: 'Truck Wash',
      load_agent: 'Load Agent',
    };
    return labels[contact.resource_type || ''] || null;
  }
  if (contact.source === 'facility') {
    const labels: Record<string, string> = {
      shipper: 'Shipper Facility',
      receiver: 'Receiver Facility',
      both: 'Shipper & Receiver',
      warehouse: 'Warehouse',
      terminal: 'Terminal',
    };
    return labels[contact.facility_type || ''] || 'Facility';
  }
  return null;
}

// --- CRM Contacts hooks ---

export function useContacts(typeFilter?: string) {
  return useQuery({
    queryKey: ['crm-contacts', typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('crm_contacts')
        .select('*')
        .order('company_name');

      if (typeFilter && typeFilter !== 'all') {
        query = query.eq('contact_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CRMContact[];
    },
  });
}

export function useContactMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createContact = useMutation({
    mutationFn: async (contact: TablesInsert<'crm_contacts'>) => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .insert(contact)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      toast({ title: 'Contact created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error creating contact', description: error.message, variant: 'destructive' });
    },
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<'crm_contacts'> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-contact-detail'] });
      toast({ title: 'Contact updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error updating contact', description: error.message, variant: 'destructive' });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      toast({ title: 'Contact deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error deleting contact', description: error.message, variant: 'destructive' });
    },
  });

  return { createContact, updateContact, deleteContact };
}

// --- Company Resources hooks ---

export function useCompanyResources() {
  return useQuery({
    queryKey: ['company_resources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_resources')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as CompanyResource[];
    },
  });
}

export function useResourceMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createResource = useMutation({
    mutationFn: async (resource: TablesInsert<'company_resources'>) => {
      const { data, error } = await supabase
        .from('company_resources')
        .insert(resource)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_resources'] });
      toast({ title: 'Resource created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error creating resource', description: error.message, variant: 'destructive' });
    },
  });

  const updateResource = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase
        .from('company_resources')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_resources'] });
      toast({ title: 'Resource updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error updating resource', description: error.message, variant: 'destructive' });
    },
  });

  const deleteResource = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_resources').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_resources'] });
      toast({ title: 'Resource deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error deleting resource', description: error.message, variant: 'destructive' });
    },
  });

  return { createResource, updateResource, deleteResource };
}

// --- Facilities hooks ---

export function useFacilities() {
  return useQuery({
    queryKey: ['facilities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facilities')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Facility[];
    },
  });
}

export function useFacilityMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createFacility = useMutation({
    mutationFn: async (facility: TablesInsert<'facilities'>) => {
      const { data, error } = await supabase
        .from('facilities')
        .insert(facility)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
      toast({ title: 'Facility created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error creating facility', description: error.message, variant: 'destructive' });
    },
  });

  const updateFacility = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase
        .from('facilities')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
      toast({ title: 'Facility updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error updating facility', description: error.message, variant: 'destructive' });
    },
  });

  const deleteFacility = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('facilities').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] });
      toast({ title: 'Facility deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Error deleting facility', description: error.message, variant: 'destructive' });
    },
  });

  return { createFacility, updateFacility, deleteFacility };
}

// --- Unified contacts hook ---

export function useUnifiedContacts(typeFilter?: string) {
  const { data: crmContacts = [], isLoading: crmLoading } = useContacts();
  const { data: resources = [], isLoading: resLoading } = useCompanyResources();
  const { data: facilities = [], isLoading: facLoading } = useFacilities();

  const isLoading = crmLoading || resLoading || facLoading;

  const unified: UnifiedContact[] = [
    ...crmContacts.map(normalizeCRMContact),
    ...resources.map(normalizeResource),
    ...facilities.map(normalizeFacility),
  ];

  // Apply type filter
  const filtered = typeFilter && typeFilter !== 'all'
    ? unified.filter(c => c.contact_type === typeFilter)
    : unified;

  // Sort by company name
  filtered.sort((a, b) => a.company_name.localeCompare(b.company_name));

  return { data: filtered, isLoading };
}

// --- Activity & Load hooks (unchanged, only work for CRM contacts) ---

export function useContactActivities(contactId: string | null) {
  return useQuery({
    queryKey: ['crm-activities', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('contact_id', contactId)
        .order('activity_date', { ascending: false });
      if (error) throw error;
      return data as CRMActivity[];
    },
    enabled: !!contactId,
  });
}

export function useCreateActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (activity: TablesInsert<'crm_activities'>) => {
      const { data, error } = await supabase
        .from('crm_activities')
        .insert(activity)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['crm-activities', variables.contact_id] });
      toast({ title: 'Activity logged' });
    },
    onError: (error) => {
      toast({ title: 'Error logging activity', description: error.message, variant: 'destructive' });
    },
  });
}

export function useContactLoads(contactId: string | null) {
  return useQuery({
    queryKey: ['crm-contact-loads', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('crm_contact_loads')
        .select(`
          *,
          fleet_loads (
            id, origin, destination, pickup_date, delivery_date, 
            rate, gross_revenue, status, booked_miles
          )
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });
}

export function useContactRevenueStats(contactId: string | null) {
  return useQuery({
    queryKey: ['crm-revenue-stats', contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const { data, error } = await supabase
        .from('crm_contact_loads')
        .select(`
          fleet_loads (
            gross_revenue, booked_miles, pickup_date, status
          )
        `)
        .eq('contact_id', contactId);
      if (error) throw error;

      const loads = (data || [])
        .map((d: any) => d.fleet_loads)
        .filter(Boolean);

      const totalRevenue = loads.reduce((sum: number, l: any) => sum + (l.gross_revenue || 0), 0);
      const totalMiles = loads.reduce((sum: number, l: any) => sum + (l.booked_miles || 0), 0);
      const loadCount = loads.length;
      const avgRatePerMile = totalMiles > 0 ? totalRevenue / totalMiles : 0;

      // Monthly revenue for chart (last 6 months)
      const now = new Date();
      const monthlyRevenue: { month: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        const rev = loads
          .filter((l: any) => l.pickup_date && l.pickup_date.startsWith(monthKey))
          .reduce((s: number, l: any) => s + (l.gross_revenue || 0), 0);
        monthlyRevenue.push({ month: monthLabel, revenue: rev });
      }

      return { totalRevenue, totalMiles, loadCount, avgRatePerMile, monthlyRevenue };
    },
    enabled: !!contactId,
  });
}
