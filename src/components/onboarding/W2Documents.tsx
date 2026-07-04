import { useEffect } from 'react';
import { FileText, Landmark, ShieldCheck } from 'lucide-react';

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

export type W4FilingStatus = 'single' | 'married' | 'hoh' | '';
export type BankAccountType = 'checking' | 'savings' | '';

export interface W2DocsState {
  // W-4
  w4_fullName: string;
  w4_ssn: string;
  w4_address: string;
  w4_filingStatus: W4FilingStatus;
  w4_multipleJobs: boolean;
  w4_dependentsAmount: string;
  w4_otherIncome: string;
  w4_deductions: string;
  w4_extraWithholding: string;
  w4_signature: string | null;

  // I-9
  i9_fullName: string;
  i9_otherLastNames: string;
  i9_address: string;
  i9_dob: string;
  i9_ssn: string;
  i9_email: string;
  i9_phone: string;
  i9_citizenship: 'citizen' | 'national' | 'permanent_resident' | 'authorized_alien' | '';
  i9_alienNumber: string;
  i9_workAuthExpiry: string;
  i9_workAuthDocNumber: string;
  i9_attestation: boolean;
  i9_signature: string | null;

  // Direct Deposit
  dd_bankName: string;
  dd_accountType: BankAccountType;
  dd_routingNumber: string;
  dd_accountNumber: string;
  dd_confirmAccountNumber: string;
  dd_authorization: boolean;
  dd_signature: string | null;
}

