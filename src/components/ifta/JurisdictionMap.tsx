import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { STATE_COORDINATES, STATE_NAMES } from '@/lib/state-coordinates';
import { STATE_DIESEL_TAX_RATES } from '@/lib/ifta-tax-rates';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import 'leaflet/dist/leaflet.css';

interface JurisdictionData {
  state: string;
  totalMiles: number;
  gallonsPurchased: number;
  fuelCost: number;
  gallonsConsumed: number;
  taxRate: number;
  taxOwed: number;
  netTax: number;
}

interface JurisdictionMapProps {
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
  quarter: string;
}

export function JurisdictionMap({ iftaRecords, fuelPurchases, fleetMpg, quarter }: JurisdictionMapProps) {
  const jurisdictionData = useMemo(() => {
    const stateMap: Record<string, JurisdictionData> = {};

    // Aggregate IFTA records (miles)
    for (const record of iftaRecords) {
      const s = record.jurisdiction;
      if (!stateMap[s]) {
        stateMap[s] = {
          state: s,
          totalMiles: 0,
          gallonsPurchased: 0,
          fuelCost: 0,
          gallonsConsumed: 0,
          taxRate: STATE_DIESEL_TAX_RATES[s] || 0,
          taxOwed: 0,
          netTax: 0,
        };
      }
      stateMap[s].totalMiles += record.total_miles;
    }

    // Aggregate fuel purchases (gallons)
    for (const fp of fuelPurchases) {
      const s = fp.jurisdiction;
      if (!stateMap[s]) {
        stateMap[s] = {
          state: s,
          totalMiles: 0,
          gallonsPurchased: 0,
          fuelCost: 0,
          gallonsConsumed: 0,
          taxRate: STATE_DIESEL_TAX_RATES[s] || 0,
          taxOwed: 0,
          netTax: 0,
        };
      }
      stateMap[s].gallonsPurchased += fp.gallons;
      stateMap[s].fuelCost += fp.total_cost;
    }

    // Calculate consumed gallons and net tax
    const mpg = fleetMpg > 0 ? fleetMpg : 6.0;
    for (const data of Object.values(stateMap)) {
      data.gallonsConsumed = data.totalMiles / mpg;
      // Tax owed = (gallons consumed × rate) - (gallons purchased × rate)
      data.taxOwed = data.gallonsConsumed * data.taxRate;
      const taxCredit = data.gallonsPurchased * data.taxRate;
      data.netTax = data.taxOwed - taxCredit;
    }

    return Object.values(stateMap).sort((a, b) => a.state.localeCompare(b.state));
  }, [iftaRecords, fuelPurchases, fleetMpg]);

  const totals = useMemo(() => {
    return jurisdictionData.reduce(
      (acc, d) => ({
        totalMiles: acc.totalMiles + d.totalMiles,
        gallonsPurchased: acc.gallonsPurchased + d.gallonsPurchased,
        fuelCost: acc.fuelCost + d.fuelCost,
        gallonsConsumed: acc.gallonsConsumed + d.gallonsConsumed,
        taxOwed: acc.taxOwed + d.taxOwed,
        netTax: acc.netTax + d.netTax,
      }),
      { totalMiles: 0, gallonsPurchased: 0, fuelCost: 0, gallonsConsumed: 0, taxOwed: 0, netTax: 0 }
    );
  }, [jurisdictionData]);

  const maxAbsTax = useMemo(() => {
    return Math.max(...jurisdictionData.map(d => Math.abs(d.netTax)), 1);
  }, [jurisdictionData]);

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

  return (
    <div className="space-y-6">
      {/* Map */}
      <Card className="card-elevated overflow-hidden">
        <CardHeader>
          <CardTitle>Tax Liability by State</CardTitle>
          <CardDescription>
            Circle size shows amount; <span className="text-destructive font-medium">red = tax owed</span>, <span className="text-success font-medium">green = credit</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[420px] w-full">
            <MapContainer
              center={[39.5, -98.35]}
              zoom={4}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              {jurisdictionData.map((d) => {
                const coords = STATE_COORDINATES[d.state];
                if (!coords) return null;
                const absTax = Math.abs(d.netTax);
                const radius = Math.max(8, Math.min(30, (absTax / maxAbsTax) * 28 + 8));
                const isOwed = d.netTax >= 0;

                return (
                  <CircleMarker
                    key={d.state}
                    center={coords}
                    radius={radius}
                    pathOptions={{
                      fillColor: isOwed ? 'hsl(0, 72%, 51%)' : 'hsl(142, 71%, 45%)',
                      color: isOwed ? 'hsl(0, 72%, 40%)' : 'hsl(142, 71%, 35%)',
                      weight: 1.5,
                      fillOpacity: 0.65,
                    }}
                  >
                    <Popup>
                      <div className="text-sm min-w-[180px]">
                        <div className="font-bold text-base mb-2">{STATE_NAMES[d.state] || d.state}</div>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span>Miles driven:</span><span className="font-medium">{d.totalMiles.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span>Gal purchased:</span><span className="font-medium">{d.gallonsPurchased.toFixed(1)}</span></div>
                          <div className="flex justify-between"><span>Gal consumed:</span><span className="font-medium">{d.gallonsConsumed.toFixed(1)}</span></div>
                          <div className="flex justify-between"><span>Tax rate:</span><span className="font-medium">${d.taxRate.toFixed(4)}/gal</span></div>
                          <hr className="my-1" />
                          <div className="flex justify-between font-bold">
                            <span>{d.netTax >= 0 ? 'Tax owed:' : 'Credit:'}</span>
                            <span style={{ color: d.netTax >= 0 ? 'hsl(0, 72%, 51%)' : 'hsl(142, 71%, 45%)' }}>
                              {fmt(Math.abs(d.netTax))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Summary Table */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Jurisdiction Summary — {quarter}</CardTitle>
          <CardDescription>Combined mileage, fuel, and tax data per state</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Miles</TableHead>
                <TableHead className="text-right">Gal Purchased</TableHead>
                <TableHead className="text-right">Gal Consumed</TableHead>
                <TableHead className="text-right">Tax Rate</TableHead>
                <TableHead className="text-right">Tax Owed</TableHead>
                <TableHead className="text-right">Tax Credit</TableHead>
                <TableHead className="text-right">Net Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jurisdictionData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No jurisdiction data. Generate IFTA records from the Report tab first.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {jurisdictionData.map((d) => (
                    <TableRow key={d.state}>
                      <TableCell className="font-medium">
                        {STATE_NAMES[d.state] || d.state} ({d.state})
                      </TableCell>
                      <TableCell className="text-right">{d.totalMiles.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{d.gallonsPurchased.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{d.gallonsConsumed.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${d.taxRate.toFixed(4)}</TableCell>
                      <TableCell className="text-right">{fmt(d.taxOwed)}</TableCell>
                      <TableCell className="text-right">{fmt(d.gallonsPurchased * d.taxRate)}</TableCell>
                      <TableCell className={`text-right font-bold ${d.netTax >= 0 ? 'text-destructive' : 'text-success'}`}>
                        {d.netTax >= 0 ? '' : '-'}{fmt(Math.abs(d.netTax))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold border-t-2">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{totals.totalMiles.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{totals.gallonsPurchased.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{totals.gallonsConsumed.toFixed(2)}</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">{fmt(totals.taxOwed)}</TableCell>
                    <TableCell className="text-right">{fmt(totals.taxOwed - totals.netTax)}</TableCell>
                    <TableCell className={`text-right ${totals.netTax >= 0 ? 'text-destructive' : 'text-success'}`}>
                      {totals.netTax >= 0 ? '' : '-'}{fmt(Math.abs(totals.netTax))}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
