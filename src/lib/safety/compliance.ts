import { addDays, addMonths, differenceInCalendarDays, format, parseISO, subMonths } from 'date-fns';

/**
 * Safety checks for drivers and equipment, against Landstar's operator minimums and the federal rules that apply to JeanWay.
 * Pure: no database. The rules and where each came from are in docs/SAFETY_REQUIREMENTS_RESEARCH.md.
 *
 * Landstar keeps the official driver qualification files and runs the drug and alcohol program. What JeanWay owes is keeping
 * credentials current, a copy of each driver's MVR, equipment inspected, and a record of accidents. Anything Landstar does is
 * shown as information, not as something JeanWay is failing.
 */

export const LANDSTAR_INSPECTION_DAYS = 120;
export const SOON_DAYS = 30;

export type CheckStatus = 'ok' | 'soon' | 'overdue' | 'missing' | 'review' | 'info';

export interface Check {
  key: string;
  label: string;
  status: CheckStatus;
  /** One plain sentence: what is true now. */
  detail: string;
  /** The rule behind it. */
  rule: string;
  /** The date the check turns on, when there is one. */
  date?: string | null;
}

/** Worst first. */
const SEVERITY: Record<CheckStatus, number> = { overdue: 5, missing: 4, review: 3, soon: 2, ok: 1, info: 0 };
export const worst = (checks: Array<Pick<Check, 'status'>>): CheckStatus => checks.reduce<CheckStatus>((w, c) => (SEVERITY[c.status] > SEVERITY[w] ? c.status : w), 'info');
/** A check that needs someone to act. */
export const needsAction = (s: CheckStatus) => s === 'overdue' || s === 'missing' || s === 'review' || s === 'soon';

const day = (d: string) => format(parseISO(d), 'MMM d, yyyy');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Status for something that expires on a date: ok, due within 30 days, or expired. */
export function expiryCheck(args: { key: string; label: string; date: string | null | undefined; today: string; rule: string; missingDetail: string; missingStatus?: CheckStatus }): Check {
  const { key, label, date, today, rule } = args;
  if (!date) return { key, label, status: args.missingStatus ?? 'missing', detail: args.missingDetail, rule, date: null };
  const days = differenceInCalendarDays(parseISO(date), parseISO(today));
  if (days < 0) return { key, label, status: 'overdue', detail: `Expired ${plural(-days, 'day')} ago, on ${day(date)}.`, rule, date };
  if (days <= SOON_DAYS) return { key, label, status: 'soon', detail: days === 0 ? `Expires today, ${day(date)}.` : `Expires in ${plural(days, 'day')}, on ${day(date)}.`, rule, date };
  return { key, label, status: 'ok', detail: `Good until ${day(date)}.`, rule, date };
}

// ---------------------------------------------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------------------------------------------

export interface DriverInput {
  id: string;
  license_expiry: string | null;
  license_state?: string | null;
  medical_card_expiry: string | null;
  hazmat_expiry: string | null;
  endorsements: string[] | null;
  mvr_expiry: string | null;
  landstar_operator_id: string | null;
  landstar_approved_on?: string | null;
}

export interface FileInput { subject_id: string; kind: string; doc_date: string | null; expires_on: string | null; file_name: string; created_at?: string }
export interface IncidentInput { driver_id: string | null; incident_date: string; incident_type: string; severity: string | null; injuries_reported: boolean | null; citation_issued: boolean | null }

/** The newest file of a kind for a subject. */
export function latestFile(files: FileInput[], subjectId: string, kind: string): FileInput | null {
  const mine = files.filter((f) => f.subject_id === subjectId && f.kind === kind);
  mine.sort((a, b) => (b.doc_date ?? b.created_at ?? '').localeCompare(a.doc_date ?? a.created_at ?? ''));
  return mine[0] ?? null;
}

const HAZMAT_ENDORSEMENT = /^(h|x)$|hazmat|hazardous/i;

/** Incidents that could be a DOT-recordable accident (a crash with an injury, a tow-away, or a citation) and need a decision. */
export function accidentsToReview(incidents: IncidentInput[], driverId: string, today: string): IncidentInput[] {
  const since = format(subMonths(parseISO(today), 12), 'yyyy-MM-dd');
  return incidents.filter((i) => i.driver_id === driverId && i.incident_date >= since && i.incident_date <= today && (i.incident_type === 'accident' || i.incident_type === 'injury'));
}

