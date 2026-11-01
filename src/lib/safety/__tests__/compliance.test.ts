import { describe, expect, it } from 'vitest';
import { accidentsToReview, driverChecks, equipmentChecks, expiryCheck, latestFile, needsAction, worst, type DriverInput, type FileInput, type IncidentInput } from '@/lib/safety/compliance';

const today = '2026-11-01';
const driver: DriverInput = { id: 'd1', license_expiry: '2028-05-01', medical_card_expiry: '2027-03-01', hazmat_expiry: '2027-08-01', endorsements: ['H', 'N'], mvr_expiry: '2027-02-01', landstar_operator_id: 'L123', landstar_approved_on: '2026-01-10' };
const mvrFile: FileInput = { subject_id: 'd1', kind: 'mvr', doc_date: '2026-02-01', expires_on: null, file_name: 'mvr.pdf' };
const get = (cs: ReturnType<typeof driverChecks>, key: string) => cs.find((c) => c.key === key)!;

describe('expiry checks', () => {
  const base = { key: 'k', label: 'L', today, rule: 'r', missingDetail: 'none' };
  it('ok, soon (within 30 days), overdue and missing', () => {
    expect(expiryCheck({ ...base, date: '2027-01-01' }).status).toBe('ok');
    expect(expiryCheck({ ...base, date: '2026-11-30' })).toMatchObject({ status: 'soon', detail: 'Expires in 29 days, on Nov 30, 2026.' });
    expect(expiryCheck({ ...base, date: '2026-12-01' }).status).toBe('soon'); // exactly 30 days
    expect(expiryCheck({ ...base, date: '2026-12-02' }).status).toBe('ok');
    expect(expiryCheck({ ...base, date: '2026-10-30' })).toMatchObject({ status: 'overdue', detail: 'Expired 2 days ago, on Oct 30, 2026.' });
    expect(expiryCheck({ ...base, date: null }).status).toBe('missing');
    expect(expiryCheck({ ...base, date: '2026-11-01' }).detail).toBe('Expires today, Nov 1, 2026.');
  });
});

describe('driver checks', () => {
  it('a fully current driver has nothing to act on', () => {
    const cs = driverChecks({ driver, files: [mvrFile], incidents: [], today });
    expect(cs.filter((c) => needsAction(c.status))).toEqual([]);
    expect(worst(cs)).toBe('ok');
    expect(get(cs, 'landstar-program').status).toBe('info');
  });
  it('flags an expired CDL and an expiring medical card', () => {
    const cs = driverChecks({ driver: { ...driver, license_expiry: '2026-10-01', medical_card_expiry: '2026-11-15' }, files: [mvrFile], incidents: [], today });
    expect(get(cs, 'cdl').status).toBe('overdue');
    expect(get(cs, 'medical').status).toBe('soon');
    expect(worst(cs)).toBe('overdue');
  });
  it('Landstar requires a hazmat endorsement', () => {
    expect(get(driverChecks({ driver: { ...driver, endorsements: ['N'], hazmat_expiry: null }, files: [mvrFile], incidents: [], today }), 'hazmat').status).toBe('missing');
    expect(get(driverChecks({ driver: { ...driver, endorsements: ['X'], hazmat_expiry: null }, files: [mvrFile], incidents: [], today }), 'hazmat').status).toBe('missing'); // endorsement but no expiry entered
    expect(get(driverChecks({ driver: { ...driver, endorsements: null, hazmat_expiry: '2027-01-01' }, files: [mvrFile], incidents: [], today }), 'hazmat').status).toBe('ok');
  });
  it('the MVR is missing until a copy is uploaded', () => {
    const none = get(driverChecks({ driver, files: [], incidents: [], today }), 'mvr');
    expect(none.status).toBe('missing');
    const late = get(driverChecks({ driver: { ...driver, mvr_expiry: '2026-09-01' }, files: [], incidents: [], today }), 'mvr');
    expect(late.status).toBe('overdue');
  });
  it('the MVR is due a year after the copy when no date is entered', () => {
    const c = get(driverChecks({ driver: { ...driver, mvr_expiry: null }, files: [mvrFile], incidents: [], today }), 'mvr');
    expect(c.date).toBe('2027-02-01');
    expect(c.status).toBe('ok');
    const old = get(driverChecks({ driver: { ...driver, mvr_expiry: null }, files: [{ ...mvrFile, doc_date: '2025-06-01' }], incidents: [], today }), 'mvr');
    expect(old.status).toBe('overdue');
  });
  it('a driver Landstar has not approved is flagged', () => {
    expect(get(driverChecks({ driver: { ...driver, landstar_operator_id: null, landstar_approved_on: null }, files: [mvrFile], incidents: [], today }), 'landstar').status).toBe('missing');
    expect(get(driverChecks({ driver: { ...driver, landstar_approved_on: null }, files: [mvrFile], incidents: [], today }), 'landstar').status).toBe('ok');
  });
});

