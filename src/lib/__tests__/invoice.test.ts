import { describe, expect, it } from 'vitest';
import { fallbackSummary, invoiceFileProblem, invoiceNotes, matchTruck, normalizeInvoice, partsFrom, toIsoDate, toNumber } from '@/lib/shop/invoice';

const ctx = { allowedKinds: ['pm', 'M1', 'tire', 'brake', 'inspection', 'repair'], today: '2026-11-06' };

// What a good reading of the two real invoices looks like (INVOICE_5054 from Reliable Road Service, and the Force TK
// Thermo King service order BWO025116), written out from the printed amounts.
const reliable = {
  vendor: 'Reliable Road Service', invoice_number: '5054', invoice_date: '2026-11-06', service_date: null,
  truck_unit: null, odometer_miles: null, engine_hours: null, work_kinds: ['repair'],
  summary: 'Replaced the air compressor and its discharge line, O-rings and mounting, and refilled coolant.',
  line_items: [
    { kind: 'fee', description: 'Service Call Out', quantity: 1, unit_price: 125, amount: 125 },
    { kind: 'labor', description: 'Hourly Rate. Includes the drive time to and from the unit plus the time onsite', quantity: 12, unit_price: 165, amount: 1980 },
    { kind: 'part', description: 'Hose (per ft)', quantity: 4, unit_price: 27, amount: 108 },
    { kind: 'part', description: 'High pressure air fitting', quantity: 4, unit_price: 4, amount: 16 },
    { kind: 'part', description: 'Coolant line', quantity: 1, unit_price: 43.49, amount: 43.49 },
    { kind: 'part', description: 'O-ring', quantity: 1, unit_price: 25.79, amount: 25.79 },
    { kind: 'part', description: 'O-ring', quantity: 1, unit_price: 9.7, amount: 9.7 },
    { kind: 'part', description: 'Bracket', quantity: 1, unit_price: 16.61, amount: 16.61 },
    { kind: 'part', description: 'Air compressor unloader', quantity: 1, unit_price: 178.63, amount: 178.63 },
    { kind: 'part', description: 'Compressor discharge hose', quantity: 1, unit_price: 176.99, amount: 176.99 },
    { kind: 'part', description: 'Freightliner air compressor metal discharge line', quantity: 1, unit_price: 178.69, amount: 178.69 },
    { kind: 'part', description: 'Air compressor', quantity: 1, unit_price: 1495.69, amount: 1495.69 },
    { kind: 'part', description: 'Coolant', quantity: 7, unit_price: 21, amount: 147 },
  ],
  subtotal: 4501.59, tax: 183.12, discount: 3000, other_fees: null, total: 1684.71,
  confidence: { vendor: 95, truck: 0, date: 95, work: 80, totals: 95 }, warnings: [],
};

const forceTk = {
  vendor: 'Force TK', invoice_number: 'BWO025116', invoice_date: '2026-08-05', service_date: null,
  truck_unit: '433780', odometer_miles: null, engine_hours: 16903.2, work_kinds: ['repair'],
  summary: 'Replaced the compressor and main drive belt on the APU after a shredded belt, and did a full preventive service and vacuum test.',
  line_items: [
    { kind: 'part', description: 'PAG oil compressor 8oz', part_number: '2030502', quantity: 1, unit_price: 55.45, amount: 55.45 },
    { kind: 'part', description: 'Belt 6PK EL46.5', part_number: '782093', quantity: 1, unit_price: 45.26, amount: 45.26 },
    { kind: 'part', description: 'Compressor w/ clutch and manifold', part_number: '1021290', quantity: 1, unit_price: 617.77, amount: 617.77 },
    { kind: 'part', description: 'PM kit Evolution', part_number: '100473', quantity: 1, unit_price: 74.7, amount: 74.7 },
    { kind: 'part', description: 'Valve 13mm SSV', part_number: '70R5120', quantity: 1, unit_price: 3.4, amount: 3.4 },
    { kind: 'part', description: 'Valve 16mm SSV', part_number: '70R5125', quantity: 1, unit_price: 4.12, amount: 4.12 },
    { kind: 'part', description: 'Refrigerant R134A', part_number: '2030741', quantity: 2, unit_price: 26.19, amount: 52.38 },
    { kind: 'labor', description: 'Diagnosis of code', quantity: 1, unit_price: 160.2, amount: 160.2 },
    { kind: 'labor', description: 'R&R compressor', quantity: 1, unit_price: 288.36, amount: 288.36 },
    { kind: 'labor', description: 'Run and check operations', quantity: 1, unit_price: 76.9, amount: 76.9 },
    { kind: 'labor', description: 'Complete PM service', quantity: 1, unit_price: 192.24, amount: 192.24 },
    { kind: 'labor', description: 'Check recovery, repair, evacuate and charge', quantity: 1, unit_price: 249.91, amount: 249.91 },
  ],
  // "SUB TOTAL 1,992.16" on this invoice already includes tax; the environmental charge is only in the totals block.
  subtotal: 1992.16, tax: 125.97, discount: null, other_fees: 45.5, total: 1992.16,
  confidence: { vendor: 90, truck: 90, date: 95, work: 85, totals: 95 }, warnings: [],
};

