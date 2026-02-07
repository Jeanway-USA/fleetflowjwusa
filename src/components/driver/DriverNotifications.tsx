import { useState, useEffect } from 'react';
import { Bell, Package, Check, X, ChevronDown, MessageSquareReply, Clock, Home, CalendarDays, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface DriverNotificationsProps {
  driverId: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function DriverNotifications({ driverId }: DriverNotificationsProps) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Fetch notifications
  const { data: notifications = [] } = useQuery({
    queryKey: ['driver-notifications', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_notifications')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Notification[];
    },
    enabled: !!driverId,
  });

  // Subscribe to realtime notifications
  useEffect(() => {
    if (!driverId) return;

    const channel = supabase
      .channel('driver-notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_notifications',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['driver-notifications', driverId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, queryClient]);

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('driver_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-notifications', driverId] });
    },
  });

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('driver_notifications')
        .update({ is_read: true })
        .eq('driver_id', driverId)
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-notifications', driverId] });
    },
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const hasRedirect = (type: string) => type === 'load_assigned';

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    
    if (hasRedirect(notification.notification_type) && notification.related_id) {
      setOpen(false);
      navigate('/fleet-loads');
    } else {
      setExpandedId(prev => prev === notification.id ? null : notification.id);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'load_assigned':
        return <Package className="h-4 w-4 text-primary" />;
      case 'request_response':
        return <MessageSquareReply className="h-4 w-4 text-primary" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <h4 className="font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs h-7"
              onClick={() => markAllAsReadMutation.mutate()}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        
        <ScrollArea className="h-[300px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full p-3 text-left hover:bg-muted/50 transition-colors flex gap-3 ${
                    !notification.is_read ? 'bg-primary/5' : ''
                  } ${expandedId === notification.id ? 'bg-muted/40' : ''}`}
                >
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.notification_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className={`text-sm flex-1 ${!notification.is_read ? 'font-semibold' : ''}`}>
                        {notification.title}
                      </p>
                      {!hasRedirect(notification.notification_type) && (
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${
                          expandedId === notification.id ? 'rotate-180' : ''
                        }`} />
                      )}
                    </div>
                    <p className={`text-xs text-muted-foreground mt-0.5 ${
                      expandedId === notification.id ? 'whitespace-pre-wrap' : 'truncate'
                    }`}>
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}