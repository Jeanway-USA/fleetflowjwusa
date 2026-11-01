import { describe, expect, it } from 'vitest';
import { accessorialShare, applyStopOffRule, defaultAccessorialPercentage, isStopOff } from '@/lib/accessorials';
import { sumAccessorials } from '@/utils/payCalculations';
import { calculateRevenue } from '@/lib/revenue-calculator';

describe('stop-off pay is paid at the linehaul share', () => {
  it('recognises every spelling of stop-off and nothing else', () => {
    for (const t of ['Stop-off', 'Stop Off', 'STOP OFFS', 'Stop Of', ' stop_off ']) expect(isStopOff(t)).toBe(true);
    for (const t of ['Layover', 'Detention', 'Stop Off Fee Reversal', '', null, undefined]) expect(isStopOff(t as string)).toBe(false);
  });

  it('$325 of stop-off pay is $211.25', () => {
    expect(accessorialShare({ amount: 325, percentage: 65 })).toBe(211.25);
    expect(accessorialShare({ amount: 325 })).toBe(325); // a row with no percentage is paid in full
    expect(accessorialShare({ amount: 162.5, percentage: 100 })).toBe(162.5);
  });

  it('a new stop-off starts at the linehaul share, everything else at 100%', () => {
    expect(defaultAccessorialPercentage('Stop-off', 65)).toBe(65);
        expect(defaultAccessorialPercentage('Layover', 65)).toBe(100);
  });

  it('never leaves a new stop-off at 100%, but leaves saved rows and hand-typed percentages alone', () => {
    const rows = [
      { accessorial_type: 'Stop-off', percentage: 100 },
      { accessorial_type: 'Stop-off', percentage: 70 }, // typed on purpose: left alone
      { accessorial_type: 'Stop-off', percentage: 50 }, // typed on purpose
      { id: 'saved', accessorial_type: 'Stop Off', percentage: 100 }, // already holds the discounted amount from a statement
      { accessorial_type: 'Layover', percentage: 100 },
    ];
    const out = applyStopOffRule(rows, 65, [65]);
    expect(out.map((r) => r.percentage)).toEqual([65, 70, 50, 100, 100]);
  });

  it('driver pay and company revenue both use the paid share', () => {
    const load = { load_accessorials: [{ amount: 325, percentage: 65, is_driver_pay: true }, { amount: 100, percentage: 100, is_driver_pay: true }, { amount: 50, percentage: 100, is_driver_pay: false }] };
    expect(sumAccessorials(load)).toBeCloseTo(311.25, 2); // 211.25 + 100, and the company-only charge is left out
    const r = calculateRevenue(
      { rate: 1000, fuel_surcharge: 0, lumper: 0, advance_taken: 0, is_power_only: false, accessorialsTotal: accessorialShare({ amount: 325, percentage: 65 }) },
      { truckPct: 0.65, trailerPct: 0.07, advancePct: 0.3, ownsTrailer: false },
    );
    expect(r.truck_revenue).toBeCloseTo(650 + 211.25, 2);
  });
});