export function driverChecks(args: { driver: DriverInput; files: FileInput[]; incidents: IncidentInput[]; today: string }): Check[] {
  const { driver, files, incidents, today } = args;
  const out: Check[] = [];

  out.push(expiryCheck({
    key: 'cdl', label: 'CDL', date: driver.license_expiry, today,
    rule: 'Federal CDL rules (49 CFR 383). Landstar: Class A, issued in the driver\'s home state (non-domiciled CDLs are not accepted).',
    missingDetail: 'No CDL expiry date on file.',
  }));

  out.push(expiryCheck({
    key: 'medical', label: 'DOT medical card', date: driver.medical_card_expiry, today,
    rule: '49 CFR 391.45: a medical exam at least every 24 months (12 for some conditions), by an examiner on the National Registry.',
    missingDetail: 'No medical card expiry date on file.',
  }));

  const hasHazmat = !!driver.hazmat_expiry || (driver.endorsements ?? []).some((e) => HAZMAT_ENDORSEMENT.test(e.trim()));
  if (!hasHazmat) {
    out.push({ key: 'hazmat', label: 'Hazmat endorsement', status: 'missing', detail: 'No hazmat endorsement on file. Landstar requires one.', rule: 'Landstar operator minimums: hazmat endorsement. Training every 3 years (49 CFR 172.704).', date: null });
  } else {
    out.push(expiryCheck({
      key: 'hazmat', label: 'Hazmat endorsement', date: driver.hazmat_expiry, today,
      rule: 'Landstar operator minimums: hazmat endorsement. Training every 3 years (49 CFR 172.704).',
      missingDetail: 'The hazmat endorsement is on the license but its expiry date is not entered.', missingStatus: 'missing',
    }));
  }

  // The annual MVR: due on the entered date, or a year after the copy on file.
  const mvr = latestFile(files, driver.id, 'mvr');
  const mvrDue = driver.mvr_expiry ?? (mvr?.doc_date ? format(addMonths(parseISO(mvr.doc_date), 12), 'yyyy-MM-dd') : null);
  const mvrRule = '49 CFR 391.25: review the driving record at least every 12 months and note who reviewed it and when. Landstar keeps the official file.';
  if (!mvr) {
    const dated = mvrDue ? expiryCheck({ key: 'mvr', label: 'Annual MVR', date: mvrDue, today, rule: mvrRule, missingDetail: '' }) : null;
    out.push({ key: 'mvr', label: 'Annual MVR', status: dated && (dated.status === 'overdue') ? 'overdue' : 'missing', detail: dated && dated.status === 'overdue' ? `Annual review was due ${day(mvrDue!)}, and no copy is uploaded.` : 'No MVR copy uploaded.', rule: mvrRule, date: mvrDue });
  } else {
    const c = expiryCheck({ key: 'mvr', label: 'Annual MVR', date: mvrDue, today, rule: mvrRule, missingDetail: 'The MVR is uploaded but no date is entered. Add the date it was pulled.' });
    out.push({ ...c, detail: c.status === 'ok' || c.status === 'soon' ? `${c.detail.replace('Good until', 'Annual review due')} Copy on file${mvr.doc_date ? `, pulled ${day(mvr.doc_date)}` : ''}.` : c.detail });
  }

  if (driver.landstar_operator_id || driver.landstar_approved_on) {
    out.push({ key: 'landstar', label: 'Landstar approval', status: 'ok', detail: `Landstar operator ID ${driver.landstar_operator_id ?? 'not entered'}${driver.landstar_approved_on ? `, approved ${day(driver.landstar_approved_on)}` : ''}.`, rule: 'Landstar decides who is qualified, case by case. Every driver is approved by Landstar before driving.', date: driver.landstar_approved_on ?? null });
  } else {
    out.push({ key: 'landstar', label: 'Landstar approval', status: 'missing', detail: 'No Landstar operator ID or approval date on file. Do not dispatch this driver until Landstar has approved them.', rule: 'Landstar decides who is qualified, case by case. Every driver is approved by Landstar before driving.', date: null });
  }

  const recent = accidentsToReview(incidents, driver.id, today);
  out.push(recent.length === 0
    ? { key: 'accidents', label: 'Accidents, last 12 months', status: 'ok', detail: 'No accident or injury incidents recorded in the last 12 months.', rule: 'Landstar: no DOT-recordable or preventable accident in the past 12 months.', date: null }
    : { key: 'accidents', label: 'Accidents, last 12 months', status: 'review', detail: `${plural(recent.length, 'accident or injury incident')} in the last 12 months. Decide whether each is DOT-recordable or preventable. Landstar's rule is none in 12 months.`, rule: 'Landstar: no DOT-recordable or preventable accident in the past 12 months. DOT-recordable means a fatality, an injury treated away from the scene, or a tow-away (49 CFR 390.5).', date: recent[0].incident_date });

  out.push({ key: 'landstar-program', label: 'Drug and alcohol testing, Clearinghouse, driver qualification file', status: 'info', detail: 'Landstar keeps these for our drivers. Ask Landstar for a copy if an auditor or insurer asks.', rule: '49 CFR Parts 382 and 391. Landstar requires no positive drug or alcohol tests, and a completed SAP program does not waive that.', date: null });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------------------------------------------

export interface EquipmentInput {
  id: string;
  kind: 'truck' | 'trailer';
  status: string | null;
  /** The last Landstar inspection (trucks) or the last inspection (trailers). */
  last_inspection: string | null;
  /** A saved "next inspection" date, used only when there is no last date. */
  next_inspection: string | null;
}

export function equipmentChecks(args: { item: EquipmentInput; files: FileInput[]; today: string }): Check[] {
  const { item, files, today } = args;
  const out: Check[] = [];
  const label = item.kind === 'truck' ? 'tractor' : 'trailer';
  const due = item.last_inspection ? format(addDays(parseISO(item.last_inspection), LANDSTAR_INSPECTION_DAYS), 'yyyy-MM-dd') : item.next_inspection;
  const c = expiryCheck({
    key: 'inspection-120', label: 'Landstar 120-day inspection', date: due, today,
    rule: `Landstar requires every leased ${label} to be inspected every ${LANDSTAR_INSPECTION_DAYS} days at a Landstar-approved facility. A Level One DOT inspection is also required to be leased on.`,
    missingDetail: `No inspection date recorded for this ${label}.`,
  });
  out.push({ ...c, detail: c.status === 'ok' ? `Next one due ${day(due!)}${item.last_inspection ? `. Last done ${day(item.last_inspection)}` : ''}.` : c.status === 'soon' ? `Next one due in ${plural(differenceInCalendarDays(parseISO(due!), parseISO(today)), 'day')}, on ${day(due!)}.` : c.status === 'overdue' ? `Inspection was due ${day(due!)}.` : c.detail });

  if (item.last_inspection) {
    const months = differenceInCalendarDays(parseISO(today), parseISO(item.last_inspection));
    const annualRule = '49 CFR 396.17: every tractor and trailer must pass an inspection at least once in 12 months, with the report or sticker kept on the vehicle. A passed 120-day inspection by a qualified inspector covers this.';
    out.push(months > 366
      ? { key: 'annual', label: 'Federal annual inspection', status: 'overdue', detail: `Last inspection was ${day(item.last_inspection)}, more than 12 months ago.`, rule: annualRule, date: item.last_inspection }
      : { key: 'annual', label: 'Federal annual inspection', status: 'ok', detail: `Inspected ${day(item.last_inspection)}, within the last 12 months.`, rule: annualRule, date: item.last_inspection });
  }

  const report = latestFile(files, item.id, 'inspection_report');
  out.push(report
    ? { key: 'report', label: 'Inspection report copy', status: 'ok', detail: `${report.file_name}${report.doc_date ? `, dated ${day(report.doc_date)}` : ''}.`, rule: '49 CFR 396.17(c): the report or sticker must be on the vehicle. A copy here is a backup.', date: report.doc_date }
    : { key: 'report', label: 'Inspection report copy', status: 'info', detail: 'No copy uploaded. Optional, but handy if the report on the truck is lost.', rule: '49 CFR 396.17(c): the report or sticker must be on the vehicle. A copy here is a backup.', date: null });

  if (item.status === 'down' || item.status === 'out_of_service') {
    out.push({ key: 'status', label: 'Out of service', status: 'overdue', detail: `This ${label} is marked ${item.status === 'down' ? 'down' : 'out of service'}.`, rule: 'Do not dispatch equipment that is down. Repair defects before it goes out again (49 CFR 396.11).', date: null });
  }
  return out;
}

export interface Tally { ok: number; soon: number; overdue: number; missing: number; review: number }
export function tally(results: Array<Pick<Check, 'status'>>): Tally {
  const t: Tally = { ok: 0, soon: 0, overdue: 0, missing: 0, review: 0 };
  for (const r of results) if (r.status in t) t[r.status as keyof Tally] += 1;
  return t;
}
