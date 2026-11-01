/**
 * Landstar pays accessorials on a share of the amount it lists, the same way it pays linehaul. Stop-off pay is the clear
 * case: a load listing $325 of stop-off pay pays the truck 65% of it, $211.25, not $325.
 *
 * Every accessorial row stores the listed amount and the share of it that is paid (percentage). What the truck is paid is
 * always amount x percentage, worked out by accessorialShare so no screen can forget the percentage.
 */

export interface AccessorialLike {
  amount?: number | null;
  /** Share of the listed amount that is paid, as a whole number (65 means 65%). Missing means 100. */
  percentage?: number | null;
}

/** "Stop-off", "Stop Off", "STOP OFFS", "Stop Of": all the same charge. */
export function isStopOff(type: string | null | undefined): boolean {
  return /^\s*stop[\s_-]*offs?\s*$|^\s*stop[\s_-]*of\s*$/i.test(type ?? '');
}

/** What is actually paid for one accessorial row, in dollars. */
export function accessorialShare(a: AccessorialLike | null | undefined): number {
  const amount = Number(a?.amount) || 0;
  const pct = a?.percentage == null ? 100 : Number(a.percentage);
  return Math.round(amount * (Number.isFinite(pct) ? pct : 100)) / 100;
}

/** The percentage a new accessorial of this type starts with. Stop-off follows the truck share (65). */
export function defaultAccessorialPercentage(type: string | null | undefined, linehaulPct: number): number {
  return isStopOff(type) ? linehaulPct : 100;
}

/**
 * Makes sure stop-off pay on a load is not left at 100%. Rows already saved keep what they have, because a row set from
 * a Landstar statement already holds the discounted amount. A new row, or a row still at the untouched 100% or the
 * other linehaul share, is set to this load's linehaul share. A percentage someone typed in on purpose is left alone.
 */
export function applyStopOffRule<T extends { id?: string; accessorial_type: string; percentage: number }>(items: T[], linehaulPct: number, otherShares: number[] = []): T[] {
  const untouched = new Set([100, ...otherShares]);
  return items.map((a) => (isStopOff(a.accessorial_type) && !a.id && untouched.has(Number(a.percentage)) ? { ...a, percentage: linehaulPct } : a));
}
