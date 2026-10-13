import { NavLink } from 'react-router-dom';
import { Boxes, CalendarClock, ClipboardCheck, History } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { to: '/shop', label: 'Board', icon: ClipboardCheck, end: true },
  { to: '/shop/parts', label: 'Parts room', icon: Boxes },
  { to: '/shop/planner', label: 'Service planner', icon: CalendarClock },
  { to: '/shop/history', label: 'Service history', icon: History },
];

/** Moves between the shop's screens. Scrolls sideways on a phone instead of wrapping. */
export function ShopNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Shop sections" className={cn('-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1 scrollbar-hide', className)}>
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
              isActive ? 'border-primary bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
            )
          }
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
