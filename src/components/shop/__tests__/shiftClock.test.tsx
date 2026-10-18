import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ShiftClock } from '@/components/shop/ShiftClock';

const state = vi.hoisted(() => ({ ready: true, shift: null as any }));
const mutate = vi.hoisted(() => ({ clockIn: vi.fn(), clockOut: vi.fn(), mealStart: vi.fn(), mealEnd: vi.fn() }));

vi.mock('@/hooks/useShift', () => ({
  useMyShift: () => ({ ready: state.ready, shift: state.shift, isLoading: false }),
  useShiftActions: () => ({
    clockIn: { mutate: mutate.clockIn, isPending: false },
    clockOut: { mutate: mutate.clockOut, isPending: false },
    mealStart: { mutate: mutate.mealStart, isPending: false },
    mealEnd: { mutate: mutate.mealEnd, isPending: false },
  }),
}));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const shift = (over: Record<string, unknown> = {}) => ({ id: 's', userId: 'u', userName: 'Sam', startedAt: hoursAgo(2), endedAt: null, mealMinutes: 0, mealStartedAt: null, ...over });

describe('the shift clock', () => {
  beforeEach(() => { Object.values(mutate).forEach((m) => m.mockClear()); state.ready = true; state.shift = null; });

  it('shows nothing until the shift upgrade is applied', () => {
    state.ready = false;
    const { container } = render(<ShiftClock />);
    expect(container.firstChild).toBeNull();
  });

  it('offers Clock in when not clocked in, and clocks in on tap', () => {
    render(<ShiftClock />);
    expect(screen.getByText('Not clocked in')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /clock in/i }));
    expect(mutate.clockIn).toHaveBeenCalledTimes(1);
  });

  it('shows the running shift with meal break and clock out', () => {
    state.shift = shift();
    render(<ShiftClock />);
    expect(screen.getByText('You are clocked in')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /lunch/i }));
    expect(mutate.mealStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /clock out/i }));
    expect(mutate.clockOut).toHaveBeenCalledTimes(1);
  });

  it('shows lunch as paid, however long, and offers Back to work', () => {
    state.shift = shift({ mealStartedAt: new Date(Date.now() - 55 * 60_000).toISOString() });
    render(<ShiftClock />);
    expect(screen.getByText('At lunch')).toBeTruthy();
    expect(screen.getByText('Lunch is paid time.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /back to work/i }));
    expect(mutate.mealEnd).toHaveBeenCalledTimes(1);
  });

  it('warns after 10 hours and says what happens at 12', () => {
    state.shift = shift({ startedAt: hoursAgo(10.5) });
    render(<ShiftClock />);
    expect(screen.getByText(/more than 10 hours/i)).toBeTruthy();
    expect(screen.getByText(/stops itself at 12 hours/i)).toBeTruthy();
  });

  it('does not warn on a normal shift', () => {
    state.shift = shift({ startedAt: hoursAgo(8) });
    render(<ShiftClock />);
    expect(screen.queryByText(/more than 10 hours/i)).toBeNull();
  });
});
