import { Card, CardContent } from '@/components/ui/card';
import { Building2, Users, Warehouse, Truck, Wrench, UserCheck } from 'lucide-react';
import type { CRMContact } from '@/hooks/useCRMData';

interface CRMSummaryCardsProps {
  contacts: CRMContact[];
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card className="border-border">
        <CardContent className="p-4 flex items-center gap-3">
          <UserCheck className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Total Active</p>
            <p className="text-xl font-bold">{totalActive}</p>
          </div>
        </CardContent>
      </Card>
      {Object.entries(TYPE_CONFIG).map(([type, config]) => (
        <Card key={type} className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <config.icon className={`h-5 w-5 ${config.color}`} />
            <div>
              <p className="text-xs text-muted-foreground">{config.label}</p>
              <p className="text-xl font-bold">{counts[type] || 0}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
