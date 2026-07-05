import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FileText, ShieldCheck, ClipboardList } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DocumentTemplateRenderer } from '@/components/onboarding/DocumentTemplateRenderer';
import {
  W2Documents,
  EMPTY_W2_DOCS_STATE,
  type W2DocsState,
} from '@/components/onboarding/W2Documents';
import {
  ContractorDocuments,
  EMPTY_CONTRACTOR_DOCS_STATE,
  type ContractorDocsState,
} from '@/components/onboarding/ContractorDocuments';
import type { DriverPayType } from '@/lib/pay-format';


// ---------------------------------------------------------------------------
// Types shared with parent (DriverOnboarding)
// ---------------------------------------------------------------------------

export interface TemplateState {
  driverAddress: string;
  signature: string | null;
  cdlNumber: string;
  attachment: File | null;
  ssn: string;
  email: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  bankAccountType: 'checking' | 'savings' | '';
}

export interface DocumentTemplateRow {
  id: string;
  document_type: string;
  name?: string | null;
  content: string;
}

interface DriverRowLike {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  license_number?: string | null;
  license_expiry?: string | null;
  medical_card_expiry?: string | null;
  endorsements?: string[] | null;
  has_twic?: boolean | null;
  twic_expiry?: string | null;
  pay_type?: DriverPayType | null;
  pay_rate?: number | null;
}

export interface DocumentSignatureStepProps {
  employmentType: '1099' | 'W-2' | null;
  templates: DocumentTemplateRow[];
  state: Record<string, TemplateState>;
  onUpdateTemplateState: (templateId: string, patch: Partial<TemplateState>) => void;
  driverRow: DriverRowLike;
  docRevisions: Record<string, { status: string; notes: string | null }>;
  revisionMode: boolean;
  onValidityChange: (valid: boolean) => void;
  w2Docs: W2DocsState;
  onW2DocsChange: (patch: Partial<W2DocsState>) => void;
  contractorDocs: ContractorDocsState;
  onContractorDocsChange: (patch: Partial<ContractorDocsState>) => void;
}

// ---------------------------------------------------------------------------
// Categorization
// ---------------------------------------------------------------------------

const SHARED_DOCUMENT_TYPES = ['driver_agreement'] as const;
const W2_DOCUMENT_TYPES = ['direct_deposit'] as const;
const CONTRACTOR_DOCUMENT_TYPES: readonly string[] = [];

// Placeholder cards used until real DB templates are seeded for these docs.
interface PlaceholderDoc {
  id: string;
  title: string;
  description: string;
  Icon: typeof FileText;
}

const SHARED_PLACEHOLDERS: PlaceholderDoc[] = [
  {
    id: 'placeholder_safety_policy',
    title: 'Company Safety Policy',
    description: 'Acknowledgement of safety expectations, defensive driving, and reporting requirements.',
    Icon: ShieldCheck,
  },
  {
    id: 'placeholder_equipment_use',
    title: 'Equipment Use Agreement',
    description: 'Terms covering assigned tractor, trailer, ELD, and any company-provided equipment.',
    Icon: ClipboardList,
  },
];

// Employment-specific placeholder lists were replaced by real form components:
// W2Documents (W-4 / I-9 / Direct Deposit) and ContractorDocuments (W-9 / IOO Agreement).


// ---------------------------------------------------------------------------
// Validity helper
// ---------------------------------------------------------------------------

const isValidSignatureDataUrl = (s: string | null): s is string =>
  !!s && s.startsWith('data:image/');

export function computeTemplateValidity(
  template: DocumentTemplateRow,
  s: TemplateState,
): boolean {
  const c = template.content;
  const has = (re: RegExp) => re.test(c);
  const ssnDigits = s.ssn.replace(/\D/g, '');
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim());

  if (has(/\{\{\s*driver_signature\s*\}\}/) && !isValidSignatureDataUrl(s.signature)) return false;
  if (has(/\{\{\s*driver_address\s*\}\}/) && s.driverAddress.trim().length === 0) return false;
  if (has(/\{\{\s*cdl_number\s*\}\}/) && s.cdlNumber.trim().length === 0) return false;
  if (has(/\{\{\s*file_upload\s*\}\}/) && s.attachment == null) return false;
  if (has(/\{\{\s*ssn\s*\}\}/) && ssnDigits.length !== 9) return false;
  if (has(/\{\{\s*email\s*\}\}/) && !emailValid) return false;
  if (has(/\{\{\s*bank_name\s*\}\}/) && s.bankName.trim().length === 0) return false;
  if (has(/\{\{\s*bank_account_type\s*\}\}/) && s.bankAccountType === '') return false;
  if (has(/\{\{\s*routing_number\s*\}\}/) && s.routingNumber.length !== 9) return false;
  if (has(/\{\{\s*account_number\s*\}\}/) && s.accountNumber.length < 4) return false;
  return true;
}

