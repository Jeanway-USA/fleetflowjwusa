import { useState } from 'react';
import { Bell, Truck, Wrench, Info, Package } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type NotificationCategory = 'loads' | 'maintenance' | 'system';

interface Notification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  isRead: boolean;
  createdAt: string;
}

const INITIAL_NOTIFICATIONS: Notification[] = [];

const CATEGORY_ICON: Record<NotificationCategory, React.ElementType> = {
  loads: Package,
  maintenance: Wrench,
  system: Info,
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  const markRead = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));

  const renderList = (items: Notification[]) =>
    items.length === 0 ? (
      <p className="text-sm text-muted-foreground text-center py-8">No notifications</p>
    ) : (
      items.map(n => {
        const Icon = CATEGORY_ICON[n.category];
        return (
          <button
            key={n.id}
            onClick={() => markRead(n.id)}
            className={cn(
              'w-full flex items-start gap-3 p-3 text-left rounded-md transition-colors hover:bg-accent/50',
              !n.isRead && 'bg-accent/30'
            )}
          >
            <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{n.title}</span>
                {!n.isRead && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
              </div>
              <p className="text-xs text-muted-foreground truncate">{n.message}</p>
              <span className="text-xs text-muted-foreground/70">{timeAgo(n.createdAt)}</span>
            </div>
          </button>
        );
      })
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllRead}>
              Mark all as read
            </Button>
          )}
        </div>
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4 h-9">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="loads" className="text-xs">Loads</TabsTrigger>
            <TabsTrigger value="maintenance" className="text-xs">Maintenance</TabsTrigger>
            <TabsTrigger value="system" className="text-xs">System</TabsTrigger>
          </TabsList>
          <ScrollArea className="h-72">
            <TabsContent value="all" className="m-0 p-1">{renderList(notifications)}</TabsContent>
            <TabsContent value="loads" className="m-0 p-1">{renderList(notifications.filter(n => n.category === 'loads'))}</TabsContent>
            <TabsContent value="maintenance" className="m-0 p-1">{renderList(notifications.filter(n => n.category === 'maintenance'))}</TabsContent>
            <TabsContent value="system" className="m-0 p-1">{renderList(notifications.filter(n => n.category === 'system'))}</TabsContent>
          </ScrollArea>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
