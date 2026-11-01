import { format, parseISO } from 'date-fns';
import { Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/finance/statement-ui';
import { LANDSTAR_RECRUITING_PHONE, LANDSTAR_VALID_AS_OF, REQUIREMENT_SECTIONS } from '@/lib/safety/requirements';
import { cn } from '@/lib/utils';

/** What Landstar and DOT require, in plain words, with who handles each one and where it comes from. */
export function RequirementsReference() {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">Landstar's standards are valid as of {format(parseISO(LANDSTAR_VALID_AS_OF), 'MMMM d, yyyy')}.</p>
        <p className="mt-1 text-muted-foreground">Landstar can change them and decides who qualifies case by case. Confirm anything important with Landstar recruiting before acting on it.</p>
        <p className="mt-2 flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" />{LANDSTAR_RECRUITING_PHONE}</p>
      </div>
      {REQUIREMENT_SECTIONS.map((s) => (
        <Panel key={s.id} title={s.title} description={s.note}>
          <ul className="divide-y border-t">
            {s.items.map((r) => (
              <li key={r.title} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{r.title}</p>
                  <Badge variant="outline" className={cn('rounded-sm text-xs font-normal', r.handledBy === 'Landstar' ? 'text-muted-foreground' : r.handledBy === 'JeanWay' ? 'text-primary' : '')}>{r.handledBy === 'Both' ? 'Landstar and JeanWay' : `${r.handledBy} handles it`}</Badge>
                  {!r.verified && <Badge variant="outline" className="rounded-sm border-warning/40 text-xs font-normal text-warning">Check the regulation</Badge>}
                </div>
                <p className="text-sm">{r.standard}</p>
                <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground/80">Our part:</span> {r.ourPart}</p>
                <p className="text-xs text-muted-foreground">{r.source}</p>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
