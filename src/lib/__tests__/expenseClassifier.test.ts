import { describe, expect, it } from 'vitest';
import { classifyStatementLine } from '@/lib/expense-classifier';

// Descriptions taken from the Misc expenses in the real data.
describe('classifyStatementLine', () => {
  it('treats revised-freight-bill reversals and statement totals as not costs', () => {
    for (const d of ['Updtd FB From Agency', 'FUEL SURCHARGE', 'Update Detention', 'STOP OFFS', 'STOP OFF', 'ADDITIONAL PT TO TRUCK', 'UNLOADING', 'NEW YORK ARBITRARY', 'DETENTION AT DESTINATION', 'TRACTOR PERCENT OVER CON', 'DEADHEAD', 'Total']) {
      expect(classifyStatementLine(d)?.action, d).toBe('skip');
    }
  });

  it('files advances under Advance', () => {
    for (const d of ['COMCHEK CONT. SPEC ADV.', 'CARD PARTIAL FINAL SETT', 'COMCHEK PARTIAL FINAL ST', 'CARD CONTRACTOR PAY']) {
      expect(classifyStatementLine(d)).toMatchObject({ action: 'retype', toType: 'Advance' });
    }
  });

  it('gives real costs their category', () => {
    const expected: Record<string, string> = {
      'BP NYSTA      02/20/26': 'Tolls',
      'MASSPIKE      03/01/26': 'Tolls',
      'TOLL CHARGES': 'Tolls',
      'MAR FUEL TAX': 'IFTA',
      'EOBR - AIRTIME': 'LCN/Satellite',
      '2026 PLATES': 'Registration/Plates',
      '80,000# RENEWAL  IN35226': 'Licensing/Permits',
      'MILEAGE TAX CHARGES': 'Taxes',
      'AD VALOREM TAX CHARGES': 'Taxes',
      'CONTRACTOR LOAN INTEREST': 'Interest',
      '2ND QTR ADV INT DED': 'Interest',
      '33073520 TIRE PURCHASE': 'Maintenance',
      'RPR/RPR COMBO LN 2/9/26': 'Maintenance',
      'REPAIR LOAN 1/26/26': 'Maintenance',
      'REDFILE LOAN 9/3/26': 'Maintenance',
      'OPER EXP/RPR LN 6/23/26': 'Maintenance',
      'COMCHEK FEE': 'Card Fee',
    };
    for (const [d, type] of Object.entries(expected)) {
      expect(classifyStatementLine(d), d).toMatchObject({ action: 'retype', toType: type });
    }
  });

  it('leaves unknown lines alone', () => {
    expect(classifyStatementLine('C#-01-IW-1199')).toBeNull();
    expect(classifyStatementLine('TRK PAYMENT LN 4/4/26')).toBeNull();
    expect(classifyStatementLine('')).toBeNull();
  });
});
