import { describe, expect, it } from 'vitest';
import { csvCell, csvLine, toCsv } from '@/lib/csv';

describe('csvCell', () => {
  it('defuses text a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe(`"'=HYPERLINK(""http://evil"",""click"")"`);
    expect(csvCell('+1+1')).toBe(`"'+1+1"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(csvCell('-cmd|calc')).toBe(`"'-cmd|calc"`);
    expect(csvCell('\tcmd')).toBe(`"'\tcmd"`);
  });

  it('leaves real numbers and number-looking text alone', () => {
    expect(csvCell(-12.5)).toBe('"-12.5"');
    expect(csvCell('-12.50')).toBe('"-12.50"');
    expect(csvCell('+3')).toBe('"+3"');
    expect(csvCell(0)).toBe('"0"');
  });

  it('quotes everything, doubles quotes, and writes blanks as empty', () => {
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('builds whole lines and files', () => {
    expect(csvLine(['x', 1, null])).toBe('"x","1",""');
    expect(toCsv(['A', 'B'], [['=1', 2]])).toBe(`"A","B"\n"'=1","2"`);
  });
});
