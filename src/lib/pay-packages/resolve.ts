import type {
  PackageSnapshot,
  PayComponent,
  PayPackage,
  PayPackageAssignment,
  PayPackageOverride,
  PayPackageVersion,
} from '@/lib/pay-packages/types';

/**
 * Which package, which version and which overrides apply to a person for a pay period. Dates are plain
 * YYYY-MM-DD strings compared as text, the same way the rest of the app compares them.
 */

const inRange = (date: string, start: string | null | undefined, end: string | null | undefined) =>
  (!start || start <= date) && (!end || end >= date);

/** The assignment in force on a date. When two overlap, the one that started later wins. */
export function assignmentOn(assignments: PayPackageAssignment[], date: string): PayPackageAssignment | null {
  const live = assignments.filter((a) => inRange(date, a.effective_start, a.effective_end));
  if (live.length === 0) return null;
  return live.sort((a, b) => b.effective_start.localeCompare(a.effective_start) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
}

/** True when the package's own dates cover the day (an archived package still covers the past). */
export function packageCovers(pkg: Pick<PayPackage, 'effective_start' | 'effective_end'>, date: string): boolean {
  return inRange(date, pkg.effective_start, pkg.effective_end);
}

/**
 * The version of a package as it stood at the end of a day: the newest version saved on or before that day.
 * Returns null when the package had not been saved yet.
 */
export function versionAsOf(versions: PayPackageVersion[], date: string): PayPackageVersion | null {
  const upTo = versions.filter((v) => v.created_at.slice(0, 10) <= date);
  if (upTo.length === 0) return null;
  return upTo.sort((a, b) => b.version_number - a.version_number)[0];
}

/** The override for a person whose period covers the settlement's last day. */
export function overrideFor(overrides: PayPackageOverride[], periodEnd: string, packageId: string): PayPackageOverride | null {
  const hit = overrides
    .filter((o) => (o.package_id === null || o.package_id === packageId) && o.period_start <= periodEnd && o.period_end >= periodEnd)
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  return hit[0] ?? null;
}

export interface ResolvedPay {
  assignment: PayPackageAssignment;
  version: PayPackageVersion;
  override: PayPackageOverride | null;
  components: PayComponent[];
}

/** Everything needed to pay one person for a period, or null when no package applies. */
export function resolvePay(args: {
  assignments: PayPackageAssignment[];
  versionsByPackage: Map<string, PayPackageVersion[]>;
  overrides: PayPackageOverride[];
  periodEnd: string;
  /** The day pay is worked out. Defaults to the last day of the period, so a late run still uses that week's version. */
  asOf?: string;
}): ResolvedPay | null {
  const assignment = assignmentOn(args.assignments, args.periodEnd);
  if (!assignment) return null;
  const versions = args.versionsByPackage.get(assignment.package_id) ?? [];
  const day = args.asOf ?? args.periodEnd;
  // A version saved after the period but before the run still counts when the run is later: use the newest saved.
  const version = versionAsOf(versions, day) ?? versionAsOf(versions, '9999-12-31');
  if (!version) return null;
  const override = overrideFor(args.overrides, args.periodEnd, assignment.package_id);
  return { assignment, version, override, components: version.snapshot.components };
}

/** What a settlement keeps forever about the package it was paid under. */
export interface SettlementPaySnapshot {
  packageId: string;
  packageName: string;
  versionId: string;
  versionNumber: number;
  assignmentId: string;
  overrideId: string | null;
  snapshot: PackageSnapshot;
}

export function snapshotFor(resolved: ResolvedPay): SettlementPaySnapshot {
  return {
    packageId: resolved.version.package_id,
    packageName: resolved.version.snapshot.package.name,
    versionId: resolved.version.id,
    versionNumber: resolved.version.version_number,
    assignmentId: resolved.assignment.id,
    overrideId: resolved.override?.id ?? null,
    snapshot: resolved.version.snapshot,
  };
}
