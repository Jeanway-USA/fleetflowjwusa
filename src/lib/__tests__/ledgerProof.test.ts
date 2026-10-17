import { describe, expect, it } from 'vitest';
import { buildLedger, categorize, categorizeApp } from '@/lib/ledger-proof';

// Descriptions and signs taken from Landstar's year-to-date Settlement Details export.
describe('categorize', () => {
  const key = (d: string, a: number) => categorize(d, a).key;

  it('sorts settlement lines into plain categories', () => {
    expect(key('TRACTOR L/H', 2806.25)).toBe('revenue');
    expect(key('Tractor Line Haul', -3446.95)).toBe('revenue');
    expect(key('FUEL SURCHARGE', 937.17)).toBe('revenue');
    expect(key('120 DAY SAFETY PROGRAM', 250)).toBe('safety');
    expect(key('SATELLITE MOTOR SURVEILL', 42.5)).toBe('revenue');
    expect(key('CARD PRE-TRIP', -2714.09)).toBe('advances');
    expect(key('CARD CONT. SPEC ADV', -16146.66)).toBe('advances');
    expect(key('UA CARD PRE-TRIP', 300)).toBe('advances');
    expect(key('COMCHEK PARTIAL FINAL ST', -330)).toBe('advances');
    expect(key('CARD FEE', -1.75)).toBe('cardFees');
    expect(key('VOID CARD FEE', 1.75)).toBe('cardFees');
    expect(key('TRKSTP SCN LTL 1369039', -2)).toBe('scanning');
    expect(key('DD FEE DD#  3524889', -1.75)).toBe('depositFees');
    expect(key('UNLADEN LIABILITY STD P', -33.98)).toBe('insurance');
    expect(key('JEAN,SIADRAK/CPP', -35.38)).toBe('cpp');
    expect(key('NTP TRUCK WARRANTY PROG.', -87.94)).toBe('warranty');
    expect(key('BP NYSTA      02/20/26', -123.06)).toBe('tolls');
    expect(key('TOLL CHARGES', -117.76)).toBe('tolls');
    expect(key('MILEAGE TAX CHARGES', -10.81)).toBe('taxes');
    expect(key('MAR FUEL TAX', -227.92)).toBe('fuelTax');
    expect(key('2026 PLATES', -661.16)).toBe('permits');
    expect(key('80,000# RENEWAL IN35226', -1038.84)).toBe('permits');
    expect(key('LCN FEES - CONT.', -3.69)).toBe('satellite');
    expect(key('PREPASS', -2.5)).toBe('satellite');
    expect(key('33073520 TIRE PURCHASE', -900)).toBe('tires');
    expect(key('C36944-01-IW-1199', -150)).toBe('weekly');
  });

  it('keeps escrow and loan money out of the costs', () => {
    expect(key('TRIP% ESCROW PAYMENT', -213)).toBe('escrowIn');
    expect(key('REIMB VOLUNTARY ESCROW', 13592.25)).toBe('escrowOut');
    expect(key('SET UP COMBO LOAN', 7435.32)).toBe('loanProceeds');
    expect(key('REPAIR LOAN  8/6/26', 1992.16)).toBe('loanProceeds');
    expect(key('REPAIR LOAN  1/26/26', -2469.5)).toBe('repairLoans');
    expect(key('RPR/RPR COMBO LN 2/9/26', -2500)).toBe('repairLoans');
    expect(key('REDFILE LOAN 9/3/26', -524.34)).toBe('repairLoans');
    expect(key('OPER EXP LN 6/23/26', -2000)).toBe('repairLoans');
  });

  it('treats interest charged and interest paid to you as one category', () => {
    expect(key('3RD QTR ADV INT DED', -9.28)).toBe('interest');
    expect(key('3RD QTR ESCROW INT PAY', 9.28)).toBe('interest');
    expect(key('CONTRACTOR LOAN INTEREST', -357.68)).toBe('interest');
    expect(key('REIMB LOAN INTEREST', 133.79)).toBe('interest');
  });

  it('files refunds and unknown lines', () => {
    expect(key('REF #650060120 3/26/26', 1502.67)).toBe('refunds');
    expect(key('GA MAR CREDIT', 21.32)).toBe('refunds');
    expect(key('SOMETHING NEW', -5)).toBe('other');
  });
});

