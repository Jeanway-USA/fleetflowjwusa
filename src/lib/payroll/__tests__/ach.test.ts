import { describe, expect, it } from 'vitest';
import { achProblems, achText, amountInWords, buildAchFile, routingValid, type AchCompany, type AchEntry } from '@/lib/payroll/ach';

// 021000021 (JPMorgan Chase) and 011401533 are real routing numbers that pass the checksum.
const company: AchCompany = { name: 'JeanWay USA', companyId: '1234567890', bankRouting: '021000021', bankName: 'Chase' };
const entries: AchEntry[] = [
  { name: 'Siadrak Jean', routing: '011401533', account: '123456789', accountType: 'checking', amountCents: 207713, idNumber: 'DRV001' },
  { name: 'Andrew Baker', routing: '021000021', account: '9988776655', accountType: 'savings', amountCents: 118969, idNumber: 'STF001' },
];
const when = new Date(2026, 9, 29, 14, 5);

describe('routing numbers', () => {
  it('accepts numbers that pass the bank checksum', () => {
    expect(routingValid('021000021')).toBe(true);
    expect(routingValid('011401533')).toBe(true);
  });
  it('rejects a wrong digit, wrong length or letters', () => {
    expect(routingValid('021000022')).toBe(false);
    expect(routingValid('12345678')).toBe(false);
    expect(routingValid('02100002A')).toBe(false);
  });
});

describe('direct deposit file', () => {
  const file = buildAchFile({ company, entries, effectiveDate: '2026-10-30', createdAt: when });
  const lines = file.text.trimEnd().split('\r\n');

  it('every line is exactly 94 characters and the file fills whole blocks of 10 lines', () => {
    expect(lines.every((l) => l.length === 94)).toBe(true);
    expect(lines.length % 10).toBe(0);
    expect(file.lineCount).toBe(lines.length);
  });

  it('has a file header, batch header, one entry per person, batch control and file control', () => {
    expect(lines.slice(0, 5).map((l) => l[0])).toEqual(['1', '5', '6', '6', '8']);
    expect(lines[5][0]).toBe('9');
    expect(lines[6]).toBe('9'.repeat(94));
  });

  it('puts the bank, company and date in the headers', () => {
    // record type, priority, destination (space + bank routing), origin (company ID), date, time, modifier, size, blocking, format, bank name
    expect(lines[0].slice(0, 63)).toBe(`101 0210000211234567890261029140${'5'}A094101${'CHASE'.padEnd(23)}`);
    expect(lines[1].slice(0, 4)).toBe('5220');
    expect(lines[1].slice(4, 20)).toBe('JEANWAY USA     ');
    expect(lines[1].slice(40, 50)).toBe('1234567890');
    expect(lines[1].slice(50, 53)).toBe('PPD');
    expect(lines[1].slice(69, 75)).toBe('261030');
  });

  it('writes each deposit with the right code, routing, account, amount and trace number', () => {
    const e1 = lines[2];
    expect(e1.slice(0, 3)).toBe('622'); // checking credit
    expect(e1.slice(3, 11)).toBe('01140153');
    expect(e1[11]).toBe('3');
    expect(e1.slice(12, 29)).toBe('123456789'.padEnd(17));
    expect(e1.slice(29, 39)).toBe('0000207713');
    expect(e1.slice(54, 76)).toBe('SIADRAK JEAN'.padEnd(22));
    expect(e1.slice(78, 94)).toBe('0' + '02100002' + '0000001');
    const e2 = lines[3];
    expect(e2.slice(0, 3)).toBe('632'); // savings credit
    expect(e2.slice(78, 94)).toBe('0' + '02100002' + '0000002');
  });

  it('totals and the hash agree with the entries', () => {
    const batch = lines[4];
    expect(batch.slice(4, 10)).toBe('000002');
    expect(batch.slice(10, 20)).toBe(String(1140153 + 2100002).padStart(10, '0'));
    expect(batch.slice(20, 32)).toBe('000000000000');
    expect(batch.slice(32, 44)).toBe(String(207713 + 118969).padStart(12, '0'));
    const control = lines[5];
    expect(control.slice(1, 7)).toBe('000001');
    expect(control.slice(7, 13)).toBe('000001');
    expect(control.slice(13, 21)).toBe('00000002');
    expect(control.slice(43, 55)).toBe(String(207713 + 118969).padStart(12, '0'));
    expect(file.totalCents).toBe(326682);
    expect(file.entryCount).toBe(2);
  });

  it('a file longer than one block rounds up', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...entries[0], idNumber: `D${i}` }));
    const f = buildAchFile({ company, entries: many, effectiveDate: '2026-10-30', createdAt: when });
    const l = f.text.trimEnd().split('\r\n');
    expect(l.length).toBe(20); // 1 + 1 + 12 + 1 + 1 = 16 lines, padded to 20
    expect(l[l.findIndex((x) => x[0] === '9' && x !== '9'.repeat(94))].slice(7, 13)).toBe('000002');
  });
});

