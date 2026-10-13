import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
const MaintenanceKPICards = lazy(() =>
  import('@/components/maintenance/MaintenanceKPICards').then(m => ({ default: m.MaintenanceKPICards })),
);
import { PanelSkeleton } from '@/components/shared/LazyFallbacks';
import { ActiveWorkOrdersTab } from '@/components/maintenance/ActiveWorkOrdersTab';
import { PreventiveMaintenanceTab } from '@/components/maintenance/PreventiveMaintenanceTab';
import { ServiceHistoryTab } from '@/components/maintenance/ServiceHistoryTab';
import { NewWorkOrderSheet } from '@/components/maintenance/NewWorkOrderSheet';
const TruckHistoryDrawer = lazy(() =>
  import('@/components/maintenance/TruckHistoryDrawer').then(m => ({ default: m.TruckHistoryDrawer })),
);
import { PMNotificationsPanel, PMNotificationsBell } from '@/components/maintenance/PMNotificationsPanel';
import { PredictiveServiceCalendar } from '@/components/maintenance/PredictiveServiceCalendar';
import { InventoryManagementTab } from '@/components/maintenance/InventoryManagementTab';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Plus } from 'lucide-react';

const TABS = [
  { value: 'active', label: 'Work orders', title: 'Work orders' },
  { value: 'pm', label: 'PM schedule', title: 'PM schedule' },
  { value: 'predictive', label: 'Forecast', title: 'Service forecast' },
  { value: 'history', label: 'History', title: 'Service history' },
  { value: 'inventory', label: 'Inventory', title: 'Parts inventory' },
] as const;

export default function MaintenanceManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [newWorkOrderOpen, setNewWorkOrderOpen] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [truckDrawerOpen, setTruckDrawerOpen] = useState(false);

  // Auto-open sheet from command palette or the dashboard's "Schedule a job"
  useEffect(() => {
    if (searchParams.get('action') === 'new-work-order') {
      setNewWorkOrderOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleViewTruck = (truckId: string) => {
    setSelectedTruckId(truckId);
    setTruckDrawerOpen(true);
  };

  const tabParam = searchParams.get('tab');
  const tab = TABS.some(t => t.value === tabParam) ? (tabParam as string) : 'active';
  const current = TABS.find(t => t.value === tab)!;

  return (
    <>
      {/* The page heading names the open tab, so the phone tab bar's
          Work orders / PM entries land on a screen titled for them. */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-condensed text-[28px] font-bold leading-tight sm:text-[32px]">{current.title}</h1>
          <p className="text-[15px] text-muted-foreground">Maintenance</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <PMNotificationsBell />
            </SheetTrigger>
            <SheetContent className="w-full sm:w-[450px] flex flex-col p-0 gap-0 overflow-hidden">
              <SheetHeader className="sr-only">
                <SheetTitle>PM Notifications</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <PMNotificationsPanel onViewTruck={handleViewTruck} />
              </div>
            </SheetContent>
          </Sheet>
          <Button onClick={() => setNewWorkOrderOpen(true)} className="h-11 gap-2 sm:h-10">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New work order</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      <div className="space-y-4 lg:space-y-6">
        <Suspense fallback={<PanelSkeleton height={84} />}>
          <MaintenanceKPICards />
        </Suspense>

        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = new URLSearchParams(searchParams);
            if (value === 'active') next.delete('tab');
            else next.set('tab', value);
            setSearchParams(next, { replace: true });
          }}
          className="w-full min-w-0"
        >
          {/* Scrolls sideways inside itself instead of widening the page. */}
          <div className="-mx-3 overflow-x-auto px-3 scrollbar-hide sm:mx-0 sm:px-0">
            <TabsList className="h-11 w-max min-w-full justify-start sm:min-w-0">
              {TABS.map(t => (
                <TabsTrigger key={t.value} value={t.value} className="h-9 px-3.5 text-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="mt-4">
            <TabsContent value="active" className="mt-0">
              <ActiveWorkOrdersTab onViewTruck={handleViewTruck} />
            </TabsContent>
            <TabsContent value="pm" className="mt-0">
              <PreventiveMaintenanceTab onViewTruck={handleViewTruck} />
            </TabsContent>
            <TabsContent value="predictive" className="mt-0">
              <PredictiveServiceCalendar />
            </TabsContent>
            <TabsContent value="history" className="mt-0">
              <ServiceHistoryTab onViewTruck={handleViewTruck} />
            </TabsContent>
            <TabsContent value="inventory" className="mt-0">
              <InventoryManagementTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <NewWorkOrderSheet open={newWorkOrderOpen} onOpenChange={setNewWorkOrderOpen} />

      {/* Truck History Drawer: only mount (and load chunk) once opened */}
      {truckDrawerOpen && (
        <Suspense fallback={null}>
          <TruckHistoryDrawer
            truckId={selectedTruckId}
            open={truckDrawerOpen}
            onOpenChange={setTruckDrawerOpen}
          />
        </Suspense>
      )}
    </>
  );
}
