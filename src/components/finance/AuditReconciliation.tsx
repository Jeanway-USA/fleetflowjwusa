import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { parseISO } from 'date-fns';
import { Search, AlertTriangle, CheckCircle2, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type FleetLoad = Database['public']['Tables']['fleet_loads']['Row'];

interface AuditReconciliationProps {
  loads: FleetLoad[];
}

export function AuditReconciliation({ loads }: AuditReconciliationProps) {
  const currentYear = new Date().getFullYear();
  const [auditEnabled, setAuditEnabled] = useState(false);
  const [landstarYTD, setLandstarYTD] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [tableOpen, setTableOpen] = useState(false);

  const yearNum = parseInt(selectedYear);

  // Filter loads to selected year by pickup_date
  const ytdLoads = useMemo(() => {
    return loads
      .filter(l => {
        if (!l.pickup_date) return false;
        if (l.status !== 'delivered') return false;
        const d = parseISO(l.pickup_date);
        return d.getFullYear() === yearNum;
      })
      .sort((a, b) => parseISO(a.pickup_date!).getTime() - parseISO(b.pickup_date!).getTime());
  }, [loads, yearNum]);

  // App YTD = sum of net_revenue
  const appYTD = useMemo(() => {
    return ytdLoads.reduce((sum, l) => sum + (l.net_revenue ?? 0), 0);
  }, [ytdLoads]);

  const landstarValue = parseFloat(landstarYTD) || 0;
  const variance = landstarValue - appYTD;
  const variancePct = landstarValue > 0 ? (variance / landstarValue) * 100 : 0;
  const isMatched = Math.abs(variance) < 0.01;

  // Revenue component breakdown
  const totalLinehaul = useMemo(() => ytdLoads.reduce((s, l) => s + (l.truck_revenue ?? 0), 0), [ytdLoads]);
  const totalFSC = useMemo(() => ytdLoads.reduce((s, l) => s + (l.fuel_surcharge ?? 0), 0), [ytdLoads]);
  const totalAccessorials = useMemo(() => ytdLoads.reduce((s, l) => s + (l.accessorials ?? 0), 0), [ytdLoads]);

  // Running cumulative table
  const tableRows = useMemo(() => {
    let cumulative = 0;
    return ytdLoads.map(l => {
      const loadSettlement = l.net_revenue ?? 0;
      cumulative += loadSettlement;
      return { load: l, loadSettlement, cumulative };
    });
  }, [ytdLoads]);

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <Card className="card-elevated mb-6 border-primary/20">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calculator className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">1099 Audit Mode</CardTitle>
              <CardDescription>Compare Landstar YTD 1099 earnings against app data</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="audit-toggle" className="text-sm">Enable</Label>
            <Switch id="audit-toggle" checked={auditEnabled} onCheckedChange={setAuditEnabled} />
          </div>
        </div>
      </CardHeader>

      {auditEnabled && (
        <CardContent className="space-y-6">
          {/* Input Section */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Landstar YTD 1099 Earnings ($)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="22873.37"
                value={landstarYTD}
                onChange={e => setLandstarYTD(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* YTD Comparison */}
          {landstarValue > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground mb-1">Landstar YTD 1099</p>
                <p className="text-2xl font-bold">{formatCurrency(landstarValue)}</p>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground mb-1">App YTD Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(appYTD)}</p>
                <p className="text-xs text-muted-foreground">{ytdLoads.length} loads</p>
              </div>
              <div className={`p-4 rounded-lg ${isMatched ? 'bg-success/10' : 'bg-destructive/10'}`}>
                <p className="text-xs text-muted-foreground mb-1">Variance</p>
                <div className="flex items-center gap-2">
                  {isMatched
                    ? <CheckCircle2 className="h-5 w-5 text-success" />
                    : <AlertTriangle className="h-5 w-5 text-destructive" />}
                  <p className={`text-2xl font-bold ${isMatched ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(Math.abs(variance))}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {variance > 0 ? 'Under-reported' : variance < 0 ? 'Over-reported' : 'Matched'} ({variancePct.toFixed(1)}%)
                </p>
              </div>
            </div>
          )}

          {/* Revenue Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border">
              <p className="text-xs text-muted-foreground">Booked Linehaul (65%)</p>
              <p className="text-lg font-semibold">{formatCurrency(totalLinehaul)}</p>
            </div>
            <div className="p-3 rounded-lg border">
              <p className="text-xs text-muted-foreground">Fuel Surcharge</p>
              <p className="text-lg font-semibold">{formatCurrency(totalFSC)}</p>
            </div>
            <div className="p-3 rounded-lg border">
              <p className="text-xs text-muted-foreground">Accessorials</p>
              <p className="text-lg font-semibold">{formatCurrency(totalAccessorials)}</p>
            </div>
            <div className="p-3 rounded-lg border">
              <p className="text-xs text-muted-foreground">Total Loads (YTD)</p>
              <p className="text-lg font-semibold">{ytdLoads.length}</p>
            </div>
          </div>

          {/* Reconciliation Formula */}
          <div className="p-4 rounded-lg bg-muted/50 border font-mono text-xs space-y-1">
            <p>Landstar 1099  = Sum of (Tractor L/H % + FSC + Accessorials)</p>
            <p>App Total      = Sum of fleet_loads.net_revenue = {formatCurrency(appYTD)}</p>
            {landstarValue > 0 && (
              <p className={`font-bold ${isMatched ? 'text-success' : 'text-destructive'}`}>
                Variance       = {formatCurrency(Math.abs(variance))} {variance > 0 ? '(under-reported)' : variance < 0 ? '(over-reported)' : '(matched)'}
              </p>
            )}
          </div>

          {/* Load-by-Load Table */}
          <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              {tableOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <Search className="h-4 w-4" />
              Load-by-Load Breakdown ({ytdLoads.length} loads)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="rounded-lg border overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="whitespace-nowrap">Load ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">FSC</TableHead>
                      <TableHead className="text-right">Accessorials</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right font-bold">Net Revenue</TableHead>
                      <TableHead className="text-right font-bold">Cumulative</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableRows.map(({ load, loadSettlement, cumulative }) => {
                      const isMissing = !load.net_revenue;
                      return (
                        <TableRow key={load.id} className={isMissing ? 'bg-warning/10' : ''}>
                          <TableCell className="whitespace-nowrap">{formatDate(load.pickup_date)}</TableCell>
                          <TableCell className="font-mono text-xs">{load.landstar_load_id || '-'}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{load.origin} → {load.destination}</TableCell>
                          <TableCell className="text-right">{formatCurrency(load.rate)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(load.fuel_surcharge)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(load.accessorials)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(load.gross_revenue)}</TableCell>
                          <TableCell className="text-right font-bold">
                            {isMissing
                              ? <Badge variant="outline" className="text-warning border-warning/30">Missing</Badge>
                              : formatCurrency(loadSettlement)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(cumulative)}</TableCell>
                          <TableCell><StatusBadge status={load.status} /></TableCell>
                        </TableRow>
                      );
                    })}
                    {tableRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No loads found for {selectedYear}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      )}
    </Card>
  );
}
