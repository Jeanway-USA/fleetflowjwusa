import { useMemo } from 'react';
import { CalendarRange, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettlementWeekSetting } from '@/hooks/useSettlementWeekSetting';
import { weekFrame } from '@/lib/week-import';

/**
 * First thing on the Settlement tab: the Landstar week the office should be proving, and the button that starts it.
 * Statements arrive after a week ends, so it names the last finished settlement week (the picker in the window can
 * go further back).
 */
export function ThisWeekStatements({ onOpen }: { onOpen: () => void }) {
  const { startsOn, startName, endName } = useSettlementWeekSetting();
  const frame = useMemo(() => weekFrame(new Date(), -1, startsOn), [startsOn]);

  return (
    <section aria-labelledby="week-statements-title" className="mb-5 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CalendarRange className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 id="week-statements-title" className="font-condensed text-xl font-bold leading-tight">This week&apos;s Landstar statements</h2>
            <p className="text-[15px]">{frame.label}</p>
            <p className="text-[13px] text-muted-foreground">
              Settlement week {startName} to {endName}. Add the Contractor Statement, Card Activity, Settlement Details and Freight Bill Details, then prove the week.
            </p>
          </div>
        </div>
        <Button onClick={onOpen} className="h-12 w-full shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 sm:h-10 sm:w-auto">
          <FileCheck2 className="mr-2 h-4 w-4" />
          Prove this week
        </Button>
      </div>
    </section>
  );
}
