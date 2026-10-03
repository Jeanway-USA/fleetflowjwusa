// Client-side amortization math for truck loans.
// Pure functions — no side effects, no I/O.

export type AmortizationInputs = {
  /** Original financed principal (equipment cost - down payment + financing fees). */
  principal: number;
  /** Annual interest rate as a percent (e.g. 8.5 for 8.5%). */
  annualRatePct: number;
  /** Fixed monthly payment. */
  monthlyPayment: number;
  /** Total loan term in months. */
  termMonths: number;
  /** ISO date the loan started (YYYY-MM-DD). */
  loanStartDate: string;
  /** Sum of every recorded ledger payment (in $). */
  actualPaidToDate: number;
  /** Optional override for "today" — for tests. */
  today?: Date;
};

export type AmortizationResult = {
  scheduledPaymentsElapsed: number;
  scheduledPaidToDate: number;
  actualPaidToDate: number;
  remainingPrincipal: number;
  payoffProgressPct: number;
  estimatedPayoffDate: Date | null;
  monthlyRate: number;
};

const parseISODate = (iso: string): Date => new Date(iso + 'T00:00:00');

const monthsBetween = (start: Date, end: Date): number => {
  const y = end.getFullYear() - start.getFullYear();
  const m = end.getMonth() - start.getMonth();
  const dayAdj = end.getDate() >= start.getDate() ? 0 : -1;
  return Math.max(0, y * 12 + m + dayAdj);
};

/**
 * Standard amortized balance after n payments of M with monthly rate r on principal P:
 *   B(n) = P·(1+r)^n − M·((1+r)^n − 1)/r
 * Falls back to straight-line when rate is 0.
 */
const balanceAfter = (P: number, r: number, M: number, n: number): number => {
  if (n <= 0) return P;
  if (r <= 0) return Math.max(0, P - M * n);
  const growth = Math.pow(1 + r, n);
  return P * growth - M * ((growth - 1) / r);
};

/**
 * Months to pay off balance B at payment M and monthly rate r:
 *   n = −ln(1 − rB/M) / ln(1 + r)
 * Returns null when the payment never covers the interest.
 */
const estimatePayoffDate = (B: number, r: number, M: number, from: Date): Date | null => {
  if (B <= 0) return from;
  if (M <= 0) return null;
  let n: number;
  if (r <= 0) {
    n = B / M;
  } else {
    if (M <= r * B) return null;
    n = -Math.log(1 - (r * B) / M) / Math.log(1 + r);
  }
  return new Date(from.getFullYear(), from.getMonth() + Math.ceil(n), from.getDate());
};

export function computeAmortization(inputs: AmortizationInputs): AmortizationResult {
  const {
    principal,
    annualRatePct,
    monthlyPayment,
    termMonths,
    loanStartDate,
    actualPaidToDate,
    today = new Date(),
  } = inputs;

  const monthlyRate = (annualRatePct || 0) / 100 / 12;
  const start = loanStartDate ? parseISODate(loanStartDate) : null;

  const scheduledPaymentsElapsed = start
    ? Math.min(termMonths || 0, monthsBetween(start, today))
    : 0;
  const scheduledPaidToDate = scheduledPaymentsElapsed * (monthlyPayment || 0);

  // Balance on schedule, then adjust for the difference between what was actually
  // paid and what was scheduled. Overpayments go straight to principal; shortfalls
  // stay on the balance. (Approximation: ignores interest on the timing of the gap.)
  const scheduledBalance = balanceAfter(principal || 0, monthlyRate, monthlyPayment || 0, scheduledPaymentsElapsed);
  const paymentGap = (actualPaidToDate || 0) - scheduledPaidToDate;
  const remainingPrincipal = Math.max(0, scheduledBalance - paymentGap);

  const payoffProgressPct = principal > 0
    ? Math.min(100, Math.max(0, (1 - remainingPrincipal / principal) * 100))
    : 0;

  const estimatedPayoffDate = estimatePayoffDate(remainingPrincipal, monthlyRate, monthlyPayment || 0, today);

  return {
    scheduledPaymentsElapsed,
    scheduledPaidToDate,
    actualPaidToDate,
    remainingPrincipal,
    payoffProgressPct,
    estimatedPayoffDate,
    monthlyRate,
  };
}