const EMPTY_TEMPLATE_STATE: TemplateState = {
  driverAddress: '',
  signature: null,
  cdlNumber: '',
  attachment: null,
  ssn: '',
  email: '',
  bankName: '',
  routingNumber: '',
  accountNumber: '',
  bankAccountType: '',
};

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function PlaceholderDocumentCard({
  doc,
  checked,
  onCheckedChange,
}: {
  doc: PlaceholderDoc;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  const { Icon } = doc;
  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">{doc.title}</CardTitle>
            <Badge variant="secondary" className="uppercase tracking-wide text-[10px]">
              Coming soon
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{doc.description}</p>
        </div>
      </CardHeader>
      <CardContent>
        <label
          htmlFor={`ack-${doc.id}`}
          className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer hover:bg-accent/40"
        >
          <Checkbox
            id={`ack-${doc.id}`}
            checked={checked}
            onCheckedChange={(v) => onCheckedChange(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm">
            I acknowledge that this document is not yet available and I&apos;ll sign it as soon as it&apos;s ready.
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

function TemplateBlock({
  template,
  tState,
  onPatch,
  driverRow,
  employmentType,
  revisionNote,
}: {
  template: DocumentTemplateRow;
  tState: TemplateState;
  onPatch: (patch: Partial<TemplateState>) => void;
  driverRow: DriverRowLike;
  employmentType: '1099' | 'W-2' | null;
  revisionNote: string | null;
}) {
  const driverName = `${driverRow.first_name ?? ''} ${driverRow.last_name ?? ''}`.trim();
  return (
    <div className="space-y-3">
      {revisionNote && (
        <Alert variant="destructive" className="border-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Revisions requested for {template.name ?? template.document_type}</AlertTitle>
          <AlertDescription className="mt-1 whitespace-pre-wrap">{revisionNote}</AlertDescription>
        </Alert>
      )}
      <div className="rounded-sm bg-white text-slate-900 shadow-lg p-6 md:p-10 font-serif leading-relaxed">
        <DocumentTemplateRenderer
          content={template.content}
          driverAddress={tState.driverAddress}
          onDriverAddressChange={(v) => onPatch({ driverAddress: v })}
          signature={tState.signature}
          onSignatureCapture={(dataUrl) => onPatch({ signature: dataUrl ? dataUrl : null })}
          driverName={driverName}
          cdlNumber={tState.cdlNumber}
          onCdlNumberChange={(v) => onPatch({ cdlNumber: v })}
          attachment={tState.attachment}
          onAttachmentChange={(file) => onPatch({ attachment: file })}
          licenseNumber={driverRow.license_number}
          licenseExpiry={driverRow.license_expiry}
          medicalCardExpiry={driverRow.medical_card_expiry}
          endorsements={driverRow.endorsements}
          hasTwic={driverRow.has_twic}
          twicExpiry={driverRow.twic_expiry}
          phoneNumber={driverRow.phone}
          payType={driverRow.pay_type ?? null}
          payRate={driverRow.pay_rate ?? null}
          ssn={tState.ssn}
          onSsnChange={(v) => onPatch({ ssn: v })}
          email={tState.email}
          onEmailChange={(v) => onPatch({ email: v })}
          bankName={tState.bankName}
          onBankNameChange={(v) => onPatch({ bankName: v })}
          routingNumber={tState.routingNumber}
          onRoutingNumberChange={(v) => onPatch({ routingNumber: v })}
          accountNumber={tState.accountNumber}
          onAccountNumberChange={(v) => onPatch({ accountNumber: v })}
          bankAccountType={tState.bankAccountType}
          onBankAccountTypeChange={(v) => onPatch({ bankAccountType: v })}
          employmentType={employmentType}
        />
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {badge && (
          <Badge variant="outline" className="uppercase tracking-wide text-[10px]">
            {badge}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DocumentSignatureStep({
  employmentType,
  templates,
  state,
  onUpdateTemplateState,
  driverRow,
  docRevisions,
  revisionMode,
  onValidityChange,
  w2Docs,
  onW2DocsChange,
  contractorDocs,
  onContractorDocsChange,
}: DocumentSignatureStepProps) {
  const [placeholderAcks, setPlaceholderAcks] = useState<Record<string, boolean>>({});
  const [w2Valid, setW2Valid] = useState(false);
  const [contractorValid, setContractorValid] = useState(false);

  // Group templates by section
  const sharedTemplates = useMemo(
    () => templates.filter((t) => (SHARED_DOCUMENT_TYPES as readonly string[]).includes(t.document_type)),
    [templates],
  );
  const w2Templates = useMemo(
    () => templates.filter((t) => (W2_DOCUMENT_TYPES as readonly string[]).includes(t.document_type)),
    [templates],
  );
  const contractorTemplates = useMemo(
    () => templates.filter((t) => (CONTRACTOR_DOCUMENT_TYPES as readonly string[]).includes(t.document_type)),
    [templates],
  );

  // Determine which real templates should count toward validity (skip approved ones in revision mode)
  const shouldValidateTemplate = (t: DocumentTemplateRow) =>
    !(revisionMode && docRevisions[t.document_type]?.status === 'approved');

  // Aggregate validity: shared templates + shared placeholders + real form components
  useEffect(() => {
    if (employmentType === null) {
      onValidityChange(false);
      return;
    }
    const activeTemplates: DocumentTemplateRow[] = [...sharedTemplates];
    if (employmentType === 'W-2') activeTemplates.push(...w2Templates);
    if (employmentType === '1099') activeTemplates.push(...contractorTemplates);

    const templatesValid = activeTemplates
      .filter(shouldValidateTemplate)
      .every((t) => computeTemplateValidity(t, state[t.id] ?? EMPTY_TEMPLATE_STATE));

    const sharedPlaceholdersValid = SHARED_PLACEHOLDERS.every(
      (p) => placeholderAcks[p.id] === true,
    );

    const employmentFormsValid = employmentType === 'W-2' ? w2Valid : contractorValid;

    onValidityChange(templatesValid && sharedPlaceholdersValid && employmentFormsValid);
    // We intentionally omit onValidityChange from deps to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    employmentType,
    sharedTemplates,
    w2Templates,
    contractorTemplates,
    state,
    placeholderAcks,
    w2Valid,
    contractorValid,
    revisionMode,
    docRevisions,
  ]);


  if (employmentType === null) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Choose your employment type first</AlertTitle>
        <AlertDescription>
          Go back to the first step and select Independent Contractor (1099) or Company Driver (W-2)
          so we can show you the right documents.
        </AlertDescription>
      </Alert>
    );
  }

  const renderTemplate = (t: DocumentTemplateRow) => {
    const revision =
      revisionMode && docRevisions[t.document_type]?.status === 'revision_requested'
        ? docRevisions[t.document_type].notes
        : null;
    return (
      <TemplateBlock
        key={t.id}
        template={t}
        tState={state[t.id] ?? EMPTY_TEMPLATE_STATE}
        onPatch={(patch) => onUpdateTemplateState(t.id, patch)}
        driverRow={driverRow}
        employmentType={employmentType}
        revisionNote={revision}
      />
    );
  };

  return (
    <div className="space-y-8">
      {/* Shared Documents */}
      <section className="space-y-4">
        <SectionHeader
          title="Shared Documents"
          description="Every driver signs these agreements, regardless of employment type."
          badge="All Drivers"
        />
        <div className="space-y-4">
          {sharedTemplates.map(renderTemplate)}
          {SHARED_PLACEHOLDERS.map((doc) => (
            <PlaceholderDocumentCard
              key={doc.id}
              doc={doc}
              checked={placeholderAcks[doc.id] === true}
              onCheckedChange={(v) =>
                setPlaceholderAcks((prev) => ({ ...prev, [doc.id]: v }))
              }
            />
          ))}
        </div>
      </section>

      {/* Employment-specific block */}
      {employmentType === 'W-2' ? (
        <section className="space-y-4">
          <SectionHeader
            title="W-2 Employee Documents"
            description="Payroll and withholding paperwork for company drivers."
            badge="Company Driver"
          />
          <div className="space-y-4">
            {w2Templates.map(renderTemplate)}
            <W2Documents
              value={w2Docs}
              onChange={onW2DocsChange}
              onValidityChange={setW2Valid}
            />
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <SectionHeader
            title="1099 Contractor Documents"
            description="Independent contractor paperwork and tax forms."
            badge="Independent Contractor"
          />
          <div className="space-y-4">
            {contractorTemplates.map(renderTemplate)}
            <ContractorDocuments
              value={contractorDocs}
              onChange={onContractorDocsChange}
              onValidityChange={setContractorValid}
            />
          </div>
        </section>
      )}
    </div>
  );

}
