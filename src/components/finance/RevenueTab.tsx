import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface RevenueTabProps {
  filteredLoads: any[];
  revenueTotals: any;
}

const CATEGORY_COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))'];

export function RevenueTab({ filteredLoads, revenueTotals }: RevenueTabProps) {
  const { isIndependent } = useOrganizationMode();

  const categoryData = [
    { name: 'Line Haul', value: revenueTotals.bookedLinehaul || 0 },
    { name: 'Fuel Surcharge', value: revenueTotals.fuelSurcharge || 0 },
    { name: 'Accessorials', value: revenueTotals.accessorials || 0 },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Revenue Category Breakdown — Independent mode only */}
      {isIndependent && categoryData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="card-elevated">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Line Haul</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(revenueTotals.bookedLinehaul)}</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Fuel Surcharge</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(revenueTotals.fuelSurcharge)}</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Accessorials</p>
              <p className="text-xl font-bold text-foreground">{formatCurrency(revenueTotals.accessorials)}</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="pt-4 pb-3 flex items-center gap-4">
              <div className="w-16 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" cx="50%" cy="50%" outerRadius={28} innerRadius={14} strokeWidth={0}>
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                {categoryData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
    </div>
  );
}