export const EMPTY_W2_DOCS_STATE: W2DocsState = {
  w4_fullName: '',
  w4_ssn: '',
  w4_address: '',
  w4_filingStatus: '',
  w4_multipleJobs: false,
  w4_dependentsAmount: '',
  w4_otherIncome: '',
  w4_deductions: '',
  w4_extraWithholding: '',
  w4_signature: null,

  i9_fullName: '',
  i9_otherLastNames: '',
  i9_address: '',
  i9_dob: '',
  i9_ssn: '',
  i9_email: '',
  i9_phone: '',
  i9_citizenship: '',
  i9_alienNumber: '',
  i9_workAuthExpiry: '',
  i9_workAuthDocNumber: '',
  i9_attestation: false,
  i9_signature: null,

  dd_bankName: '',
  dd_accountType: '',
  dd_routingNumber: '',
  dd_accountNumber: '',
  dd_confirmAccountNumber: '',
  dd_authorization: false,
  dd_signature: null,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isSig = (s: string | null): s is string => !!s && s.startsWith('data:image/');
const digitsOnly = (v: string) => v.replace(/\D/g, '');
const nonEmpty = (v: string) => v.trim().length > 0;
const isOptionalNumber = (v: string) => v.trim() === '' || (!isNaN(Number(v)) && Number(v) >= 0);
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function isW2DocsValid(s: W2DocsState): boolean {
  // W-4
  if (!nonEmpty(s.w4_fullName)) return false;
  if (digitsOnly(s.w4_ssn).length !== 9) return false;
  if (!nonEmpty(s.w4_address)) return false;
  if (s.w4_filingStatus === '') return false;
  if (!isOptionalNumber(s.w4_dependentsAmount)) return false;
  if (!isOptionalNumber(s.w4_otherIncome)) return false;
  if (!isOptionalNumber(s.w4_deductions)) return false;
  if (!isOptionalNumber(s.w4_extraWithholding)) return false;
  if (!isSig(s.w4_signature)) return false;

  // I-9
  if (!nonEmpty(s.i9_fullName)) return false;
  if (!nonEmpty(s.i9_address)) return false;
  if (!nonEmpty(s.i9_dob)) return false;
  if (digitsOnly(s.i9_ssn).length !== 9) return false;
  if (!isEmail(s.i9_email)) return false;
  if (!nonEmpty(s.i9_phone)) return false;
  if (s.i9_citizenship === '') return false;
  if (s.i9_citizenship === 'permanent_resident' && !nonEmpty(s.i9_alienNumber)) return false;
  if (s.i9_citizenship === 'authorized_alien') {
    if (!nonEmpty(s.i9_workAuthExpiry)) return false;
    if (!nonEmpty(s.i9_workAuthDocNumber)) return false;
  }
  if (!s.i9_attestation) return false;
  if (!isSig(s.i9_signature)) return false;

  // Direct Deposit
  if (!nonEmpty(s.dd_bankName)) return false;
  if (s.dd_accountType === '') return false;
  if (digitsOnly(s.dd_routingNumber).length !== 9) return false;
  const acct = digitsOnly(s.dd_accountNumber);
  if (acct.length < 4) return false;
  if (s.dd_accountNumber !== s.dd_confirmAccountNumber) return false;
  if (!s.dd_authorization) return false;
  if (!isSig(s.dd_signature)) return false;

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

interface W2DocumentsProps {
  value: W2DocsState;
  onChange: (patch: Partial<W2DocsState>) => void;
  onValidityChange: (valid: boolean) => void;
}

export function W2Documents({ value, onChange, onValidityChange }: W2DocumentsProps) {
  useEffect(() => {
    onValidityChange(isW2DocsValid(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const v = value;
  const set = onChange;

  return (
    <div className="space-y-4">
      {/* ---------------- W-4 ---------------- */}
      <DocCardShell
        Icon={FileText}
        title="Federal W-4 Withholding"
        subtitle="Employee's Withholding Certificate. Fields correspond to IRS Form W-4."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="w4_fullName" label="Full legal name">
            <Input
              id="w4_fullName"
              value={v.w4_fullName}
              onChange={(e) => set({ w4_fullName: e.target.value })}
              autoComplete="name"
            />
          </Field>
          <Field id="w4_ssn" label="Social Security Number" hint="9 digits">
            <Input
              id="w4_ssn"
              value={v.w4_ssn}
              inputMode="numeric"
              maxLength={11}
              placeholder="XXX-XX-XXXX"
              onChange={(e) => set({ w4_ssn: e.target.value })}
            />
          </Field>
          <Field id="w4_address" label="Home address">
            <Input
              id="w4_address"
              value={v.w4_address}
              onChange={(e) => set({ w4_address: e.target.value })}
              autoComplete="street-address"
            />
          </Field>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Filing status</Label>
          <RadioGroup
            value={v.w4_filingStatus}
            onValueChange={(val) => set({ w4_filingStatus: val as W4FilingStatus })}
            className="grid grid-cols-1 sm:grid-cols-3 gap-2"
          >
            {(
              [
                ['single', 'Single or married filing separately'],
                ['married', 'Married filing jointly'],
                ['hoh', 'Head of household'],
              ] as const
            ).map(([val, label]) => (
              <label
                key={val}
                htmlFor={`w4_fs_${val}`}
                className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
              >
                <RadioGroupItem id={`w4_fs_${val}`} value={val} className="mt-0.5" />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>

        <label
          htmlFor="w4_multipleJobs"
          className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
        >
          <Checkbox
            id="w4_multipleJobs"
            checked={v.w4_multipleJobs}
            onCheckedChange={(c) => set({ w4_multipleJobs: c === true })}
            className="mt-0.5"
          />
          <span className="text-sm">
            Step 2(c): I hold more than one job or my spouse works.
          </span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="w4_dependentsAmount" label="Step 3: Dependents amount ($)" hint="Optional">
            <Input
              id="w4_dependentsAmount"
              inputMode="decimal"
              value={v.w4_dependentsAmount}
              onChange={(e) => set({ w4_dependentsAmount: e.target.value })}
            />
          </Field>
          <Field id="w4_otherIncome" label="Step 4(a): Other income ($)" hint="Optional">
            <Input
              id="w4_otherIncome"
              inputMode="decimal"
              value={v.w4_otherIncome}
              onChange={(e) => set({ w4_otherIncome: e.target.value })}
            />
          </Field>
          <Field id="w4_deductions" label="Step 4(b): Deductions ($)" hint="Optional">
            <Input
              id="w4_deductions"
              inputMode="decimal"
              value={v.w4_deductions}
              onChange={(e) => set({ w4_deductions: e.target.value })}
            />
          </Field>
          <Field id="w4_extraWithholding" label="Step 4(c): Extra withholding ($)" hint="Optional">
            <Input
              id="w4_extraWithholding"
              inputMode="decimal"
              value={v.w4_extraWithholding}
              onChange={(e) => set({ w4_extraWithholding: e.target.value })}
            />
          </Field>
        </div>

        <SignatureField
          label="Employee signature"
          value={v.w4_signature}
          onChange={(s) => set({ w4_signature: s })}
        />
      </DocCardShell>

      {/* ---------------- I-9 ---------------- */}
      <DocCardShell
        Icon={ShieldCheck}
        title="Form I-9 — Employment Eligibility Verification"
        subtitle="Section 1 (Employee Information and Attestation)."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="i9_fullName" label="Full legal name">
            <Input
              id="i9_fullName"
              value={v.i9_fullName}
              onChange={(e) => set({ i9_fullName: e.target.value })}
            />
          </Field>
          <Field id="i9_otherLastNames" label="Other last names used" hint="Optional (maiden, etc.)">
            <Input
              id="i9_otherLastNames"
              value={v.i9_otherLastNames}
              onChange={(e) => set({ i9_otherLastNames: e.target.value })}
            />
          </Field>
          <Field id="i9_address" label="Address">
            <Input
              id="i9_address"
              value={v.i9_address}
              onChange={(e) => set({ i9_address: e.target.value })}
            />
          </Field>
          <Field id="i9_dob" label="Date of birth">
            <Input
              id="i9_dob"
              type="date"
              value={v.i9_dob}
              onChange={(e) => set({ i9_dob: e.target.value })}
            />
          </Field>
          <Field id="i9_ssn" label="SSN" hint="9 digits">
            <Input
              id="i9_ssn"
              inputMode="numeric"
              maxLength={11}
              placeholder="XXX-XX-XXXX"
              value={v.i9_ssn}
              onChange={(e) => set({ i9_ssn: e.target.value })}
            />
          </Field>
          <Field id="i9_email" label="Email">
            <Input
              id="i9_email"
              type="email"
              value={v.i9_email}
              onChange={(e) => set({ i9_email: e.target.value })}
            />
          </Field>
          <Field id="i9_phone" label="Phone">
            <Input
              id="i9_phone"
              type="tel"
              value={v.i9_phone}
              onChange={(e) => set({ i9_phone: e.target.value })}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Citizenship / immigration status</Label>
          <RadioGroup
            value={v.i9_citizenship}
            onValueChange={(val) => set({ i9_citizenship: val as W2DocsState['i9_citizenship'] })}
            className="grid grid-cols-1 gap-2"
          >
            {(
              [
                ['citizen', 'A citizen of the United States'],
                ['national', 'A noncitizen national of the United States'],
                ['permanent_resident', 'A lawful permanent resident'],
                ['authorized_alien', 'An alien authorized to work until a specified date'],
              ] as const
            ).map(([val, label]) => (
              <label
                key={val}
                htmlFor={`i9_c_${val}`}
                className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
              >
                <RadioGroupItem id={`i9_c_${val}`} value={val} className="mt-0.5" />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>

        {v.i9_citizenship === 'permanent_resident' && (
          <Field id="i9_alienNumber" label="Alien Registration / USCIS Number">
            <Input
              id="i9_alienNumber"
              value={v.i9_alienNumber}
              onChange={(e) => set({ i9_alienNumber: e.target.value })}
            />
          </Field>
        )}
        {v.i9_citizenship === 'authorized_alien' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field id="i9_workAuthExpiry" label="Work authorization expiry">
              <Input
                id="i9_workAuthExpiry"
                type="date"
                value={v.i9_workAuthExpiry}
                onChange={(e) => set({ i9_workAuthExpiry: e.target.value })}
              />
            </Field>
            <Field id="i9_workAuthDocNumber" label="Document number (I-94 / passport)">
              <Input
                id="i9_workAuthDocNumber"
                value={v.i9_workAuthDocNumber}
                onChange={(e) => set({ i9_workAuthDocNumber: e.target.value })}
              />
            </Field>
          </div>
        )}

        <label
          htmlFor="i9_attest"
          className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
        >
          <Checkbox
            id="i9_attest"
            checked={v.i9_attestation}
            onCheckedChange={(c) => set({ i9_attestation: c === true })}
            className="mt-0.5"
          />
          <span className="text-sm">
            I am aware that federal law provides for imprisonment and/or fines for false
            statements, or use of false documents, in connection with the completion of this form.
            The information I have provided is true and correct.
          </span>
        </label>

        <SignatureField
          label="Employee signature"
          value={v.i9_signature}
          onChange={(s) => set({ i9_signature: s })}
        />
      </DocCardShell>

      {/* ---------------- Direct Deposit ---------------- */}
      <DocCardShell
        Icon={Landmark}
        title="Direct Deposit Authorization"
        subtitle="Authorize payroll to deposit wages to your bank account."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field id="dd_bankName" label="Bank name">
            <Input
              id="dd_bankName"
              value={v.dd_bankName}
              onChange={(e) => set({ dd_bankName: e.target.value })}
            />
          </Field>
          <div className="space-y-2">
            <Label className="text-sm">Account type</Label>
            <RadioGroup
              value={v.dd_accountType}
              onValueChange={(val) => set({ dd_accountType: val as BankAccountType })}
              className="flex gap-2"
            >
              {(['checking', 'savings'] as const).map((val) => (
                <label
                  key={val}
                  htmlFor={`dd_at_${val}`}
                  className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40 flex-1 capitalize"
                >
                  <RadioGroupItem id={`dd_at_${val}`} value={val} />
                  <span className="text-sm">{val}</span>
                </label>
              ))}
            </RadioGroup>
          </div>
          <Field id="dd_routingNumber" label="Routing number" hint="9 digits">
            <Input
              id="dd_routingNumber"
              inputMode="numeric"
              maxLength={9}
              value={v.dd_routingNumber}
              onChange={(e) => set({ dd_routingNumber: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field id="dd_accountNumber" label="Account number">
            <Input
              id="dd_accountNumber"
              inputMode="numeric"
              value={v.dd_accountNumber}
              onChange={(e) => set({ dd_accountNumber: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field id="dd_confirmAccountNumber" label="Confirm account number">
            <Input
              id="dd_confirmAccountNumber"
              inputMode="numeric"
              value={v.dd_confirmAccountNumber}
              onChange={(e) =>
                set({ dd_confirmAccountNumber: e.target.value.replace(/\D/g, '') })
              }
            />
            {v.dd_confirmAccountNumber &&
              v.dd_accountNumber !== v.dd_confirmAccountNumber && (
                <p className="text-xs text-destructive">Account numbers don&apos;t match.</p>
              )}
          </Field>
        </div>

        <label
          htmlFor="dd_auth"
          className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-accent/40"
        >
          <Checkbox
            id="dd_auth"
            checked={v.dd_authorization}
            onCheckedChange={(c) => set({ dd_authorization: c === true })}
            className="mt-0.5"
          />
          <span className="text-sm">
            I authorize my employer to deposit my wages into the account listed above, and if
            necessary, to debit entries and adjustments for any credit entries made in error.
          </span>
        </label>

        <SignatureField
          label="Employee signature"
          value={v.dd_signature}
          onChange={(s) => set({ dd_signature: s })}
        />
      </DocCardShell>
    </div>
  );
}
