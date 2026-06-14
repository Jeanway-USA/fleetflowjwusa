import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Trophy, Sparkles, ShieldAlert, ShieldCheck, Crown } from 'lucide-react';
import confetti from 'canvas-confetti';
import { differenceInCalendarDays, endOfMonth } from 'date-fns';
import { useSafetyBonus } from '@/hooks/useSafetyBonus';

interface MonthlyBonusWidgetProps {
  driverId: string;
}

const currency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const rate = (n: number) =>
  `$${(n || 0).toFixed(2)}/mile`;
const formatMiles = (m: number) =>
  new Intl.NumberFormat('en-US').format(Math.round(m || 0));

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
    periodEnd: _periodEnd,
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
  // June 1 -> 30d, June 30 -> 1d, last day -> 1d, never negative.
  const daysToReset = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthEnd = endOfMonth(today);
    return Math.max(differenceInCalendarDays(monthEnd, today) + 1, 0);
  })();

  // ---------- Loading ----------
  if (isLoading) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Safety &amp; Performance Bonus
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  // ---------- No program configured ----------
  if (!hasSettings) {
    return (
      <Card className="border-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
            <Trophy className="h-5 w-5" />
            Safety &amp; Performance Bonus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Bonus program isn’t set up yet. Check back once your fleet enables it.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---------- Disqualified ----------
  if (!isEligible) {
    const reasons: string[] = [];
    if (disqualifiers.accidents) reasons.push('a reported accident');
    if (disqualifiers.csaPoints) reasons.push('a CSA citation');
    if (disqualifiers.serviceFailures) reasons.push('a service failure');
    const reasonText =
      reasons.length === 0
        ? 'a disqualifying event'
        : reasons.length === 1
        ? reasons[0]
        : reasons.slice(0, -1).join(', ') + ' and ' + reasons.slice(-1);

    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" />
            Bonus paused this period
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-foreground">
            You aren’t eligible for the Safety &amp; Performance bonus this period because of{' '}
            <span className="font-medium">{reasonText}</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            Hang in there —{' '}
            <span className="font-medium text-foreground">
              {daysToReset === 0
                ? 'a fresh period starts tomorrow'
                : `your next period resets in ${daysToReset} day${daysToReset === 1 ? '' : 's'}`}
            </span>
            . A clean record from then earns the full {currency(maxBonus)} bonus.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ---------- Eligible ----------
  const atTopTier = nextTier == null;
  const tierFloor = currentTier?.minMiles ?? 0;
  const tierCeiling = nextTier?.minMiles ?? currentTier?.maxMiles ?? null;
  const milesIntoTier = Math.max(0, currentSafeMiles - tierFloor);
  const tierSpan = tierCeiling != null ? Math.max(1, tierCeiling - tierFloor) : 0;
  const progressPct = atTopTier ? 100 : Math.min((milesIntoTier / tierSpan) * 100, 100);

  const currentTierLabel = currentTier ? `Tier ${currentTier.index + 1}` : 'Starter';

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {capHit ? (
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-primary" />
          )}
          Safety &amp; Performance Bonus
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-4xl font-bold tracking-tight text-primary">
            {currency(currentEarnedBonus)}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {formatMiles(currentSafeMiles)} safe miles this period
          </p>
        </div>

        {/* Tier badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="default" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {currentTierLabel}
            {tierCount > 0 && currentTier ? ` of ${tierCount}` : ''} · {rate(currentRate)}
          </Badge>
          {atTopTier ? (
            <Badge variant="secondary" className="gap-1.5">
              <Crown className="h-3.5 w-3.5" />
              Top tier reached
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5">
              Next: Tier {(nextTier?.index ?? 0) + 1} · {rate(nextTier?.ratePerMile ?? 0)}
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <Progress value={progressPct} className="h-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {atTopTier
                ? 'Max rate active'
                : `${formatMiles(milesIntoTier)} / ${formatMiles(tierSpan)} mi into ${currentTierLabel} · ${formatMiles(nextTierMiles ?? 0)} mi to next rate jump`}
            </span>
            {daysToReset != null && (
              <span className="whitespace-nowrap pl-2">
                {daysToReset === 0 ? 'Resets tomorrow' : `${daysToReset}d left`}
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Current rate:{' '}
          <span className="font-medium text-foreground">{rate(currentRate)}</span>
          {' · '}Max bonus:{' '}
          <span className="font-medium text-foreground">{currency(maxBonus)}</span>
        </p>
      </CardContent>
    </Card>
  );
}
