import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Shield, Loader2 } from 'lucide-react';
import { parseISO, differenceInDays } from 'date-fns';
import { format } from 'date-fns';

function getExpiryStatus(dateStr: string | null): { label: string; className: string } {
  if (!dateStr) return { label: 'Not Set', className: 'bg-muted text-muted-foreground' };
  const days = differenceInDays(parseISO(dateStr), new Date());
  if (days < 0) return { label: 'Expired', className: 'bg-destructive/10 text-destructive border-destructive/20' };
  if (days < 30) return { label: `${days}d left`, className: 'bg-warning/10 text-warning border-warning/20' };
  return { label: 'Valid', className: 'bg-success/10 text-success border-success/20' };
}

function ExpiryCell({ date }: { date: string | null }) {
  const status = getExpiryStatus(date);
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className={status.className}>
        {status.label}
      </Badge>
      {date && <span className="text-xs text-muted-foreground">{format(parseISO(date), 'MM/dd/yyyy')}</span>}
    </div>
  );
}

export function DriverComplianceHub() {
  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers-compliance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, status, license_expiry, medical_card_expiry, mvr_expiry')
        .order('last_name');
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card className="card-elevated mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Driver Compliance Hub
        </CardTitle>
        <CardDescription>CDL, Medical Card, and MVR expiration tracking</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : drivers.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No drivers found</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>CDL Expiry</TableHead>
                <TableHead>Medical Card</TableHead>
                <TableHead>Annual MVR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map(driver => (
                <TableRow key={driver.id}>
                  <TableCell className="font-medium">{driver.first_name} {driver.last_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{driver.status}</Badge>
                  </TableCell>
                  <TableCell><ExpiryCell date={driver.license_expiry} /></TableCell>
                  <TableCell><ExpiryCell date={driver.medical_card_expiry} /></TableCell>
                  <TableCell><ExpiryCell date={(driver as any).mvr_expiry} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
