import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Globe, MapPin, Edit2, Clock, Info, ShieldCheck, ShieldAlert, MapPinned, Zap, Route } from 'lucide-react';
import { ActivityTimeline } from './ActivityTimeline';
import { ContactLoadHistory } from './ContactLoadHistory';
import { lazy, Suspense } from 'react';
const ContactRevenueStats = lazy(() =>
  import('./ContactRevenueStats').then(m => ({ default: m.ContactRevenueStats })),
);
import { ChartSkeleton } from '@/components/shared/LazyFallbacks';
import { getSubTypeLabel, useAgentVolumeStats, useAgentLanes, type UnifiedContact } from '@/hooks/useCRMData';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';

interface ContactDetailSheetProps {
  contact: UnifiedContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (contact: UnifiedContact) => void;
  readOnly?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  broker: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  agent: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  shipper: 'bg-green-500/10 text-green-600 border-green-500/30',
  receiver: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  vendor: 'bg-red-500/10 text-red-600 border-red-500/30',
  shop: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  warehouse: 'bg-teal-500/10 text-teal-600 border-teal-500/30',
  terminal: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30',
  both: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
};

type Kind = 'broker' | 'agent' | 'facility' | 'vendor-roadside' | 'vendor-resource' | 'vendor-other';

function classify(contact: UnifiedContact): Kind {
  if (contact.source === 'facility') return 'facility';
  if (contact.source === 'resource') {
    if (contact.resource_type === 'load_agent') return 'agent';
    if (contact.resource_type === 'roadside') return 'vendor-roadside';
    return 'vendor-resource';
  }
  // CRM source
  if (contact.contact_type === 'broker') return 'broker';
  if (contact.contact_type === 'agent') return 'agent';
  return 'vendor-other';
}

function Field({ icon: Icon, label, value, href }: { icon?: any; label: string; value: React.ReactNode; href?: string }) {
  if (value === null || value === undefined || value === '') return null;
  const content = (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm text-foreground break-words">{value}</div>
      </div>
    </div>
  );
  if (href) {
    return <a href={href} className="block hover:bg-muted/40 rounded-md -mx-1 px-1 py-0.5">{content}</a>;
  }
  return content;
}

