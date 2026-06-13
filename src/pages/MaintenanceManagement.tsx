import { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
const MaintenanceKPICards = lazy(() =>
  import('@/components/maintenance/MaintenanceKPICards').then(m => ({ default: m.MaintenanceKPICards })),
);
import { ChartSkeleton, PanelSkeleton } from '@/components/shared/LazyFallbacks';
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
import { Plus, Wrench, Calendar, History, TrendingUp, Package } from 'lucide-react';

export default function MaintenanceManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [newWorkOrderOpen, setNewWorkOrderOpen] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [truckDrawerOpen, setTruckDrawerOpen] = useState(false);

  // Auto-open sheet from command palette quick action
  useEffect(() => {
    if (searchParams.get('action') === 'new-work-order') {
      setNewWorkOrderOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const handleViewTruck = (truckId: string) => {
    setSelectedTruckId(truckId);
    setTruckDrawerOpen(true);
  };

  return (
    <>
      <PageHeader 
        title="Maintenance Management" 
        description="Fleet maintenance tracking, work orders, and preventive maintenance schedules"
        hideNotifications
      >
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <PMNotificationsBell />
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[450px] flex flex-col p-0 gap-0 overflow-hidden">
              <SheetHeader className="sr-only">
                <SheetTitle>PM Notifications</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto">
                <PMNotificationsPanel onViewTruck={handleViewTruck} />
              </div>
            </SheetContent>

          </Sheet>
          <Button onClick={() => setNewWorkOrderOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Work Order
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-6">
        {/* KPI Dashboard */}
        <Suspense fallback={<PanelSkeleton height={140} />}>
          <MaintenanceKPICards />
        </Suspense>

        {/* Main Content Card with Tabs */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="sr-only">Maintenance Tabs</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs
              value={(() => {
                const t = searchParams.get('tab');
                return ['active', 'pm', 'predictive', 'history', 'inventory'].includes(t ?? '')
                  ? (t as string)
                  : 'active';
              })()}
              onValueChange={(value) => {
                const next = new URLSearchParams(searchParams);
                if (value === 'active') next.delete('tab');
                else next.set('tab', value);
                setSearchParams(next, { replace: true });
              }}
              className="w-full"
            >
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="active" className="gap-2 px-4">
                  <Wrench className="h-4 w-4" />
                  Active Work Orders
                </TabsTrigger>
                <TabsTrigger value="pm" className="gap-2 px-4">
                  <Calendar className="h-4 w-4" />
                  PM Schedule
                </TabsTrigger>
                <TabsTrigger value="predictive" className="gap-2 px-4">
                  <TrendingUp className="h-4 w-4" />
                  Predictive
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2 px-4">
                  <History className="h-4 w-4" />
                  Service History
                </TabsTrigger>
                <TabsTrigger value="inventory" className="gap-2 px-4">
                  <Package className="h-4 w-4" />
                  Inventory
                </TabsTrigger>
              </TabsList>

              <div className="mt-6">
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
          </CardContent>
        </Card>
      </div>

      {/* New Work Order Sheet */}
      <NewWorkOrderSheet 
        open={newWorkOrderOpen} 
        onOpenChange={setNewWorkOrderOpen} 
      />

      {/* Truck History Drawer — only mount (and load chunk) once opened */}
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
