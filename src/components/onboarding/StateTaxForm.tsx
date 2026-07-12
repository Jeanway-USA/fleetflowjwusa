import { useEffect } from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SignaturePad } from '@/components/driver/SignaturePad';
import { US_STATES, NO_STATE_INCOME_TAX, stateHasIncomeTax } from '@/lib/us-states';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StateFilingStatus = 'single' | 'married' | 'hoh' | 'married_separate' | '';

export interface StateTaxFormState {
  workState: string;         // 2-letter (SUTA — where labor is performed)
  residenceState: string;    // 2-letter (SIT — where the driver lives)
  filingStatus: StateFilingStatus;
  allowances: string;
  additionalWithholding: string;
  exempt: boolean;
  attestation: boolean;
  signature: string | null;
}

export const EMPTY_STATE_TAX_FORM: StateTaxFormState = {
  workState: '',
  residenceState: '',
  filingStatus: '',
  allowances: '',
  additionalWithholding: '',
  exempt: false,
  attestation: false,
  signature: null,
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isSig = (s: string | null): s is string => !!s && s.startsWith('data:image/');
const isOptionalNonNegativeNumber = (v: string) =>
  v.trim() === '' || (!isNaN(Number(v)) && Number(v) >= 0);
const isValidState = (s: string) => US_STATES.includes(s.toUpperCase() as never);

export function isStateTaxFormValid(s: StateTaxFormState): boolean {
  if (!isValidState(s.workState)) return false;
  if (!isValidState(s.residenceState)) return false;
  const residenceHasSit = stateHasIncomeTax(s.residenceState);
  // SIT-specific fields only required when residence state has income tax
  // and the driver is not claiming exempt.
  if (residenceHasSit && !s.exempt) {
    if (s.filingStatus === '') return false;
    if (!isOptionalNonNegativeNumber(s.allowances)) return false;
    if (!isOptionalNonNegativeNumber(s.additionalWithholding)) return false;
  }
  if (!s.attestation) return false;
  if (!isSig(s.signature)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StateTaxFormProps {
  value: StateTaxFormState;
  onChange: (patch: Partial<StateTaxFormState>) => void;
  onValidityChange: (valid: boolean) => void;
  /** '1099' contractors only see residence state; SIT elections are informational only. */
  audience?: 'w2' | '1099';
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function StateSelect({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {US_STATES.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
            {NO_STATE_INCOME_TAX.includes(code) && (
              <span className="ml-2 text-xs text-muted-foreground">(no state income tax)</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StateTaxForm({
  value,
  onChange,
  onValidityChange,
  audience = 'w2',
}: StateTaxFormProps) {
  useEffect(() => {
    onValidityChange(isStateTaxFormValid(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const residenceHasSit = stateHasIncomeTax(value.residenceState);
  const showElections = audience === 'w2' && residenceHasSit && !value.exempt;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">State Tax Withholding</CardTitle>
            <Badge variant="secondary" className="uppercase tracking-wide text-[10px]">
              Required
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Tells us which state we owe unemployment and (if applicable) income-tax withholding
            for. Your work state may differ from where you live.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* States */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="st_work" className="text-sm">
              {audience === '1099' ? 'Primary state of operation' : 'Work state (SUTA)'}
            </Label>
            <StateSelect
              id="st_work"
              value={value.workState}
              onChange={(v) => {
                // If residence hasn't been set yet, mirror work state as a sensible default.
                onChange({
                  workState: v,
                  ...(value.residenceState ? {} : { residenceState: v }),
                });
              }}
              placeholder="Select state"
            />
            <p className="text-xs text-muted-foreground">
              State where you primarily perform work / your home terminal.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st_res" className="text-sm">
              State of residence
            </Label>
            <StateSelect
              id="st_res"
              value={value.residenceState}
              onChange={(v) => onChange({ residenceState: v })}
              placeholder="Select state"
            />
            <p className="text-xs text-muted-foreground">
              State where you live and file your personal income tax return.
            </p>
          </div>
        </div>

        {/* Residence has no SIT — informational note */}
        {value.residenceState && !residenceHasSit && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>{value.residenceState.toUpperCase()} has no state income tax</AlertTitle>
            <AlertDescription>
              No state withholding elections are required. You'll still be reported for
              unemployment insurance in your work state.
            </AlertDescription>
          </Alert>
        )}

        {/* 1099 note */}
        {audience === '1099' && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Contractors — no state withholding</AlertTitle>
            <AlertDescription>
              As a 1099 contractor, we don't withhold state taxes from your pay. This information
              is used only to determine which states we must file 1099 information returns in.
            </AlertDescription>
          </Alert>
        )}

        {/* SIT elections (W-2 employees only, residence has SIT, not exempt) */}
        {audience === 'w2' && residenceHasSit && (
          <>
            <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
              <Checkbox
                id="st_exempt"
                checked={value.exempt}
                onCheckedChange={(c) => onChange({ exempt: !!c })}
              />
              <div className="space-y-1">
                <Label htmlFor="st_exempt" className="text-sm font-medium leading-none">
                  Claim exempt from {value.residenceState.toUpperCase()} state income tax
                </Label>
                <p className="text-xs text-muted-foreground">
                  Only check this if you had no state tax liability last year AND expect none
                  this year. False claims may result in penalties.
                </p>
              </div>
            </div>
          </>
        )}

        {showElections && (
          <div className="space-y-4 rounded-md border p-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Filing status</Label>
              <RadioGroup
                value={value.filingStatus}
                onValueChange={(v) => onChange({ filingStatus: v as StateFilingStatus })}
                className="grid gap-2 sm:grid-cols-2"
              >
                <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer">
                  <RadioGroupItem value="single" id="st_fs_single" />
                  <span className="text-sm">Single</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer">
                  <RadioGroupItem value="married" id="st_fs_married" />
                  <span className="text-sm">Married filing jointly</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer">
                  <RadioGroupItem value="married_separate" id="st_fs_msep" />
                  <span className="text-sm">Married filing separately</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border p-2 cursor-pointer">
                  <RadioGroupItem value="hoh" id="st_fs_hoh" />
                  <span className="text-sm">Head of household</span>
                </label>
              </RadioGroup>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="st_allow" className="text-sm">
                  Allowances / exemptions
                </Label>
                <Input
                  id="st_allow"
                  inputMode="numeric"
                  placeholder="0"
                  value={value.allowances}
                  onChange={(e) => onChange({ allowances: e.target.value.replace(/[^\d]/g, '') })}
                />
                <p className="text-xs text-muted-foreground">
                  Number of allowances claimed on your state W-4 equivalent.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="st_addl" className="text-sm">
                  Additional withholding (per paycheck)
                </Label>
                <Input
                  id="st_addl"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={value.additionalWithholding}
                  onChange={(e) =>
                    onChange({ additionalWithholding: e.target.value.replace(/[^\d.]/g, '') })
                  }
                />
                <p className="text-xs text-muted-foreground">Optional extra dollars withheld each pay period.</p>
              </div>
            </div>
          </div>
        )}

        {/* Attestation + signature */}
        <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
          <Checkbox
            id="st_attest"
            checked={value.attestation}
            onCheckedChange={(c) => onChange({ attestation: !!c })}
          />
          <Label htmlFor="st_attest" className="text-sm leading-snug">
            I certify, under penalty of perjury, that the state information above is accurate to
            the best of my knowledge and that I will notify my employer of any change.
          </Label>
        </div>

        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Employee signature</Label>
            <span className="text-xs text-muted-foreground">Date: {todayIso()}</span>
          </div>
          {value.signature ? (
            <div className="space-y-2">
              <div className="rounded-md border bg-white p-2">
                <img src={value.signature} alt="Signature" className="max-h-24 object-contain" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ signature: null })}
              >
                Clear &amp; re-sign
              </Button>
            </div>
          ) : (
            <SignaturePad onSignatureCapture={(d) => onChange({ signature: d || null })} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
