import type { Database } from '@/integrations/supabase/types';

type Expense = Database['public']['Tables']['expenses']['Row'];

export const EXPENSE_TYPES = [
  'Fuel', 'DEF', 'Fuel Discount', 'Reimbursement', 'Truck Payment', 'Trailer Payment',
  'Licensing/Permits', 'Registration/Plates', 'Insurance', 'LCN/Satellite', 'Maintenance',
  'Cell Phone', 'Trip Scanning', 'Card Load', 'Card Fee', 'Cash Advance', 'Direct Deposit Fee',
  'Advance', 'Direct Deposit',
  'Truck Warranty', 'CPP/Benefits', 'IFTA', 'PrePass/Scale', 'Tolls', 'Parking', 'Misc'
];

export const GALLONS_EXPENSE_TYPES = ['Fuel', 'DEF'];

// Advance types are non-P&L (early access to funds, not true expenses)
export const ADVANCE_EXPENSE_TYPES = ['Advance', 'Cash Advance', 'Card Load', 'Direct Deposit'];

// Credit types offset expenses (money coming back)
export const CREDIT_EXPENSE_TYPES = ['Reimbursement', 'Fuel Discount'];

export const isAdvanceExpense = (expense: Expense): boolean => {
  return ADVANCE_EXPENSE_TYPES.includes(expense.expense_type) ||
    (expense.notes?.includes('Advance (Non-P&L)') ?? false);
};

export const isCreditExpense = (expense: Expense): boolean => {
  return CREDIT_EXPENSE_TYPES.includes(expense.expense_type) || expense.amount < 0;
};

export const isActualExpense = (expense: Expense): boolean => {
  return !isAdvanceExpense(expense) && !isCreditExpense(expense);
};