describe('reading numbers and dates', () => {
  it('turns money text into numbers and rejects the rest', () => {
    expect(toNumber('$1,234.50')).toBe(1234.5);
    expect(toNumber('(12.00)')).toBe(-12);
    expect(toNumber(42)).toBe(42);
    expect(toNumber('n/a')).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber(undefined)).toBeNull();
  });
  it('accepts only real calendar dates', () => {
    expect(toIsoDate('2026-11-06')).toBe('2026-11-06');
    expect(toIsoDate('2026-02-30')).toBeNull();
    expect(toIsoDate('11/06/2026')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });
});

describe('the Reliable Road Service invoice', () => {
  const p = normalizeInvoice(reliable, ctx);
  it('keeps the vendor, number and date', () => {
    expect(p).toMatchObject({ vendor: 'Reliable Road Service', invoiceNumber: '5054', workDate: '2026-11-06', truckUnit: null, workKinds: ['repair'] });
  });
  it('adds up: the items equal the subtotal, and subtotal plus tax less the discount equals the total', () => {
    expect(p.math.itemsTotal).toBe(4501.59);
    expect(p.math.ok).toBe(true);
    expect(p.warnings).toEqual([]);
    expect(p.cost).toBe(1684.71);
  });
  it('splits the cost into parts, labor and fees', () => {
    expect(p.byKind).toEqual({ part: 2396.59, labor: 1980, fee: 125, other: 0 });
  });
  it('writes notes that show where the cost came from', () => {
    expect(invoiceNotes(p)).toBe('Invoice #5054 from Reliable Road Service dated 2026-11-06\nParts $2,396.59 · Labor $1,980.00 · Fees $125.00 · Tax $183.12 · Discount -$3,000.00 · Total $1,684.71');
  });
  it('lists the parts to save with the job, not the labor or call-out', () => {
    const parts = partsFrom(p);
    expect(parts).toHaveLength(11);
    expect(parts[0]).toMatchObject({ name: 'Hose (per ft)', quantity: 4, unitCost: 27 });
    expect(parts.every((x) => x.quantity > 0 && x.unitCost > 0)).toBe(true);
  });
});

describe('the Force TK Thermo King service order', () => {
  const p = normalizeInvoice(forceTk, ctx);
  it('finds the truck number and treats the unit hours as hours, not miles', () => {
    expect(p).toMatchObject({ vendor: 'Force TK', invoiceNumber: 'BWO025116', truckUnit: '433780', odometer: null, engineHours: 16903.2, workDate: '2026-08-05' });
  });
  it('adds up even though the printed sub total already includes tax and the environmental charge is only in the totals', () => {
    expect(p.byKind.part).toBe(853.08);
    expect(p.byKind.labor).toBe(967.61);
    expect(p.math.ok).toBe(true);
    expect(p.cost).toBe(1992.16);
  });
  it('keeps part numbers', () => {
    expect(partsFrom(p).find((x) => x.number === '1021290')).toMatchObject({ name: 'Compressor w/ clutch and manifold', unitCost: 617.77 });
  });
  it('mentions the unit hours in the notes', () => {
    expect(invoiceNotes(p)).toMatch(/Unit hours at service: 16903.2/);
  });
});

