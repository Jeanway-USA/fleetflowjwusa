import { useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { STATE_DIESEL_TAX_RATES } from '@/lib/ifta-tax-rates';
import { STATE_NAMES } from '@/lib/state-coordinates';

interface IFTAPrintSummaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quarter: string;
  iftaRecords: Array<{
    jurisdiction: string;
    total_miles: number;
    taxable_miles: number;
    fuel_gallons: number;
    fuel_cost: number;
    tax_rate: number;
    tax_owed: number;
  }>;
  fuelPurchases: Array<{
    jurisdiction: string;
    gallons: number;
    total_cost: number;
  }>;
  fleetMpg: number;
}

export function IFTAPrintSummary({
  open,
  onOpenChange,
  quarter,
  iftaRecords,
  fuelPurchases,
  fleetMpg,
}: IFTAPrintSummaryProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const jurisdictionData = useMemo(() => {
    const stateMap: Record<string, {
      state: string;
      totalMiles: number;
      taxableMiles: number;
      gallonsPurchased: number;
      gallonsConsumed: number;
      taxRate: number;
      taxOwed: number;
      taxCredit: number;
      netTax: number;
    }> = {};

    for (const record of iftaRecords) {
      const s = record.jurisdiction;
      if (!stateMap[s]) {
        stateMap[s] = {
          state: s,
          totalMiles: 0,
          taxableMiles: 0,
          gallonsPurchased: 0,
          gallonsConsumed: 0,
          taxRate: STATE_DIESEL_TAX_RATES[s] || 0,
          taxOwed: 0,
          taxCredit: 0,
          netTax: 0,
        };
      }
      stateMap[s].totalMiles += record.total_miles;
      stateMap[s].taxableMiles += record.taxable_miles;
    }

    for (const fp of fuelPurchases) {
      const s = fp.jurisdiction;
      if (!stateMap[s]) {
        stateMap[s] = {
          state: s,
          totalMiles: 0,
          taxableMiles: 0,
          gallonsPurchased: 0,
          gallonsConsumed: 0,
          taxRate: STATE_DIESEL_TAX_RATES[s] || 0,
          taxOwed: 0,
          taxCredit: 0,
          netTax: 0,
        };
      }
      stateMap[s].gallonsPurchased += fp.gallons;
    }

    const mpg = fleetMpg > 0 ? fleetMpg : 6.0;
    for (const data of Object.values(stateMap)) {
      data.gallonsConsumed = data.totalMiles / mpg;
      data.taxOwed = data.gallonsConsumed * data.taxRate;
      data.taxCredit = data.gallonsPurchased * data.taxRate;
      data.netTax = data.taxOwed - data.taxCredit;
    }

    return Object.values(stateMap).sort((a, b) => a.state.localeCompare(b.state));
  }, [iftaRecords, fuelPurchases, fleetMpg]);

  const totals = useMemo(() => {
    return jurisdictionData.reduce(
      (acc, d) => ({
        totalMiles: acc.totalMiles + d.totalMiles,
        taxableMiles: acc.taxableMiles + d.taxableMiles,
        gallonsPurchased: acc.gallonsPurchased + d.gallonsPurchased,
        gallonsConsumed: acc.gallonsConsumed + d.gallonsConsumed,
        taxOwed: acc.taxOwed + d.taxOwed,
        taxCredit: acc.taxCredit + d.taxCredit,
        netTax: acc.netTax + d.netTax,
      }),
      { totalMiles: 0, taxableMiles: 0, gallonsPurchased: 0, gallonsConsumed: 0, taxOwed: 0, taxCredit: 0, netTax: 0 }
    );
  }, [jurisdictionData]);

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>IFTA Quarterly Return - ${quarter}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; font-size: 11px; padding: 20px; color: #000; }
          h1 { font-size: 16px; text-align: center; margin-bottom: 4px; }
          h2 { font-size: 13px; text-align: center; margin-bottom: 16px; font-weight: normal; }
          .header-info { display: flex; justify-content: space-between; margin-bottom: 16px; border: 1px solid #000; padding: 8px; }
          .header-info div { flex: 1; }
          .header-info label { font-weight: bold; display: block; font-size: 9px; text-transform: uppercase; margin-bottom: 2px; }
          .header-info .value { font-size: 12px; min-height: 18px; border-bottom: 1px solid #999; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #000; padding: 3px 5px; text-align: right; font-size: 10px; }
          th { background: #e5e5e5; font-weight: bold; text-align: center; font-size: 9px; text-transform: uppercase; }
          td:first-child, th:first-child { text-align: left; }
          .totals td { font-weight: bold; background: #f0f0f0; }
          .footer { margin-top: 30px; display: flex; justify-content: space-between; }
          .footer .sig-line { border-top: 1px solid #000; width: 45%; padding-top: 4px; font-size: 9px; }
          .mpg-note { margin-top: 12px; font-size: 9px; color: #666; }
          .col-a { width: 10%; }
          .col-b { width: 11%; }
          @media print { body { padding: 10px; } }
        </style>
      </head>
      <body>
        ${content.innerHTML}
        <script>window.print(); window.close();<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const [year, q] = quarter.split('-');
  const quarterNum = q.replace('Q', '');
  const today = new Date().toLocaleDateString('en-US');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>IFTA Quarterly Filing Summary</DialogTitle>
        </DialogHeader>

        <div ref={printRef}>
          <h1>IFTA QUARTERLY FUEL TAX RETURN</h1>
          <h2>Reporting Period: Q{quarterNum} {year}</h2>

          <div className="header-info" style={{ display: 'flex', gap: '16px', border: '1px solid hsl(var(--border))', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: 'hsl(var(--muted-foreground))' }}>Carrier Name</label>
              <div style={{ borderBottom: '1px solid hsl(var(--border))', minHeight: '20px', fontSize: '13px' }}>&nbsp;</div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: 'hsl(var(--muted-foreground))' }}>IFTA License #</label>
              <div style={{ borderBottom: '1px solid hsl(var(--border))', minHeight: '20px', fontSize: '13px' }}>&nbsp;</div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: 'hsl(var(--muted-foreground))' }}>Fleet MPG</label>
              <div style={{ borderBottom: '1px solid hsl(var(--border))', minHeight: '20px', fontSize: '13px' }}>{fleetMpg.toFixed(2)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', fontWeight: 'bold', display: 'block', marginBottom: '2px', color: 'hsl(var(--muted-foreground))' }}>Date Generated</label>
              <div style={{ borderBottom: '1px solid hsl(var(--border))', minHeight: '20px', fontSize: '13px' }}>{today}</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'left', fontSize: '10px', fontWeight: 'bold' }}>
                  (A)<br/>Jurisdiction
                </th>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  (B)<br/>Total Miles
                </th>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  (C)<br/>Taxable Miles
                </th>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  (D)<br/>Tax Rate
                </th>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  (E)<br/>Gal Consumed
                </th>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  (F)<br/>Gal Purchased
                </th>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  (G)<br/>Tax Owed
                </th>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  (H)<br/>Tax Credit
                </th>
                <th style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', background: 'hsl(var(--muted))', textAlign: 'right', fontSize: '10px', fontWeight: 'bold' }}>
                  (I)<br/>Net Tax
                </th>
              </tr>
            </thead>
            <tbody>
              {jurisdictionData.map(d => (
                <tr key={d.state}>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', fontWeight: 500 }}>
                    {STATE_NAMES[d.state] || d.state} ({d.state})
                  </td>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', textAlign: 'right' }}>
                    {d.totalMiles.toLocaleString()}
                  </td>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', textAlign: 'right' }}>
                    {d.taxableMiles.toLocaleString()}
                  </td>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', textAlign: 'right' }}>
                    ${d.taxRate.toFixed(4)}
                  </td>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', textAlign: 'right' }}>
                    {d.gallonsConsumed.toFixed(2)}
                  </td>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', textAlign: 'right' }}>
                    {d.gallonsPurchased.toFixed(2)}
                  </td>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', textAlign: 'right' }}>
                    {fmt(d.taxOwed)}
                  </td>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', textAlign: 'right' }}>
                    {fmt(d.taxCredit)}
                  </td>
                  <td style={{ border: '1px solid hsl(var(--border))', padding: '4px 8px', textAlign: 'right', fontWeight: 'bold', color: d.netTax >= 0 ? '#dc2626' : '#16a34a' }}>
                    {d.netTax >= 0 ? '' : '-'}{fmt(Math.abs(d.netTax))}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', fontWeight: 'bold', background: 'hsl(var(--muted))' }}>
                  TOTALS
                </td>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: 'hsl(var(--muted))' }}>
                  {totals.totalMiles.toLocaleString()}
                </td>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: 'hsl(var(--muted))' }}>
                  {totals.taxableMiles.toLocaleString()}
                </td>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: 'hsl(var(--muted))' }}>
                  —
                </td>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: 'hsl(var(--muted))' }}>
                  {totals.gallonsConsumed.toFixed(2)}
                </td>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: 'hsl(var(--muted))' }}>
                  {totals.gallonsPurchased.toFixed(2)}
                </td>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: 'hsl(var(--muted))' }}>
                  {fmt(totals.taxOwed)}
                </td>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: 'hsl(var(--muted))' }}>
                  {fmt(totals.taxCredit)}
                </td>
                <td style={{ border: '1px solid hsl(var(--border))', padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', background: 'hsl(var(--muted))', color: totals.netTax >= 0 ? '#dc2626' : '#16a34a' }}>
                  {totals.netTax >= 0 ? '' : '-'}{fmt(Math.abs(totals.netTax))}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '12px', fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
            Fleet MPG: {fleetMpg.toFixed(2)} · Generated: {today}
          </div>

          <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ borderTop: '1px solid hsl(var(--border))', width: '45%', paddingTop: '6px', fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
              Authorized Signature
            </div>
            <div style={{ borderTop: '1px solid hsl(var(--border))', width: '25%', paddingTop: '6px', fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
              Date
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
