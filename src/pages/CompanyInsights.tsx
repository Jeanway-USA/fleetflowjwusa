import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { truckRevenueOf, expenseCost, MIRRORED_LOAN_EXPENSE_TYPE, driverPayTotals } from '@/lib/pl-metrics';

const CompanyInsights = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const from = `${selectedYear}-01-01`;
  const to = `${selectedYear}-12-31`;
  const inYear = (date: string | null | undefined) => !!date && date >= from && date <= to;

  // Same rules as the Money page: delivered loads, by delivery date, at your revenue (not the gross bill).
  const { data: fleetLoads = [] } = useQuery({
    queryKey: ['fleet-loads-insights', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('*, drivers(*), trucks(*)')
        .is('deleted_at', null)
        .eq('status', 'delivered')
        .gte('delivery_date', from)
        .lte('delivery_date', to);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses-insights', selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('expense_type, amount, notes')
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to);
      if (error) throw error;
      return data || [];
    },
  });

  // Older per-load expense records, which the Money page still counts.
  const { data: loadExpenses = [] } = useQuery({
    queryKey: ['load-expenses-insights', selectedYear, fleetLoads.length],
    queryFn: async () => {
      const loadIds = fleetLoads.map((l: any) => l.id);
      if (loadIds.length === 0) return [];
      const { data, error } = await supabase
        .from('load_expenses')
        .select('operating_total')
        .is('deleted_at', null)
        .in('load_id', loadIds);
      if (error) throw error;
      return data || [];
    },
    enabled: fleetLoads.length > 0,
  });

  // The loan ledger is the source of truth for truck payments.
  const { data: loanPayments = [] } = useQuery({
    queryKey: ['loan-payments-insights', selectedYear],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('truck_loan_payments')
        .select('amount, payment_date')
        .gte('payment_date', from)
        .lte('payment_date', to);
      if (error) throw error;
      return (data ?? []) as Array<{ amount: number; payment_date: string }>;
    },
  });

  // Driver pay: approved or paid settlements, W-2 batches and safety bonuses.
  const { data: settlements = [] } = useQuery({
    queryKey: ['insights-driver-settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_settlements')
        .select('driver_id, period_end, status, gross_pay, reimbursements')
        .is('deleted_at', null);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: batches = [] } = useQuery({
    queryKey: ['insights-driver-payroll'],
    queryFn: async () => {
      const { data, error } = await supabase.from('driver_payroll').select('driver_id, period_end, net_pay').is('deleted_at', null);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: bonuses = [] } = useQuery({
    queryKey: ['insights-safety-bonuses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_bonus_payouts')
        .select('period_end, status, earned_amount, paid_in_settlement_id')
        .is('deleted_at', null);
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

  const truckRevenue = fleetLoads.reduce((acc: Record<string, { truck: any; revenue: number; loads: number }>, load: any) => {
    if (!load.truck_id || !load.trucks) return acc;
    const truckId = load.truck_id;
    if (!acc[truckId]) {
      acc[truckId] = { truck: load.trucks, revenue: 0, loads: 0 };
    }
    acc[truckId].revenue += truckRevenueOf(load);
    acc[truckId].loads += 1;
    return acc;
  }, {});

  const truckLeaderboard = Object.values(truckRevenue)
    .sort((a: any, b: any) => b.revenue - a.revenue);

  const driverRevenue = fleetLoads.reduce((acc: Record<string, { driver: any; revenue: number; loads: number; miles: number }>, load: any) => {
    if (!load.driver_id || !load.drivers) return acc;
    const driverId = load.driver_id;
    if (!acc[driverId]) {
      acc[driverId] = { driver: load.drivers, revenue: 0, loads: 0, miles: 0 };
    }
    acc[driverId].revenue += truckRevenueOf(load);
    acc[driverId].loads += 1;
    acc[driverId].miles += (load.actual_miles || load.booked_miles || 0);
    return acc;
  }, {});

  const driverLeaderboard = Object.values(driverRevenue)
    .sort((a: any, b: any) => b.revenue - a.revenue);

  // ==================== AGENCY REPORTS ====================

  const agencyStats = fleetLoads.reduce((acc: Record<string, { name: string; totalRevenue: number; loads: number; loadRefs: string[] }>, load: any) => {
    const agencyCode = load.agency_code || 'No Agency';
    if (!acc[agencyCode]) {
      acc[agencyCode] = { name: agencyCode, totalRevenue: 0, loads: 0, loadRefs: [] };
    }
    acc[agencyCode].totalRevenue += truckRevenueOf(load);
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

  const grossIncome = fleetLoads.reduce((sum: number, load: any) => sum + truckRevenueOf(load), 0);

  // Costs follow the Money page: card advances are not costs, credits (fuel discounts, reimbursements)
  // reduce cost, truck payments come from the loan ledger, and driver pay counts.
  const operatingCosts: Record<string, number> = {};
  for (const exp of expenses as any[]) {
    const type = exp.expense_type || 'Other';
    if (type === MIRRORED_LOAN_EXPENSE_TYPE) continue;
    const cost = expenseCost(exp);
    if (cost !== 0) operatingCosts[type] = (operatingCosts[type] || 0) + cost;
  }
  const loanTotal = loanPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  if (loanTotal !== 0) operatingCosts['Truck payments'] = loanTotal;
  const legacyTotal = (loadExpenses as any[]).reduce((sum, e) => sum + (Number(e.operating_total) || 0), 0);
  if (legacyTotal !== 0) operatingCosts['Load expenses (older records)'] = legacyTotal;
  const driverPay = driverPayTotals(
    (settlements as any[]).filter((s) => inYear(s.period_end)),
    (batches as any[]).filter((b) => inYear(b.period_end)),
    (bonuses as any[]).filter((b) => inYear(b.period_end)),
  );
  if (driverPay.total !== 0) operatingCosts['Driver pay'] = driverPay.total;

  const sortedOperatingCosts = Object.entries(operatingCosts)
    .filter(([_, amount]) => Math.abs(amount) >= 0.005)
    .sort((a, b) => b[1] - a[1]);

  const totalOperatingCosts = sortedOperatingCosts.reduce((sum, [_, amount]) => sum + amount, 0);

  const taxDeductibleTotal = totalOperatingCosts;
  const netTaxableIncome = grossIncome - taxDeductibleTotal;

  const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());

  const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
  const th = 'py-2 text-[12px] font-semibold   text-muted-foreground';
  const money = (v: number) => formatCurrency(v);

  const leaderboard = (caption: string, columns: string[], rows: React.ReactNode[][], empty: string) =>
    rows.length === 0 ? (
      <p className="border-t px-4 py-6 text-sm text-muted-foreground">{empty}</p>
    ) : (
      <div className="overflow-x-auto border-t">
        <table className="w-full text-[15px]">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b text-left">
              {columns.map((c, i) => (
                <th key={c} scope="col" className={`${th} ${i === 0 ? 'pl-4' : ''} ${i >= 2 || (i === 1 && columns.length === 3) ? 'text-right' : ''} ${i === columns.length - 1 ? 'pr-4' : ''}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((cells, r) => (
              <tr key={r} className={r === 0 ? 'bg-primary/5' : ''}>
                {cells.map((cell, i) => (
                  <td key={i} className={`py-2.5 ${i === 0 ? 'pl-4 font-medium' : ''} ${i >= 2 || (i === 1 && columns.length === 3) ? 'figure text-right' : ''} ${i === cells.length - 1 ? 'pr-4 font-semibold' : ''}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <>
      <PageHeader title="Company Insights" description="How the fleet, the agencies and the tax year are doing">
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="h-11 w-full sm:h-10 sm:w-32" aria-label="Year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={year}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <Tabs defaultValue="fleet-driver" className="space-y-5">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto">
          <TabsTrigger value="fleet-driver" className="h-11 shrink-0 px-4">Fleet and drivers</TabsTrigger>
          <TabsTrigger value="agency" className="h-11 shrink-0 px-4">Agencies</TabsTrigger>
          <TabsTrigger value="tax" className="h-11 shrink-0 px-4">Tax summary</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet-driver" className="mt-0 space-y-5">
          <Panel title={`${selectedYear} at a glance`}>
            <StatementLine label="Fleet revenue" note="Delivered loads, your share after Landstar's cut" value={money(grossIncome)} />
            <StatementLine label="Loads" value={fleetLoads.length} rule="single" />
            <StatementLine label="Trucks with loads" value={Object.keys(truckRevenue).length} rule="single" />
            <StatementLine label="Drivers with loads" value={Object.keys(driverRevenue).length} rule="single" />
          </Panel>

          <Panel title="Trucks by revenue" description="Ranked by your revenue" flush>
            {leaderboard(
              'Trucks ranked by revenue',
              ['Rank', 'Unit', 'Loads', 'Revenue'],
              (truckLeaderboard as any[]).map((item, index) => [ordinal(index + 1), item.truck.unit_number, item.loads, money(item.revenue)]),
              `No truck data for ${selectedYear}`,
            )}
          </Panel>

          <Panel title="Drivers by revenue" description="Ranked by your revenue" flush>
            {leaderboard(
              'Drivers ranked by revenue',
              ['Rank', 'Driver', 'Loads', 'Miles', 'Revenue'],
              (driverLeaderboard as any[]).map((item, index) => [ordinal(index + 1), `${item.driver.first_name} ${item.driver.last_name}`, item.loads, item.miles.toLocaleString(), money(item.revenue)]),
              `No driver data for ${selectedYear}`,
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="agency" className="mt-0 space-y-5">
          <Panel title={`${selectedYear} agencies`}>
            <StatementLine label="Agency revenue" value={money(totalAgencyRevenue)} />
            <StatementLine label="Agency loads" value={totalAgencyLoads} rule="single" />
            <StatementLine label="Active agencies" value={agencyLeaderboard.length} rule="single" />
          </Panel>

          <Panel title="Agencies by revenue" flush>
            {leaderboard(
              'Agencies ranked by revenue',
              ['Rank', 'Agency', 'Loads', 'Revenue'],
              (agencyLeaderboard as any[]).map((agency, index) => [ordinal(index + 1), agency.name, agency.loads, money(agency.totalRevenue)]),
              `No agency load data for ${selectedYear}`,
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="tax" className="mt-0 space-y-5">
          <Panel title={`${selectedYear} taxable income`}>
            <StatementLine label="Gross income" note="Your revenue on loads delivered this year" value={money(grossIncome)} />
            <StatementLine label="Operating costs" note="Everything in the breakdown below, driver pay included" value={`−${money(totalOperatingCosts)}`} rule="single" />
            <StatementLine label="Net taxable income" value={money(netTaxableIncome)} strong rule="double" tone={netTaxableIncome < 0 ? 'bad' : undefined} />
          </Panel>

          <Panel title="Operating costs" description="Highest first" flush>
            {sortedOperatingCosts.length === 0 ? (
              <p className="border-t px-4 py-6 text-sm text-muted-foreground">No operating costs recorded for {selectedYear}</p>
            ) : (
              <div className="overflow-x-auto border-t">
                <table className="w-full text-[15px]">
                  <caption className="sr-only">Operating costs by category</caption>
                  <thead>
                    <tr className="border-b text-left">
                      <th scope="col" className={`${th} pl-4`}>Category</th>
                      <th scope="col" className={`${th} text-right`}>Amount</th>
                      <th scope="col" className={`${th} pr-4 text-right`}>Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedOperatingCosts.map(([category, amount]) => (
                      <tr key={category}>
                        <td className="py-2.5 pl-4 font-medium">{category}</td>
                        <td className="figure py-2.5 text-right">{money(amount)}</td>
                        <td className="figure py-2.5 pr-4 text-right text-muted-foreground">{totalOperatingCosts > 0 ? ((amount / totalOperatingCosts) * 100).toFixed(1) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-[3px] border-double border-foreground/70 font-semibold">
                      <td className="py-3 pl-4">Total operating costs</td>
                      <td className="figure py-3 text-right">{money(totalOperatingCosts)}</td>
                      <td className="figure py-3 pr-4 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Tax-deductible expenses" description="Operating costs are generally deductible for a trucking business">
            <StatementLine label="Total deductible" value={money(taxDeductibleTotal)} />
            <div className="border-t py-3 text-sm text-muted-foreground">
              <p className="mb-2">Common trucking deductions:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Fuel and oil</li>
                <li>Truck and trailer payments or depreciation</li>
                <li>Insurance premiums</li>
                <li>Maintenance and repairs</li>
                <li>Licensing and permits</li>
                <li>Tolls and parking</li>
                <li>Phone and satellite service</li>
                <li>Office supplies and business equipment</li>
              </ul>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
};

export default CompanyInsights;
