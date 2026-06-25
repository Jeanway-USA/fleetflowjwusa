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

// --- Render helpers ---
function formatLocation(c: UnifiedContact): string {
  const cityState = [c.city, c.state].filter(Boolean).join(', ');
  if (cityState) return cityState;
  if (c.service_area) return c.service_area;
  return '—';
}

function formatAddress(c: UnifiedContact): string {
  const parts: string[] = [];
  if (c.address) parts.push(c.address);
  const cityStateZip = [c.city, c.state].filter(Boolean).join(', ');
  const tail = [cityStateZip, c.zip].filter(Boolean).join(' ');
  if (tail) parts.push(tail);
  return parts.length ? parts.join(' • ') : '—';
}

function renderAgentStatus(status: string | null) {
  if (status === 'safe') return <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">Safe</Badge>;
  if (status === 'unsafe') return <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">Unsafe</Badge>;
  return <span className="text-xs text-muted-foreground">Unrated</span>;
}

function renderCode(code: string | null) {
  if (!code) return <span className="text-muted-foreground">—</span>;
  return <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{code}</code>;
}

function renderTags(tags: string[] | null) {
  if (!tags || tags.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 3).map((t) => (
        <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
      ))}
      {tags.length > 3 && <Badge variant="secondary" className="text-[10px]">+{tags.length - 3}</Badge>}
    </div>
  );
}

type ColumnCtx = {
  canEdit: boolean;
  setDetailContact: (c: UnifiedContact) => void;
  handleEdit: (c: UnifiedContact) => void;
  setDeleteTarget: (c: UnifiedContact) => void;
};

function actionsColumn(ctx: ColumnCtx) {
  return {
    key: 'actions',
    header: '',
    render: (contact: UnifiedContact) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); ctx.setDetailContact(contact); }}>
            <Eye className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>
          {ctx.canEdit && (
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); ctx.handleEdit(contact); }}>
              <Edit2 className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
          )}
          {ctx.canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); ctx.setDeleteTarget(contact); }}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  };
}

