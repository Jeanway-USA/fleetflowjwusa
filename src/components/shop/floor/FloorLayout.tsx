import { NavLink, Outlet, Link } from 'react-router-dom';
import { Boxes, ClipboardList, LogOut, Truck, Wrench, ArrowUpRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMyName, useShopBoard } from '@/hooks/useShop';
import { Initials, RunningClock, useNow } from '@/components/shop/shared';

const TABS = [
  { to: '/shop/floor', label: 'Jobs', icon: ClipboardList, end: true },
  { to: '/shop/floor/parts', label: 'Parts', icon: Boxes },
  { to: '/shop/floor/trucks', label: 'Trucks', icon: Truck },
];

/**
 * The mechanic's tablet. Its own screen (no office menu), big tap targets, readable across a bay. The rail runs down
 * the side in landscape and along the bottom in portrait.
 */
export function FloorLayout() {
  const { signOut, isOwner, user } = useAuth();
  const me = useMyName();
  const now = useNow(15_000);
  const { data } = useShopBoard();
  const mine = data?.jobs.find((j) => j.runningTimer && j.runningTimer.userName === me) ?? null;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground md:flex-row">
      <nav aria-label="Shop floor" className="order-2 flex shrink-0 border-t bg-card md:order-1 md:w-28 md:flex-col md:border-r md:border-t-0">
        <div className="hidden items-center justify-center py-4 md:flex"><span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary"><Wrench className="h-6 w-6" /></span></div>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => cn('flex min-h-[72px] flex-1 flex-col items-center justify-center gap-1 text-sm font-semibold transition-colors md:flex-none md:py-5', isActive ? 'bg-primary/10 text-primary md:border-r-4 md:border-r-primary' : 'text-muted-foreground hover:bg-accent')}
          >
            <t.icon className="h-7 w-7" />
            {t.label}
          </NavLink>
        ))}
      </nav>

      <div className="order-1 flex min-h-0 flex-1 flex-col md:order-2">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-condensed text-2xl font-bold leading-none">Shop floor</p>
            <p className="text-xs text-muted-foreground">{format(now, 'EEEE, MMM d · h:mm a')}</p>
          </div>
          {mine && (
            <Link to={`/shop/floor/jobs/${mine.id}`} className="flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2 text-primary ring-1 ring-primary/40">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
              <span className="text-sm font-semibold">Unit {mine.unit}</span>
              <RunningClock since={mine.runningTimer!.startedAt} className="text-sm font-bold" />
            </Link>
          )}
          <div className="flex items-center gap-2">
            <Initials name={me} className="h-9 w-9 text-xs" />
            <span className="hidden text-sm font-medium sm:inline">{me}</span>
          </div>
          {isOwner && (
            <Link to="/shop" className="hidden min-h-[44px] items-center gap-1 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent sm:flex">
              Office <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
          <button type="button" onClick={() => void signOut()} className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent" aria-label={`Sign out ${user?.email ?? ''}`}>
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:inline">Switch</span>
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
