import { Card, CardContent } from '@/components/ui/card';
import { Building2, Users, Warehouse, Truck, Wrench, UserCheck } from 'lucide-react';
import type { UnifiedContact } from '@/hooks/useCRMData';

interface CRMSummaryCardsProps {
  contacts: UnifiedContact[];
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  broker: { label: 'Brokers', icon: Building2, color: 'text-blue-500' },
  agent: { label: 'Agents', icon: Users, color: 'text-amber-500' },
  shipper: { label: 'Shippers', icon: Warehouse, color: 'text-green-500' },
  receiver: { label: 'Receivers', icon: Truck, color: 'text-purple-500' },
  vendor: { label: 'Vendors', icon: Wrench, color: 'text-red-500' },
};

export function CRMSummaryCards({ contacts }: CRMSummaryCardsProps) {
  const counts = contacts.reduce<Record<string, number>>((acc, c) => {
    acc[c.contact_type] = (acc[c.contact_type] || 0) + 1;
    return acc;
  }, {});

  const totalActive = contacts.filter((c) => c.is_active).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      <Card className="border-border overflow-hidden">
        <CardContent className="p-4 flex items-center gap-3">
          <UserCheck className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Total Active</p>
            <p className="text-lg sm:text-xl font-bold truncate">{totalActive}</p>
          </div>
        </CardContent>
      </Card>
      {Object.entries(TYPE_CONFIG).map(([type, config]) => (
        <Card key={type} className="border-border overflow-hidden">
          <CardContent className="p-4 flex items-center gap-3">
            <config.icon className={`h-5 w-5 flex-shrink-0 ${config.color}`} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{config.label}</p>
              <p className="text-lg sm:text-xl font-bold truncate">{counts[type] || 0}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
