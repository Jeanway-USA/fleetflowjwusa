import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { Search, Eye, Edit2, Trash2 } from 'lucide-react';
import { useContacts, useContactMutations, type CRMContact } from '@/hooks/useCRMData';
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
  const [editContact, setEditContact] = useState<CRMContact | null>(null);
  const [detailContact, setDetailContact] = useState<CRMContact | null>(null);
  const [deleteContact, setDeleteContact] = useState<CRMContact | null>(null);

  const { data: contacts = [], isLoading } = useContacts(typeFilter);
  const { deleteContact: deleteContactMutation } = useContactMutations();

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
        (c.tags && c.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [contacts, search]);

  const handleEdit = (contact: CRMContact) => {
    setDetailContact(null);
    setEditContact(contact);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteContact) return;
    await deleteContactMutation.mutateAsync(deleteContact.id);
    setDeleteContact(null);
  };

  return (
    <DashboardLayout>
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
                  <TableHead className="hidden md:table-cell">Tags</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((contact) => (
                  <TableRow key={contact.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailContact(contact)}>
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
                      <Badge variant="outline" className={`text-xs capitalize ${TYPE_COLORS[contact.contact_type] || ''}`}>
                        {contact.contact_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {contact.phone || '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {[contact.city, contact.state].filter(Boolean).join(', ') || '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
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
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteContact(contact)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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
        open={!!deleteContact}
        onOpenChange={(open) => !open && setDeleteContact(null)}
        onConfirm={handleDelete}
        title="Delete Contact"
        description={`Are you sure you want to delete "${deleteContact?.company_name}"? This will also remove all linked activities.`}
        isDeleting={deleteContactMutation.isPending}
      />
    </DashboardLayout>
  );
}
