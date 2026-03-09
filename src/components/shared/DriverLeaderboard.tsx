import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal, Award, TrendingUp, Route } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DriverLeaderboardProps {
  readOnly?: boolean;
}

interface DriverRanking {
  driverId: string;
  firstName: string;
  lastName: string;
  totalMiles: number;
  totalRevenue: number;
}

const RANK_STYLES = [
  { bg: 'bg-yellow-400/15 border-yellow-400/50', text: 'text-yellow-600 dark:text-yellow-400', icon: Trophy, label: '1st' },
  { bg: 'bg-muted/60 border-muted-foreground/30', text: 'text-muted-foreground', icon: Medal, label: '2nd' },
  { bg: 'bg-amber-700/15 border-amber-700/40', text: 'text-amber-700 dark:text-amber-500', icon: Award, label: '3rd' },
];

function PodiumCard({ rank, name, value, label }: { rank: number; name: string; value: string; label: string }) {
  const style = RANK_STYLES[rank] ?? null;
  if (!style) return null;
  const Icon = style.icon;

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${style.bg}`}>
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.text} bg-background border`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{name}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <span className={`text-sm font-bold tabular-nums ${style.text}`}>{value}</span>
    </div>
  );
}

function RankRow({ rank, name, value }: { rank: number; name: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <span className="w-5 text-xs text-muted-foreground text-right">{rank + 1}</span>
      <span className="text-sm truncate flex-1">{name}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

export function DriverLeaderboard({ readOnly }: DriverLeaderboardProps) {
  const now = new Date();
  const monthStart = startOfMonth(now).toISOString();
  const monthEnd = endOfMonth(now).toISOString();
  const monthLabel = format(now, 'MMMM yyyy');

  const { data: rankings, isLoading } = useQuery({
    queryKey: ['driver-leaderboard', monthStart],
    queryFn: async () => {
      const [{ data: drivers }, { data: loads }] = await Promise.all([
        supabase.from('drivers_public_view').select('id, first_name, last_name').eq('status', 'active'),
        supabase.from('fleet_loads').select('driver_id, actual_miles, net_revenue').eq('status', 'delivered').gte('delivery_date', monthStart).lte('delivery_date', monthEnd),
      ]);

      if (!drivers?.length) return [];

      const map = new Map<string, DriverRanking>();
      for (const d of drivers) {
        map.set(d.id, { driverId: d.id, firstName: d.first_name, lastName: d.last_name, totalMiles: 0, totalRevenue: 0 });
      }

      for (const l of loads ?? []) {
        const entry = l.driver_id ? map.get(l.driver_id) : null;
        if (entry) {
          entry.totalMiles += Number(l.actual_miles ?? 0);
          entry.totalRevenue += Number(l.net_revenue ?? 0);
        }
      }

      return Array.from(map.values());
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  const all = rankings ?? [];
  if (all.length === 0) return null;

  const byMiles = [...all].sort((a, b) => b.totalMiles - a.totalMiles);
  const byRevenue = [...all].sort((a, b) => b.totalRevenue - a.totalRevenue);

  const renderList = (sorted: DriverRanking[], formatValue: (d: DriverRanking) => string, label: string) => {
    const top3 = sorted.slice(0, 3);
    const rest = sorted.slice(3).filter((d) => formatValue(d) !== '$0' && formatValue(d) !== '0');

    return (
      <div className="space-y-2">
        {top3.map((d, i) => (
          <PodiumCard
            key={d.driverId}
            rank={i}
            name={`${d.firstName} ${d.lastName}`}
            value={formatValue(d)}
            label={label}
          />
        ))}
        {rest.length > 0 && (
          <div className="border rounded-lg divide-y">
            {rest.map((d, i) => (
              <RankRow key={d.driverId} rank={i + 3} name={`${d.firstName} ${d.lastName}`} value={formatValue(d)} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Driver Leaderboard — {monthLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="miles" className="w-full">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="miles" className="flex-1 gap-1.5">
              <Route className="h-3.5 w-3.5" />
              Miles
            </TabsTrigger>
            <TabsTrigger value="revenue" className="flex-1 gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Revenue
            </TabsTrigger>
          </TabsList>
          <TabsContent value="miles">
            {renderList(byMiles, (d) => d.totalMiles.toLocaleString(), 'miles driven')}
          </TabsContent>
          <TabsContent value="revenue">
            {renderList(byRevenue, (d) => formatCurrency(d.totalRevenue), 'revenue generated')}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
