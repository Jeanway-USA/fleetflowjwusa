import { useState } from 'react';
import { usePMNotifications, useMarkPMNotificationRead, useDismissPMNotification, useMarkAllPMNotificationsRead, PMNotification } from '@/hooks/usePMNotifications';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Clock, CheckCircle, X, Bell, BellOff, Truck, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface PMNotificationsPanelProps {
  onViewTruck?: (truckId: string) => void;
}

export function PMNotificationsPanel({ onViewTruck }: PMNotificationsPanelProps) {
  const navigate = useNavigate();
  const { data: notifications, isLoading } = usePMNotifications();
  const markRead = useMarkPMNotificationRead();
  const dismiss = useDismissPMNotification();
  const markAllRead = useMarkAllPMNotificationsRead();

  const handleNotificationClick = (notification: PMNotification) => {
    if (!notification.is_read) {
      markRead.mutate(notification.id);
    }
    if (onViewTruck) {
      onViewTruck(notification.truck_id);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'overdue':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'due_soon':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'upcoming':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getNotificationStyle = (type: string, isRead: boolean) => {
    const baseStyle = isRead ? 'opacity-60' : '';
    switch (type) {
      case 'overdue':
        return cn(baseStyle, 'border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20');
      case 'due_soon':
        return cn(baseStyle, 'border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20');
      case 'upcoming':
        return cn(baseStyle, 'border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20');
      default:
        return baseStyle;
    }
  };

  const formatRemaining = (notification: PMNotification) => {
    if (notification.days_or_miles_remaining === null) return '';
    
    const value = notification.days_or_miles_remaining;
    const unit = notification.unit;
    
    if (value < 0) {
      return `${Math.abs(value).toLocaleString()} ${unit} overdue`;
    }
    return `${value.toLocaleString()} ${unit} remaining`;
  };

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!notifications?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <BellOff className="h-10 w-10 text-muted-foreground mb-3" />
        <h3 className="text-sm font-medium">No PM Notifications</h3>
        <p className="text-xs text-muted-foreground mt-1">
          All maintenance schedules are on track!
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          <span className="font-medium text-sm">PM Alerts</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => markAllRead.mutate()}
          >
            Mark all read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                'relative p-3 rounded-md cursor-pointer hover:bg-muted/50 transition-colors',
                getNotificationStyle(notification.notification_type, notification.is_read)
              )}
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {getNotificationIcon(notification.notification_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Truck className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium">
                      {notification.trucks?.unit_number || 'Unknown'}
                    </span>
                    {notification.trucks?.make && (
                      <span className="text-xs text-muted-foreground">
                        ({notification.trucks.make})
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-1 truncate">
                    {notification.service_name}
                    {notification.service_code && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({notification.service_code})
                      </span>
                    )}
                  </p>
                  <p className={cn(
                    'text-xs mt-0.5',
                    notification.notification_type === 'overdue' ? 'text-red-600 dark:text-red-400' :
                    notification.notification_type === 'due_soon' ? 'text-amber-600 dark:text-amber-400' :
                    'text-muted-foreground'
                  )}>
                    {formatRemaining(notification)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss.mutate(notification.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {!notification.is_read && (
                <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// Compact bell icon with badge for use in headers
export function PMNotificationsBell({ onClick }: { onClick?: () => void }) {
  const { data: notifications } = usePMNotifications();
  
  const overdueCount = notifications?.filter(n => n.notification_type === 'overdue' && !n.is_read).length || 0;
  const dueSoonCount = notifications?.filter(n => n.notification_type === 'due_soon' && !n.is_read).length || 0;
  const totalUnread = overdueCount + dueSoonCount;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      onClick={onClick}
    >
      <Bell className={cn(
        'h-5 w-5',
        overdueCount > 0 && 'text-red-500',
        overdueCount === 0 && dueSoonCount > 0 && 'text-amber-500'
      )} />
      {totalUnread > 0 && (
        <span className={cn(
          'absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
          overdueCount > 0 
            ? 'bg-red-500 text-white' 
            : 'bg-amber-500 text-white'
        )}>
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
    </Button>
  );
}