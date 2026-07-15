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
 * Open Window ranges (new): pass legacyEndTime (or utcEndIso) to render a
 * `HH:MM - HH:MM` range in the stop's zone. If only start info is provided,
 * behavior is unchanged.
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
  /** Optional UTC instant marking the END of an Open Window range. */
  utcEndIso?: string | null;
  /** Optional legacy end time ("17:00"). Renders as `start - end` when present. */
  legacyEndTime?: string | null;
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
  utcEndIso,
  legacyEndTime,
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

  // Resolve optional end instant for Open Window ranges.
  let effectiveEndIso: string | null | undefined = utcEndIso;
  if (!effectiveEndIso && legacyDate && legacyEndTime) {
    effectiveEndIso = combineToUtc(legacyDate, legacyEndTime, effectiveTz);
  }

  const formatted = formatStopTime(effectiveIso, effectiveTz, {
    viewerTz,
    hideSecondary: hideSecondary || dateOnly,
  });
  const formattedEnd = effectiveEndIso
    ? formatStopTime(effectiveEndIso, effectiveTz, {
        viewerTz,
        hideSecondary: hideSecondary || dateOnly,
      })
    : null;

  if (!formatted) return <span className={className}>{placeholder}</span>;

  if (dateOnly) {
    return <span className={className}>{formatted.dateLabel}</span>;
  }

  // For ranges, strip the trailing tz abbreviation from the start half so we
  // don't render "08:00 CST - 15:00 CST" — keep it once at the end.
  const stripZone = (label: string) => label.replace(/\s+[A-Z]{2,5}$/, '');
  const timeLine = formattedEnd
    ? `${stripZone(formatted.timeLabel)} - ${formattedEnd.timeLabel}`
    : formatted.timeLabel;
  const fullLine = withDate ? `${formatted.dateLabel} · ${timeLine}` : timeLine;
  const secondaryLine = formatted.secondaryLabel
    ? formattedEnd?.secondaryLabel
      ? `${stripZone(formatted.secondaryLabel)} - ${formattedEnd.secondaryLabel}`
      : formatted.secondaryLabel
    : undefined;

  return (
    <span className={cn('inline-flex flex-col leading-tight', className)}>
      <span>{fullLine}</span>
      {secondaryLine && (
        <span className="text-[10px] text-muted-foreground">
          ({secondaryLine} your time)
        </span>
      )}
    </span>
  );
}
