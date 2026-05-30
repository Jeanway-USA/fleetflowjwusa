import { Fragment, useMemo } from 'react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/components/driver/SignaturePad';

const COMPANY_ADDRESS = '4700 Diplomacy Rd, Fort Worth, TX 76155';
const TOKEN_REGEX =
  /\{\{\s*(today_date|company_address|driver_address|owner_signature|driver_signature)\s*\}\}/g;

export interface DocumentTemplateRendererProps {
  content: string;
  driverAddress: string;
  onDriverAddressChange: (value: string) => void;
  signature: string | null;
  onSignatureCapture: (dataUrl: string) => void;
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

export function DocumentTemplateRenderer({
  content,
  driverAddress,
  onDriverAddressChange,
  signature,
  onSignatureCapture,
}: DocumentTemplateRendererProps) {
  const nodes = useMemo(() => tokenize(content), [content]);
  const todayFormatted = useMemo(() => format(new Date(), 'MMMM d, yyyy'), []);

  return (
    <div className="text-foreground leading-relaxed">
      {nodes.map((node, i) => {
        if (node.kind === 'text') {
          return (
            <span key={i} className="whitespace-pre-wrap">
              {node.value}
            </span>
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
