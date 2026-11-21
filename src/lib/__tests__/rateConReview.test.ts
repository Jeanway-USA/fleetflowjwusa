import { describe, expect, it } from 'vitest';
import { classifyParseFailure, findTripMatch, flaggedInputIds, flagText, looksLikeRateCon, previewMoney, revenueSettingsFrom, reviewFlags } from '../rate-con-review';

describe('classifyParseFailure', () => {
  it('explains an oversized file', () => {
    const f = classifyParseFailure('PDF file must be under 5MB. This file is 7.2MB.');
    expect(f.kind).toBe('too_big');
    expect(f.retryable).toBe(false);
  });

  it('explains a timeout and allows a retry', () => {
    const f = classifyParseFailure(new Error('Reading this PDF took too long.'));
    expect(f.kind).toBe('timeout');
    expect(f.retryable).toBe(true);
  });

  it('tells apart busy, credits, forbidden and upload failures', () => {
    expect(classifyParseFailure('Rate limit exceeded. Please try again in a moment.').kind).toBe('busy');
    expect(classifyParseFailure('AI credits exhausted. Please add credits to continue.').kind).toBe('credits');
    expect(classifyParseFailure('Forbidden: insufficient permissions').kind).toBe('forbidden');
    expect(classifyParseFailure('Failed to upload file for processing').kind).toBe('upload');
  });

  it('explains an unreadable PDF', () => {
    expect(classifyParseFailure('Failed to parse extracted data').kind).toBe('unreadable');
    expect(classifyParseFailure('Empty PDF body').kind).toBe('unreadable');
  });

  it('never returns a blank explanation for something unexpected', () => {
    const f = classifyParseFailure('weird thing');
    expect(f.kind).toBe('unknown');
    expect(f.detail).toContain('weird thing');
    expect(classifyParseFailure(undefined).detail.length).toBeGreaterThan(10);
  });
});

describe('looksLikeRateCon', () => {
  it('needs at least two real load facts', () => {
    expect(looksLikeRateCon({ landstar_load_id: '8941232', origin: 'Dallas, TX', destination: null, rate: null })).toBe(true);
    expect(looksLikeRateCon({ landstar_load_id: null, origin: null, destination: null, rate: 0 })).toBe(false);
    expect(looksLikeRateCon(null)).toBe(false);
  });
});

describe('reviewFlags', () => {
  const full = { landstar_load_id: '8941232', agency_code: 'ABC', origin: 'A', destination: 'B', pickup_date: '2026-11-20', delivery_date: '2026-11-22', rate: 2000, fuel_surcharge: 300, booked_miles: 800, pickup_number: 'P1234' };

  it('flags nothing for a fully confident read', () => {
    expect(reviewFlags({ ...full, confidence: { landstar_load_id: 99, origin: 95, destination: 95, rate: 97, pickup_date: 90 } })).toEqual([]);
  });

  it('flags low-confidence fields with their score', () => {
    const flags = reviewFlags({ ...full, confidence: { rate: 62, origin: 91 } });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ key: 'rate', level: 'low', confidence: 62 });
    expect(flagText(flags[0])).toBe('Linehaul: the reader is 62% sure');
  });

  it('flags required fields that were not found, but not optional ones', () => {
    const flags = reviewFlags({ ...full, agency_code: null, rate: 0, pickup_number: null, fuel_surcharge: null, confidence: {} });
    expect(flags.map((f) => [f.key, f.level])).toEqual([
      ['agency_code', 'missing'],
      ['rate', 'missing'],
    ]);
    expect(flagText(flags[0])).toBe('Agent code: not found in the PDF');
  });

  it('maps flags to the load form input ids', () => {
    const flags = reviewFlags({ ...full, rate: 0, confidence: { origin: 40 } });
    expect(flaggedInputIds(flags).sort()).toEqual(['origin', 'rate']);
  });
});

describe('previewMoney', () => {
  const settings = revenueSettingsFrom([]); // Landstar defaults: 65 / 7 / 30, no trailer, 70 power only

  it('pays the truck share of linehaul plus 100% of the fuel surcharge', () => {
    const m = previewMoney({ rate: 2000, fuel_surcharge: 400 }, settings);
    expect(m.gross).toBe(2400);
    expect(m.linehaulShare).toBe(1300);
    expect(m.landstarCut).toBe(700);
    expect(m.fuelSurcharge).toBe(400);
    expect(m.net).toBe(1700);
  });

  it('pays stop-off at the linehaul share, other accessorials in full', () => {
    const m = previewMoney({ rate: 1000, fuel_surcharge: 0, accessorials: [{ type: 'Stop Of', amount: 325 }, { type: 'Detention', amount: 100 }] }, settings);
    expect(m.gross).toBe(1425);
    expect(m.accessorials).toBe(311.25); // 325 x 65% + 100
    expect(m.net).toBe(650 + 311.25);
  });

  it('uses the power-only share and no trailer share when power only', () => {
    const owns = revenueSettingsFrom([{ setting_key: 'owns_trailer', setting_value: 'true' }]);
    expect(previewMoney({ rate: 1000, fuel_surcharge: 0 }, owns).trailerShare).toBe(70);
    const p = previewMoney({ rate: 1000, fuel_surcharge: 0, is_power_only: true }, owns);
    expect(p.linehaulShare).toBe(700);
    expect(p.trailerShare).toBe(0);
    expect(p.usesPowerOnly).toBe(true);
  });

  it('follows the org settings, not hard-coded numbers', () => {
    const s = revenueSettingsFrom([{ setting_key: 'truck_percentage', setting_value: '60' }]);
    expect(previewMoney({ rate: 1000, fuel_surcharge: 0 }, s).net).toBe(600);
  });
});

describe('findTripMatch', () => {
  const loads = [
    { id: '1', landstar_load_id: '8941232', origin: 'A', destination: 'B', status: 'delivered' },
    { id: '2', landstar_load_id: '555', origin: 'C', destination: 'D', status: 'cancelled' },
    { id: '3', landstar_load_id: '777', origin: 'E', destination: 'F', status: 'assigned', deleted_at: '2026-11-01' },
  ];
  it('finds a live load by trip number, ignoring case and spaces', () => {
    expect(findTripMatch(loads, ' 8941232 ')?.id).toBe('1');
  });
  it('ignores cancelled and deleted loads and empty ids', () => {
    expect(findTripMatch(loads, '555')).toBeNull();
    expect(findTripMatch(loads, '777')).toBeNull();
    expect(findTripMatch(loads, '')).toBeNull();
  });
});
