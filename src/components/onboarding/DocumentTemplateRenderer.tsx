import { Fragment, useMemo, useState } from 'react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/components/driver/SignaturePad';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { extractStateFromAddress } from '@/lib/us-states';
import { formatPayRate, payTypeLabel, type DriverPayType } from '@/lib/pay-format';
import { cn } from '@/lib/utils';

const FILL_IN_INPUT_CLASS =
  "inline-block h-7 sm:h-7 align-baseline w-auto min-w-0 " +
  "px-1 py-0 rounded-none border-0 border-b-2 border-primary/70 " +
  "bg-transparent " +
  "text-base sm:text-sm font-medium text-slate-900 " +
  "focus-visible:ring-0 focus-visible:ring-offset-0 " +
  "focus-visible:border-primary focus-visible:bg-primary/5 " +
  "placeholder:text-slate-400 placeholder:font-normal";

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

// Same as MARKDOWN_COMPONENTS but unwraps the outer <p> so its content can
// render as inline children inside an enclosing paragraph (used when a
// paragraph contains fill-in tokens that must stay on the same line as the
// surrounding text).
const INLINE_MARKDOWN_COMPONENTS = {
  ...MARKDOWN_COMPONENTS,
  p: ({ children }: any) => <>{children}</>,
};

// Tokens that render as their own block (not inline within a sentence).
const BLOCK_TOKENS = new Set(['driver_signature', 'file_upload', 'owner_signature']);

