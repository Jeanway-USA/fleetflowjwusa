import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LaneBoard } from '@/components/shop/board/LaneBoard';
import { PulseStrip } from '@/components/shop/board/PulseStrip';
import { summarize, type ShopJob } from '@/lib/shop/board';

const job = (over: Partial<ShopJob>): ShopJob => ({
  id: 'j', truckId: 't', unit: '101', truckName: 'Freightliner Cascadia', odometer: 100000, status: 'open', serviceType: 'pm', serviceTypes: [], description: null,
  entryDate: '2026-10-12', estimatedCompletion: null, startedAt: null, assignedTo: null, assignedName: null, priority: 'normal', bay: null, blockedReason: null,
  costEstimate: 0, tasksTotal: 0, tasksDone: 0, partsCount: 0, partsCost: 0, laborMinutes: 0, runningTimer: null, ...over,
});

const jobs = [
  job({ id: '1', unit: '433780', status: 'open', priority: 'high', serviceType: 'tire' }),
  job({ id: '2', unit: '101', status: 'in_progress', tasksTotal: 4, tasksDone: 2, assignedName: 'Sam Rivera' }),
  job({ id: '3', unit: '102', status: 'parts_ordered', blockedReason: 'Waiting on a part: steer tire' }),
  job({ id: '4', unit: '103', status: 'in_progress', tasksTotal: 2, tasksDone: 2 }),
];

describe('the shop board', () => {
  it('shows every truck in the lane it belongs to, with what it is waiting on', () => {
    render(<MemoryRouter><LaneBoard jobs={jobs} jobPath={(id) => `/shop/jobs/${id}`} /></MemoryRouter>);
    const lane = (name: string) => within(screen.getByRole('region', { name }));
    expect(lane('Up next').getByText('433780')).toBeTruthy();
    expect(lane('On the lift').getByText('101')).toBeTruthy();
    expect(lane('Waiting').getByText('102')).toBeTruthy();
    expect(lane('Waiting').getByText('Waiting on a part: steer tire')).toBeTruthy();
    expect(lane('Ready to close').getByText('103')).toBeTruthy();
  });

  it('links each card to its job', () => {
    render(<MemoryRouter><LaneBoard jobs={jobs} jobPath={(id) => `/shop/jobs/${id}`} /></MemoryRouter>);
    expect(screen.getByText('433780').closest('a')?.getAttribute('href')).toBe('/shop/jobs/1');
  });

  it('puts clear messages in empty lanes', () => {
    render(<MemoryRouter><LaneBoard jobs={[]} jobPath={() => '/'} /></MemoryRouter>);
    expect(screen.getAllByText('Clear')).toHaveLength(4);
  });

  it('summarizes the board in the pulse strip', () => {
    render(<PulseStrip summary={summarize(jobs)} fleetSize={5} doneToday={3} />);
    expect(screen.getByText('Trucks in the shop')).toBeTruthy();
    expect(screen.getByText('of 5 in the fleet', { exact: false })).toBeTruthy();
    expect(screen.getByText('Finished today')).toBeTruthy();
  });
});
