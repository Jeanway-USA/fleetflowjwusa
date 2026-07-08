import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActiveBatchTab } from './ActiveBatchTab';
import { TruistAchStagingTab } from './TruistAchStagingTab';
import { TaxFilingRegistryTab } from './TaxFilingRegistryTab';

export function InHousePayrollWorkspace() {
  return (
    <Tabs defaultValue="active" className="space-y-6">
      <TabsList>
        <TabsTrigger value="active">Active Batch</TabsTrigger>
        <TabsTrigger value="truist">Truist ACH Staging</TabsTrigger>
        <TabsTrigger value="registry">Tax Filing Registry</TabsTrigger>
      </TabsList>
      <TabsContent value="active"><ActiveBatchTab /></TabsContent>
      <TabsContent value="truist"><TruistAchStagingTab /></TabsContent>
      <TabsContent value="registry"><TaxFilingRegistryTab /></TabsContent>
    </Tabs>
  );
}