// Detect block-level markdown so the whole block routes through
// MARKDOWN_COMPONENTS (headings, lists, hr, blockquotes, code fences) instead
// of being wrapped in an inline paragraph.
function isBlockMarkdown(text: string): boolean {
  const first = text.trim().split('\n')[0] ?? '';
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|---|\*\*\*|___|```)/.test(first);
}

// Detect inline markdown syntax. When absent we render the text as a plain
// <span> so adjacent whitespace is preserved exactly (so "resides in " stays
// glued to the input that follows it).
function hasInlineMarkdown(text: string): boolean {
  return /(\*\*|__|`|\[[^\]]+\]\([^)]+\)|~~)/.test(text);
}

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
  payType = null,
  payRate = null,
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

  // Renders a single token as an inline element.
  const renderToken = (name: string, key: string) => {
    switch (name) {
      case 'today_date':
        return <span key={key} className="font-medium">{todayFormatted}</span>;
      case 'company_address':
        return <span key={key} className="font-medium">{COMPANY_ADDRESS}</span>;
      case 'driver_name':
        return (
          <span key={key} className="font-medium">
            {driverName?.trim() ? driverName : <span className="text-muted-foreground italic">[Your name]</span>}
          </span>
        );
      case 'cdl_number':
        return (
          <Input
            key={key}
            value={cdlNumber}
            onChange={(e) => onCdlNumberChange(e.target.value)}
            placeholder="CDL number"
            aria-label="CDL number"
            className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[16ch]")}
          />
        );
      case 'contractor_state':
        return (
          <span key={key} className="font-medium">
            {contractorState ?? <span className="text-muted-foreground italic">[State]</span>}
          </span>
        );
      case 'owner_signature':
        return (
          <span
            key={key}
            className="my-3 inline-flex min-w-[240px] items-center justify-center rounded-md border border-dashed border-muted-foreground/40 bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            Owner Signature Pending
          </span>
        );
      case 'driver_address':
        return (
          <Input
            key={key}
            value={driverAddress}
            onChange={(e) => onDriverAddressChange(e.target.value)}
            placeholder="Your address"
            aria-label="Driver address"
            className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[28ch]")}
          />
        );
      case 'driver_signature':
        return (
          <div key={key} className="my-4 not-prose">
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
        );
      case 'file_upload':
        return (
          <div key={key} className="my-4 rounded-md border border-dashed bg-muted/30 p-4 not-prose">
            <Label htmlFor={`file-upload-${key}`} className="block text-sm font-medium">
              Attach voided check or bank letter
            </Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Required. Accepted formats: PDF, JPG, PNG (max 10 MB).
            </p>
            <Input
              id={`file-upload-${key}`}
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
          <span key={key} className="font-medium">
            {licenseNumber?.trim() ? licenseNumber : <span className="text-muted-foreground italic">[Not provided]</span>}
          </span>
        );
      case 'license_expiry':
        return (
          <span key={key} className="font-medium">
            {licenseExpiryText ?? <span className="text-muted-foreground italic">[Not provided]</span>}
          </span>
        );
      case 'dot_medical_expiry':
        return (
          <span key={key} className="font-medium">
            {medicalExpiryText ?? <span className="text-muted-foreground italic">[Not provided]</span>}
          </span>
        );
      case 'endorsements_list':
        return <span key={key} className="font-medium">{endorsementsText}</span>;
      case 'twic_status':
        return (
          <span key={key} className="font-medium">
            {twicStatusText ?? <span className="text-muted-foreground italic">[Not provided]</span>}
          </span>
        );
      case 'phone_number':
        return (
          <span key={key} className="font-medium">
            {phoneNumber?.trim() ? phoneNumber : <span className="text-muted-foreground italic">[Not provided]</span>}
          </span>
        );
      case 'pay_type':
        return payType ? (
          <span key={key} className="font-medium">{payTypeLabel(payType)}</span>
        ) : (
          <span key={key} className="font-bold text-destructive">[TERMS NOT SET - CONTACT HIRING MANAGER]</span>
        );
      case 'pay_rate':
        return payType && payRate != null ? (
          <span key={key} className="font-medium">{formatPayRate(payType, payRate)}</span>
        ) : (
          <span key={key} className="font-bold text-destructive">[TERMS NOT SET - CONTACT HIRING MANAGER]</span>
        );
      case 'ssn':
        return (
          <Input
            key={key}
            value={ssn}
            onChange={(e) => onSsnChange?.(e.target.value)}
            placeholder="SSN (XXX-XX-XXXX)"
            aria-label="Social Security Number"
            inputMode="numeric"
            autoComplete="off"
            className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[14ch]")}
          />
        );
      case 'email':
        return (
          <Input
            key={key}
            type="email"
            value={email}
            onChange={(e) => onEmailChange?.(e.target.value)}
            placeholder="Email address"
            aria-label="Email address"
            className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[22ch]")}
          />
        );
      case 'bank_account_type':
        return (
          <Select
            key={key}
            value={bankAccountType || undefined}
            onValueChange={(v) => onBankAccountTypeChange?.(v as 'checking' | 'savings')}
          >
            <SelectTrigger
              className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[14ch] inline-flex")}
              aria-label="Bank account type"
            >
              <SelectValue placeholder="Account type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="checking">Checking</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
            </SelectContent>
          </Select>
        );
      case 'bank_name':
        return (
          <Input
            key={key}
            value={bankName}
            onChange={(e) => onBankNameChange?.(e.target.value)}
            placeholder="Bank name"
            aria-label="Bank name"
            className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[20ch]")}
          />
        );
      case 'routing_number':
        return (
          <Input
            key={key}
            value={routingNumber}
            onChange={(e) => onRoutingNumberChange?.(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Routing number"
            aria-label="Routing number"
            inputMode="numeric"
            autoComplete="off"
            maxLength={9}
            className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[11ch]")}
          />
        );
      case 'account_number':
        return (
          <Input
            key={key}
            value={accountNumber}
            onChange={(e) => onAccountNumberChange?.(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Account number"
            aria-label="Account number"
            inputMode="numeric"
            autoComplete="off"
            className={cn(FILL_IN_INPUT_CLASS, "mx-1 w-[16ch]")}
          />
        );
      default:
        return <span key={key}>{`{{${name}}}`}</span>;
    }
  };

  // Group the flat node stream into paragraph groups separated by blank lines
  // (\n\n+ inside text nodes). Block-level tokens (signature, file upload,
  // owner-signature) also force a paragraph break so they render on their own.
  const blocks = useMemo(() => {
    const groups: Node[][] = [[]];
    const pushText = (value: string) => {
      const parts = value.split(/\n[ \t]*\n+/);
      parts.forEach((part, idx) => {
        if (idx > 0) groups.push([]);
        if (part.length > 0) {
          groups[groups.length - 1].push({ kind: 'text', value: part });
        }
      });
    };
    for (const node of nodes) {
      if (node.kind === 'text') {
        pushText(node.value);
      } else if (BLOCK_TOKENS.has(node.name)) {
        groups.push([node]);
        groups.push([]);
      } else {
        groups[groups.length - 1].push(node);
      }
    }
    return groups.filter((g) => g.length > 0);
  }, [nodes]);

  return (
    <div className="text-slate-900 leading-relaxed">
      {blocks.map((group, gi) => {
        // Solo block token → render the block element directly.
        if (group.length === 1 && group[0].kind === 'token' && BLOCK_TOKENS.has(group[0].name)) {
          return renderToken(group[0].name, `b-${gi}`);
        }

        // All-text block with block-level markdown (heading, list, hr, …) →
        // use full ReactMarkdown so headings/lists render correctly.
        const onlyText = group.every((n) => n.kind === 'text');
        if (onlyText) {
          const text = group.map((n) => (n as TextNode).value).join('');
          if (isBlockMarkdown(text)) {
            return (
              <ReactMarkdown
                key={`b-${gi}`}
                remarkPlugins={[remarkGfm]}
                components={MARKDOWN_COMPONENTS}
              >
                {text}
              </ReactMarkdown>
            );
          }
        }

        // Inline paragraph: text + inline tokens, all on the same wrapping line.
        return (
          <p key={`b-${gi}`} className="my-2 leading-relaxed">
            {group.map((node, ni) => {
              if (node.kind === 'text') {
                if (hasInlineMarkdown(node.value)) {
                  return (
                    <ReactMarkdown
                      key={`b-${gi}-n-${ni}`}
                      remarkPlugins={[remarkGfm]}
                      components={INLINE_MARKDOWN_COMPONENTS}
                    >
                      {node.value}
                    </ReactMarkdown>
                  );
                }
                // Plain text: render as span so adjacent whitespace is preserved
                // exactly (newlines collapse to a single space like normal HTML).
                return (
                  <span key={`b-${gi}-n-${ni}`}>
                    {node.value.replace(/\s*\n\s*/g, ' ')}
                  </span>
                );
              }
              return renderToken(node.name, `b-${gi}-n-${ni}`);
            })}
          </p>
        );
      })}
    </div>
  );
}

