import { Fragment } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import type { TaxAuditSnapshot, TaxLine } from '@/lib/payroll/types';

interface Props {
  gross: number;
  /** Stored audit snapshot from the pay record, when the payee is W-2. */
  audit?: TaxAuditSnapshot | null;
  /** Non-tax deductions (advances, escrow, insurance…). */
  otherDeductions?: number;
  reimbursements?: number;
  netPay: number;
  /** Show the employer-side liability block (internal view only). */
  showEmployer?: boolean;
  className?: string;
  compact?: boolean;
}

function Row({
  label,
  value,
  muted,
  negative,
  note,
  bold,
}: {
  label: string;
  value: number;
  muted?: boolean;
  negative?: boolean;
  note?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <span className={cn('text-sm', muted && 'text-muted-foreground', bold && 'font-semibold')}>
          {label}
        </span>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <span
        className={cn(
          'text-sm tabular-nums whitespace-nowrap',
          bold && 'font-semibold',
          negative && 'text-destructive',
        )}
      >
        {negative ? `- ${formatCurrency(Math.abs(value))}` : formatCurrency(value)}
      </span>
    </div>
  );
}

/**
 * The single Gross → Taxes → Deductions → Net block used by settlement detail,
 * printable statements and W-2 pay stubs so every surface agrees.
 */
export function PayBreakdown({
  gross,
  audit,
  otherDeductions = 0,
  reimbursements = 0,
  netPay,
  showEmployer = false,
  className,
  compact,
}: Props) {
  const employeeLines: TaxLine[] = (audit?.lines ?? []).filter((l) => l.side === 'employee');
  const employerLines: TaxLine[] = (audit?.lines ?? []).filter((l) => l.side === 'employer');
  const totalTaxes = employeeLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return (
    <div className={cn('rounded-lg border border-border bg-card/50 p-4', className)}>
      <Row label="Gross pay" value={gross} bold />
      {reimbursements > 0 && <Row label="Reimbursements" value={reimbursements} />}

      {employeeLines.length > 0 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Taxes withheld
          </p>
          {employeeLines.map((l) => (
            <Fragment key={l.key}>
              <Row
                label={l.label}
                value={l.amount}
                negative
                note={
                  compact
                    ? undefined
                    : [
                        l.rate != null ? `${(l.rate * 100).toFixed(2)}%` : null,
                        l.taxableWages != null ? `on ${formatCurrency(l.taxableWages)}` : null,
                        l.note,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined
                }
              />
            </Fragment>
          ))}
          <Row label="Total taxes" value={totalTaxes} negative bold />
        </div>
      )}

      {otherDeductions > 0 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <Row label="Other deductions" value={otherDeductions} negative />
        </div>
      )}

      <div className="mt-2 border-t border-border pt-2">
        <Row label="Net pay" value={netPay} bold />
      </div>

      {showEmployer && employerLines.length > 0 && (
        <div className="mt-3 rounded-md bg-muted/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Employer liability (not withheld from pay)
          </p>
          {employerLines.map((l) => (
            <Row key={l.key} label={l.label} value={l.amount} muted />
          ))}
        </div>
      )}

      {audit && !compact && (
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Calculated {new Date(audit.calculatedAt).toLocaleString()} · tax year {audit.taxYear} ·
          IRS Pub 15-T percentage method ({audit.fit.tableSet === 'multiple_jobs' ? 'multiple jobs' : 'standard'} table),
          {' '}{audit.payFrequency} ({audit.periodsPerYear}/yr) · engine v{audit.engineVersion}
          {audit.profile?.usedDefaults ? ' · no signed W-4 on file, defaults applied' : ''}
          {audit.override
            ? ` · manual override: computed ${formatCurrency(audit.override.computed)}, applied ${formatCurrency(audit.override.applied)} — ${audit.override.reason}`
            : ''}
        </p>
      )}
    </div>
  );
}
