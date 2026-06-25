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
}

export function SettlementPrintable({ data }: Props) {
  const { settlement, driver, items, reimbursementItems, breakdown, ytd } = data;
  const status = statusLabel(settlement.status);
  const driverName =
    `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim() || 'Driver';
  const driverIdLabel =
    driver?.landstar_operator_id ||
    (settlement.driver_id
      ? `ID ${String(settlement.driver_id).slice(0, 8).toUpperCase()}`
      : '—');
  const statementNo = String(settlement.id).slice(0, 8).toUpperCase();

  const currentGross = Number(settlement.gross_pay ?? 0);
  const currentReimb = Number(settlement.reimbursements ?? 0);
  const currentNet = currentGross + currentReimb;
  const ytdNet = ytd.gross + ytd.reimbursements;

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white text-zinc-900 shadow-sm print:shadow-none print:p-0">
      {/* Header banner */}
      <header className="bg-slate-900 text-white px-10 py-8 flex items-start justify-between gap-6 print:break-inside-avoid">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-wide">
            {CORPORATE_HEADER.name}
          </h1>
          <p className="text-sm tracking-normal text-slate-300">
            {CORPORATE_HEADER.subtitle}
          </p>
          <p className="text-xs tracking-normal text-slate-400">
            {CORPORATE_HEADER.address}
          </p>
        </div>
        <div className="text-right space-y-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">
            Settlement &amp; Earnings Statement
          </p>
          <p className="text-xs text-slate-300">Statement #{statementNo}</p>
          <span
            className={`inline-block px-2.5 py-1 text-[11px] font-semibold tracking-wider rounded ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>
        </div>
      </header>

      {/* Statement details + Contractor information */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6 border-t border-zinc-200 print:break-inside-avoid">
        <div className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Statement Details
          </h2>
          <Field label="Statement #" value={statementNo} />
          <Field
            label="Pay Period"
            value={`${fmtDate(settlement.period_start)} – ${fmtDate(settlement.period_end)}`}
          />
          <Field label="Payment Date" value={fmtDate(settlement.payment_date)} />
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 w-32 shrink-0">
              Status
            </span>
            <span
              className={`inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wider rounded ${STATUS_STYLES[status]}`}
            >
              {status}
            </span>
          </div>
          <Field label="Earnings Method" value={breakdown.methodLabel} />
        </div>

        <div className="border border-zinc-200 rounded-md p-4 space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Contractor Information
          </h2>
          <Field label="Driver Name" value={driverName} />
          <Field label="Driver ID" value={driverIdLabel} />
          <Field label="Email" value={driver?.email || '—'} />
          <Field label="Phone" value={driver?.phone || '—'} />
        </div>
      </section>

      {/* Load Earnings & Routes */}
      <section className="border-t border-zinc-200 py-6 print:break-inside-avoid">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-3">
          Load Earnings &amp; Routes
        </h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-900 text-white text-left text-[11px] uppercase tracking-wider">
              <th className="px-3 py-2 font-semibold">Date</th>
              <th className="px-3 py-2 font-semibold">Load #</th>
              <th className="px-3 py-2 font-semibold text-right">Miles</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Origin</th>
              <th className="px-3 py-2 font-semibold">Destination</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.loads.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-zinc-500 italic border-b border-zinc-100"
                >
                  No loads recorded in this period
                </td>
              </tr>
            ) : (
              breakdown.loads.map((l) => (
                <tr
                  key={l.id}
                  className="align-top even:bg-zinc-50 border-b border-zinc-100"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtDateShort(l.delivery_date ?? l.pickup_date)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-medium">
                    {l.landstar_load_id || l.id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMiles(Number(l.booked_miles ?? l.actual_miles ?? 0))}
                  </td>
                  <td className="px-3 py-2 capitalize">
                    {(l.status ?? '—').replace(/_/g, ' ')}
                  </td>
                  <td className="px-3 py-2 whitespace-normal text-zinc-700">
                    {l.origin ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-normal text-zinc-700">
                    {l.destination ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {/* Earnings & Reimbursements */}
      <section className="border-t border-zinc-200 py-6 print:break-inside-avoid">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 mb-3">
          Earnings &amp; Reimbursements
        </h2>
        <div className="divide-y divide-zinc-100">
          <LineItem label="Flat Rate Base Pay" value={breakdown.basePay} />
          {reimbursementItems.length === 0 ? (
            <div className="flex justify-between py-2 text-sm text-zinc-500 italic">
              <span>No reimbursements in this period</span>
              <span className="tabular-nums">{formatCurrency(0)}</span>
            </div>
          ) : (
            reimbursementItems.map((r) => (
              <LineItem
                key={r.id}
                label={`Reimbursement — ${r.description ?? 'Other'}`}
                value={Number(r.amount ?? 0)}
              />
            ))
          )}
        </div>
      </section>

      {/* Dual summary cards */}
      <section className="border-t border-zinc-200 py-6 print:break-inside-avoid">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SummaryCard
            title="Current Period"
            gross={currentGross}
            reimbursements={currentReimb}
            net={currentNet}
          />
          <SummaryCard
            title="Year-to-Date"
            gross={ytd.gross}
            reimbursements={ytd.reimbursements}
            net={ytdNet}
          />
        </div>
        <p className="text-[11px] italic text-zinc-500 mt-3 text-center">
          Net Pay = Gross Pay + Reimbursements
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
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500 w-32 shrink-0">
        {label}
      </span>
      <span className="text-sm font-medium text-zinc-900">{value}</span>
    </div>
  );
}

function LineItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-2 text-sm">
      <span className="text-zinc-700">{label}</span>
      <span className="font-medium tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

function SummaryCard({
  title,
  gross,
  reimbursements,
  net,
}: {
  title: string;
  gross: number;
  reimbursements: number;
  net: number;
}) {
  return (
    <div className="border border-zinc-200 rounded-lg overflow-hidden">
      <div className="bg-slate-900 text-white px-4 py-2 text-xs font-semibold tracking-wider uppercase">
        {title}
      </div>
      <div className="px-4 py-3 text-sm divide-y divide-zinc-100">
        <div className="flex justify-between py-2">
          <span className="text-zinc-600">Gross Pay</span>
          <span className="tabular-nums">{formatCurrency(gross)}</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-zinc-600">Reimbursements</span>
          <span className="tabular-nums">{formatCurrency(reimbursements)}</span>
        </div>
        <div className="flex justify-between py-2 bg-slate-50 -mx-4 px-4 font-semibold text-base">
          <span>Net Pay</span>
          <span className="tabular-nums">{formatCurrency(net)}</span>
        </div>
      </div>
    </div>
  );
}