describe('categorizeApp', () => {
  it('uses the wording first and the type when the wording says nothing', () => {
    expect(categorizeApp({ expense_type: 'Tolls', description: 'BP', amount: 8.45 })?.key).toBe('tolls');
    expect(categorizeApp({ expense_type: 'Taxes', description: 'MILEAGE TAX CHARGES', amount: 10.81 })?.key).toBe('taxes');
    expect(categorizeApp({ expense_type: 'Maintenance', description: 'REDFILE LOAN 9/3/26', amount: 524.34 })?.key).toBe('repairLoans');
  });

  it("leaves out the card's own spending and its $1 deposit fee", () => {
    expect(categorizeApp({ expense_type: 'Fuel', description: 'PETRO', amount: 800 })).toBeNull();
    expect(categorizeApp({ expense_type: 'Direct Deposit Fee', description: 'Direct-Deposit Fee', amount: 1 })).toBeNull();
    expect(categorizeApp({ expense_type: 'PrePass/Scale', description: 'CAT Scale PORTAGE WI', amount: 14.75 })).toBeNull();
    expect(categorizeApp({ expense_type: 'Direct Deposit Fee', description: 'DD FEE DD#  3524889', amount: 1.75 })?.key).toBe('depositFees');
  });
});

describe('buildLedger', () => {
  const lines = [
    { description: 'TRACTOR L/H', trip: '1', amount: 1000 },
    { description: 'FUEL SURCHARGE', trip: '1', amount: 300 },
    { description: 'CARD FEE', trip: '1', amount: -1.75 },
    { description: 'CARD FEE', trip: '2', amount: -1.75 },
    { description: 'CARD PRE-TRIP', trip: '1', amount: -900 },
    { description: 'TRIP% ESCROW PAYMENT', trip: '1', amount: -150 },
    { description: 'REIMB VOLUNTARY ESCROW', trip: null, amount: 500 },
    { description: 'JEAN,SIADRAK/CPP', trip: null, amount: -35.38 },
  ];

  it('adds every line up to the settled amount', () => {
    const r = buildLedger(lines, []);
    expect(r.settled).toBe(Math.round((1000 + 300 - 1.75 - 1.75 - 900 - 150 + 500 - 35.38) * 100) / 100);
    expect(r.totals.revenue).toBe(1300);
  });

  it('sets costs and advances beside what the app holds and flags the difference', () => {
    const r = buildLedger(lines, [
      { expense_type: 'Card Fee', description: 'CARD FEE', amount: 1.75 },
      { expense_type: 'Advance', description: 'CARD PRE-TRIP', amount: 900 },
      { expense_type: 'CPP/Benefits', description: 'JEAN,SIADRAK/CPP', amount: 35.38 },
    ]);
    const by = (k: string) => r.rows.find((x) => x.category.key === k)!;
    expect(by('cardFees')).toMatchObject({ landstar: 3.5, app: 1.75, difference: -1.75, lines: 2 });
    expect(by('advances')).toMatchObject({ landstar: 900, app: 900, difference: 0 });
    expect(by('cpp').difference).toBe(0);
    // Escrow is cash, not a cost, so the app is not compared with it.
    expect(by('escrowIn')).toMatchObject({ landstar: 150, app: null, difference: null });
    expect(by('escrowOut')).toMatchObject({ landstar: -500, app: null });
  });
});

describe('returned advances in the ledger', () => {
  it('subtracts an advance saved negative from the advances total', () => {
    const rows = buildLedger([{ description: 'CARD PRE-TRIP', amount: -1000 }, { description: 'UA CARD PRE-TRIP', amount: 300 }] as never, [
      { expense_type: 'Advance', amount: 1000, description: 'CARD PRE-TRIP' },
      { expense_type: 'Advance', amount: -300, description: 'UA CARD PRE-TRIP' },
    ] as never).rows;
    const adv = rows.find((x) => x.category.key === 'advances')!;
    expect(adv.landstar).toBe(700);
    expect(adv.app).toBe(700);
  });
});
