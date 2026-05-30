import { Fragment, useMemo } from 'react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/components/driver/SignaturePad';
import { extractStateFromAddress } from '@/lib/us-states';

const COMPANY_ADDRESS = '4700 Diplomacy Rd, Fort Worth, TX 76155';
const TOKEN_REGEX =
  /\{\{\s*(today_date|company_address|driver_address|driver_name|cdl_number|contractor_state|owner_signature|driver_signature)\s*\}\}/g;

export interface DocumentTemplateRendererProps {
  content: string;
  driverAddress: string;
  onDriverAddressChange: (value: string) => void;
  signature: string | null;
  onSignatureCapture: (dataUrl: string) => void;
  driverName?: string;
  cdlNumber: string;
  onCdlNumberChange: (value: string) => void;
  showAttachmentUpload?: boolean;
  attachment?: File | null;
  onAttachmentChange?: (file: File | null) => void;
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
  showAttachmentUpload = false,
  attachment = null,
  onAttachmentChange,
}: DocumentTemplateRendererProps) {

  const nodes = useMemo(() => tokenize(content), [content]);
  const todayFormatted = useMemo(() => format(new Date(), 'MMMM d, yyyy'), []);
  const contractorState = useMemo(() => extractStateFromAddress(driverAddress), [driverAddress]);

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
          default:
            return <span key={i}>{`{{${node.name}}}`}</span>;
        }
      })}
    </div>
  );
}