export function ContactDetailSheet({ contact, open, onOpenChange, onEdit, readOnly = false }: ContactDetailSheetProps) {
  if (!contact) return null;

  const subType = getSubTypeLabel(contact);
  const kind = classify(contact);
  const supportsTabs = kind === 'broker' || (kind === 'agent' && contact.source === 'crm');

  const handleEditClick = () => {
    onOpenChange(false);
    setTimeout(() => onEdit(contact), 180);
  };

  const addressLine = [contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(', ');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0 overflow-hidden">
        <SheetHeader className="shrink-0 mx-0 mt-0 px-6 pt-6 pb-4 pr-12 border-b static">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-lg">{contact.company_name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={`text-xs capitalize ${TYPE_COLORS[contact.contact_type] || ''}`}>
                  {contact.contact_type}
                </Badge>
                {subType && <Badge variant="secondary" className="text-[10px]">{subType}</Badge>}
                {contact.agent_code && (
                  <Badge variant="outline" className="text-xs font-mono">Code: {contact.agent_code}</Badge>
                )}
                {contact.agent_status === 'unsafe' && (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <ShieldAlert className="h-3 w-3" /> Unsafe
                  </Badge>
                )}
                {contact.agent_status === 'safe' && (kind === 'agent') && (
                  <Badge variant="outline" className="text-xs gap-1 bg-success/10 text-success border-success/20">
                    <ShieldCheck className="h-3 w-3" /> Safe
                  </Badge>
                )}
                {!contact.is_active && (
                  <Badge variant="destructive" className="text-xs">Inactive</Badge>
                )}
              </div>
            </div>
            {!readOnly && (
              <Button variant="ghost" size="icon" onClick={handleEditClick} aria-label="Edit">
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* === Type-aware information section === */}
          {kind === 'broker' && (
            <section className="space-y-3 pb-4 border-b border-border">
              <Field icon={Info} label="Primary Contact" value={contact.contact_name} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Phone} label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
                <Field icon={Mail} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
              </div>
              <Field icon={Globe} label="Website" value={contact.website} href={contact.website ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`) : undefined} />
              <Field icon={MapPin} label="Address" value={addressLine || null} />
              {contact.tags && contact.tags.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {contact.notes && (
                <Field icon={Info} label="Notes" value={<span className="whitespace-pre-wrap">{contact.notes}</span>} />
              )}
            </section>
          )}

          {kind === 'agent' && (
            <section className="space-y-3 pb-4 border-b border-border">
              {contact.agent_code && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">Agent Code</div>
                  <div className="text-2xl font-mono font-bold tracking-widest text-amber-700 dark:text-amber-300">{contact.agent_code}</div>
                </div>
              )}
              <Field icon={Info} label="Agency Name" value={contact.company_name} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Phone} label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
                <Field icon={Mail} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
              </div>
              {contact.notes && (
                <Field icon={Info} label="Information" value={<span className="whitespace-pre-wrap">{contact.notes}</span>} />
              )}
            </section>
          )}

          {kind === 'facility' && (
            <section className="space-y-3 pb-4 border-b border-border">
              <Field icon={MapPin} label="Address" value={addressLine || null} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Info} label="Contact" value={contact.contact_name} />
                <Field icon={Phone} label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
                <Field icon={Mail} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
                <Field icon={Clock} label="Operating Hours" value={contact.operating_hours} />
              </div>
              <Field icon={Info} label="Dock Info" value={contact.dock_info} />
              {contact.appointment_required && (
                <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">
                  Appointment Required
                </Badge>
              )}
              {contact.notes && (
                <Field icon={Info} label="Notes" value={<span className="whitespace-pre-wrap">{contact.notes}</span>} />
              )}
            </section>
          )}

          {kind === 'vendor-roadside' && (
            <section className="space-y-3 pb-4 border-b border-border">
              {contact.service_area && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-red-700 dark:text-red-400 flex items-center gap-1">
                    <MapPinned className="h-3 w-3" /> Service Area
                  </div>
                  <div className="text-base font-semibold text-red-700 dark:text-red-300 mt-0.5">{contact.service_area}</div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Phone} label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
                <Field icon={Mail} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
              </div>
              <Field icon={Globe} label="Website" value={contact.website} href={contact.website ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`) : undefined} />
              {contact.notes && (
                <Field icon={Info} label="Notes" value={<span className="whitespace-pre-wrap">{contact.notes}</span>} />
              )}
            </section>
          )}

          {kind === 'vendor-resource' && (
            <section className="space-y-3 pb-4 border-b border-border">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Phone} label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
                <Field icon={Mail} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
              </div>
              <Field icon={Globe} label="Website" value={contact.website} href={contact.website ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`) : undefined} />
              <Field icon={MapPin} label="Address" value={contact.address} />
              {contact.notes && (
                <Field icon={Info} label="Notes" value={<span className="whitespace-pre-wrap">{contact.notes}</span>} />
              )}
            </section>
          )}

          {kind === 'vendor-other' && (
            <section className="space-y-3 pb-4 border-b border-border">
              <Field icon={Info} label="Contact" value={contact.contact_name} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Phone} label="Phone" value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
                <Field icon={Mail} label="Email" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
              </div>
              <Field icon={Globe} label="Website" value={contact.website} href={contact.website ? (contact.website.startsWith('http') ? contact.website : `https://${contact.website}`) : undefined} />
              <Field icon={MapPin} label="Address" value={addressLine || null} />
              {contact.tags && contact.tags.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {contact.notes && (
                <Field icon={Info} label="Notes" value={<span className="whitespace-pre-wrap">{contact.notes}</span>} />
              )}
            </section>
          )}

          {/* === Tabs (only for brokers and CRM-source agents) === */}
          {supportsTabs ? (
            <Tabs defaultValue="activity">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
                <TabsTrigger value="loads" className="text-xs">Load History</TabsTrigger>
                <TabsTrigger value="revenue" className="text-xs">Revenue</TabsTrigger>
              </TabsList>
              <TabsContent value="activity" className="mt-3">
                <ActivityTimeline contactId={contact.id} readOnly={readOnly} />
              </TabsContent>
              <TabsContent value="loads" className="mt-3">
                <ContactLoadHistory contactId={contact.id} />
              </TabsContent>
              <TabsContent value="revenue" className="mt-3">
                <Suspense fallback={<ChartSkeleton height={260} />}>
                  <ContactRevenueStats contactId={contact.id} />
                </Suspense>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-4">
              Activity log & revenue analytics are only available for brokers and CRM-source agents.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
