import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTruckHistory, useTruckProfitability } from '@/hooks/useMaintenanceData';
import { calculateWearPartHealth } from '@/lib/truck-maintenance-profiles';
import { format, formatDistanceToNow } from 'date-fns';
import { Truck, DollarSign, Wrench, Calendar, FileText, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

interface TruckHistoryDrawerProps {
  truckId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getHealthColor(pct: number) {
  if (pct > 50) return 'bg-green-500';
  if (pct > 20) return 'bg-amber-500';
  return 'bg-destructive';
}

function getHealthTextColor(pct: number) {
  if (pct > 50) return 'text-green-600 dark:text-green-400';
  if (pct > 20) return 'text-amber-600 dark:text-amber-400';
  return 'text-destructive';
}

export function TruckHistoryDrawer({ truckId, open, onOpenChange }: TruckHistoryDrawerProps) {
  const { data, isLoading } = useTruckHistory(truckId);
  const { data: profitability, isLoading: isProfitabilityLoading } = useTruckProfitability(truckId);

  const wearParts = data?.truck
    ? calculateWearPartHealth(
        data.truck.make,
        null,
        data.truck.current_odometer || 0,
        data.truck.purchase_mileage || 0
      )
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {isLoading ? (
              <Skeleton className="h-6 w-24" />
            ) : (
              <>Unit {data?.truck?.unit_number || 'Unknown'}</>
            )}
          </SheetTitle>
          <SheetDescription>
            {isLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              data?.truck && (
                <>
                  {data.truck.year} {data.truck.make} {data.truck.model}
                  {data.truck.current_odometer != null && data.truck.current_odometer > 0 && (
                    <> • {data.truck.current_odometer.toLocaleString()} miles</>
                  )}
                </>
              )
            )}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 py-6">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : data ? (
          <Tabs defaultValue="history" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="profitability">Unit P&L</TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="mt-0">
              <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                <div className="space-y-6 py-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-xs">Total Spend</span>
                    </div>
                    <p className="text-xl font-bold">
                      ${data.stats.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Wrench className="h-4 w-4" />
                      <span className="text-xs">Total Jobs</span>
                    </div>
                    <p className="text-xl font-bold">
                      {data.workOrders.length + data.logs.length}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {data.stats.lastServiceDate && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Last service: {formatDistanceToNow(new Date(data.stats.lastServiceDate), { addSuffix: true })}
                </div>
              )}

              {/* Component Health Section */}
              {wearParts.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Component Health
                    </h3>
                    <div className="space-y-3">
                      {wearParts.map(part => (
                        <div key={part.part_name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{part.part_name}</span>
                            <span className={cn('text-xs font-semibold', getHealthTextColor(part.health_pct))}>
                              {part.health_pct.toFixed(0)}%
                              {part.is_urgent && (
                                <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0">
                                  URGENT
                                </Badge>
                              )}
                            </span>
                          </div>
                          <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className={cn('h-full rounded-full transition-all', getHealthColor(part.health_pct))}
                              style={{ width: `${Math.max(2, part.health_pct)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{part.miles_used.toLocaleString()} mi used</span>
                            <span>{part.lifespan_miles.toLocaleString()} mi lifespan</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Work Orders */}
              {data.workOrders.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Work Orders ({data.workOrders.length})
                  </h3>
                  <div className="space-y-3">
                    {data.workOrders.map(wo => (
                      <Card key={wo.id} className={cn(
                        wo.is_reimbursable && 'border-amber-200 bg-amber-50/30 dark:bg-amber-950/20'
                      )}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="capitalize text-xs">
                                  {wo.service_type}
                                </Badge>
                                <Badge 
                                  variant={wo.status === 'completed' ? 'default' : 'secondary'}
                                  className={cn(
                                    'text-xs',
                                    wo.status === 'completed' && 'bg-emerald-500'
                                  )}
                                >
                                  {wo.status}
                                </Badge>
                                {wo.is_reimbursable && (
                                  <Badge className="bg-amber-100 text-amber-800 text-xs">
                                    Reimbursable
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm">{wo.description || wo.vendor || 'No description'}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date((wo.estimated_completion || wo.entry_date) + 'T00:00:00'), 'MMM d, yyyy')}
                                {wo.vendor && <> • {wo.vendor}</>}
                              </p>
                            </div>
                            <div className="text-right">
                              {wo.final_cost ? (
                                <p className="font-medium">${wo.final_cost.toLocaleString()}</p>
                              ) : wo.cost_estimate ? (
                                <p className="text-sm text-muted-foreground">
                                  Est. ${wo.cost_estimate.toLocaleString()}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Maintenance Logs */}
              {data.logs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Maintenance Logs ({data.logs.length})
                  </h3>
                  <div className="space-y-3">
                    {data.logs.map(log => (
                      <Card key={log.id}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <Badge variant="outline" className="capitalize text-xs">
                                {log.service_type}
                              </Badge>
                              <p className="text-sm">{log.description || 'No description'}</p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(log.service_date), 'MMM d, yyyy')}
                                {log.vendor && <> • {log.vendor}</>}
                              </p>
                            </div>
                            {log.cost && (
                              <p className="font-medium">${log.cost.toLocaleString()}</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {data.workOrders.length === 0 && data.logs.length === 0 && wearParts.length === 0 && (
                <div className="text-center py-8">
                  <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No maintenance history for this truck.</p>
                </div>
              )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="profitability" className="mt-0">
              <ScrollArea className="h-[calc(100vh-200px)] pr-4">
                <div className="space-y-6 py-6">
                  {isProfitabilityLoading ? (
                    <>
                      <Skeleton className="h-32 w-full" />
                      <Skeleton className="h-64 w-full" />
                    </>
                  ) : profitability ? (
                    <>
                      {/* Metric Cards */}
                      <div className="grid grid-cols-1 gap-4">
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                              <TrendingUp className="h-4 w-4" />
                              <span className="text-xs">90-Day Gross Revenue</span>
                            </div>
                            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                              ${profitability.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                              <TrendingDown className="h-4 w-4" />
                              <span className="text-xs">90-Day Total Cost</span>
                            </div>
                            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                              ${profitability.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-muted-foreground mb-1">
                              <Activity className="h-4 w-4" />
                              <span className="text-xs">Net Profit Margin</span>
                            </div>
                            <p className={cn(
                              "text-2xl font-bold",
                              profitability.profitMargin >= 0 
                                ? "text-green-600 dark:text-green-400" 
                                : "text-red-600 dark:text-red-400"
                            )}>
                              {profitability.profitMargin.toFixed(1)}%
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Net: ${profitability.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Chart */}
                      {profitability.chartData.length > 0 ? (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-sm">Revenue vs Cost Trends (90 Days)</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ChartContainer
                              config={{
                                revenue: {
                                  label: "Revenue",
                                  color: "hsl(142 76% 36%)",
                                },
                                cost: {
                                  label: "Cost",
                                  color: "hsl(0 84% 60%)",
                                },
                              }}
                              className="h-[300px] w-full"
                            >
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={profitability.chartData}>
                                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                  <XAxis 
                                    dataKey="month" 
                                    tickFormatter={(value) => {
                                      const [year, month] = value.split('-');
                                      return `${month}/${year.slice(2)}`;
                                    }}
                                  />
                                  <YAxis 
                                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                                  />
                                  <ChartTooltip 
                                    content={<ChartTooltipContent />}
                                    formatter={(value: number) => `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                                  />
                                  <Legend />
                                  <Bar dataKey="revenue" fill="hsl(142 76% 36%)" name="Revenue" radius={[4, 4, 0, 0]} />
                                  <Bar dataKey="cost" fill="hsl(0 84% 60%)" name="Cost" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </ChartContainer>
                          </CardContent>
                        </Card>
                      ) : (
                        <Card>
                          <CardContent className="p-6 text-center">
                            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">No financial data for the last 90 days.</p>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No profitability data available.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