describe('Truist file rules', () => {
  it('puts a blank and the 9-digit tax ID in the header origin when given, as Truist asks', () => {
    const f = buildAchFile({ company: { ...company, originId: '12-3456789' }, entries, effectiveDate: '2026-10-30', createdAt: when });
    expect(f.text.split('\r\n')[0].slice(13, 23)).toBe(' 123456789');
  });
  it('the batch company ID stays the 10-character ID, and the bank ID is the first 8 digits of the routing number', () => {
    const l = buildAchFile({ company: { ...company, bankRouting: '053101121', originId: '123456789' }, entries, effectiveDate: '2026-10-30', createdAt: when }).text.split('\r\n');
    expect(l[0].slice(3, 13)).toBe(' 053101121');
    expect(l[1].slice(40, 50)).toBe('1234567890');
    expect(l[1].slice(79, 87)).toBe('05310112');
    expect(l[1].slice(87, 94)).toBe('0000001');
    expect(l[4].slice(79, 87)).toBe('05310112');
  });
  it('a second file the same day takes the next letter', () => {
    const f = buildAchFile({ company, entries, effectiveDate: '2026-10-30', createdAt: when, fileIdModifier: 'b' });
    expect(f.text[33]).toBe('B');
    expect(() => buildAchFile({ company, entries, effectiveDate: '2026-10-30', createdAt: when, fileIdModifier: '!' })).toThrow(/file letter/);
  });
  it('refuses a weekend or a date that has passed', () => {
    expect(achProblems(company, entries, '2026-10-31', '2026-10-29').join(' ')).toMatch(/banking day/);
    expect(achProblems(company, entries, '2026-10-28', '2026-10-29').join(' ')).toMatch(/already passed/);
    expect(achProblems(company, entries, '2026-10-30', '2026-10-29')).toEqual([]);
  });
  it('refuses a tax ID that is not 9 digits', () => {
    expect(achProblems({ ...company, originId: '12345' }, entries, '2026-10-30').join(' ')).toMatch(/tax ID \(EIN\) must be 9 digits/);
  });
});

describe('problems the bank would refuse', () => {
  it('refuses a bad company routing, bad person routing and zero amounts, in plain words', () => {
    const p = achProblems({ ...company, bankRouting: '123456789' }, [{ ...entries[0], routing: '111111111', amountCents: 0 }], '2026-10-30');
    expect(p.join(' ')).toMatch(/bank routing number in Payroll settings/);
    expect(p.join(' ')).toMatch(/Siadrak Jean: the routing number is not valid/);
    expect(p.join(' ')).toMatch(/Siadrak Jean: the amount must be more than zero/);
  });
  it('refuses to build a bad file', () => {
    expect(() => buildAchFile({ company: { ...company, companyId: '12' }, entries, effectiveDate: '2026-10-30' })).toThrow(/10 characters/);
  });
  it('cleans names to what the format allows', () => {
    expect(achText("José O'Neil-Smith", 22)).toBe("JOS O'NEIL-SMITH".padEnd(22));
  });
});

describe('amount in words for checks', () => {
  it('writes dollars in words and cents as a fraction', () => {
    expect(amountInWords(1189.69)).toBe('One thousand one hundred eighty-nine and 69/100');
    expect(amountInWords(2077.13)).toBe('Two thousand seventy-seven and 13/100');
    expect(amountInWords(0.5)).toBe('Zero and 50/100');
    expect(amountInWords(100)).toBe('One hundred and 00/100');
    expect(amountInWords(12000000)).toBe('Twelve million and 00/100');
  });
});
