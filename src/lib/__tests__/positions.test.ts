import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITIONS, suggestFromPosition } from '@/lib/positions/defaults';
import { BUILTIN_DOCUMENTS } from '@/lib/positions/types';

describe('standard positions', () => {
  it('has every position the company asked for, each with a unique key', () => {
    expect(DEFAULT_POSITIONS.map((p) => p.name)).toEqual([
      'Owner-Operator', 'Company Driver', 'Lease Purchase', 'Dispatcher', 'Safety Manager', 'Mechanic', 'Broker', 'Admin', 'Custom',
    ]);
    expect(new Set(DEFAULT_POSITIONS.map((p) => p.key)).size).toBe(DEFAULT_POSITIONS.length);
  });

  it('links no pay package, since packages belong to the company', () => {
    expect(DEFAULT_POSITIONS.every((p) => p.default_pay_package_id === null)).toBe(true);
  });

  it('only asks for documents the onboarding flow knows how to collect', () => {
    const known = new Set(BUILTIN_DOCUMENTS.map((d) => d.key));
    for (const p of DEFAULT_POSITIONS) for (const d of p.required_documents) expect(known.has(d.key)).toBe(true);
  });

  it('gives contractors the 1099 forms and employees the W-2 forms', () => {
    const docs = (key: string) => DEFAULT_POSITIONS.find((p) => p.key === key)!.required_documents.map((d) => d.key);
    expect(docs('owner_operator')).toContain('w9');
    expect(docs('owner_operator')).not.toContain('w4');
    expect(docs('company_driver')).toContain('w4');
    expect(docs('company_driver')).not.toContain('w9');
  });

  it('gives every checklist step its own id', () => {
    for (const p of DEFAULT_POSITIONS) expect(new Set(p.onboarding_checklist.map((c) => c.id)).size).toBe(p.onboarding_checklist.length);
  });
});

describe('suggesting from a position', () => {
  const position = { ...DEFAULT_POSITIONS[1], default_pay_package_id: 'pkg-1' };

  it('suggests the linked pay package, role, onboarding, documents and checklist', () => {
    const s = suggestFromPosition(position, new Set(['pkg-1']));
    expect(s).toMatchObject({ payPackageId: 'pkg-1', role: 'driver', requiresOnboarding: true });
    expect(s.documents.length).toBeGreaterThan(0);
    expect(s.checklist.length).toBeGreaterThan(0);
  });

  it('does not suggest a package that has been archived or switched off', () => {
    expect(suggestFromPosition(position, new Set(['other'])).payPackageId).toBeNull();
  });

  it('suggests nothing for the package when none is linked', () => {
    expect(suggestFromPosition(DEFAULT_POSITIONS[0], new Set()).payPackageId).toBeNull();
  });
});

describe('mechanic position', () => {
  it('opens the account role that can use the shop floor', () => {
    expect(DEFAULT_POSITIONS.find((p) => p.key === 'mechanic')!.default_role).toBe('maintenance');
  });
});
