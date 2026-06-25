/**
 * Drop-in display for an appointment time. Reads the viewer's current
 * Company/Local preference and renders:
 *
 *   08:00 CST                  (when stop zone matches viewer zone)
 *   08:00 CST
 *   (06:00 PDT)                (when zones differ)
 *
 * Usage (new contract — UTC instant + stop tz):
 *   <StopTime utcIso={load.pickup_at} tz={load.pickup_tz} />
 *
 * Legacy-row fallback (when *_at / *_tz columns aren't populated yet):
 *   <StopTime legacyDate={load.pickup_date} legacyTime={load.pickup_time} />
 *
 * The legacy path treats the date+time as a wall clock in the stop's tz
 * (falling back to the org's company timezone). The Company/Local toggle
 * still flips the secondary "(06:00 PDT) your time" line.
 */

import { useTimeDisplay } from '@/contexts/TimeDisplayContext';
import { combineToUtc, formatStopTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';

interface StopTimeProps {
  utcIso?: string | null;
  tz?: string | null;
  /** Legacy YYYY-MM-DD date. Used only when utcIso is missing. */
  legacyDate?: string | null;
  /** Legacy time string ("08:00" or "8:00 AM"). Used only when utcIso is missing. */
  legacyTime?: string | null;
  /** When true, render `Mon, Jun 15 · 08:00 CST`. Default false. */
  withDate?: boolean;
  /** When true, render only the date (`Mon, Jun 15`) — no time line. */
  dateOnly?: boolean;
  /** Suppress the (06:00 PDT) secondary line. Default false. */
  hideSecondary?: boolean;
  className?: string;
  /** Fallback when there's nothing to render. Default '—'. */
  placeholder?: string;
}

export function StopTime({
  utcIso,
  tz,
  legacyDate,
  legacyTime,
  withDate = false,
  dateOnly = false,
  hideSecondary = false,
  className,
  placeholder = '—',
}: StopTimeProps) {
  const { viewerTz, companyTz } = useTimeDisplay();

  // Resolve the instant + zone we're going to render.
  const effectiveTz = tz || companyTz;
  let effectiveIso: string | null | undefined = utcIso;
  if (!effectiveIso && legacyDate) {
    effectiveIso = combineToUtc(legacyDate, legacyTime ?? '00:00', effectiveTz);
  }

  const formatted = formatStopTime(effectiveIso, effectiveTz, {
    viewerTz,
    hideSecondary: hideSecondary || dateOnly,
  });

  if (!formatted) return <span className={className}>{placeholder}</span>;

  if (dateOnly) {
    return <span className={className}>{formatted.dateLabel}</span>;
  }

  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span>{withDate ? formatted.full : formatted.timeLabel}</span>
      {formatted.secondaryLabel && (
        <span className="text-[10px] text-muted-foreground">
          ({formatted.secondaryLabel} your time)
        </span>
      )}
    </span>
  );
}
