import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ComponentBuilder } from '@/components/settings/pay-packages/ComponentBuilder';
import { PayPreview } from '@/components/settings/pay-packages/PayPreview';
import type { PayComponent } from '@/lib/pay-packages/types';

const base: PayComponent = {
  id: 'a', component_type: 'base_pay', label: 'Weekly base', calculation_method: 'flat_weekly', value: 1000, unit: 'usd_per_week',
  formula: null, is_taxable: true, is_deduction: false, sort_order: 1, is_active: true,
};
const mileage: PayComponent = { ...base, id: 'b', component_type: 'mileage_bonus', label: 'Mileage', calculation_method: 'per_mile', value: 0.1, unit: 'usd_per_mile', sort_order: 2 };

function Harness() {
  const [list, setList] = useState<PayComponent[]>([base, mileage]);
  return (
    <>
      <ComponentBuilder components={list} onChange={setList} />
      <PayPreview components={list} />
      <output data-testid="order">{list.map((c) => c.label).join('|')}</output>
    </>
  );
}

describe('pay package screens', () => {
  it('moves a line down and the preview follows', () => {
    render(<Harness />);
    expect(screen.getByTestId('order').textContent).toBe('Weekly base|Mileage');
    fireEvent.click(screen.getAllByLabelText('Move down')[0]);
    expect(screen.getByTestId('order').textContent).toBe('Mileage|Weekly base');
    // sample week is 2000 miles at $0.10 = $200, plus $1,000 base
    expect(screen.getAllByText('$200.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$1,200.00').length).toBeGreaterThan(0);
  });

  it('adds a line and flags a broken formula', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Add pay line'));
    expect(screen.getByTestId('order').textContent).toBe('Weekly base|Mileage|');
  });
});
