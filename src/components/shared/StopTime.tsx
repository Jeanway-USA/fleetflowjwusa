/**
 * Drop-in display for an appointment time. Reads the viewer's current
 * Company/Local preference and renders:
 *
 *   08:00 CST                  (when stop zone matches viewer zone)
 *   08:00 CST
 *   (06:00 PDT)                (when zones differ)
 *
 * Usage:
 *   <StopTime utcIso={load.pickup_at} tz={load.pickup_tz} />
 *   <StopTime utcIso={load.pickup_at} tz={load.pickup_tz} withDate />
 */

import { useTimeDisplay } from '@/contexts/TimeDisplayContext';
import { formatStopTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';

interface StopTimeProps {
  utcIso: string | null | undefined;
  tz: string | null | undefined;
  /** When true, render `Mon, Jun 15 · 08:00 CST`. Default false. */
  withDate?: boolean;
  /** Suppress the (06:00 PDT) secondary line. Default false. */
  hideSecondary?: boolean;
  className?: string;
  /** Fallback when utcIso is null. Default '—'. */
  placeholder?: string;
}

export function StopTime({
  utcIso,
  tz,
  withDate = false,
  hideSecondary = false,
  className,
  placeholder = '—',
}: StopTimeProps) {
  const { viewerTz } = useTimeDisplay();
  const formatted = formatStopTime(utcIso, tz, { viewerTz, hideSecondary });

  if (!formatted) return <span className={className}>{placeholder}</span>;

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
