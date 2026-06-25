import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { Search, Eye, Edit2, Trash2, MoreHorizontal, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  useUnifiedContacts,
  useContactMutations,
  useResourceMutations,
  useFacilityMutations,
  getSubTypeLabel,
  type UnifiedContact,
} from '@/hooks/useCRMData';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationMode } from '@/hooks/useOrganizationMode';
import { CRMSummaryCards } from '@/components/crm/CRMSummaryCards';
import { ContactFormDialog } from '@/components/crm/ContactFormDialog';
import { ContactDetailSheet } from '@/components/crm/ContactDetailSheet';
import { BrokerDatabase } from '@/components/crm/BrokerDatabase';

const AGENCY_TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'broker', label: 'Brokers' },
  { value: 'agent', label: 'Agents' },
  { value: 'shipper', label: 'Shippers' },
  { value: 'receiver', label: 'Receivers' },
];

const SCOPE_TABS = [
  { value: 'agencies', label: 'Freight Agencies' },
  { value: 'shops', label: 'Maintenance Shops' },
] as const;

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

export default function CRM() {
  const { isIndependent } = useOrganizationMode();

  if (isIndependent) {
    return <BrokerDatabase />;
  }

  return <AgentCRM />;
}

function AgentCRM() {
  const { hasRole, isOwner } = useAuth();
  const canEdit = isOwner || hasRole('dispatcher');

  const [scope, setScope] = useState<'agencies' | 'shops'>('agencies');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<UnifiedContact | null>(null);
  const [detailContact, setDetailContact] = useState<UnifiedContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedContact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const { data: contacts, isLoading } = useUnifiedContacts(typeFilter, scope);
  const { deleteContact: deleteCRMMutation } = useContactMutations();
  const { deleteResource: deleteResourceMutation } = useResourceMutations();
  const { deleteFacility: deleteFacilityMutation } = useFacilityMutations();

  // Open contact detail sheet from ?contactId= (command palette deep-link)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('contactId');
    if (id && contacts && contacts.length > 0) {
      const match = contacts.find((c) => c.id === id);
      if (match) setDetailContact(match);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, contacts]);

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
    // Let Radix Sheet finish its close animation before opening the Dialog
    // so the sheet's focus trap / overlay doesn't block the edit form.
    setTimeout(() => {
      setEditContact(contact);
      setFormOpen(true);
    }, 180);
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
        {/* Top-level scope toggle: Freight Agencies vs Maintenance Shops */}
        <Tabs value={scope} onValueChange={(v) => { setScope(v as 'agencies' | 'shops'); setTypeFilter('all'); }}>
          <TabsList className="h-11">
            {SCOPE_TABS.map((s) => (
              <TabsTrigger key={s.value} value={s.value} className="text-sm px-4">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 sm:pl-10"
            />
          </div>
          {scope === 'agencies' && (
            <Tabs value={typeFilter} onValueChange={setTypeFilter}>
              <TabsList>
                {AGENCY_TYPE_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="text-xs">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>


        {/* Contacts Table */}
        <DataTable
          columns={[
            { key: 'company_name', header: 'Company', render: (contact: UnifiedContact) => (
              <div>
                <div className="font-medium">{contact.company_name}</div>
                {contact.agent_code && (
                  <span className="text-xs text-muted-foreground">Code: {contact.agent_code}</span>
                )}
              </div>
            )},
            { key: 'contact_name', header: 'Contact', hiddenOnMobile: true, render: (contact: UnifiedContact) => contact.contact_name || '—' },
            { key: 'contact_type', header: 'Type', render: (contact: UnifiedContact) => {
              const subType = getSubTypeLabel(contact);
              return (
                <div className="flex flex-col gap-1">
                  <Badge variant="outline" className={`text-xs capitalize w-fit ${TYPE_COLORS[contact.contact_type] || ''}`}>
                    {contact.contact_type}
                  </Badge>
                  {subType && <span className="text-[10px] text-muted-foreground">{subType}</span>}
                </div>
              );
            }},
            { key: 'phone', header: 'Phone', hiddenOnMobile: true, render: (contact: UnifiedContact) => contact.phone || '—' },
            { key: 'location', header: 'Location', hiddenOnMobile: true, render: (contact: UnifiedContact) => 
              [contact.city, contact.state].filter(Boolean).join(', ') || contact.service_area || '—'
            },
            { key: 'details', header: 'Details', hiddenOnMobile: true, render: (contact: UnifiedContact) => (
              <div className="flex flex-wrap gap-1">
                {contact.source === 'crm' && contact.agent_status === 'safe' && (contact.notes || '').startsWith('Auto-added from') && (
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Auto-added</Badge>
                )}
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
            )},
            { key: 'actions', header: '', render: (contact: UnifiedContact) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDetailContact(contact)}>
                    <Eye className="mr-2 h-4 w-4" /> View Details
                  </DropdownMenuItem>
                  {canEdit && (
                    <DropdownMenuItem onClick={() => handleEdit(contact)}>
                      <Edit2 className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                  )}
                  {canEdit && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(contact)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )},
          ]}
          data={filtered}
          loading={isLoading}
          emptyMessage={search ? 'No contacts match your search.' : 'No contacts yet. Add your first contact to get started.'}
          onRowClick={(contact) => setDetailContact(contact)}
          onRowDoubleClick={(contact) => setDetailContact(contact)}
          tableId="crm-contacts"
          exportFilename="crm-contacts"
          selectable={canEdit}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          bulkActions={canEdit ? (ids) => (
            <>
              <Button size="sm" variant="destructive" onClick={() => setMassDeleteOpen(true)}>
                <Trash2 className="mr-1 h-3 w-3" /> Delete ({ids.size})
              </Button>
            </>
          ) : undefined}
        />
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
      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={async () => {
          setBulkUpdating(true);
          try {
            // CRM contacts only (not resources/facilities from unified view) - delete from crm_contacts
            const { error } = await supabase.from('crm_contacts').delete().in('id', [...selectedIds]);
            if (error) throw error;
            // Also try resources and facilities tables for any selected unified contacts
            await supabase.from('company_resources').delete().in('id', [...selectedIds]);
            await supabase.from('facilities').delete().in('id', [...selectedIds]);
            toast.success(`${selectedIds.size} contact(s) deleted`);
            setSelectedIds(new Set());
            setMassDeleteOpen(false);
          } catch (e: any) { toast.error(e.message); }
          finally { setBulkUpdating(false); }
        }}
        title="Delete Selected Contacts"
        description={`Are you sure you want to delete ${selectedIds.size} contact(s)? This action cannot be undone.`}
        isDeleting={bulkUpdating}
      />
    </>
  );
}
