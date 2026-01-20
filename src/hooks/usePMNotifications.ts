import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export interface PMNotification {
  id: string;
  truck_id: string;
  service_name: string;
  service_code: string | null;
  notification_type: 'overdue' | 'due_soon' | 'upcoming';
  days_or_miles_remaining: number | null;
  unit: 'miles' | 'days' | null;
  is_read: boolean;
  dismissed_at: string | null;
  created_at: string;
  trucks?: {
    unit_number: string;
    make: string | null;
  };
}

export function usePMNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['pm-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pm_notifications')
        .select(`
          *,
          trucks (
            unit_number,
            make
          )
        `)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PMNotification[];
    },
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('pm-notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pm_notifications',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['pm-notifications'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useUnreadPMNotificationCount() {
  return useQuery({
    queryKey: ['pm-notifications-unread-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pm_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)
        .is('dismissed_at', null);

      if (error) throw error;
      return count || 0;
    },
  });
}

export function useMarkPMNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('pm_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['pm-notifications-unread-count'] });
    },
  });
}

export function useDismissPMNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('pm_notifications')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['pm-notifications-unread-count'] });
    },
  });
}

export function useMarkAllPMNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('pm_notifications')
        .update({ is_read: true })
        .eq('is_read', false)
        .is('dismissed_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['pm-notifications-unread-count'] });
    },
  });
}