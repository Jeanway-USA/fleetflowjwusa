import { describe, expect, it } from 'vitest';
import { nextStop } from '../next-stop';

const base = { origin: 'Calgary, AB', destination: 'Denver, CO', pickup_date: '2026-11-19', delivery_date: '2026-11-21' };

describe('nextStop', () => {
  it('heads for the pickup until the load is picked up', () => {
    for (const status of ['assigned', 'loading', 'at_pickup']) {
      const s = nextStop({ ...base, status });
      expect(s.verb).toBe('Pickup');
      expect(s.place).toContain('Calgary');
      expect(s.when).toBe('Thu Nov 19');
    }
  });

  it('heads for the delivery once the load is moving', () => {
    for (const status of ['in_transit', 'at_delivery', 'unloading']) {
      const s = nextStop({ ...base, status });
      expect(s.verb).toBe('Delivery');
      expect(s.place).toContain('Denver');
      expect(s.when).toBe('Sat Nov 21');
    }
  });

  it('copes with missing places and dates', () => {
    const s = nextStop({ status: 'in_transit', origin: null, destination: null, pickup_date: null, delivery_date: null });
    expect(s.place).toBe('Unknown');
    expect(s.when).toBeNull();
  });
});