describe('accidents in the last 12 months', () => {
  const inc = (over: Partial<IncidentInput>): IncidentInput => ({ driver_id: 'd1', incident_date: '2026-06-01', incident_type: 'accident', severity: 'minor', injuries_reported: false, citation_issued: false, ...over });
  it('counts accident and injury incidents for the driver inside the window', () => {
    const list = [inc({}), inc({ incident_type: 'injury' }), inc({ incident_date: '2025-10-31' }), inc({ incident_type: 'near_miss' }), inc({ driver_id: 'd2' }), inc({ incident_date: '2026-12-01' })];
    expect(accidentsToReview(list, 'd1', today)).toHaveLength(2);
  });
  it('asks for a decision rather than failing the driver', () => {
    const c = get(driverChecks({ driver, files: [mvrFile], incidents: [inc({})], today }), 'accidents');
    expect(c.status).toBe('review');
    expect(c.detail).toMatch(/Decide whether/);
  });
  it('is clear with nothing recorded', () => {
    expect(get(driverChecks({ driver, files: [mvrFile], incidents: [], today }), 'accidents').status).toBe('ok');
  });
});

describe('equipment checks', () => {
  const truck = { id: 't1', kind: 'truck' as const, status: 'active', last_inspection: '2026-09-01', next_inspection: null };
  const byKey = (cs: ReturnType<typeof equipmentChecks>, k: string) => cs.find((c) => c.key === k)!;
  it('the Landstar inspection is due 120 days after the last one', () => {
    const c = byKey(equipmentChecks({ item: truck, files: [], today }), 'inspection-120');
    expect(c.date).toBe('2026-12-30');
    expect(c.status).toBe('ok');
  });
  it('soon and overdue', () => {
    expect(byKey(equipmentChecks({ item: { ...truck, last_inspection: '2026-07-20' }, files: [], today }), 'inspection-120').status).toBe('soon'); // due Nov 17
    expect(byKey(equipmentChecks({ item: { ...truck, last_inspection: '2026-06-01' }, files: [], today }), 'inspection-120').status).toBe('overdue'); // due Sep 29
  });
  it('uses the saved next date when there is no last date, and is missing with neither', () => {
    expect(byKey(equipmentChecks({ item: { ...truck, last_inspection: null, next_inspection: '2027-01-15' }, files: [], today }), 'inspection-120').date).toBe('2027-01-15');
    expect(byKey(equipmentChecks({ item: { ...truck, last_inspection: null }, files: [], today }), 'inspection-120').status).toBe('missing');
  });
  it('the federal annual inspection fails after 12 months', () => {
    expect(byKey(equipmentChecks({ item: truck, files: [], today }), 'annual').status).toBe('ok');
    expect(byKey(equipmentChecks({ item: { ...truck, last_inspection: '2025-09-01' }, files: [], today }), 'annual').status).toBe('overdue');
  });
  it('a truck that is down is flagged, and a report copy is only informational when missing', () => {
    const cs = equipmentChecks({ item: { ...truck, status: 'out_of_service' }, files: [], today });
    expect(byKey(cs, 'status').status).toBe('overdue');
    expect(byKey(cs, 'report').status).toBe('info');
    expect(byKey(equipmentChecks({ item: truck, files: [{ subject_id: 't1', kind: 'inspection_report', doc_date: '2026-09-01', expires_on: null, file_name: 'report.pdf' }], today }), 'report').status).toBe('ok');
  });
});

describe('latest file', () => {
  it('picks the newest by document date, per subject and kind', () => {
    const f = (d: string, id = 'd1', kind = 'mvr'): FileInput => ({ subject_id: id, kind, doc_date: d, expires_on: null, file_name: d });
    expect(latestFile([f('2025-01-01'), f('2026-02-01'), f('2026-03-01', 'd2'), f('2026-04-01', 'd1', 'other')], 'd1', 'mvr')?.file_name).toBe('2026-02-01');
    expect(latestFile([], 'd1', 'mvr')).toBeNull();
  });
});
