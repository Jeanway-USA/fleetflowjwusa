import { Fragment, useMemo } from 'react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/components/driver/SignaturePad';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { extractStateFromAddress } from '@/lib/us-states';
import { formatPayRate, payTypeLabel, type DriverPayType } from '@/lib/pay-format';

const COMPANY_ADDRESS = '4700 Diplomacy Rd, Fort Worth, TX 76155';
const TOKEN_REGEX =
  /\{\{\s*(today_date|company_address|driver_address|driver_name|cdl_number|contractor_state|owner_signature|driver_signature|file_upload|license_number|license_expiry|dot_medical_expiry|endorsements_list|twic_status|phone_number|pay_type|pay_rate|ssn|email|bank_account_type|bank_name|routing_number|account_number)\s*\}\}/g;


export interface DocumentTemplateRendererProps {
  content: string;
  driverAddress: string;
  onDriverAddressChange: (value: string) => void;
  signature: string | null;
  onSignatureCapture: (dataUrl: string) => void;
  driverName?: string;
  cdlNumber: string;
  onCdlNumberChange: (value: string) => void;
  attachment?: File | null;
  onAttachmentChange?: (file: File | null) => void;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  medicalCardExpiry?: string | null;
  endorsements?: string[] | null;
  hasTwic?: boolean | null;
  twicExpiry?: string | null;
  phoneNumber?: string | null;
  payType?: DriverPayType;
  payRate?: number | null;
  ssn?: string;
  onSsnChange?: (value: string) => void;
  email?: string;
  onEmailChange?: (value: string) => void;
  bankName?: string;
  onBankNameChange?: (value: string) => void;
  routingNumber?: string;
  onRoutingNumberChange?: (value: string) => void;
  accountNumber?: string;
  onAccountNumberChange?: (value: string) => void;
  bankAccountType?: 'checking' | 'savings' | '';
  onBankAccountTypeChange?: (value: 'checking' | 'savings') => void;
}


function formatDateToken(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'MMMM d, yyyy');
}


type TextNode = { kind: 'text'; value: string };
type TokenNode = { kind: 'token'; name: string };
type Node = TextNode | TokenNode;

function tokenize(content: string): Node[] {
  const nodes: Node[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ kind: 'text', value: content.slice(lastIndex, match.index) });
    }
    nodes.push({ kind: 'token', name: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    nodes.push({ kind: 'text', value: content.slice(lastIndex) });
  }
  return nodes;
}

const MARKDOWN_COMPONENTS = {
  h1: (props: any) => <h1 className="text-2xl font-bold tracking-tight mt-4 mb-2" {...props} />,
  h2: (props: any) => <h2 className="text-xl font-semibold tracking-tight mt-4 mb-2" {...props} />,
  h3: (props: any) => <h3 className="text-lg font-semibold mt-3 mb-2" {...props} />,
  p: (props: any) => <p className="my-2 leading-relaxed whitespace-pre-wrap" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-6 my-2 space-y-1" {...props} />,
  ol: (props: any) => <ol className="list-decimal pl-6 my-2 space-y-1" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  strong: (props: any) => <strong className="font-semibold" {...props} />,
  em: (props: any) => <em className="italic" {...props} />,
  hr: (props: any) => <hr className="my-4 border-border" {...props} />,
  blockquote: (props: any) => (
    <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground my-3" {...props} />
  ),
  a: (props: any) => <a className="text-primary underline underline-offset-2" {...props} />,
  code: (props: any) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm" {...props} />
  ),
};

