import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Mail, Globe, MapPin, Edit2 } from 'lucide-react';
import { ActivityTimeline } from './ActivityTimeline';
import { ContactLoadHistory } from './ContactLoadHistory';
import { ContactRevenueStats } from './ContactRevenueStats';
import type { CRMContact } from '@/hooks/useCRMData';

interface ContactDetailSheetProps {
  contact: CRMContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (contact: CRMContact) => void;
  readOnly?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  broker: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  agent: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  shipper: 'bg-green-500/10 text-green-600 border-green-500/30',
  receiver: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  vendor: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export function ContactDetailSheet({ contact, open, onOpenChange, onEdit, readOnly = false }: ContactDetailSheetProps) {
  if (!contact) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-lg">{contact.company_name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={`text-xs capitalize ${TYPE_COLORS[contact.contact_type] || ''}`}>
                  {contact.contact_type}
                </Badge>
                {contact.agent_code && (
                  <Badge variant="outline" className="text-xs">Code: {contact.agent_code}</Badge>
                )}
                {!contact.is_active && (
                  <Badge variant="destructive" className="text-xs">Inactive</Badge>
                )}
              </div>
            </div>
            {!readOnly && (
              <Button variant="ghost" size="icon" onClick={() => onEdit(contact)}>
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Contact Info */}
        <div className="space-y-2 pb-4 border-b border-border">
          {contact.contact_name && (
            <p className="text-sm font-medium">{contact.contact_name}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-foreground">
                <Phone className="h-3 w-3" /> {contact.phone}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-foreground">
                <Mail className="h-3 w-3" /> {contact.email}
              </a>
            )}
            {contact.website && (
              <a href={contact.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                <Globe className="h-3 w-3" /> Website
              </a>
            )}
          </div>
          {(contact.city || contact.state || contact.address) && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {[contact.address, contact.city, contact.state].filter(Boolean).join(', ')}
            </p>
          )}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
              ))}
            </div>
          )}
          {contact.notes && (
            <p className="text-xs text-muted-foreground mt-2 italic">{contact.notes}</p>
          )}
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="activity" className="mt-4">
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
            <ContactRevenueStats contactId={contact.id} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
