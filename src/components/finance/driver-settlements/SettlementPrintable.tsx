import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import {
  CORPORATE_HEADER,
  LEGAL_DISCLOSURE,
  statusLabel,
  type SettlementDocumentData,
  type SettlementStatusLabel,
} from '@/lib/settlement-document-data';

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy') : '—';
const fmtDateShort = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MM/dd/yyyy') : '—';
const fmtMiles = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const STATUS_STYLES: Record<SettlementStatusLabel, string> = {
  DRAFT: 'bg-zinc-200 text-zinc-800',
  PENDING: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  APPROVED: 'bg-slate-700 text-white',
  PAID: 'bg-emerald-600 text-white',
};

interface Props {
  data: SettlementDocumentData;
  /** @deprecated Voucher is now auto-rendered for every statement. */
  includeVoucher?: boolean;
}

export function SettlementPrintable({ data }: Props) {
  const { settlement, driver, reimbursementItems, deductionItems, breakdown, ytd } = data;
  const status = statusLabel(settlement.status);
  const driverName =
    `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim() || 'Driver';
  const driverIdLabel =
    driver?.landstar_operator_id ||
    (settlement.driver_id
      ? `ID ${String(settlement.driver_id).slice(0, 8).toUpperCase()}`
      : '—');
  const statementNo = String(settlement.id).slice(0, 8).toUpperCase();
  const driverIdShort = settlement.driver_id
    ? String(settlement.driver_id).slice(0, 8).toUpperCase()
    : '00000000';

  const isW2 = driver?.employment_type === 'w2_company';
  const wrapperTitle = isW2
    ? 'W-2 EARNINGS STATEMENT'
    : 'CONTRACTOR SETTLEMENT STATEMENT';

  const currentGross = Number(settlement.gross_pay ?? 0);
  const currentReimb = Number(settlement.reimbursements ?? 0);
  const currentDed = Number(settlement.deductions ?? 0);
  const taxWithholding = Number((settlement as any).tax_withholding ?? 0);
  const currentNet = isW2
    ? currentGross + currentReimb - currentDed - taxWithholding
    : currentGross + currentReimb - currentDed;
  const ytdNet = ytd.gross + ytd.reimbursements - ytd.deductions;

  return (
    <div className="max-w-4xl mx-auto bg-white text-zinc-900 shadow-sm print:shadow-none">
      {/* Top legacy system metadata line */}
      <div className="font-mono text-[10px] text-zinc-400 tracking-wider px-10 py-1 border-b border-zinc-100 whitespace-nowrap overflow-hidden">
        CO: JW&nbsp;&nbsp;&nbsp;&nbsp;FILE: {driverIdShort}&nbsp;&nbsp;&nbsp;&nbsp;DEPT: DISPATCH&nbsp;&nbsp;&nbsp;&nbsp;CLOCK: {driverIdShort}&nbsp;&nbsp;&nbsp;&nbsp;NUMBER: 00000000
      </div>

      <div className="p-8 print:p-0">
      {/* Header banner */}
      <header className="bg-zinc-900 text-white px-10 py-8 flex items-start justify-between gap-6 print:break-inside-avoid">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-wide">
            {CORPORATE_HEADER.name}
          </h1>
          <p className="text-sm tracking-normal text-zinc-300">
            {CORPORATE_HEADER.subtitle}
          </p>
          <p className="text-xs tracking-normal text-zinc-400">
            {CORPORATE_HEADER.address}
          </p>
        </div>
        <div className="text-right space-y-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-200 font-semibold">
            {wrapperTitle}
          </p>
          <p className="text-xs text-zinc-300">Statement #{statementNo}</p>
          <p className="text-xs text-zinc-300">
            Pay Period {fmtDateShort(settlement.period_start)} – {fmtDateShort(settlement.period_end)}
          </p>
          <p className="text-xs text-zinc-300">
            Payment Date {fmtDateShort(settlement.payment_date)}
          </p>
          <span
            className={`inline-block px-2.5 py-1 text-[11px] font-semibold tracking-wider rounded-none ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>
        </div>
      </header>

      {/* W-2 Tax & Withholding metadata block */}
      {isW2 && (
        <section className="border-t border-zinc-200 py-6 print:break-inside-avoid">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-3">
            Tax &amp; Withholding
          </h2>
          <div className="border border-zinc-200 rounded-none shadow-none overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-zinc-200">
              <TaxCell label="Filing Status" value="—" />
              <TaxCell label="Federal Allowances" value="—" />
              <TaxCell label="State Allowances" value="—" />
              <TaxCell label="State Code" value="—" />
            </div>
            <div className="border-t border-zinc-200">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-3 py-1 text-left font-semibold border-b border-zinc-200">Statutory Withholding</th>
                    <th className="px-3 py-1 text-right font-semibold border-b border-zinc-200">Current Period</th>
                    <th className="px-3 py-1 text-right font-semibold border-b border-zinc-200">Year-to-Date</th>
                  </tr>
                </thead>
                <tbody>
                  <WithholdingRow label="Federal Income Tax" current={taxWithholding} ytd={0} />
                  <WithholdingRow label="Social Security (6.2%)" current={currentGross * 0.062} ytd={ytd.gross * 0.062} />
                  <WithholdingRow label="Medicare (1.45%)" current={currentGross * 0.0145} ytd={ytd.gross * 0.0145} />
                  <WithholdingRow label="State Tax" current={0} ytd={0} />
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Statement details + Contractor/Employee information */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 py-6 border-t border-zinc-200 print:break-inside-avoid">
        <InfoTable title="Statement Details">
          <InfoRow label="Statement #" value={statementNo} />
          <InfoRow
            label="Pay Period"
            value={`${fmtDate(settlement.period_start)} – ${fmtDate(settlement.period_end)}`}
          />
          <InfoRow label="Payment Date" value={fmtDate(settlement.payment_date)} />
          <InfoRow label="Status" value={status} />
          <InfoRow label="Earnings Method" value={breakdown.methodLabel} />
        </InfoTable>

        <InfoTable title={isW2 ? 'Employee Information' : 'Contractor Information'}>
          <InfoRow label="Driver Name" value={driverName} />
          <InfoRow label="Driver ID" value={driverIdLabel} />
          <InfoRow label="Email" value={driver?.email || '—'} />
          <InfoRow label="Phone" value={driver?.phone || '—'} />
        </InfoTable>
      </section>

      {/* Load Earnings & Routes */}
      <section className="border-t border-zinc-200 py-6 print:break-inside-avoid">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-3">
          Load Earnings &amp; Routes
        </h2>
        <table className="w-full text-sm border-collapse border border-zinc-200 rounded-none shadow-none">
          <thead>
            <tr className="bg-zinc-900 text-white text-left text-[11px] uppercase tracking-wider">
              <th className="px-3 py-1 font-semibold">Date</th>
              <th className="px-3 py-1 font-semibold">Load #</th>
              <th className="px-3 py-1 font-semibold text-right">Miles</th>
              <th className="px-3 py-1 font-semibold">Status</th>
              <th className="px-3 py-1 font-semibold">Origin</th>
              <th className="px-3 py-1 font-semibold">Destination</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.loads.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-2 text-center text-zinc-500 italic border-b border-zinc-100"
                >
                  No loads recorded in this period
                </td>
              </tr>
            ) : (
              breakdown.loads.map((l) => (
                <tr
                  key={l.id}
                  className="align-top even:bg-slate-50/50 border-b border-zinc-100 print:break-inside-avoid"
                >
                  <td className="px-3 py-1 whitespace-nowrap">
                    {fmtDateShort(l.delivery_date ?? l.pickup_date)}
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap font-medium">
                    {l.landstar_load_id || l.id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    {fmtMiles(Number(l.booked_miles ?? l.actual_miles ?? 0))}
                  </td>
                  <td className="px-3 py-1 capitalize">
                    {(l.status ?? '—').replace(/_/g, ' ')}
                  </td>
                  <td className="px-3 py-1 whitespace-normal text-zinc-700">
                    {l.origin ?? '—'}
                  </td>
                  <td className="px-3 py-1 whitespace-normal text-zinc-700">
                    {l.destination ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Dual-column itemization: Earnings & Additions / Deductions & Escrows */}
      <section className="border-t border-zinc-200 py-6 print:break-inside-avoid">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ItemColumn title="Earnings & Additions">
            <ItemRow label={breakdown.methodLabel} value={breakdown.basePay} bold />
            {reimbursementItems.map((r) => (
              <ItemRow
                key={r.id}
                label={`Reimbursement — ${r.description ?? 'Other'}`}
                value={Number(r.amount ?? 0)}
              />
            ))}
            {reimbursementItems.length === 0 && (
              <ItemEmpty text="No reimbursements in this period" />
            )}
          </ItemColumn>

          <ItemColumn title="Deductions & Escrows">
            {deductionItems.length === 0 ? (
              <ItemEmpty text="No deductions in this period" />
            ) : (
              deductionItems.map((d) => (
                <ItemRow
                  key={d.id}
                  label={d.description ?? 'Deduction'}
                  value={-Math.abs(Number(d.amount ?? 0))}
                  negative
                />
              ))
            )}
          </ItemColumn>
        </div>
      </section>

      {/* Dual summary cards: CURRENT PERIOD vs YEAR-TO-DATE */}
      <section className="border-t border-zinc-200 py-6 print:break-inside-avoid">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SummaryCard
            title="Current Period"
            gross={currentGross}
            reimbursements={currentReimb}
            deductions={currentDed}
            taxWithholding={isW2 ? taxWithholding : undefined}
            net={currentNet}
          />
          <SummaryCard
            title="Year-to-Date"
            gross={ytd.gross}
            reimbursements={ytd.reimbursements}
            deductions={ytd.deductions}
            net={ytdNet}
          />
        </div>
        <p className="text-[11px] italic text-zinc-500 mt-3 text-center">
          {isW2
            ? 'Calculation Note: Net Pay = Gross Pay + Reimbursements − Deductions − Statutory Withholdings'
            : 'Calculation Note: Net Pay = Gross Pay + Reimbursements − Deductions'}
        </p>
      </section>

      {/* Legal footer */}
      <footer className="border-t border-zinc-200 pt-4 mt-2 print:break-inside-avoid">
        <p className="text-[12px] italic text-zinc-600 leading-relaxed">
          {LEGAL_DISCLOSURE}
        </p>
        <div className="flex justify-between text-[10px] text-zinc-500 pt-3">
          <span>Generated {format(new Date(), 'PPpp')}</span>
          <span>Page 1 of 1</span>
        </div>
      </footer>

      {/* Compliance check voucher — always at the absolute bottom */}
      <section className="mt-6 print:break-inside-avoid">
        <div className="relative overflow-hidden border-2 border-dashed border-zinc-300 bg-zinc-50/40 p-4 min-h-[110px]">
          <span
            className="pointer-events-none select-none absolute inset-0 flex items-center justify-center text-zinc-300/40 text-3xl font-extrabold tracking-[0.25em] whitespace-nowrap"
            style={{ transform: 'rotate(-20deg)' }}
            aria-hidden="true"
          >
            NON-NEGOTIABLE — FOR RECORD PURPOSES ONLY
          </span>
          <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4">
            <VoucherCell label="Bank Deposit Routing" value="•••• •••• ••••" />
            <VoucherCell label="Voucher / Check Number" value={`V-${statementNo}`} />
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Net Pay Distribution
              </p>
              <p className="tabular-nums text-zinc-900 text-2xl font-bold">
                {formatCurrency(currentNet)}
              </p>
            </div>
            <div className="flex flex-col justify-end space-y-1">
              <div className="border-b border-zinc-500 h-10" />
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">
                Authorized Signature
              </p>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}

function InfoTable({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-zinc-200 rounded-none shadow-none">
      <div className="bg-zinc-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 border-b border-zinc-200">
        {title}
      </div>
      <table className="w-full text-sm border-collapse">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="even:bg-slate-50/50 border-b border-zinc-100 last:border-b-0">
      <td className="px-3 py-1 text-[11px] uppercase tracking-wider text-zinc-500 w-2/5">
        {label}
      </td>
      <td className="px-3 py-1 text-sm font-medium text-zinc-900">{value}</td>
    </tr>
  );
}

function TaxCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-1">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-sm font-medium text-zinc-900 mt-0.5">{value}</p>
    </div>
  );
}

function WithholdingRow({
  label,
  current,
  ytd,
}: {
  label: string;
  current: number;
  ytd: number;
}) {
  return (
    <tr className="even:bg-slate-50/50 border-b border-zinc-100 last:border-b-0">
      <td className="px-3 py-1 text-zinc-700">{label}</td>
      <td className="px-3 py-1 text-right tabular-nums">{formatCurrency(current)}</td>
      <td className="px-3 py-1 text-right tabular-nums text-zinc-600">{formatCurrency(ytd)}</td>
    </tr>
  );
}

function VoucherCell({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="tabular-nums text-zinc-900 text-sm font-medium">{value}</p>
    </div>
  );
}

function ItemColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-200 rounded-none shadow-none overflow-hidden">
      <div className="bg-zinc-900 text-white px-3 py-1 text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-200">
            <th className="px-3 py-1 text-left font-semibold">Description</th>
            <th className="px-3 py-1 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ItemRow({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <tr className="even:bg-slate-50/50 border-b border-zinc-100 last:border-b-0">
      <td className={`px-3 py-1 text-zinc-700 ${bold ? 'font-semibold text-zinc-900' : ''}`}>
        {label}
      </td>
      <td
        className={`px-3 py-1 text-right tabular-nums ${bold ? 'font-semibold' : 'font-medium'} ${
          negative ? 'text-red-600' : 'text-zinc-900'
        }`}
      >
        {formatCurrency(value)}
      </td>
    </tr>
  );
}

function ItemEmpty({ text }: { text: string }) {
  return (
    <tr>
      <td colSpan={2} className="px-3 py-2 text-xs italic text-zinc-500 text-center">
        {text}
      </td>
    </tr>
  );
}

function SummaryCard({
  title,
  gross,
  reimbursements,
  deductions,
  taxWithholding,
  net,
}: {
  title: string;
  gross: number;
  reimbursements: number;
  deductions: number;
  taxWithholding?: number;
  net: number;
}) {
  return (
    <div className="border border-zinc-200 rounded-none shadow-none overflow-hidden">
      <div className="bg-zinc-900 text-white px-3 py-1 text-xs font-semibold tracking-wider uppercase">
        {title}
      </div>
      <table className="w-full text-sm border-collapse">
        <tbody>
          <tr className="even:bg-slate-50/50 border-b border-zinc-100">
            <td className="px-3 py-1 text-zinc-600">Gross Pay</td>
            <td className="px-3 py-1 text-right tabular-nums">{formatCurrency(gross)}</td>
          </tr>
          <tr className="even:bg-slate-50/50 border-b border-zinc-100">
            <td className="px-3 py-1 text-zinc-600">Total Reimbursements</td>
            <td className="px-3 py-1 text-right tabular-nums">{formatCurrency(reimbursements)}</td>
          </tr>
          <tr className="even:bg-slate-50/50 border-b border-zinc-100">
            <td className="px-3 py-1 text-zinc-600">Total Deductions</td>
            <td className="px-3 py-1 text-right tabular-nums text-red-600">
              {formatCurrency(-Math.abs(deductions))}
            </td>
          </tr>
          {taxWithholding !== undefined && (
            <tr className="even:bg-slate-50/50 border-b border-zinc-100">
              <td className="px-3 py-1 text-zinc-600">Statutory Withholdings</td>
              <td className="px-3 py-1 text-right tabular-nums text-red-600">
                {formatCurrency(-Math.abs(taxWithholding))}
              </td>
            </tr>
          )}
          <tr className="bg-slate-100 border-t-2 border-zinc-900">
            <td className="px-3 py-1.5 font-semibold text-zinc-900 text-base">Net Pay</td>
            <td className="px-3 py-1.5 text-right tabular-nums font-bold text-zinc-900 text-base">
              {formatCurrency(net)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