function getColumnsFor(typeFilter: string, scope: 'agencies' | 'shops', ctx: ColumnCtx) {
  // Maintenance shops scope
  if (scope === 'shops') {
    return [
      { key: 'company_name', header: 'Shop Name', render: (c: UnifiedContact) => (
        <div className="font-medium">{c.company_name}</div>
      )},
      { key: 'sub_type', header: 'Sub-Type', render: (c: UnifiedContact) => {
        const label = getSubTypeLabel(c);
        return label ? <Badge variant="outline" className="text-xs">{label}</Badge> : <span className="text-muted-foreground">—</span>;
      }},
      { key: 'phone', header: 'Phone', hiddenOnMobile: true, render: (c: UnifiedContact) => c.phone || '—' },
      { key: 'email', header: 'Email', hiddenOnMobile: true, render: (c: UnifiedContact) => c.email || '—' },
      { key: 'service_area', header: 'Service Area', hiddenOnMobile: true, render: (c: UnifiedContact) => c.service_area || '—' },
      { key: 'address', header: 'Address', hiddenOnMobile: true, render: (c: UnifiedContact) => c.address || '—' },
      actionsColumn(ctx),
    ];
  }

  if (typeFilter === 'broker') {
    return [
      { key: 'company_name', header: 'Broker', render: (c: UnifiedContact) => (
        <div className="font-medium">{c.company_name}</div>
      )},
      { key: 'contact_name', header: 'Contact', hiddenOnMobile: true, render: (c: UnifiedContact) => c.contact_name || '—' },
      { key: 'mc', header: 'MC#', hiddenOnMobile: true, render: (c: UnifiedContact) => renderCode(c.agent_code) },
      { key: 'phone', header: 'Phone', hiddenOnMobile: true, render: (c: UnifiedContact) => c.phone || '—' },
      { key: 'email', header: 'Email', hiddenOnMobile: true, render: (c: UnifiedContact) => c.email || '—' },
      { key: 'location', header: 'Location', hiddenOnMobile: true, render: (c: UnifiedContact) => formatLocation(c) },
      { key: 'tags', header: 'Tags', hiddenOnMobile: true, render: (c: UnifiedContact) => renderTags(c.tags) },
      actionsColumn(ctx),
    ];
  }

  if (typeFilter === 'agent') {
    return [
      { key: 'company_name', header: 'Agent', render: (c: UnifiedContact) => (
        <div className="font-medium">{c.company_name}</div>
      )},
      { key: 'agent_code', header: 'Agent Code', render: (c: UnifiedContact) => renderCode(c.agent_code) },
      { key: 'agency', header: 'Agency', hiddenOnMobile: true, render: (c: UnifiedContact) => c.contact_name || '—' },
      { key: 'status', header: 'Status', hiddenOnMobile: true, render: (c: UnifiedContact) => renderAgentStatus(c.agent_status) },
      { key: 'phone', header: 'Phone', hiddenOnMobile: true, render: (c: UnifiedContact) => c.phone || '—' },
      { key: 'email', header: 'Email', hiddenOnMobile: true, render: (c: UnifiedContact) => c.email || '—' },
      { key: 'service_area', header: 'Service Area', hiddenOnMobile: true, render: (c: UnifiedContact) => c.service_area || '—' },
      actionsColumn(ctx),
    ];
  }

  if (typeFilter === 'shipper' || typeFilter === 'receiver') {
    return [
      { key: 'company_name', header: 'Facility', render: (c: UnifiedContact) => (
        <div className="font-medium">{c.company_name}</div>
      )},
      { key: 'sub_type', header: 'Sub-Type', render: (c: UnifiedContact) => {
        const label = getSubTypeLabel(c);
        return label ? (
          <Badge variant="outline" className={`text-xs ${TYPE_COLORS[c.contact_type] || ''}`}>{label}</Badge>
        ) : <span className="text-muted-foreground">—</span>;
      }},
      { key: 'address', header: 'Address', hiddenOnMobile: true, render: (c: UnifiedContact) => formatAddress(c) },
      { key: 'contact', header: 'Contact', hiddenOnMobile: true, render: (c: UnifiedContact) => c.contact_name || '—' },
      { key: 'phone', header: 'Phone', hiddenOnMobile: true, render: (c: UnifiedContact) => c.phone || '—' },
      { key: 'hours', header: 'Hours', hiddenOnMobile: true, render: (c: UnifiedContact) => c.operating_hours || '—' },
      { key: 'appt', header: 'Appt', hiddenOnMobile: true, render: (c: UnifiedContact) =>
        c.appointment_required
          ? <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">Required</Badge>
          : <span className="text-xs text-muted-foreground">No</span>
      },
      actionsColumn(ctx),
    ];
  }

  // typeFilter === 'all'
  return [
    { key: 'company_name', header: 'Company', render: (c: UnifiedContact) => (
      <div className="font-medium">{c.company_name}</div>
    )},
    { key: 'contact_type', header: 'Type', render: (c: UnifiedContact) => {
      const subType = getSubTypeLabel(c);
      return (
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className={`text-xs capitalize w-fit ${TYPE_COLORS[c.contact_type] || ''}`}>
            {c.contact_type}
          </Badge>
          {subType && <span className="text-[10px] text-muted-foreground">{subType}</span>}
        </div>
      );
    }},
    { key: 'identifier', header: 'Identifier', hiddenOnMobile: true, render: (c: UnifiedContact) => {
      if (c.agent_code) return renderCode(c.agent_code);
      if (c.source === 'facility') {
        const label = getSubTypeLabel(c);
        return label ? <span className="text-xs">{label}</span> : <span className="text-muted-foreground">—</span>;
      }
      return <span className="text-muted-foreground">—</span>;
    }},
    { key: 'phone', header: 'Phone', hiddenOnMobile: true, render: (c: UnifiedContact) => c.phone || '—' },
    { key: 'location', header: 'Location', hiddenOnMobile: true, render: (c: UnifiedContact) => formatLocation(c) },
    { key: 'flags', header: 'Flags', hiddenOnMobile: true, render: (c: UnifiedContact) => (
      <div className="flex flex-wrap gap-1">
        {c.source === 'crm' && c.agent_status === 'safe' && (c.notes || '').startsWith('Auto-added from') && (
          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">Auto-added</Badge>
        )}
        {c.source === 'facility' && c.appointment_required && (
          <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">Appt Req</Badge>
        )}
        {c.agent_status === 'unsafe' && (
          <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">Unsafe</Badge>
        )}
        {c.agent_status === 'safe' && c.source === 'resource' && (
          <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">Safe</Badge>
        )}
        {(c.tags || []).slice(0, 2).map((tag) => (
          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
        ))}
        {(c.tags || []).length > 2 && (
          <Badge variant="secondary" className="text-[10px]">+{c.tags!.length - 2}</Badge>
        )}
      </div>
    )},
    actionsColumn(ctx),
  ];
}

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
          columns={getColumnsFor(typeFilter, scope, { canEdit, setDetailContact, handleEdit, setDeleteTarget })}
          data={filtered}
          loading={isLoading}
          emptyMessage={search ? 'No contacts match your search.' : 'No contacts yet. Add your first contact to get started.'}
          onRowClick={(contact) => setDetailContact(contact)}
          onRowDoubleClick={(contact) => setDetailContact(contact)}
          tableId={`crm-contacts-${scope}-${typeFilter}`}
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
