import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Expand, Minimize2, NotebookPen, Plus, Tablet, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useShopBoard } from '@/hooks/useShop';
import { useFleetAvailability } from '@/hooks/useMaintenanceData';
import { summarize } from '@/lib/shop/board';
import { cn } from '@/lib/utils';
import { NewJobSheet } from '@/components/shop/NewJobSheet';
import { LogWorkSheet } from '@/components/shop/LogWorkSheet';
import { LaneBoard } from '@/components/shop/board/LaneBoard';
import { PulseStrip } from '@/components/shop/board/PulseStrip';
import { HeadsUpRail } from '@/components/shop/board/HeadsUpRail';
import { ShopNav } from '@/components/shop/ShopNav';
import { UpgradeNotice } from '@/components/shop/UpgradeNotice';
import { useNow } from '@/components/shop/shared';

/**
 * The shop's main screen: every truck in the shop, where it is in the work, and what needs a decision.
 * "Wall mode" fills the screen with larger type for a TV in the shop.
 */
export default function ShopBoardPage() {
  const { data, isLoading, error } = useShopBoard();
  const fleet = useFleetAvailability();
  const [params, setParams] = useSearchParams();
  const [newOpen, setNewOpen] = useState(params.get('new') === '1');
  const [wall, setWall] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const now = useNow(30_000);

  const jobs = data?.jobs ?? [];
  const summary = useMemo(() => summarize(jobs), [jobs]);

  useEffect(() => {
    if (params.get('new') === '1') setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onChange = () => setWall(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleWall = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.();
  };

  return (
    <div ref={root} className={cn('min-h-full bg-background', wall && 'overflow-y-auto p-6')}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Wrench className="h-4 w-4 text-primary" />
            {format(now, 'EEEE, MMMM d')} <span className="tabular-nums">· {format(now, 'h:mm a')}</span>
          </p>
          <h1 className={cn('font-condensed font-bold leading-tight', wall ? 'text-6xl' : 'text-[32px]')}>Shop</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11 gap-2" onClick={toggleWall}>
            {wall ? <Minimize2 className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
            {wall ? 'Exit wall mode' : 'Wall mode'}
          </Button>
          <Button asChild variant="outline" className="h-11 gap-2">
            <Link to="/shop/floor"><Tablet className="h-4 w-4" />Open the floor app</Link>
          </Button>
          <Button variant="outline" className="h-11 gap-2" onClick={() => setLogOpen(true)}>
            <NotebookPen className="h-4 w-4" />Log work done
          </Button>
          <Button className="h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />New job
          </Button>
        </div>
      </header>

      {!wall && <ShopNav />}
      {data && !data.upgraded && <UpgradeNotice />}

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">The shop board could not load: {(error as Error).message}</div>
      ) : isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-lg" />)}</div>
        </div>
      ) : (
        <div className="space-y-4">
          <PulseStrip summary={summary} fleetSize={fleet.data?.total ?? null} doneToday={data?.doneToday ?? 0} wall={wall} />
          <div className={cn('grid gap-4', wall ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
            <LaneBoard jobs={jobs} jobPath={(id) => `/shop/jobs/${id}`} wall={wall} />
            {!wall && <HeadsUpRail jobs={jobs} partsPath="/shop/parts" />}
          </div>
        </div>
      )}

      <NewJobSheet open={newOpen} onOpenChange={setNewOpen} />
      <LogWorkSheet open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}
