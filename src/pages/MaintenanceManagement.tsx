import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MaintenanceKPICards } from '@/components/maintenance/MaintenanceKPICards';
import { ActiveWorkOrdersTab } from '@/components/maintenance/ActiveWorkOrdersTab';
import { PreventiveMaintenanceTab } from '@/components/maintenance/PreventiveMaintenanceTab';
import { ServiceHistoryTab } from '@/components/maintenance/ServiceHistoryTab';
import { NewWorkOrderSheet } from '@/components/maintenance/NewWorkOrderSheet';
import { TruckHistoryDrawer } from '@/components/maintenance/TruckHistoryDrawer';
import { Plus, Wrench, Calendar, History } from 'lucide-react';

export default function MaintenanceManagement() {
  const [newWorkOrderOpen, setNewWorkOrderOpen] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [truckDrawerOpen, setTruckDrawerOpen] = useState(false);

  const handleViewTruck = (truckId: string) => {
    setSelectedTruckId(truckId);
    setTruckDrawerOpen(true);
  };

  return (
    <DashboardLayout>
      <PageHeader 
        title="Maintenance Management" 
        description="Fleet maintenance tracking, work orders, and preventive maintenance schedules"
      >
        <Button onClick={() => setNewWorkOrderOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Work Order
        </Button>
      </PageHeader>

      <div className="space-y-6">
        {/* KPI Dashboard */}
        <MaintenanceKPICards />

        {/* Main Content Card with Tabs */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="sr-only">Maintenance Tabs</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="active" className="gap-2 px-4">
                  <Wrench className="h-4 w-4" />
                  Active Work Orders
                </TabsTrigger>
                <TabsTrigger value="pm" className="gap-2 px-4">
                  <Calendar className="h-4 w-4" />
                  PM Schedule
                </TabsTrigger>
                <TabsTrigger value="history" className="gap-2 px-4">
                  <History className="h-4 w-4" />
                  Service History
                </TabsTrigger>
              </TabsList>

              <div className="mt-6">
                <TabsContent value="active" className="mt-0">
                  <ActiveWorkOrdersTab onViewTruck={handleViewTruck} />
                </TabsContent>

                <TabsContent value="pm" className="mt-0">
                  <PreventiveMaintenanceTab onViewTruck={handleViewTruck} />
                </TabsContent>

                <TabsContent value="history" className="mt-0">
                  <ServiceHistoryTab onViewTruck={handleViewTruck} />
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

      {/* Truck History Drawer */}
      <TruckHistoryDrawer
        truckId={selectedTruckId}
        open={truckDrawerOpen}
        onOpenChange={setTruckDrawerOpen}
      />
    </DashboardLayout>
  );
}
