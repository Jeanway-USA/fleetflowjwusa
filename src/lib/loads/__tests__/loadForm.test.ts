import { describe, expect, it } from 'vitest';
import { escapeLike, pickAgencyRow, realCompanyName } from '@/lib/loads/agency';
import { findPickupNumber, looksLikeReference } from '@/lib/loads/pickupNumber';

describe('agent code lookup', () => {
  it('reads % and _ as plain characters', () => {
    expect(escapeLike('AB_')).toBe('AB\\_');
    expect(escapeLike('A%C')).toBe('A\\%C');
    expect(escapeLike('HMD')).toBe('HMD');
  });
  it('uses the agent the system keeps before the CRM one, and null when neither', () => {
    const a = { company_name: 'HMD', agent_code: 'HMD', agent_status: 'safe', notes: null };
    const b = { company_name: 'Other', agent_code: 'HMD', agent_status: 'unsafe', notes: 'x' };
    expect(pickAgencyRow(a, b)).toBe(a);
    expect(pickAgencyRow(null, b)).toBe(b);
    expect(pickAgencyRow(undefined, undefined)).toBeNull();
  });
  it('shows a company name only when it is more than the code repeated', () => {
    expect(realCompanyName({ company_name: 'hmd', agent_code: 'HMD' })).toBeNull();
    expect(realCompanyName({ company_name: 'B-Line Logistics LLC - LTL', agent_code: 'LTL' })).toBe('B-Line Logistics LLC - LTL');
    expect(realCompanyName({ company_name: null, agent_code: 'LTL' })).toBeNull();
  });
});

describe('what counts as a reference code', () => {
  it('needs 4 to 30 letters, digits or hyphens, with at least one digit', () => {
    expect(looksLikeReference('M010340587')).toBe(true);
    expect(looksLikeReference('SC32834849')).toBe(true);
    expect(looksLikeReference('PU-48291')).toBe(true);
    expect(looksLikeReference('12345')).toBe(true);
    expect(looksLikeReference('APPOINTMENT')).toBe(false);
    expect(looksLikeReference('A1')).toBe(false);
    expect(looksLikeReference('has space 123')).toBe(false);
  });
});

describe('pickup number', () => {
  it('uses the number the reader found', () => {
    expect(findPickupNumber({ pickup_number: ' M010340587 ' })).toBe('M010340587');
  });
  it('takes the Customer Reference Number under References (the load detail in the Loads screenshot)', () => {
    expect(findPickupNumber({ customer_references: ['M010340587', 'SC32834849'] })).toBe('M010340587');
  });
  it('prefers the reference that also shows in the pickup stop notes', () => {
    expect(findPickupNumber({ customer_references: ['SC32834849', 'M010340587'], pickup_stop_notes: 'M010340587' })).toBe('M010340587');
  });
  it('falls back to the pickup stop notes when there are no references', () => {
    expect(findPickupNumber({ customer_references: [], pickup_stop_notes: 'Notes M010340587' })).toBe('M010340587');
    expect(findPickupNumber({ pickup_stop_notes: 'Call ahead. Use door 4. PU 77881234' })).toBe('77881234');
  });
  it('reads a labelled number in the load notes as a last resort', () => {
    expect(findPickupNumber({ notes: 'Driver must have Pickup # 5510-2233 at the gate.' })).toBe('5510-2233');
    expect(findPickupNumber({ notes: 'PU number: IFCT19611' })).toBe('IFCT19611');
  });
  it('is null rather than a guess when there is nothing', () => {
    expect(findPickupNumber({})).toBeNull();
    expect(findPickupNumber({ pickup_stop_notes: 'Call ahead', notes: 'Fragile' })).toBeNull();
    expect(findPickupNumber({ pickup_number: 'n/a' })).toBeNull();
  });
});
