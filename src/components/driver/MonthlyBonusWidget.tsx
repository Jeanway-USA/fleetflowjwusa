import { useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import confetti from 'canvas-confetti';
import { differenceInCalendarDays, endOfMonth } from 'date-fns';
import { useSafetyBonus } from '@/hooks/useSafetyBonus';
import { Bar, Chip, Note, Panel, PanelHead, Stat, StatCell, StatRow } from '@/components/driver/ui/driver-ui';

interface MonthlyBonusWidgetProps {
  driverId: string;
}

const currency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const rate = (n: number) => `$${(n || 0).toFixed(2)}/mile`;
const formatMiles = (m: number) => new Intl.NumberFormat('en-US').format(Math.round(m || 0));

export function MonthlyBonusWidget({ driverId }: MonthlyBonusWidgetProps) {
  const hasFired = useRef(false);
  const {
    isLoading,
    hasSettings,
    isEligible,
    currentSafeMiles,
    currentEarnedBonus,
    currentRate,
    nextTierMiles,
    maxBonus,
    disqualifiers,
    currentTier,
    nextTier,
    tierCount,
  } = useSafetyBonus(driverId);

  const capHit = isEligible && maxBonus > 0 && currentEarnedBonus >= maxBonus;

  useEffect(() => {
    if (capHit && !hasFired.current && !isLoading) {
      hasFired.current = true;
      const fire = () => {
        confetti({ particleCount: 100, spread: 70, origin: { x: 0.1, y: 0.6 } });
        confetti({ particleCount: 100, spread: 70, origin: { x: 0.9, y: 0.6 } });
      };
      fire();
      setTimeout(fire, 250);
    }
  }, [capHit, isLoading]);

  // Days remaining in the current calendar month (inclusive of today).
  const daysToReset = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(differenceInCalendarDays(endOfMonth(today), today) + 1, 0);
  })();

  if (isLoading) {
    return (
      <Panel>
        <PanelHead title="Safety bonus" />
        <div className="space-y-3 px-4 pb-4">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-2 w-full" />
        </div>
      </Panel>
    );
  }

  if (!hasSettings) {
    return (
      <Panel>
        <PanelHead title="Safety bonus" />
        <Note>The bonus program is not set up yet. Check back once your fleet turns it on.</Note>
      </Panel>
    );
  }

  if (!isEligible) {
    const reasons: string[] = [];
    if (disqualifiers.accidents) reasons.push('a reported accident');
    if (disqualifiers.csaPoints) reasons.push('a CSA citation');
    if (disqualifiers.serviceFailures) reasons.push('a service failure');
    const reasonText =
      reasons.length === 0 ? 'a disqualifying event' : reasons.length === 1 ? reasons[0] : reasons.slice(0, -1).join(', ') + ' and ' + reasons.slice(-1);
    return (
      <Panel>
        <PanelHead title="Safety bonus" aside={<Chip tone="bad">Paused this period</Chip>} />
        <div className="space-y-2 px-4 pb-4 text-sm">
          <p>You are not eligible for the bonus this period because of <strong>{reasonText}</strong>.</p>
          <p className="text-muted-foreground">
            {daysToReset === 0 ? 'A fresh period starts tomorrow' : `Your next period starts in ${daysToReset} day${daysToReset === 1 ? '' : 's'}`}. A clean record from then earns the full {currency(maxBonus)} bonus.
          </p>
        </div>
      </Panel>
    );
  }

  const atTopTier = nextTier == null;
  const tierFloor = currentTier?.minMiles ?? 0;
  const tierCeiling = nextTier?.minMiles ?? currentTier?.maxMiles ?? null;
  const milesIntoTier = Math.max(0, currentSafeMiles - tierFloor);
  const tierSpan = tierCeiling != null ? Math.max(1, tierCeiling - tierFloor) : 0;
  const currentTierLabel = currentTier ? `Tier ${currentTier.index + 1}${tierCount > 0 ? ` of ${tierCount}` : ''}` : 'Starter';

  return (
    <Panel>
      <PanelHead title="Safety bonus" aside={capHit ? <Chip tone="good">Maximum reached</Chip> : daysToReset === 0 ? 'Resets tomorrow' : `${daysToReset} days left`} />
      <div className="px-4 pb-4">
        <p className="text-xs text-muted-foreground">Earned this period</p>
        <p className="mt-0.5 font-condensed text-4xl font-bold tabular-nums leading-tight">{currency(currentEarnedBonus)}</p>
        <Bar className="mt-3" value={atTopTier ? 1 : milesIntoTier} max={atTopTier ? 1 : tierSpan} label="Miles toward the next bonus rate" />
        <p className="mt-2 text-xs text-muted-foreground">
          {atTopTier ? 'Maximum rate active.' : `${formatMiles(nextTierMiles ?? 0)} miles to the next rate. Maximum bonus ${currency(maxBonus)}.`}
        </p>
      </div>
      <StatRow>
        <StatCell><Stat label="Safe miles">{formatMiles(currentSafeMiles)}</Stat></StatCell>
        <StatCell><Stat label={currentTierLabel}>{rate(currentRate)}</Stat></StatCell>
      </StatRow>
    </Panel>
  );
}