export function DocumentTemplateRenderer({
  content,
  driverAddress,
  onDriverAddressChange,
  signature,
  onSignatureCapture,
  driverName,
  cdlNumber,
  onCdlNumberChange,
  attachment = null,
  onAttachmentChange,
  licenseNumber,
  licenseExpiry,
  medicalCardExpiry,
  endorsements,
  hasTwic,
  twicExpiry,
  phoneNumber,
  ssn = '',
  onSsnChange,
  email = '',
  onEmailChange,
  bankName = '',
  onBankNameChange,
  routingNumber = '',
  onRoutingNumberChange,
  accountNumber = '',
  onAccountNumberChange,
  bankAccountType = '',
  onBankAccountTypeChange,
}: DocumentTemplateRendererProps) {


  const nodes = useMemo(() => tokenize(content), [content]);
  const todayFormatted = useMemo(() => format(new Date(), 'MMMM d, yyyy'), []);
  const contractorState = useMemo(() => extractStateFromAddress(driverAddress), [driverAddress]);

  const licenseExpiryText = useMemo(() => formatDateToken(licenseExpiry), [licenseExpiry]);
  const medicalExpiryText = useMemo(() => formatDateToken(medicalCardExpiry), [medicalCardExpiry]);
  const twicExpiryText = useMemo(() => formatDateToken(twicExpiry), [twicExpiry]);
  const endorsementsText = useMemo(
    () => (endorsements && endorsements.length > 0 ? endorsements.join(', ') : 'None'),
    [endorsements],
  );
  const twicStatusText = useMemo(() => {
    if (hasTwic == null) return null;
    if (!hasTwic) return 'No';
    return twicExpiryText ? `Yes — expires ${twicExpiryText}` : 'Yes';
  }, [hasTwic, twicExpiryText]);

  return (
    <div className="text-foreground leading-relaxed">
      {nodes.map((node, i) => {
        if (node.kind === 'text') {
          if (!node.value.trim()) {
            return <span key={i} className="whitespace-pre-wrap">{node.value}</span>;
          }
          return (
            <ReactMarkdown
              key={i}
              remarkPlugins={[remarkGfm]}
              components={MARKDOWN_COMPONENTS}
            >
              {node.value}
            </ReactMarkdown>
          );
        }

        switch (node.name) {
          case 'today_date':
            return (
              <span key={i} className="font-medium">
                {todayFormatted}
              </span>
            );
          case 'company_address':
            return (
              <span key={i} className="font-medium">
                {COMPANY_ADDRESS}
              </span>
            );
          case 'driver_name':
            return (
              <span key={i} className="font-medium">
                {driverName?.trim() ? driverName : <span className="text-muted-foreground italic">[Your name]</span>}
              </span>
            );
          case 'cdl_number':
            return (
              <span key={i} className="inline-block align-middle mx-1 min-w-[200px] max-w-full">
                <Input
                  value={cdlNumber}
                  onChange={(e) => onCdlNumberChange(e.target.value)}
                  placeholder="CDL number"
                  aria-label="CDL number"
                  className="h-9 inline-block"
                />
              </span>
            );
          case 'contractor_state':
            return (
              <span key={i} className="font-medium">
                {contractorState ?? <span className="text-muted-foreground italic">[State]</span>}
              </span>
            );
          case 'owner_signature':
            return (
              <span
                key={i}
                className="my-3 inline-flex min-w-[240px] items-center justify-center rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
              >
                Owner Signature Pending
              </span>
            );
          case 'driver_address':
            return (
              <span key={i} className="inline-block align-middle mx-1 min-w-[260px] max-w-full">
                <Input
                  value={driverAddress}
                  onChange={(e) => onDriverAddressChange(e.target.value)}
                  placeholder="Your address"
                  aria-label="Driver address"
                  className="h-9 inline-block"
                />
              </span>
            );
          case 'driver_signature':
            return (
              <Fragment key={i}>
                <div className="my-4 not-prose">
                  <Label className="mb-2 block text-sm font-medium">Driver Signature</Label>
                  {signature ? (
                    <div className="rounded-md border bg-card p-3">
                      <img
                        src={signature}
                        alt="Driver signature"
                        className="h-24 w-auto object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => onSignatureCapture('')}
                        className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Clear &amp; re-sign
                      </button>
                    </div>
                  ) : (
                    <SignaturePad onSignatureCapture={onSignatureCapture} />
                  )}
                </div>
              </Fragment>
            );
          case 'file_upload':
            return (
              <div key={i} className="my-4 rounded-md border border-dashed bg-muted/30 p-4 not-prose">
                <Label htmlFor={`file-upload-${i}`} className="block text-sm font-medium">
                  Attach voided check or bank letter
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Required. Accepted formats: PDF, JPG, PNG (max 10 MB).
                </p>
                <Input
                  id={`file-upload-${i}`}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 10 * 1024 * 1024) {
                      onAttachmentChange?.(null);
                      e.target.value = '';
                      return;
                    }
                    onAttachmentChange?.(file);
                  }}
                />
                {attachment && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Selected: <span className="font-medium text-foreground">{attachment.name}</span>{' '}
                    ({(attachment.size / 1024).toFixed(0)} KB)
                  </p>
                )}
              </div>
            );
          case 'license_number':
            return (
              <span key={i} className="font-medium">
                {licenseNumber?.trim()
                  ? licenseNumber
                  : <span className="text-muted-foreground italic">[Not provided]</span>}
              </span>
            );
          case 'license_expiry':
            return (
              <span key={i} className="font-medium">
                {licenseExpiryText ?? <span className="text-muted-foreground italic">[Not provided]</span>}
              </span>
            );
          case 'dot_medical_expiry':
            return (
              <span key={i} className="font-medium">
                {medicalExpiryText ?? <span className="text-muted-foreground italic">[Not provided]</span>}
              </span>
            );
          case 'endorsements_list':
            return (
              <span key={i} className="font-medium">
                {endorsementsText}
              </span>
            );
          case 'twic_status':
            return (
              <span key={i} className="font-medium">
                {twicStatusText ?? <span className="text-muted-foreground italic">[Not provided]</span>}
              </span>
            );
          case 'phone_number':
            return (
              <span key={i} className="font-medium">
                {phoneNumber?.trim()
                  ? phoneNumber
                  : <span className="text-muted-foreground italic">[Not provided]</span>}
              </span>
            );
          case 'ssn':
            return (
              <span key={i} className="inline-block align-middle mx-1 min-w-[180px] max-w-full">
                <Input
                  value={ssn}
                  onChange={(e) => onSsnChange?.(e.target.value)}
                  placeholder="SSN (XXX-XX-XXXX)"
                  aria-label="Social Security Number"
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-9 inline-block"
                />
              </span>
            );
          case 'email':
            return (
              <span key={i} className="inline-block align-middle mx-1 min-w-[220px] max-w-full">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => onEmailChange?.(e.target.value)}
                  placeholder="Email address"
                  aria-label="Email address"
                  className="h-9 inline-block"
                />
              </span>
            );
          case 'bank_account_type':
            return (
              <span key={i} className="inline-block align-middle mx-1 min-w-[160px] max-w-full">
                <Select
                  value={bankAccountType || undefined}
                  onValueChange={(v) => onBankAccountTypeChange?.(v as 'checking' | 'savings')}
                >
                  <SelectTrigger className="h-9 inline-flex" aria-label="Bank account type">
                    <SelectValue placeholder="Account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Checking</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </span>
            );
          case 'bank_name':
            return (
              <span key={i} className="inline-block align-middle mx-1 min-w-[220px] max-w-full">
                <Input
                  value={bankName}
                  onChange={(e) => onBankNameChange?.(e.target.value)}
                  placeholder="Bank name"
                  aria-label="Bank name"
                  className="h-9 inline-block"
                />
              </span>
            );
          case 'routing_number':
            return (
              <span key={i} className="inline-block align-middle mx-1 min-w-[180px] max-w-full">
                <Input
                  value={routingNumber}
                  onChange={(e) => onRoutingNumberChange?.(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Routing number"
                  aria-label="Routing number"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={9}
                  className="h-9 inline-block"
                />
              </span>
            );
          case 'account_number':
            return (
              <span key={i} className="inline-block align-middle mx-1 min-w-[200px] max-w-full">
                <Input
                  value={accountNumber}
                  onChange={(e) => onAccountNumberChange?.(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Account number"
                  aria-label="Account number"
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-9 inline-block"
                />
              </span>
            );
          default:
            return <span key={i}>{`{{${node.name}}}`}</span>;

        }
      })}
    </div>
  );
}

