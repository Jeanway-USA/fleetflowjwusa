import { describe, expect, it } from 'vitest';
import { latestPerType } from '@/lib/onboarding/reviewQueue';

const row = (driver_id: string, document_type: string, signed_at: string, id = `${driver_id}-${document_type}-${signed_at}`) => ({ id, driver_id, document_type, signed_at });

describe('review queue', () => {
  it('keeps only the newest signed copy of each document per driver', () => {
    const rows = [row('a', 'w4', '2026-01-01'), row('a', 'w4', '2026-05-01'), row('a', 'i9', '2026-02-01'), row('b', 'w4', '2026-03-01')];
    expect(latestPerType(rows).map((r) => r.id).sort()).toEqual(['a-i9-2026-02-01', 'a-w4-2026-05-01', 'b-w4-2026-03-01']);
  });

  it('does not depend on the order the rows arrive in', () => {
    const rows = [row('a', 'w4', '2026-05-01'), row('a', 'w4', '2026-01-01')];
    expect(latestPerType(rows)).toHaveLength(1);
    expect(latestPerType(rows)[0].signed_at).toBe('2026-05-01');
  });
});
