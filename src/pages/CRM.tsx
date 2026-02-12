import { useState, useMemo } from 'react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { Search, Eye, Edit2, Trash2 } from 'lucide-react';
import {
  useUnifiedContacts,
  useContactMutations,
  useResourceMutations,
  useFacilityMutations,
  getSubTypeLabel,
  type UnifiedContact,
} from '@/hooks/useCRMData';
import { useAuth } from '@/contexts/AuthContext';
import { CRMSummaryCards } from '@/components/crm/CRMSummaryCards';
import { ContactFormDialog } from '@/components/crm/ContactFormDialog';
import { ContactDetailSheet } from '@/components/crm/ContactDetailSheet';

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'broker', label: 'Brokers' },
  { value: 'agent', label: 'Agents' },
  { value: 'shipper', label: 'Shippers' },
  { value: 'receiver', label: 'Receivers' },
  { value: 'vendor', label: 'Vendors' },
];

const TYPE_COLORS: Record<string, string> = {
  broker: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  agent: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  shipper: 'bg-green-500/10 text-green-600 border-green-500/30',
  receiver: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  vendor: 'bg-red-500/10 text-red-600 border-red-500/30',
};

export default function CRM() {
  const { hasRole, isOwner } = useAuth();
  const canEdit = isOwner || hasRole('dispatcher');

  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<UnifiedContact | null>(null);
  const [detailContact, setDetailContact] = useState<UnifiedContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedContact | null>(null);

  const { data: contacts, isLoading } = useUnifiedContacts(typeFilter);
  const { deleteContact: deleteCRMMutation } = useContactMutations();
  const { deleteResource: deleteResourceMutation } = useResourceMutations();
  const { deleteFacility: deleteFacilityMutation } = useFacilityMutations();

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        (c.contact_name && c.contact_name.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.agent_code && c.agent_code.toLowerCase().includes(q)) ||
        (c.tags && c.tags.some((t) => t.toLowerCase().includes(q))) ||
        (c.service_area && c.service_area.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  const handleEdit = (contact: UnifiedContact) => {
    setDetailContact(null);
    setEditContact(contact);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.source === 'resource') {
      await deleteResourceMutation.mutateAsync(deleteTarget.id);
    } else if (deleteTarget.source === 'facility') {
      await deleteFacilityMutation.mutateAsync(deleteTarget.id);
    } else {
      await deleteCRMMutation.mutateAsync(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const isDeleting = deleteCRMMutation.isPending || deleteResourceMutation.isPending || deleteFacilityMutation.isPending;

  return (
    <>
      <PageHeader
        title="CRM"
        description="Manage brokers, agents, shippers, receivers, and vendors"
        action={canEdit ? { label: 'Add Contact', onClick: () => { setEditContact(null); setFormOpen(true); } } : undefined}
      />

      <CRMSummaryCards contacts={contacts} />

      <div className="mt-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={typeFilter} onValueChange={setTypeFilter}>
            <TabsList>
              {TYPE_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Contacts Table */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading contacts...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search ? 'No contacts match your search.' : 'No contacts yet. Add your first contact to get started.'}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="hidden lg:table-cell">Phone</TableHead>
                  <TableHead className="hidden lg:table-cell">Location</TableHead>
                  <TableHead className="hidden md:table-cell">Details</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((contact) => {
                  const subType = getSubTypeLabel(contact);
                  return (
                    <TableRow key={`${contact.source}-${contact.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailContact(contact)}>
                      <TableCell>
                        <div className="font-medium">{contact.company_name}</div>
                        {contact.agent_code && (
                          <span className="text-xs text-muted-foreground">Code: {contact.agent_code}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {contact.contact_name || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className={`text-xs capitalize w-fit ${TYPE_COLORS[contact.contact_type] || ''}`}>
                            {contact.contact_type}
                          </Badge>
                          {subType && (
                            <span className="text-[10px] text-muted-foreground">{subType}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {contact.phone || '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {[contact.city, contact.state].filter(Boolean).join(', ') || contact.service_area || '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {contact.source === 'facility' && contact.appointment_required && (
                            <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">Appt Req</Badge>
                          )}
                          {contact.agent_status === 'unsafe' && (
                            <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">Unsafe</Badge>
                          )}
                          {contact.agent_status === 'safe' && contact.source === 'resource' && (
                            <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">Safe</Badge>
                          )}
                          {(contact.tags || []).slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                          ))}
                          {(contact.tags || []).length > 2 && (
                            <Badge variant="secondary" className="text-[10px]">+{contact.tags!.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailContact(contact)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(contact)}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(contact)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} editContact={editContact} />
      <ContactDetailSheet
        contact={detailContact}
        open={!!detailContact}
        onOpenChange={(open) => !open && setDetailContact(null)}
        onEdit={handleEdit}
        readOnly={!canEdit}
      />
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Contact"
        description={`Are you sure you want to delete "${deleteTarget?.company_name}"? This action cannot be undone.`}
        isDeleting={isDeleting}
      />
    </>
  );
}
