import { describe, expect, it } from 'vitest';
import { buildLadder, condensedAddress, ladderProgress, nextStatusOf, progressLabel, statusLabel, tripStage } from '@/lib/driver/load';

const load = (status: string) => ({ status, origin: '100 Dock Rd, Orlando, FL 32801', destination: '9 Main St, Reading, PA 19601' });
const stop = (n: number, status: string | null, over: Record<string, unknown> = {}) => ({ id: `s${n}`, stop_number: n, stop_type: 'delivery', facility_name: `Dock ${n}`, location: 'Edison, NJ', scheduled_date: null, status, completed_at: null, ...over });

describe('moving a load on', () => {
  it('goes pending, assigned, loading, in transit, delivered, and stops there', () => {
    expect(nextStatusOf('pending')).toBe('assigned');
    expect(nextStatusOf('assigned')).toBe('loading');
    expect(nextStatusOf('loading')).toBe('in_transit');
    expect(nextStatusOf('in_transit')).toBe('delivered');
    expect(nextStatusOf('delivered')).toBeNull();
    expect(nextStatusOf('cancelled')).toBeNull();
  });

  it('names each button for what the driver is doing', () => {
    expect(progressLabel('assigned')).toBe('Arrived at pickup');
    expect(progressLabel('in_transit')).toBe('Mark delivered');
    expect(progressLabel('delivered')).toBe('');
    expect(statusLabel('in_transit')).toBe('In transit');
  });
});

describe('condensedAddress', () => {
  it('keeps city and state', () => {
    expect(condensedAddress('1234 Dock Rd, Reading, PA 19601')).toBe('Reading, PA');
    expect(condensedAddress('Reading, PA')).toBe('Reading, PA');
  });
  it('copes with empty and odd input', () => {
    expect(condensedAddress(null)).toBe('-');
    expect(condensedAddress('')).toBe('-');
    expect(condensedAddress('Dock 4')).toBe('Dock 4');
  });
});

describe('the trip as a ladder', () => {
  it('is pickup then delivery when there are no stops, and the next stop is pickup before arriving', () => {
    const rows = buildLadder(load('assigned'), []);
    expect(rows.map((r) => r.kind)).toEqual(['pickup', 'delivery']);
    expect(rows.map((r) => r.next)).toEqual([true, false]);
    expect(rows[0].place).toBe('Orlando, FL');
  });

  it('marks pickup passed once the load is in transit, so the next stop is the first pending stop', () => {
    const rows = buildLadder(load('in_transit'), [stop(2, 'pending'), stop(1, 'completed')]);
    expect(rows.map((r) => [r.kind, r.index, r.done, r.next])).toEqual([
      ['pickup', 1, true, false],
      ['stop', 2, true, false],
      ['stop', 3, false, true],
      ['delivery', 4, false, false],
    ]);
  });

  it('orders stops by stop number whatever order they arrive in', () => {
    const rows = buildLadder(load('in_transit'), [stop(3, 'pending'), stop(1, 'pending'), stop(2, 'pending')]);
    expect(rows.filter((r) => r.kind === 'stop').map((r) => r.place)).toEqual(['Dock 1', 'Dock 2', 'Dock 3']);
  });

  it('has delivery as the next stop once every stop is done', () => {
    const rows = buildLadder(load('in_transit'), [stop(1, 'completed')]);
    expect(rows[rows.length - 1]).toMatchObject({ kind: 'delivery', next: true });
  });

  it('is all done with no next stop when delivered', () => {
    const rows = buildLadder(load('delivered'), [stop(1, 'completed')]);
    expect(rows.every((r) => r.done)).toBe(true);
    expect(rows.some((r) => r.next)).toBe(false);
    expect(ladderProgress(rows)).toEqual({ done: 3, total: 3 });
  });

  it('shows nothing as next for a cancelled load', () => {
    expect(buildLadder(load('cancelled'), []).some((r) => r.next)).toBe(false);
  });

  it('uses the stop location when a stop has no facility name', () => {
    const rows = buildLadder(load('in_transit'), [stop(1, 'pending', { facility_name: null, location: 'Camden, NJ' })]);
    expect(rows[1].place).toBe('Camden, NJ');
  });

  it('knows the stage of every status', () => {
    expect(['pending', 'assigned', 'loading', 'in_transit', 'delivered'].map(tripStage)).toEqual([0, 0, 1, 2, 3]);
  });
});

import { appointmentText } from '@/lib/driver/load';

describe('appointmentText', () => {
  it('says what kind of appointment it is in plain words', () => {
    expect(appointmentText('window', '08:00', '17:00')).toEqual({ kind: 'window', text: 'Open window 08:00 to 17:00', label: 'Open window' });
    expect(appointmentText('window', '08:00')).toEqual({ kind: 'window', text: 'Open window from 08:00', label: 'Open window' });
    expect(appointmentText('fcfs', '06:00')).toEqual({ kind: 'fcfs', text: 'First come first served from 06:00', label: 'First come first served' });
    expect(appointmentText('appt', '13:30')).toEqual({ kind: 'appointment', text: 'Appointment 13:30', label: 'Appointment' });
    expect(appointmentText(null, '13:30')?.kind).toBe('appointment');
  });
  it('gives nothing when there is no time', () => {
    expect(appointmentText('window', null)).toBeNull();
  });
});

import { shortDate } from '@/lib/driver/load';

describe('shortDate', () => {
  it('keeps the calendar day and ignores the time zone', () => {
    expect(shortDate('2026-10-20')).toBe('Tue Oct 20');
    expect(shortDate('2026-01-01')).toBe('Thu Jan 1');
  });
  it('gives nothing for a missing or odd date', () => {
    expect(shortDate(null)).toBeNull();
    expect(shortDate('soon')).toBeNull();
  });
});

import { splitInstructions } from '@/lib/driver/load';

describe('splitInstructions', () => {
  it('returns the plain text when there is no stops list', () => {
    expect(splitInstructions('Call before arrival.')).toEqual({ main: 'Call before arrival.', stops: '' });
  });
  it('separates the intermediate stops list from the main text', () => {
    const r = splitInstructions('Call before arrival.\n=== INTERMEDIATE STOPS ===\nStop 1 Comfort Air\nStop 2 RSD');
    expect(r.main).toBe('Call before arrival.');
    expect(r.stops).toBe('Stop 1 Comfort Air\nStop 2 RSD');
  });
  it('drops anything after the rate confirmation update marker', () => {
    expect(splitInstructions('Original note.\n--- Updated from Rate Confirmation ---\nNew rate stuff').main).toBe('Original note.');
  });
  it('handles empty and missing notes', () => {
    expect(splitInstructions(null)).toEqual({ main: '', stops: '' });
    expect(splitInstructions('')).toEqual({ main: '', stops: '' });
  });
});
