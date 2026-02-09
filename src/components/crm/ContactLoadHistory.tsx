import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useContactLoads } from '@/hooks/useCRMData';
import { format } from 'date-fns';

interface ContactLoadHistoryProps {
  contactId: string;
}

const statusVariant = (status: string) => {
  switch (status) {
    case 'delivered': return 'default';
    case 'in_transit': return 'secondary';
    case 'assigned': return 'outline';
    default: return 'outline';
  }
};

export function ContactLoadHistory({ contactId }: ContactLoadHistoryProps) {
  const { data: contactLoads = [], isLoading } = useContactLoads(contactId);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Loading load history...</div>;
  }

  if (contactLoads.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No linked loads.</p>;
  }

  return (
    <div className="overflow-auto max-h-[400px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Date</TableHead>
            <TableHead className="text-xs">Route</TableHead>
            <TableHead className="text-xs text-right">Rate</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs">Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contactLoads.map((cl: any) => {
            const load = cl.fleet_loads;
            if (!load) return null;
            return (
              <TableRow key={cl.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {load.pickup_date ? format(new Date(load.pickup_date), 'MM/dd/yy') : '—'}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="truncate max-w-[180px] inline-block">
                    {load.origin?.split(',')[0]} → {load.destination?.split(',')[0]}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-right">
                  {load.gross_revenue ? `$${load.gross_revenue.toLocaleString()}` : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(load.status)} className="text-[10px] capitalize">
                    {load.status?.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs capitalize text-muted-foreground">
                  {cl.relationship_type}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
