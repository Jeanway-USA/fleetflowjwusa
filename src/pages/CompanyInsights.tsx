import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy, Truck, Users, Building2, Receipt, TrendingUp, TrendingDown, DollarSign, FileText } from 'lucide-react';
import { startOfYear, endOfYear, format } from 'date-fns';

const CompanyInsights = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());

  const yearStart = startOfYear(new Date(parseInt(selectedYear), 0, 1));
  const yearEnd = endOfYear(new Date(parseInt(selectedYear), 0, 1));

  // Fetch fleet loads with truck and driver info
  const { data: fleetLoads = [] } = useQuery({
    queryKey: ['fleet-loads-insights', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, drivers(*), trucks(*)')
        .gte('pickup_date', format(yearStart, 'yyyy-MM-dd'))
        .lte('pickup_date', format(yearEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    },
  });

  // Note: Agency data is derived from fleet_loads using agency_code field

  // Fetch expenses
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses-insights', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', format(yearStart, 'yyyy-MM-dd'))
        .lte('expense_date', format(yearEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch load expenses
  const { data: loadExpenses = [] } = useQuery({
    queryKey: ['load-expenses-insights', selectedYear],
    queryFn: async () => {
      const loadIds = fleetLoads.map((l: any) => l.id);
      if (loadIds.length === 0) return [];
      const { data, error } = await supabase
        .from('load_expenses')
        .select('*')
        .in('load_id', loadIds);
      if (error) throw error;
      return data || [];
    },
    enabled: fleetLoads.length > 0,
  });

  // Fetch maintenance logs
  const { data: maintenanceLogs = [] } = useQuery({
    queryKey: ['maintenance-insights', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_logs')
        .select('*')
        .gte('service_date', format(yearStart, 'yyyy-MM-dd'))
        .lte('service_date', format(yearEnd, 'yyyy-MM-dd'));
      if (error) throw error;
      return data || [];
    },
  });

  const formatCurrency = (amount: number | null | undefined) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  // ==================== FLEET & DRIVER REPORTS ====================
  
  // Aggregate revenue by truck
  const truckRevenue = fleetLoads.reduce((acc: Record<string, { truck: any; revenue: number; loads: number }>, load: any) => {
    if (!load.truck_id || !load.trucks) return acc;
    const truckId = load.truck_id;
    if (!acc[truckId]) {
      acc[truckId] = { truck: load.trucks, revenue: 0, loads: 0 };
    }
    acc[truckId].revenue += (load.net_revenue || 0);
    acc[truckId].loads += 1;
    return acc;
  }, {});

  const truckLeaderboard = Object.values(truckRevenue)
    .sort((a: any, b: any) => b.revenue - a.revenue);

  // Aggregate revenue by driver
  const driverRevenue = fleetLoads.reduce((acc: Record<string, { driver: any; revenue: number; loads: number; miles: number }>, load: any) => {
    if (!load.driver_id || !load.drivers) return acc;
    const driverId = load.driver_id;
    if (!acc[driverId]) {
      acc[driverId] = { driver: load.drivers, revenue: 0, loads: 0, miles: 0 };
    }
    acc[driverId].revenue += (load.net_revenue || 0);
    acc[driverId].loads += 1;
    acc[driverId].miles += (load.actual_miles || load.booked_miles || 0);
    return acc;
  }, {});

  const driverLeaderboard = Object.values(driverRevenue)
    .sort((a: any, b: any) => b.revenue - a.revenue);

  // ==================== AGENCY REPORTS ====================
  
  // Aggregate by agency_code from fleet_loads
  const agencyStats = fleetLoads.reduce((acc: Record<string, { name: string; totalRevenue: number; loads: number; loadRefs: string[] }>, load: any) => {
    const agencyCode = load.agency_code || 'No Agency';
    if (!acc[agencyCode]) {
      acc[agencyCode] = { name: agencyCode, totalRevenue: 0, loads: 0, loadRefs: [] };
    }
    acc[agencyCode].totalRevenue += (load.net_revenue || 0);
    acc[agencyCode].loads += 1;
    if (load.landstar_load_id) {
      acc[agencyCode].loadRefs.push(load.landstar_load_id);
    }
    return acc;
  }, {});

  const agencyLeaderboard = Object.values(agencyStats)
    .filter((a: any) => a.name !== 'No Agency')
    .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);
  
  const totalAgencyRevenue = agencyLeaderboard.reduce((sum: number, a: any) => sum + a.totalRevenue, 0);
  const totalAgencyLoads = agencyLeaderboard.reduce((sum: number, a: any) => sum + a.loads, 0);

  // ==================== TAX SUMMARY ====================
  
  // Gross Income = Net Revenue from all fleet loads
  const grossIncome = fleetLoads.reduce((sum: number, load: any) => sum + (load.net_revenue || 0), 0);

  // Operating costs from load_expenses
  const operatingCosts = loadExpenses.reduce((acc: Record<string, number>, exp: any) => {
    // Aggregate operating expenses
    acc['Fuel'] = (acc['Fuel'] || 0) + (exp.fuel_cost || 0);
    acc['Truck Payment'] = (acc['Truck Payment'] || 0) + (exp.truck_payment || 0);
    acc['Trailer Payment'] = (acc['Trailer Payment'] || 0) + (exp.trailer_payment || 0);
    acc['Insurance'] = (acc['Insurance'] || 0) + (exp.insurance || 0);
    acc['Licensing & Permits'] = (acc['Licensing & Permits'] || 0) + (exp.licensing_permits || 0);
    acc['LCN/Satellite'] = (acc['LCN/Satellite'] || 0) + (exp.lcn_satellite || 0);
    acc['Cell Phone'] = (acc['Cell Phone'] || 0) + (exp.cell_phone || 0);
    acc['Tires'] = (acc['Tires'] || 0) + (exp.tires || 0);
    acc['Oil'] = (acc['Oil'] || 0) + (exp.oil || 0);
    acc['Repairs & Parts'] = (acc['Repairs & Parts'] || 0) + (exp.repairs_parts || 0);
    acc['Lumper'] = (acc['Lumper'] || 0) + (exp.lumper || 0);
    acc['Trip Scanning'] = (acc['Trip Scanning'] || 0) + (exp.trip_scanning || 0);
    acc['Card Load'] = (acc['Card Load'] || 0) + (exp.card_load || 0);
    acc['Road/Fuel Tax'] = (acc['Road/Fuel Tax'] || 0) + (exp.road_fuel_tax || 0);
    acc['PrePass/Scale'] = (acc['PrePass/Scale'] || 0) + (exp.prepass_scale || 0);
    acc['Tolls'] = (acc['Tolls'] || 0) + (exp.tolls || 0);
    acc['Parking'] = (acc['Parking'] || 0) + (exp.parking || 0);
    acc['Office Supplies'] = (acc['Office Supplies'] || 0) + (exp.office_supplies || 0);
    acc['Maintenance Fund'] = (acc['Maintenance Fund'] || 0) + (exp.maintenance_fund || 0);
    acc['Misc Operating'] = (acc['Misc Operating'] || 0) + (exp.misc_operating || 0);
    return acc;
  }, {});

  // Add maintenance costs
  const maintenanceCost = maintenanceLogs.reduce((sum: number, log: any) => sum + (log.cost || 0), 0);
  operatingCosts['Maintenance & Repairs'] = (operatingCosts['Maintenance & Repairs'] || 0) + maintenanceCost;

  // Add general expenses
  expenses.forEach((exp: any) => {
    const type = exp.expense_type || 'Other';
    operatingCosts[type] = (operatingCosts[type] || 0) + (exp.amount || 0);
  });

  // Sort operating costs by amount (highest first)
  const sortedOperatingCosts = Object.entries(operatingCosts)
    .filter(([_, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);

  const totalOperatingCosts = sortedOperatingCosts.reduce((sum, [_, amount]) => sum + amount, 0);

  // Tax-deductible expenses (all operating costs are generally deductible for trucking)
  const taxDeductibleTotal = totalOperatingCosts;
  const netTaxableIncome = grossIncome - taxDeductibleTotal;

  const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());

  const getRankBadge = (index: number) => {
    if (index === 0) return <Badge className="bg-amber-500 text-white"><Trophy className="h-3 w-3 mr-1" /> 1st</Badge>;
    if (index === 1) return <Badge className="bg-slate-400 text-white">2nd</Badge>;
    if (index === 2) return <Badge className="bg-amber-700 text-white">3rd</Badge>;
    return <Badge variant="outline">{index + 1}th</Badge>;
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader 
            title="Company Insights" 
            description="Reports and analytics for fleet performance, agencies, and tax summary"
          />
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="fleet-driver" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="fleet-driver" className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Fleet & Driver Reports
            </TabsTrigger>
            <TabsTrigger value="agency" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Agency Reports
            </TabsTrigger>
            <TabsTrigger value="tax" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Tax Summary
            </TabsTrigger>
          </TabsList>

          {/* Fleet & Driver Reports */}
          <TabsContent value="fleet-driver" className="space-y-6">
            <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
              {/* Truck Leaderboard */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" />
                    Truck Revenue Leaderboard
                  </CardTitle>
                  <CardDescription>Top performing trucks by net revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  {truckLeaderboard.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No truck data for {selectedYear}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="text-right">Loads</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {truckLeaderboard.map((item: any, index: number) => (
                          <TableRow key={item.truck.id} className={index === 0 ? 'bg-primary/10' : ''}>
                            <TableCell>{getRankBadge(index)}</TableCell>
                            <TableCell className="font-medium">{item.truck.unit_number}</TableCell>
                            <TableCell className="text-right">{item.loads}</TableCell>
                            <TableCell className="text-right font-mono font-medium text-primary">
                              {formatCurrency(item.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Driver Leaderboard */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Driver Revenue Leaderboard
                  </CardTitle>
                  <CardDescription>Top performing drivers by net revenue</CardDescription>
                </CardHeader>
                <CardContent>
                  {driverLeaderboard.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No driver data for {selectedYear}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead className="text-right">Loads</TableHead>
                          <TableHead className="text-right">Miles</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {driverLeaderboard.map((item: any, index: number) => (
                          <TableRow key={item.driver.id} className={index === 0 ? 'bg-primary/10' : ''}>
                            <TableCell>{getRankBadge(index)}</TableCell>
                            <TableCell className="font-medium">
                              {item.driver.first_name} {item.driver.last_name}
                            </TableCell>
                            <TableCell className="text-right">{item.loads}</TableCell>
                            <TableCell className="text-right">{item.miles.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-mono font-medium text-primary">
                              {formatCurrency(item.revenue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Fleet Revenue</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(grossIncome)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Loads</p>
                    <p className="text-2xl font-bold">{fleetLoads.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Active Trucks</p>
                    <p className="text-2xl font-bold">{Object.keys(truckRevenue).length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Active Drivers</p>
                    <p className="text-2xl font-bold">{Object.keys(driverRevenue).length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Agency Reports */}
          <TabsContent value="agency" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Agency Performance
                </CardTitle>
                <CardDescription>Agencies ranked by total revenue generated</CardDescription>
              </CardHeader>
              <CardContent>
                {agencyLeaderboard.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No agency load data for {selectedYear}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rank</TableHead>
                        <TableHead>Agency Code</TableHead>
                        <TableHead className="text-right">Total Loads</TableHead>
                        <TableHead className="text-right">Total Revenue</TableHead>
                        <TableHead>Load References</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agencyLeaderboard.map((agency: any, index: number) => (
                        <TableRow key={agency.name} className={index === 0 ? 'bg-primary/10' : ''}>
                          <TableCell>{getRankBadge(index)}</TableCell>
                          <TableCell className="font-medium">{agency.name}</TableCell>
                          <TableCell className="text-right">{agency.loads}</TableCell>
                          <TableCell className="text-right font-mono font-medium text-primary">
                            {formatCurrency(agency.totalRevenue)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {agency.loadRefs.slice(0, 3).map((ref: string, i: number) => (
                                <Badge key={i} variant="outline" className="text-xs">{ref}</Badge>
                              ))}
                              {agency.loadRefs.length > 3 && (
                                <Badge variant="secondary" className="text-xs">+{agency.loadRefs.length - 3} more</Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Agency Summary */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Agency Revenue</p>
                    <p className="text-2xl font-bold text-primary">
                      {formatCurrency(totalAgencyRevenue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Total Agency Loads</p>
                    <p className="text-2xl font-bold">{totalAgencyLoads}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground">Active Agencies</p>
                    <p className="text-2xl font-bold">{agencyLeaderboard.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tax Summary */}
          <TabsContent value="tax" className="space-y-6">
            {/* Top Summary Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-green-100 dark:bg-green-900">
                      <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Gross Income</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(grossIncome)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-red-100 dark:bg-red-900">
                      <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Operating Costs</p>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {formatCurrency(totalOperatingCosts)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-primary/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-full bg-primary/10">
                      <DollarSign className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Net Taxable Income</p>
                      <p className={`text-2xl font-bold ${netTaxableIncome >= 0 ? 'text-primary' : 'text-red-600'}`}>
                        {formatCurrency(netTaxableIncome)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Operating Costs Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Operating Costs Breakdown
                </CardTitle>
                <CardDescription>All operating expenses sorted by amount (highest first)</CardDescription>
              </CardHeader>
              <CardContent>
                {sortedOperatingCosts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No operating costs recorded for {selectedYear}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Expense Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedOperatingCosts.map(([category, amount], index) => (
                        <TableRow key={category} className={index < 3 ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                          <TableCell className="font-medium">{category}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {totalOperatingCosts > 0 ? ((amount / totalOperatingCosts) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2 font-bold">
                        <TableCell>Total Operating Costs</TableCell>
                        <TableCell className="text-right font-mono text-red-600 dark:text-red-400">
                          {formatCurrency(totalOperatingCosts)}
                        </TableCell>
                        <TableCell className="text-right">100%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Tax Deductible Summary */}
            <Card className="border-blue-200 dark:border-blue-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Tax-Deductible Expenses
                </CardTitle>
                <CardDescription>All operating costs are generally tax-deductible for trucking businesses</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
                    <span className="font-medium">Total Tax-Deductible Amount</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(taxDeductibleTotal)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">Common trucking tax deductions include:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Fuel and oil expenses</li>
                      <li>Truck and trailer payments/depreciation</li>
                      <li>Insurance premiums</li>
                      <li>Maintenance and repairs</li>
                      <li>Licensing and permits</li>
                      <li>Tolls and parking fees</li>
                      <li>Communication expenses (cell phone, satellite)</li>
                      <li>Office supplies and business equipment</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
};

export default CompanyInsights;
