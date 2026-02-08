import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/formatters';

interface RevenueTabProps {
  filteredLoads: any[];
  revenueTotals: any;
}

export function RevenueTab({ filteredLoads, revenueTotals }: RevenueTabProps) {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle>Load-by-Load Revenue</CardTitle>
        <CardDescription>Detailed revenue breakdown for each load</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Load ID</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Linehaul</TableHead>
                <TableHead className="text-right">FSC</TableHead>
                <TableHead className="text-right">Accessorials</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Truck</TableHead>
                <TableHead className="text-right">Trailer</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Miles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLoads.map((load: any) => (
                <TableRow key={load.id}>
                  <TableCell>{load.pickup_date ? formatDate(load.pickup_date, 'MM/dd') : '-'}</TableCell>
                  <TableCell className="font-mono">{load.landstar_load_id || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{load.origin} → {load.destination}</TableCell>
                  <TableCell className="text-right">{formatCurrency(load.rate)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(load.fuel_surcharge)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(load.accessorials)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(load.gross_revenue)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(load.truck_revenue)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(load.trailer_revenue)}</TableCell>
                  <TableCell className="text-right font-medium text-success">{formatCurrency(load.net_revenue)}</TableCell>
                  <TableCell className="text-right">{load.actual_miles?.toLocaleString() || '-'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-medium">
                <TableCell colSpan={3}>Totals ({revenueTotals.loadCount} loads)</TableCell>
                <TableCell className="text-right">{formatCurrency(revenueTotals.bookedLinehaul)}</TableCell>
                <TableCell className="text-right">{formatCurrency(revenueTotals.fuelSurcharge)}</TableCell>
                <TableCell className="text-right">{formatCurrency(revenueTotals.accessorials)}</TableCell>
                <TableCell className="text-right">{formatCurrency(revenueTotals.grossRevenue)}</TableCell>
                <TableCell className="text-right">{formatCurrency(revenueTotals.truckRevenue)}</TableCell>
                <TableCell className="text-right">{formatCurrency(revenueTotals.trailerRevenue)}</TableCell>
                <TableCell className="text-right text-success">{formatCurrency(revenueTotals.netRevenue)}</TableCell>
                <TableCell className="text-right">{revenueTotals.actualMiles.toLocaleString()}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
