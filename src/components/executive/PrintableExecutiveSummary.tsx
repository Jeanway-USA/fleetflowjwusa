import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';

interface KPIData {
  grossRevenue: number;
  netRevenue: number;
  operatingProfit: number;
  profitMargin: number;
  prevGrossRevenue: number;
  prevNetRevenue: number;
  prevOperatingProfit: number;
  prevProfitMargin: number;
  deliveredLoadCount: number;
  prevDeliveredLoadCount: number;
}

interface FleetStatus {
  active: number;
  available: number;
  maintenance: number;
  outOfService: number;
  total: number;
}

interface DriverAvailability {
  onLoad: number;
  available: number;
  offDuty: number;
  credentialIssues: number;
  total: number;
}

interface OperationalData {
  totalLoads: number;
  totalMiles: number;
  revenuePerMile: number;
  fleetUtilization: number;
  onTimeRate: number;
  totalEmptyMiles?: number;
  emptyMilesRatio?: number;
}

interface TopPerformers {
  topDriver?: {
    name: string;
    revenue: number;
    miles: number;
    loads: number;
  };
  topTruck?: {
    unitNumber: string;
    revenue: number;
    miles: number;
    loads: number;
  };
}

interface PrintableExecutiveSummaryProps {
  kpiData?: KPIData;
  fleetStatus?: FleetStatus;
  driverAvailability?: DriverAvailability;
  operationalData?: OperationalData;
  topPerformers?: TopPerformers;
  period: string;
  onClose: () => void;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const fmtNumber = (v: number) => new Intl.NumberFormat('en-US').format(Math.round(v));
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const changeLabel = (cur: number, prev: number) => {
  if (!prev) return '';
  const pct = ((cur - prev) / prev) * 100;
  return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
};

export function PrintableExecutiveSummary({
  kpiData,
  fleetStatus,
  driverAvailability,
  operationalData,
  topPerformers,
  period,
  onClose,
}: PrintableExecutiveSummaryProps) {
  const generatedAt = format(new Date(), 'MMM d, yyyy h:mm a');

  return (
    <div className="print-report bg-white text-black h-auto">
      {/* Toolbar — hidden on print */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <span className="text-sm text-gray-500">End-of-Week Report Preview</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2 bg-white border-gray-400 text-black hover:bg-gray-100">
            <Printer className="h-4 w-4" /> Print Report
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-black hover:bg-gray-100">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Report Body */}
      <div className="mx-auto max-w-4xl px-8 py-6 space-y-8 print:px-0 print:py-0 print:space-y-6">
        {/* Header */}
        <header className="text-center border-b-2 border-black pb-4">
          <h1 className="text-2xl font-bold tracking-tight">Executive Summary — End of Week Report</h1>
          <p className="text-sm text-gray-600 mt-1">
            Period: <span className="font-medium capitalize">{period}</span> &middot; Generated {generatedAt}
          </p>
        </header>

        {/* Section 1: Revenue KPIs */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest border-b border-gray-400 pb-1 mb-3">Revenue Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Gross Revenue', value: fmtCurrency(kpiData?.grossRevenue ?? 0), change: changeLabel(kpiData?.grossRevenue ?? 0, kpiData?.prevGrossRevenue ?? 0) },
              { label: 'Net Revenue', value: fmtCurrency(kpiData?.netRevenue ?? 0), change: changeLabel(kpiData?.netRevenue ?? 0, kpiData?.prevNetRevenue ?? 0) },
              { label: 'Operating Profit', value: fmtCurrency(kpiData?.operatingProfit ?? 0), change: changeLabel(kpiData?.operatingProfit ?? 0, kpiData?.prevOperatingProfit ?? 0) },
              { label: 'Profit Margin', value: fmtPct(kpiData?.profitMargin ?? 0), change: changeLabel(kpiData?.profitMargin ?? 0, kpiData?.prevProfitMargin ?? 0) },
            ].map((item) => (
              <div key={item.label} className="border border-gray-300 rounded p-3 text-center">
                <p className="text-xs text-gray-500 uppercase">{item.label}</p>
                <p className="text-lg font-bold mt-1">{item.value}</p>
                {item.change && <p className="text-xs text-gray-500 mt-0.5">vs prior: {item.change}</p>}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">Delivered loads: {kpiData?.deliveredLoadCount ?? 0} (prior: {kpiData?.prevDeliveredLoadCount ?? 0})</p>
        </section>

        {/* Section 2: Fleet Status */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest border-b border-gray-400 pb-1 mb-3">Fleet Status</h2>
          <table className="w-full text-sm border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Hauling</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Available</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Maintenance</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Out of Service</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 px-3 py-1.5">{fleetStatus?.active ?? 0}</td>
                <td className="border border-gray-300 px-3 py-1.5">{fleetStatus?.available ?? 0}</td>
                <td className="border border-gray-300 px-3 py-1.5">{fleetStatus?.maintenance ?? 0}</td>
                <td className="border border-gray-300 px-3 py-1.5">{fleetStatus?.outOfService ?? 0}</td>
                <td className="border border-gray-300 px-3 py-1.5 font-semibold">{fleetStatus?.total ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Section 3: Driver Availability */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest border-b border-gray-400 pb-1 mb-3">Driver Availability</h2>
          <table className="w-full text-sm border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">On Load</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Available</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Off Duty</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Credential Issues</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 px-3 py-1.5">{driverAvailability?.onLoad ?? 0}</td>
                <td className="border border-gray-300 px-3 py-1.5">{driverAvailability?.available ?? 0}</td>
                <td className="border border-gray-300 px-3 py-1.5">{driverAvailability?.offDuty ?? 0}</td>
                <td className="border border-gray-300 px-3 py-1.5">{driverAvailability?.credentialIssues ?? 0}</td>
                <td className="border border-gray-300 px-3 py-1.5 font-semibold">{driverAvailability?.total ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Section 4: Operational Metrics */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest border-b border-gray-400 pb-1 mb-3">Operational Metrics</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Loads Completed', value: fmtNumber(operationalData?.totalLoads ?? 0) },
              { label: 'Miles Driven', value: `${fmtNumber(operationalData?.totalMiles ?? 0)} mi` },
              { label: 'Revenue / Mile', value: `$${(operationalData?.revenuePerMile ?? 0).toFixed(2)}` },
              { label: 'Fleet Utilization', value: fmtPct(operationalData?.fleetUtilization ?? 0) },
              { label: 'On-Time Delivery', value: fmtPct(operationalData?.onTimeRate ?? 0) },
              { label: 'Empty Miles Ratio', value: fmtPct(operationalData?.emptyMilesRatio ?? 0) },
            ].map((item) => (
              <div key={item.label} className="border border-gray-300 rounded p-2 text-center">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="text-base font-bold">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 5: Top Performers */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-widest border-b border-gray-400 pb-1 mb-3">Top Performers</h2>
          <div className="grid grid-cols-2 gap-6">
            <div className="border border-gray-300 rounded p-3">
              <p className="text-xs text-gray-500 uppercase mb-1">Top Driver</p>
              {topPerformers?.topDriver ? (
                <>
                  <p className="font-bold">{topPerformers.topDriver.name}</p>
                  <p className="text-sm">{fmtCurrency(topPerformers.topDriver.revenue)} &middot; {fmtNumber(topPerformers.topDriver.miles)} mi &middot; {topPerformers.topDriver.loads} loads</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">No data</p>
              )}
            </div>
            <div className="border border-gray-300 rounded p-3">
              <p className="text-xs text-gray-500 uppercase mb-1">Top Truck</p>
              {topPerformers?.topTruck ? (
                <>
                  <p className="font-bold">#{topPerformers.topTruck.unitNumber}</p>
                  <p className="text-sm">{fmtCurrency(topPerformers.topTruck.revenue)} &middot; {fmtNumber(topPerformers.topTruck.miles)} mi &middot; {topPerformers.topTruck.loads} loads</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">No data</p>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center border-t border-gray-300 pt-3 text-xs text-gray-400">
          Generated via FleetFlow &middot; {generatedAt}
        </footer>
      </div>
    </div>
  );
}
