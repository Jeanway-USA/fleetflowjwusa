import { Card, CardContent, CardTitle, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { DollarSign, TrendingUp, TrendingDown, Percent, PiggyBank, Route } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';

interface PLSummaryTabProps {
  revenueTotals: any;
  loadExpenseTotals: any;
  standaloneExpenseTotals: any;
  loadLinkedExpenseTotals: any;
  payrollTotals: any;
  commissionTotals: any;
  deadheadMiles: number;
  totalEmptyMiles: number;
  totalActualMilesWithDeadhead: number;
  netProfit: number;
  profitMargin: number;
  totalExpenses: number;
  totalRevenueWithCommissions: number;
  getSetting: (key: string, defaultValue?: string) => string;
}

export function PLSummaryTab({
  revenueTotals,
  loadExpenseTotals,
  standaloneExpenseTotals,
  loadLinkedExpenseTotals,
  payrollTotals,
  commissionTotals,
  deadheadMiles,
  totalEmptyMiles,
  totalActualMilesWithDeadhead,
  netProfit,
  profitMargin,
  totalExpenses,
  totalRevenueWithCommissions,
  getSetting,
}: PLSummaryTabProps) {
  return (
    <>
      {/* Revenue Flow */}
      <Card className="card-elevated mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-6 text-center">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">100% GROSS</p>
              <p className="text-2xl font-bold">{formatCurrency(revenueTotals.grossRevenue)}</p>
            </div>
            <div className="p-4 bg-primary/10 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">TRUCK REVENUE ({getSetting('truck_percentage', '65')}%)</p>
              <p className="text-2xl font-bold">{formatCurrency(revenueTotals.truckRevenue)}</p>
            </div>
            <div className="p-4 bg-success/10 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">NET PROFIT</p>
              <p className="text-2xl font-bold text-success">{formatCurrency(netProfit)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Revenue Summary */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              Revenue Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>GROSS L/H</TableCell>
                  <TableCell className="text-right">{formatCurrency(revenueTotals.bookedLinehaul)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    FSC REV 
                    <span className="text-muted-foreground text-xs ml-2">
                      ({revenueTotals.grossRevenue > 0 ? ((revenueTotals.fuelSurcharge / revenueTotals.grossRevenue) * 100).toFixed(2) : 0}% of Gross)
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(revenueTotals.fuelSurcharge)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Accessorials</TableCell>
                  <TableCell className="text-right">{formatCurrency(revenueTotals.accessorials)}</TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="font-medium">Gross Revenue (100%)</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(revenueTotals.grossRevenue)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Truck Revenue ({getSetting('truck_percentage', '65')}%)</TableCell>
                  <TableCell className="text-right">{formatCurrency(revenueTotals.truckRevenue)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Trailer Revenue ({getSetting('trailer_percentage', '7')}%)</TableCell>
                  <TableCell className="text-right">{formatCurrency(revenueTotals.trailerRevenue)}</TableCell>
                </TableRow>
                <TableRow className="bg-success/10">
                  <TableCell className="font-bold">TOTAL REV (Net Revenue)</TableCell>
                  <TableCell className="text-right font-bold text-success">{formatCurrency(revenueTotals.netRevenue)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Miles Summary */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5 text-primary" />
              Miles Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell>Paid Miles (Booked)</TableCell>
                  <TableCell className="text-right font-mono">{revenueTotals.bookedMiles.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Actual Miles</TableCell>
                  <TableCell className="text-right font-mono">{revenueTotals.actualMiles.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Deadhead Miles (Between Loads)</TableCell>
                  <TableCell className="text-right font-mono">{deadheadMiles.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Empty Miles</TableCell>
                  <TableCell className="text-right font-mono">{totalEmptyMiles.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow className="border-t">
                  <TableCell className="font-medium">% of Empty Miles</TableCell>
                  <TableCell className="text-right font-medium">
                    {totalActualMilesWithDeadhead > 0
                      ? ((totalEmptyMiles / totalActualMilesWithDeadhead) * 100).toFixed(2)
                      : 0}%
                  </TableCell>
                </TableRow>
                <TableRow className="border-t-2">
                  <TableCell className="font-medium">Revenue Per Paid Mile</TableCell>
                  <TableCell className="text-right font-medium text-success">
                    {revenueTotals.bookedMiles > 0 ? formatCurrency(revenueTotals.netRevenue / revenueTotals.bookedMiles) : '$0.00'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Revenue Per Actual Mile</TableCell>
                  <TableCell className="text-right font-medium">
                    {totalActualMilesWithDeadhead > 0 ? formatCurrency(revenueTotals.netRevenue / totalActualMilesWithDeadhead) : '$0.00'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Net Profit Calculation */}
      <Card className="card-elevated mt-6">
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Net Revenue</span>
                <span className="font-mono text-success">{formatCurrency(revenueTotals.netRevenue)}</span>
              </div>
              <div className="flex justify-between">
                <span>Agency Commissions (Revenue)</span>
                <span className="font-mono text-success">+{formatCurrency(commissionTotals.amount)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-2 mt-2">
                <span>Total Revenue</span>
                <span className="font-mono">{formatCurrency(totalRevenueWithCommissions)}</span>
              </div>
              <div className="flex justify-between mt-4">
                <span>Operating Expenses</span>
                <span className="font-mono text-destructive">-{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="flex justify-between">
                <span>Driver Payroll</span>
                <span className="font-mono text-destructive">-{formatCurrency(payrollTotals.netPay)}</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">{netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS'}</span>
                  <span className={`font-bold text-2xl ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(netProfit)}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Loads</p>
                <p className="text-2xl font-bold">{revenueTotals.loadCount}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Profit Margin</p>
                <p className={`text-2xl font-bold ${profitMargin >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {profitMargin.toFixed(1)}%
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Avg Per Load</p>
                <p className="text-xl font-bold">
                  {revenueTotals.loadCount > 0 ? formatCurrency(netProfit / revenueTotals.loadCount) : '$0.00'}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Profit Per Mile</p>
                <p className="text-xl font-bold">
                  {revenueTotals.actualMiles > 0 ? formatCurrency(netProfit / revenueTotals.actualMiles) : '$0.00'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
