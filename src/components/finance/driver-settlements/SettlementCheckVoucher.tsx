import { format, parseISO } from 'date-fns';
import { Scissors } from 'lucide-react';
import { formatCurrency, numberToEnglishUsd } from '@/lib/formatters';
import {
  CORPORATE_HEADER,
  type SettlementDocumentData,
} from '@/lib/settlement-document-data';
import { useDriverBankingFull } from '@/hooks/useSensitiveDriverData';

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy') : '—';

const fmtRouting = (r: string | null | undefined) => {
  const d = (r ?? '').replace(/\D/g, '');
  if (d.length !== 9) return r || '—';
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
};

interface Props {
  data: SettlementDocumentData;
}

export function SettlementCheckVoucher({ data }: Props) {
  const { settlement, driver } = data;
  const { data: banking } = useDriverBankingFull(settlement.driver_id);
  const driverName =
    `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim() || 'Driver';
  const statementNo = String(settlement.id).slice(0, 8).toUpperCase();
  const net =
    Number(settlement.gross_pay ?? 0) +
    Number(settlement.reimbursements ?? 0) -
    Number(settlement.deductions ?? 0);

  return (
    <div className="mt-8 print:break-inside-avoid">
      <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-2">
        <Scissors className="h-3 w-3" />
        <span>Detach Here — Non-Negotiable Voucher</span>
        <Scissors className="h-3 w-3 -scale-x-100" />
      </div>

      <div className="relative border-dashed border-2 border-zinc-300 rounded-md p-6 bg-white overflow-hidden">
        {/* Diagonal watermark */}
        <div
          aria-hidden
          className="pointer-events-none select-none absolute inset-0 flex items-center justify-center"
        >
          <span
            className="text-zinc-200/80 font-black tracking-[0.25em] text-2xl md:text-3xl whitespace-nowrap"
            style={{ transform: 'rotate(-18deg)' }}
          >
            NON-NEGOTIABLE — FOR RECORD PURPOSES ONLY
          </span>
        </div>

        {/* Foreground content */}
        <div className="relative">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-zinc-200 pb-3">
            <div>
              <p className="text-sm font-bold tracking-wide text-zinc-900">
                {CORPORATE_HEADER.name}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Payroll Voucher
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Check No.
              </p>
              <p className="text-sm font-mono font-semibold text-zinc-900">
                VCH-{statementNo}
              </p>
            </div>
          </div>

          {/* Pay line */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-end mt-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Pay To The Order Of
              </p>
              <p className="text-base font-semibold text-zinc-900 border-b border-zinc-400 pb-1">
                {driverName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Amount
              </p>
              <p className="text-base font-bold tabular-nums text-zinc-900 border border-zinc-400 rounded px-3 py-1 bg-white/70">
                {formatCurrency(net)}
              </p>
            </div>
          </div>

          {/* Written amount */}
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              Amount In Words
            </p>
            <p className="text-sm italic text-zinc-800 border-b border-zinc-300 pb-1">
              {numberToEnglishUsd(net)}
            </p>
          </div>

          {/* Field grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <VField label="Pay Date" value={fmtDate(settlement.payment_date)} />
            <VField
              label="Memo"
              value={`Settlement ${fmtDate(settlement.period_start)} – ${fmtDate(settlement.period_end)}`}
            />
            <VField label="Bank Routing" value="XXXX-XXXX-XXXX" />
            <VField label="Method" value="ACH Direct Deposit on File" />
          </div>

          {/* Signature row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
            <div>
              <p
                className="text-2xl text-zinc-800 italic pb-1"
                style={{ fontFamily: '"Great Vibes", "Snell Roundhand", "Brush Script MT", cursive' }}
              >
                Jean-Way Payroll
              </p>
              <div className="border-t border-zinc-800" />
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">
                Authorized Signature
              </p>
            </div>
            <div>
              <p className="text-sm text-zinc-800 pb-1">
                {fmtDate(settlement.payment_date)}
              </p>
              <div className="border-t border-zinc-800" />
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">
                Date
              </p>
            </div>
          </div>

          {/* MICR-style line */}
          <div className="mt-6 pt-3 border-t border-dashed border-zinc-300">
            <p
              className="text-center text-zinc-600 tracking-[0.3em]"
              style={{ fontFamily: '"OCR A Std", "Courier New", monospace' }}
            >
              ⑈ XXXXXXXXX ⑈ XXXXXXXXXXXX ⑈ VCH-{statementNo} ⑈
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function VField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </p>
      <p className="text-sm font-medium text-zinc-900 border-b border-zinc-300 pb-1">
        {value}
      </p>
    </div>
  );
}
