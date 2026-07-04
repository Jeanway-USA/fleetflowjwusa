import { useEffect } from 'react';
import { FileText, Landmark } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { SignaturePad } from '@/components/driver/SignaturePad';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type W9TaxClass =
  | 'individual'
  | 'single_member_llc'
  | 'c_corp'
  | 's_corp'
  | 'partnership'
  | 'llc'
  | 'other'
  | '';

export type TinType = 'ssn' | 'ein' | '';

export interface ContractorDocsState {
  // W-9
  w9_legalName: string;
  w9_businessName: string;
  w9_taxClass: W9TaxClass;
  w9_address: string;
  w9_tinType: TinType;
  w9_tin: string;
  w9_certifyAccurate: boolean;
  w9_certifyBackupWithholding: boolean;
  w9_signature: string | null;

  // Independent Owner-Operator Agreement
  ioo_legalName: string;
  ioo_businessName: string;
  ioo_mcNumber: string;
  ioo_dotNumber: string;
  ioo_effectiveDate: string;
  ioo_agreeTerms: boolean;
  ioo_ackIcStatus: boolean;
  ioo_signature: string | null;
}

export const EMPTY_CONTRACTOR_DOCS_STATE: ContractorDocsState = {
  w9_legalName: '',
  w9_businessName: '',
  w9_taxClass: '',
  w9_address: '',
  w9_tinType: '',
  w9_tin: '',
  w9_certifyAccurate: false,
  w9_certifyBackupWithholding: false,
  w9_signature: null,

  ioo_legalName: '',
  ioo_businessName: '',
  ioo_mcNumber: '',
  ioo_dotNumber: '',
  ioo_effectiveDate: new Date().toISOString().slice(0, 10),
  ioo_agreeTerms: false,
  ioo_ackIcStatus: false,
  ioo_signature: null,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isSig = (s: string | null): s is string => !!s && s.startsWith('data:image/');
const digitsOnly = (v: string) => v.replace(/\D/g, '');
const nonEmpty = (v: string) => v.trim().length > 0;

export function isContractorDocsValid(s: ContractorDocsState): boolean {
  // W-9
  if (!nonEmpty(s.w9_legalName)) return false;
  if (s.w9_taxClass === '') return false;
  if (!nonEmpty(s.w9_address)) return false;
  if (s.w9_tinType === '') return false;
  if (digitsOnly(s.w9_tin).length !== 9) return false;
  if (!s.w9_certifyAccurate) return false;
  if (!s.w9_certifyBackupWithholding) return false;
  if (!isSig(s.w9_signature)) return false;

  // IOO
  if (!nonEmpty(s.ioo_legalName)) return false;
  if (!nonEmpty(s.ioo_mcNumber)) return false;
  if (!nonEmpty(s.ioo_dotNumber)) return false;
  if (!nonEmpty(s.ioo_effectiveDate)) return false;
  if (!s.ioo_agreeTerms) return false;
  if (!s.ioo_ackIcStatus) return false;
  if (!isSig(s.ioo_signature)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Shared subcomponents
// ---------------------------------------------------------------------------

const todayIso = () => new Date().toISOString().slice(0, 10);

function DocCardShell({
  Icon,
  title,
  subtitle,
  children,
}: {
  Icon: typeof FileText;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge variant="secondary" className="uppercase tracking-wide text-[10px]">
              Required
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function SignatureField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs text-muted-foreground">Date: {todayIso()}</span>
      </div>
      {value ? (
        <div className="space-y-2">
          <div className="rounded-md border bg-white p-2">
            <img src={value} alt="Signature" className="max-h-24 object-contain" />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
            Clear &amp; re-sign
          </Button>
        </div>
      ) : (
        <SignaturePad onSignatureCapture={(dataUrl) => onChange(dataUrl || null)} />
      )}
    </div>
  );
}

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props / main
// ---------------------------------------------------------------------------

interface ContractorDocumentsProps {
  value: ContractorDocsState;
  onChange: (patch: Partial<ContractorDocsState>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function ContractorDocuments({
  value,
  onChange,
  onValidityChange,
}: ContractorDocumentsProps) {
  useEffect(() => {
    onValidityChange(isContractorDocsValid(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const v = value;
  const set = onChange;

  return (
    <div className="space-y-4">
      {/* ---------------- W-9 ---------------- */}
      <DocCardShell
        Icon={Landmark}
        title="Form W-9 — Taxpayer Identification"
        subtitle="Request for Taxpayer Identification Number and Certification."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="w9_legalName" label="Legal name (as shown on your income tax return)">
            <Input
              id="w9_legalName"
              value={v.w9_legalName}
              onChange={(e) => set({ w9_legalName: e.target.value })}
            />
          </Field>
          <Field id="w9_businessName" label="Business / DBA name" hint="Optional, if different">
            <Input
              id="w9_businessName"
              value={v.w9_businessName}
              onChange={(e) => set({ w9_businessName: e.target.value })}
            />
          </Field>
          <Field id="w9_address" label="Address (number, street, city, state, ZIP)">
            <Input
              id="w9_address"
              value={v.w9_address}
              onChange={(e) => set({ w9_address: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Federal tax classification</Label>
          <RadioGroup
            value={v.w9_taxClass}
            onValueChange={(val) => set({ w9_taxClass: val as W9TaxClass })}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
          >
            {(
              [
                ['individual', 'Individual / sole proprietor'],
                ['single_member_llc', 'Single-member LLC'],
                ['c_corp', 'C Corporation'],
                ['s_corp', 'S Corporation'],
                ['partnership', 'Partnership'],
                ['llc', 'LLC (multi-member)'],
                ['other', 'Other'],
              ] as const
            ).map(([val, label]) => (
              <label
                key={val}
                htmlFor={`w9_tc_${val}`}
                className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
              >
                <RadioGroupItem id={`w9_tc_${val}`} value={val} className="mt-0.5" />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm">TIN type</Label>
            <RadioGroup
              value={v.w9_tinType}
              onValueChange={(val) => set({ w9_tinType: val as TinType })}
              className="flex gap-2"
            >
              {(['ssn', 'ein'] as const).map((val) => (
                <label
                  key={val}
                  htmlFor={`w9_tt_${val}`}
                  className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40 flex-1 uppercase"
                >
                  <RadioGroupItem id={`w9_tt_${val}`} value={val} />
                  <span className="text-sm">{val}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <Field
            id="w9_tin"
            label={v.w9_tinType === 'ein' ? 'EIN' : 'SSN / TIN'}
            hint="9 digits"
          >
            <Input
              id="w9_tin"
              inputMode="numeric"
              maxLength={11}
              value={v.w9_tin}
              onChange={(e) => set({ w9_tin: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="w9_cert1"
            className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
          >
            <Checkbox
              id="w9_cert1"
              checked={v.w9_certifyAccurate}
              onCheckedChange={(c) => set({ w9_certifyAccurate: c === true })}
              className="mt-0.5"
            />
            <span className="text-sm">
              I certify that the taxpayer identification number shown above is correct.
            </span>
          </label>
          <label
            htmlFor="w9_cert2"
            className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
          >
            <Checkbox
              id="w9_cert2"
              checked={v.w9_certifyBackupWithholding}
              onCheckedChange={(c) => set({ w9_certifyBackupWithholding: c === true })}
              className="mt-0.5"
            />
            <span className="text-sm">
              I certify that I am not subject to backup withholding, and that I am a U.S. person
              (including a U.S. resident alien).
            </span>
          </label>
        </div>

        <SignatureField
          label="Taxpayer signature"
          value={v.w9_signature}
          onChange={(s) => set({ w9_signature: s })}
        />
      </DocCardShell>

      {/* ---------------- IOO Agreement ---------------- */}
      <DocCardShell
        Icon={FileText}
        title="Independent Owner-Operator Agreement"
        subtitle="Master agreement between you (Contractor) and the Carrier."
      >
        <div className="max-h-64 overflow-y-auto rounded-md border bg-white p-4 text-sm text-slate-900 font-serif leading-relaxed">
          <p className="mb-2 font-semibold">1. Independent Contractor Status.</p>
          <p className="mb-3">
            Contractor is an independent business entity, not an employee of Carrier. Contractor
            controls the means and methods of transportation services performed under this
            Agreement, subject only to Carrier&apos;s obligations under 49 C.F.R. Part 376.
          </p>
          <p className="mb-2 font-semibold">2. Equipment &amp; Operations.</p>
          <p className="mb-3">
            Contractor shall provide, maintain, and operate the equipment identified in the
            equipment schedule. Contractor is responsible for all operating expenses including
            fuel, tolls, maintenance, permits, and highway use taxes unless otherwise agreed in
            writing.
          </p>
          <p className="mb-2 font-semibold">3. Insurance &amp; Indemnity.</p>
          <p className="mb-3">
            Contractor shall maintain all insurance required by law and shall indemnify Carrier
            against claims arising from Contractor&apos;s negligence, willful misconduct, or
            breach of this Agreement.
          </p>
          <p className="mb-2 font-semibold">4. Compensation.</p>
          <p className="mb-3">
            Carrier shall compensate Contractor per load per the settlement schedule provided
            separately. Contractor acknowledges no wages, benefits, or tax withholding will be
            provided; income will be reported on IRS Form 1099-NEC.
          </p>
          <p className="mb-2 font-semibold">5. Termination.</p>
          <p className="mb-3">
            Either party may terminate this Agreement with written notice. Outstanding
            settlements, escrow reconciliation, and equipment return shall be handled per Carrier
            policy following termination.
          </p>
          <p className="mb-2 font-semibold">6. Compliance.</p>
          <p>
            Contractor shall comply with all applicable FMCSA, DOT, state, and federal
            regulations, including hours-of-service, drug &amp; alcohol testing, and safety
            requirements.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="ioo_legalName" label="Contractor legal name">
            <Input
              id="ioo_legalName"
              value={v.ioo_legalName}
              onChange={(e) => set({ ioo_legalName: e.target.value })}
            />
          </Field>
          <Field id="ioo_businessName" label="Business / DBA" hint="Optional">
            <Input
              id="ioo_businessName"
              value={v.ioo_businessName}
              onChange={(e) => set({ ioo_businessName: e.target.value })}
            />
          </Field>
          <Field id="ioo_mcNumber" label="MC number">
            <Input
              id="ioo_mcNumber"
              value={v.ioo_mcNumber}
              onChange={(e) => set({ ioo_mcNumber: e.target.value })}
            />
          </Field>
          <Field id="ioo_dotNumber" label="DOT number">
            <Input
              id="ioo_dotNumber"
              value={v.ioo_dotNumber}
              onChange={(e) => set({ ioo_dotNumber: e.target.value })}
            />
          </Field>
          <Field id="ioo_effectiveDate" label="Effective date">
            <Input
              id="ioo_effectiveDate"
              type="date"
              value={v.ioo_effectiveDate}
              onChange={(e) => set({ ioo_effectiveDate: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="ioo_terms"
            className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
          >
            <Checkbox
              id="ioo_terms"
              checked={v.ioo_agreeTerms}
              onCheckedChange={(c) => set({ ioo_agreeTerms: c === true })}
              className="mt-0.5"
            />
            <span className="text-sm">
              I have read and agree to the terms of this Independent Owner-Operator Agreement.
            </span>
          </label>
          <label
            htmlFor="ioo_ic"
            className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
          >
            <Checkbox
              id="ioo_ic"
              checked={v.ioo_ackIcStatus}
              onCheckedChange={(c) => set({ ioo_ackIcStatus: c === true })}
              className="mt-0.5"
            />
            <span className="text-sm">
              I acknowledge my status as an independent contractor and not an employee of Carrier.
            </span>
          </label>
        </div>

        <SignatureField
          label="Contractor signature"
          value={v.ioo_signature}
          onChange={(s) => set({ ioo_signature: s })}
        />
      </DocCardShell>
    </div>
  );
}
