import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

export type CRMContact = Tables<'crm_contacts'>;
export type CRMActivity = Tables<'crm_activities'>;
export type CRMContactLoad = Tables<'crm_contact_loads'>;
export type ContactType = 'broker' | 'agent' | 'shipper' | 'receiver' | 'vendor';

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