describe('a misread invoice is flagged, not trusted', () => {
  it('warns when the items do not reach the total', () => {
    const bad = { ...reliable, line_items: reliable.line_items.map((l, i) => (i === 11 ? { ...l, amount: 149.69, unit_price: 149.69 } : l)) };
    const p = normalizeInvoice(bad, ctx);
    expect(p.math.ok).toBe(false);
    expect(p.warnings.join(' ')).toMatch(/items add up to \$3155\.59, but the invoice subtotal is \$4501\.59/);
  });
  it('also catches a misread line when the invoice prints no subtotal', () => {
    const bad = { ...reliable, subtotal: null, line_items: reliable.line_items.map((l, i) => (i === 11 ? { ...l, amount: 149.69, unit_price: 149.69 } : l)) };
    const p = normalizeInvoice(bad, ctx);
    expect(p.math.ok).toBe(false);
    expect(p.warnings.join(' ')).toMatch(/items add up to \$3155\.59, but the invoice total is \$1684\.71/);
  });
  it('uses the items to work out the cost when no total was found', () => {
    const p = normalizeInvoice({ ...forceTk, total: null, subtotal: null, other_fees: null }, ctx);
    expect(p.total).toBeNull();
    expect(p.math.ok).toBeNull();
    expect(p.cost).toBe(1946.66); // 1820.69 of items + 125.97 tax
    expect(p.warnings.join(' ')).toMatch(/No invoice total was found/);
  });
  it('drops work kinds we do not offer, bad dates and junk lines', () => {
    const p = normalizeInvoice({ vendor: ' Acme ', invoice_date: '2026-13-01', work_kinds: ['repair', 'wash', 5], line_items: [{ description: '', amount: 5 }, { description: 'Bolt', amount: '$2.50', kind: 'widget' }, null], total: '2.50' }, ctx);
    expect(p.workKinds).toEqual(['repair']);
    expect(p.invoiceDate).toBeNull();
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]).toMatchObject({ kind: 'other', amount: 2.5, quantity: 1, unitPrice: 2.5 });
    expect(p.vendor).toBe('Acme');
  });
  it('never logs work dated in the future', () => {
    const p = normalizeInvoice({ ...reliable, invoice_date: '2026-12-25' }, ctx);
    expect(p.workDate).toBeNull();
    expect(p.warnings.join(' ')).toMatch(/in the future/);
  });
  it('prefers the service date over the invoice date', () => {
    expect(normalizeInvoice({ ...reliable, service_date: '2026-11-02' }, ctx).workDate).toBe('2026-11-02');
  });
  it('treats a negative discount as the amount taken off, and ignores nonsense mileage', () => {
    const p = normalizeInvoice({ ...reliable, discount: '-3000', odometer_miles: 99999999 }, ctx);
    expect(p.discount).toBe(3000);
    expect(p.math.ok).toBe(true);
    expect(p.odometer).toBeNull();
  });
  it('copes with something that is not an object', () => {
    const p = normalizeInvoice('garbage', ctx);
    expect(p.lines).toEqual([]);
    expect(p.cost).toBe(0);
  });
});

describe('matching the truck', () => {
  const trucks = [{ id: 'a', unit_number: '433780' }, { id: 'b', unit_number: 'T-12' }, { id: 'c', unit_number: '1205' }, { id: 'd', unit_number: '120' }];
  it('matches a number exactly, ignoring punctuation and case', () => {
    expect(matchTruck('433780', trucks)).toBe('a');
    expect(matchTruck('t12', trucks)).toBe('b');
    expect(matchTruck('Truck 433780', trucks)).toBe('a');
  });
  it('returns nothing for no number, an unknown number or an ambiguous one', () => {
    expect(matchTruck(null, trucks)).toBeNull();
    expect(matchTruck('999999', trucks)).toBeNull();
    expect(matchTruck('12', [{ id: 'x', unit_number: '12' }, { id: 'y', unit_number: '12' }])).toBeNull();
  });
});

describe('summaries and files', () => {
  it('falls back to the biggest items when there is no summary', () => {
    expect(fallbackSummary(normalizeInvoice(forceTk, ctx))).toBe('Per invoice: Compressor w/ clutch and manifold, R&R compressor, Check recovery, repair, evacuate and charge.');
    expect(fallbackSummary({ lines: [] })).toBeNull();
  });
  it('accepts PDFs and photos only, under 12 MB', () => {
    expect(invoiceFileProblem({ size: 1000, type: 'application/pdf', name: 'a.pdf' })).toBeNull();
    expect(invoiceFileProblem({ size: 1000, type: '', name: 'scan.PDF' })).toBeNull();
    expect(invoiceFileProblem({ size: 1000, type: 'image/jpeg', name: 'a.jpg' })).toBeNull();
    expect(invoiceFileProblem({ size: 1000, type: 'text/plain', name: 'a.txt' })).toMatch(/PDF or a photo/);
    expect(invoiceFileProblem({ size: 13 * 1024 * 1024, type: 'application/pdf', name: 'a.pdf' })).toMatch(/12 MB/);
    expect(invoiceFileProblem({ size: 0, type: 'application/pdf', name: 'a.pdf' })).toMatch(/empty/);
  });
});
