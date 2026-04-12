import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOperationalCPM } from '@/hooks/useOperationalCPM';
import { calculateRevenue, type RevenueSettings, type RevenueInput } from '@/lib/revenue-calculator';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calculator, TrendingUp, TrendingDown, Target, Truck, MapPin, DollarSign, Gauge } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const DEFAULT_TARGET_MARGIN = 15;
const DEFAULT_TRUCK_PCT = 0.65;
const DEFAULT_TRAILER_PCT = 0.07;
const DEFAULT_ADVANCE_PCT = 0.30;

export default function LoadOptimizer() {
  const { orgId } = useAuth();
  const { costPerMile, isLoading: cpmLoading } = useOperationalCPM();
  const { isIndependent } = useOrganizationMode();

  const [grossPay, setGrossPay] = useState('');
  const [fuelSurcharge, setFuelSurcharge] = useState('');
  const [loadedMiles, setLoadedMiles] = useState('');
  const [deadheadMiles, setDeadheadMiles] = useState('');
  const [isPowerOnly, setIsPowerOnly] = useState(false);

  // Pull revenue settings from company_settings
  const { data: settings } = useQuery({
    queryKey: ['load-optimizer-settings', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['target_profit_margin', 'truck_percentage', 'trailer_percentage', 'advance_percentage', 'owns_trailer']);
      const map: Record<string, string> = {};
      data?.forEach(r => { map[r.setting_key] = r.setting_value; });
      return {
        targetMargin: parseFloat(map['target_profit_margin']) || DEFAULT_TARGET_MARGIN,
        truckPct: ((v) => v > 1 ? v / 100 : v)(parseFloat(map['truck_percentage'])) || DEFAULT_TRUCK_PCT,
        trailerPct: ((v) => v > 1 ? v / 100 : v)(parseFloat(map['trailer_percentage'])) || DEFAULT_TRAILER_PCT,
        advancePct: ((v) => v > 1 ? v / 100 : v)(parseFloat(map['advance_percentage'])) || DEFAULT_ADVANCE_PCT,
        ownsTrailer: map['owns_trailer'] === 'true',
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  const targetMargin = settings?.targetMargin ?? DEFAULT_TARGET_MARGIN;

  const analysis = useMemo(() => {
    const rate = parseFloat(grossPay) || 0;
    const fsc = parseFloat(fuelSurcharge) || 0;
    const miles = parseFloat(loadedMiles) || 0;
    const dh = parseFloat(deadheadMiles) || 0;

    if (rate <= 0 || miles <= 0) return null;

    const revSettings: RevenueSettings = isIndependent
      ? { truckPct: 1.0, trailerPct: 0, advancePct: 0, ownsTrailer: false }
      : {
          truckPct: settings?.truckPct ?? DEFAULT_TRUCK_PCT,
          trailerPct: settings?.trailerPct ?? DEFAULT_TRAILER_PCT,
          advancePct: settings?.advancePct ?? DEFAULT_ADVANCE_PCT,
          ownsTrailer: settings?.ownsTrailer ?? false,
        };

    const revInput: RevenueInput = {
      rate,
      fuel_surcharge: fsc,
      lumper: 0,
      advance_taken: 0,
      is_power_only: isIndependent ? false : isPowerOnly,
      accessorialsTotal: 0,
    };

    const rev = calculateRevenue(revInput, revSettings);

    const totalMiles = miles + dh;
    const overheadLoaded = costPerMile * miles;
    const overheadDeadhead = costPerMile * dh;
    const overheadTotal = costPerMile * totalMiles;

    const trueNetWithoutDH = rev.net_revenue - overheadLoaded;
    const trueNet = rev.net_revenue - overheadTotal;

    const marginWithoutDH = rev.net_revenue > 0 ? (trueNetWithoutDH / rev.net_revenue) * 100 : 0;
    const margin = rev.net_revenue > 0 ? (trueNet / rev.net_revenue) * 100 : 0;

    const rpmLoaded = miles > 0 ? rev.net_revenue / miles : 0;
    const rpmTotal = totalMiles > 0 ? rev.net_revenue / totalMiles : 0;

    const isGo = margin >= targetMargin;

    const deadheadImpact = trueNetWithoutDH - trueNet;

    return {
      grossRevenue: rev.gross_revenue,
      truckRevenue: rev.truck_revenue,
      trailerRevenue: rev.trailer_revenue,
      netRevenue: rev.net_revenue,
      overheadLoaded,
      overheadDeadhead,
      overheadTotal,
      trueNetWithoutDH,
      trueNet,
      marginWithoutDH,
      margin,
      rpmLoaded,
      rpmTotal,
      isGo,
      deadheadImpact,
      totalMiles,
    };
  }, [grossPay, fuelSurcharge, loadedMiles, deadheadMiles, isPowerOnly, costPerMile, settings, targetMargin, isIndependent]);

  const fmt = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Load Optimizer"
        description="Evaluate a potential load before booking — powered by your real operational costs."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Truck className="h-5 w-5 text-primary" />
              Load Details
            </CardTitle>
            <CardDescription>Enter the potential load information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="grossPay">Gross Pay (Linehaul Rate)</Label>
                <div className="relative">
                  <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="grossPay"
                    type="number"
                    placeholder="2,500"
                    value={grossPay}
                    onChange={e => setGrossPay(e.target.value)}
                    className="pl-10 sm:pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fsc">Fuel Surcharge (optional)</Label>
                <div className="relative">
                  <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fsc"
                    type="number"
                    placeholder="0"
                    value={fuelSurcharge}
                    onChange={e => setFuelSurcharge(e.target.value)}
                    className="pl-10 sm:pl-10"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="loadedMiles">Loaded Miles</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="loadedMiles"
                    type="number"
                    placeholder="850"
                    value={loadedMiles}
                    onChange={e => setLoadedMiles(e.target.value)}
                    className="pl-10 sm:pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deadheadMiles">Deadhead Miles (to pickup)</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="deadheadMiles"
                    type="number"
                    placeholder="120"
                    value={deadheadMiles}
                    onChange={e => setDeadheadMiles(e.target.value)}
                    className="pl-10 sm:pl-10"
                  />
                </div>
              </div>
            </div>

            {!isIndependent && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <Switch id="powerOnly" checked={isPowerOnly} onCheckedChange={setIsPowerOnly} />
                <Label htmlFor="powerOnly" className="cursor-pointer">Power Only (70% flat rate)</Label>
              </div>
            )}

            <Separator />

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>CPM: <strong className="text-foreground">{fmt(costPerMile)}</strong></span>
              <span>Target Margin: <strong className="text-foreground">{fmtPct(targetMargin)}</strong></span>
              {!isIndependent && (
                <span>Truck %: <strong className="text-foreground">{((settings?.truckPct ?? DEFAULT_TRUCK_PCT) * 100).toFixed(0)}%</strong></span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Go/No-Go Card */}
        <Card className={analysis ? (analysis.isGo ? 'border-success/50 bg-success/5' : 'border-destructive/50 bg-destructive/5') : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!analysis ? (
              <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
                Enter load details to see the analysis
              </div>
            ) : (
              <div className="space-y-6">
                {/* Big Go/No-Go Badge */}
                <div className="flex flex-col items-center gap-3">
                  <Badge
                    className={`px-8 py-3 text-2xl font-bold tracking-wider ${
                      analysis.isGo
                        ? 'bg-success text-success-foreground hover:bg-success/90'
                        : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    }`}
                  >
                    {analysis.isGo ? '✓ GO' : '✗ NO-GO'}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {analysis.isGo
                      ? `Exceeds your ${fmtPct(targetMargin)} target margin`
                      : `Below your ${fmtPct(targetMargin)} target margin`}
                  </p>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="True Net Profit" value={fmt(analysis.trueNet)} positive={analysis.trueNet > 0} icon={analysis.trueNet > 0 ? TrendingUp : TrendingDown} />
                  <MetricTile label="Profit Margin" value={fmtPct(analysis.margin)} positive={analysis.margin >= targetMargin} icon={Gauge} />
                  <MetricTile label="RPM (Loaded)" value={fmt(analysis.rpmLoaded)} positive={true} icon={DollarSign} />
                  <MetricTile label="RPM (Total)" value={fmt(analysis.rpmTotal)} positive={analysis.rpmTotal > costPerMile} icon={DollarSign} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Section */}
      {analysis && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <BreakdownRow label="Gross Revenue" value={fmt(analysis.grossRevenue)} />
                <Separator />
                <BreakdownRow label="Truck Revenue" value={fmt(analysis.truckRevenue)} sub />
                <BreakdownRow label="Trailer Revenue" value={fmt(analysis.trailerRevenue)} sub />
                <Separator />
                <BreakdownRow label="Net Revenue (Your Split)" value={fmt(analysis.netRevenue)} bold />
              </div>
            </CardContent>
          </Card>

          {/* Cost & Deadhead Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cost & Deadhead Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <BreakdownRow label={`Loaded Overhead (${parseFloat(loadedMiles) || 0} mi × ${fmt(costPerMile)})`} value={`-${fmt(analysis.overheadLoaded)}`} negative />
                <BreakdownRow label={`Deadhead Cost (${parseFloat(deadheadMiles) || 0} mi × ${fmt(costPerMile)})`} value={`-${fmt(analysis.overheadDeadhead)}`} negative />
                <Separator />
                <BreakdownRow label="Total Overhead" value={`-${fmt(analysis.overheadTotal)}`} negative bold />
                <Separator />
                <BreakdownRow label="Profit Without Deadhead" value={fmt(analysis.trueNetWithoutDH)} />
                <BreakdownRow label="Deadhead Impact" value={`-${fmt(analysis.deadheadImpact)}`} negative />
                <Separator />
                <BreakdownRow label="True Net Profit" value={fmt(analysis.trueNet)} bold positive={analysis.trueNet > 0} />
                <BreakdownRow label="Margin" value={fmtPct(analysis.margin)} bold positive={analysis.margin >= targetMargin} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function MetricTile({ label, value, positive, icon: Icon }: { label: string; value: string; positive: boolean; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center overflow-hidden min-w-0">
      <div className="mb-1 flex items-center justify-center gap-1">
        <Icon className={`h-4 w-4 flex-shrink-0 ${positive ? 'text-success' : 'text-destructive'}`} />
      </div>
      <p className={`text-lg sm:text-xl font-bold truncate ${positive ? 'text-success' : 'text-destructive'}`}>{value}</p>
      <p className="text-xs text-muted-foreground truncate">{label}</p>
    </div>
  );
}

function BreakdownRow({ label, value, bold, sub, negative, positive }: {
  label: string; value: string; bold?: boolean; sub?: boolean; negative?: boolean; positive?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 ${sub ? 'pl-4 text-sm' : ''}`}>
      <span className={`min-w-0 truncate ${bold ? 'font-semibold' : ''} ${sub ? 'text-muted-foreground' : ''}`}>{label}</span>
      <span className={`font-mono flex-shrink-0 ${bold ? 'font-bold text-base' : 'text-sm'} ${negative ? 'text-destructive' : ''} ${positive ? 'text-success' : ''}`}>
        {value}
      </span>
    </div>
  );
}
