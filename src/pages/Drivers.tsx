import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useHighlightRow } from '@/hooks/useHighlightRow';

import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DocumentUpload } from '@/components/shared/DocumentUpload';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { EmptyState } from '@/components/shared/EmptyState';

import { useSignedUrl } from '@/hooks/useSignedUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { compressImage } from '@/lib/compress-image';
import { Pencil, Trash2, FileText, Phone, Mail, Calendar, CreditCard, Shield, Upload, User, Users, AlertTriangle, Link, Link2Off, Eye, MoreHorizontal, FileSpreadsheet, FileSignature, Archive, Search, ArrowUpDown, LayoutGrid, List as ListIcon, X, ShieldCheck } from 'lucide-react';
import { archiveManyWithUndo } from '@/lib/soft-delete';
import { CSVImportDialog } from '@/components/shared/CSVImportDialog';
import { SignedOnboardingDocuments } from '@/components/drivers/SignedOnboardingDocuments';
import { CredentialsCompliance } from '@/components/drivers/CredentialsCompliance';
import { DriverDetailSheet } from '@/components/drivers/DriverDetailSheet';
import { formatPayRate } from '@/lib/pay-format';
import { US_STATES } from '@/lib/us-states';


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { format, parseISO } from 'date-fns';


const endorsementOptions = [
  { value: 'H', label: 'H — Hazmat' },
  { value: 'N', label: 'N — Tank' },
  { value: 'P', label: 'P — Passenger' },
  { value: 'S', label: 'S — School Bus' },
  { value: 'T', label: 'T — Double/Triple' },
  { value: 'X', label: 'X — Hazmat + Tank' },
];

// Component for avatar with signed URL support
function DriverAvatar({ avatarPath, initials }: { avatarPath: string | null; initials: string }) {
  const { url, loading } = useSignedUrl(
    avatarPath && !avatarPath.startsWith('http') ? 'documents' : null,
    avatarPath && !avatarPath.startsWith('http') ? avatarPath : null
  );
  
  // Use signed URL for storage paths, direct URL for legacy public URLs
  const imageSrc = avatarPath?.startsWith('http') ? avatarPath : url;
  
  return (
    <Avatar className="h-16 w-16 border-2 border-primary/20">
      <AvatarImage src={imageSrc || undefined} />
      <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

export default function Drivers() {
  useHighlightRow();

  const { isOwner, orgId } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [signedDocsDriver, setSignedDocsDriver] = useState<any>(null);
  const [profileDriver, setProfileDriver] = useState<any>(null);
  const [leaseForm, setLeaseForm] = useState<{ id?: string; weekly_lease_amount: number; escrow_cpm_rate: number; total_weeks_remaining: number }>({ weekly_lease_amount: 0, escrow_cpm_rate: 0, total_weeks_remaining: 0 });

  // Toolbar / bulk selection state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'hire_recent' | 'compliance'>('name_asc');
  const [view, setView] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    return (localStorage.getItem('drivers-view') as 'grid' | 'list') || 'grid';
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { localStorage.setItem('drivers-view', view); } catch {}
  }, [view]);




  const driverFields = [
    { key: 'first_name', label: 'First Name', required: true },
    { key: 'last_name', label: 'Last Name', required: true },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'license_number', label: 'CDL / License Number' },
    { key: 'landstar_operator_id', label: 'Landstar Operator ID' },
    { key: 'license_expiry', label: 'License Expiry' },
    { key: 'medical_card_expiry', label: 'Medical Card Expiry' },
    { key: 'hire_date', label: 'Hire Date' },
    { key: 'status', label: 'Status' },
    { key: 'pay_type', label: 'Pay Type' },
    { key: 'pay_rate', label: 'Pay Rate' },
  ];

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*').is('deleted_at', null).order('last_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch users/profiles in current org for linking
  const { data: users = [] } = useQuery({
    queryKey: ['profiles-for-linking', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, email, first_name, last_name')
        .eq('org_id', orgId)
        .order('email');
      if (error) throw error;
      return data;
    },
  });

  // Onboarding status: counts of signed docs per driver + active template count for org
  const { data: signedDocCounts = {} } = useQuery({
    queryKey: ['driver-signed-doc-counts', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_signed_documents')
        .select('driver_id')
        .eq('org_id', orgId!);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.driver_id] = (counts[row.driver_id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const { data: activeTemplateCount = 0 } = useQuery({
    queryKey: ['active-template-count', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('document_templates')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId!)
        .eq('is_active', true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const getOnboardingStatus = (driver: any): { label: string; tone: 'muted' | 'warn' | 'ok' } => {
    if (!driver.user_id) return { label: 'Not invited', tone: 'muted' };
    if (activeTemplateCount === 0) return { label: 'Login active', tone: 'ok' };
    const signed = signedDocCounts[driver.id] ?? 0;
    if (signed === 0) return { label: 'Onboarding pending', tone: 'warn' };
    if (signed >= activeTemplateCount) return { label: 'Onboarded', tone: 'ok' };
    return { label: `Onboarding ${signed}/${activeTemplateCount}`, tone: 'warn' };
  };


  // Get linked user info for display
  const getLinkedUser = (userId: string | null) => {
    if (!userId) return null;
    return users.find((u: any) => u.user_id === userId);
  };

  const createMutation = useMutation({
    mutationFn: async (driver: any) => {
      if (!orgId) throw new Error('Organization not loaded yet. Please try again.');
      const { error } = await supabase.from('drivers').insert({ ...driver, org_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast.success('Driver added successfully');
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase.from('drivers').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast.success('Driver updated successfully');
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const inviteDriverMutation = useMutation({
    mutationFn: async (driver: any) => {
      if (!driver.email) throw new Error('Driver email is required to send an invitation');
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: driver.email,
          role: 'driver',
          driver_id: driver.id,
          first_name: driver.first_name,
          last_name: driver.last_name,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(data?.message || 'Invitation sent');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['profiles-for-linking', orgId] });
    },
    onError: (error: any) => toast.error(error.message || 'Failed to send invitation'),
  });


  // Archive with undo — uses soft-delete RPC
  const deleteWithUndo = async (driver: any) => {
    const { archiveWithUndo } = await import('@/lib/soft-delete');
    await archiveWithUndo({
      table: 'drivers',
      id: driver.id,
      itemName: `${driver.first_name} ${driver.last_name}`,
      queryClient,
      invalidateKeys: [['drivers']],
    });
  };

  const openDialog = async (driver?: any) => {
    setEditingDriver(driver || null);
    setFormData(driver || { status: 'active', pay_type: 'percentage', pay_rate: 0, has_twic: false, endorsements: [], dod_clearance_level: 'None', employment_type: 'w2_company' });
    // Seed lease form
    if (driver?.id) {
      const { data: lease } = await supabase
        .from('lease_purchase_agreements')
        .select('*')
        .eq('driver_id', driver.id)
        .eq('status', 'active')
        .maybeSingle();
      if (lease) {
        setLeaseForm({
          id: lease.id,
          weekly_lease_amount: Number(lease.weekly_lease_amount) || 0,
          escrow_cpm_rate: Number(lease.escrow_cpm_rate) || 0,
          total_weeks_remaining: Number(lease.total_weeks_remaining) || 0,
        });
      } else {
        setLeaseForm({ weekly_lease_amount: 0, escrow_cpm_rate: 0, total_weeks_remaining: 0 });
      }
    } else {
      setLeaseForm({ weekly_lease_amount: 0, escrow_cpm_rate: 0, total_weeks_remaining: 0 });
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingDriver(null);
    setFormData({});
    setLeaseForm({ weekly_lease_amount: 0, escrow_cpm_rate: 0, total_weeks_remaining: 0 });
  };

  const upsertLeaseAgreement = async (driverId: string) => {
    if (formData.employment_type !== 'lease_purchase') return;
    if (!orgId) return;
    if (leaseForm.id) {
      const { error } = await supabase
        .from('lease_purchase_agreements')
        .update({
          weekly_lease_amount: leaseForm.weekly_lease_amount,
          escrow_cpm_rate: leaseForm.escrow_cpm_rate,
          total_weeks_remaining: leaseForm.total_weeks_remaining,
        })
        .eq('id', leaseForm.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('lease_purchase_agreements').insert({
        driver_id: driverId,
        org_id: orgId,
        weekly_lease_amount: leaseForm.weekly_lease_amount,
        escrow_cpm_rate: leaseForm.escrow_cpm_rate,
        total_weeks_remaining: leaseForm.total_weeks_remaining,
        status: 'active',
        current_escrow_balance: 0,
      });
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: ['lease-agreement', driverId] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.first_name || !formData.last_name) {
      toast.error('First and last name are required');
      return;
    }
    const payload = {
      ...formData,
      landstar_operator_id: formData.landstar_operator_id?.trim() ? formData.landstar_operator_id.trim() : null,
    };
    try {
      if (editingDriver) {
        await new Promise<void>((resolve, reject) =>
          updateMutation.mutate({ id: editingDriver.id, ...payload }, { onSuccess: () => resolve(), onError: (e) => reject(e) })
        );
        await upsertLeaseAgreement(editingDriver.id);
      } else {
        if (!orgId) throw new Error('Organization not loaded yet. Please try again.');
        const { data: inserted, error } = await supabase.from('drivers').insert({ ...payload, org_id: orgId }).select('id').single();
        if (error) throw error;
        await upsertLeaseAgreement(inserted.id);
        queryClient.invalidateQueries({ queryKey: ['drivers'] });
        toast.success('Driver added successfully');
        closeDialog();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save driver');
    }
  };


  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>, driverId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const compressed = await compressImage(file);
      const fileExt = compressed.name.split('.').pop();
      const fileName = `avatars/${driverId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, compressed, { contentType: compressed.type });

      if (uploadError) throw uploadError;

      // Store the path instead of public URL - signed URLs will be used for display
      await supabase.from('drivers').update({ avatar_url: fileName }).eq('id', driverId);
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast.success('Photo uploaded');
    } catch (error: any) {
      toast.error(error.message || 'Upload failed');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const toggleEndorsement = (endorsement: string) => {
    const current = formData.endorsements || [];
    const isRemoving = current.includes(endorsement);
    const updated = isRemoving
      ? current.filter((e: string) => e !== endorsement)
      : [...current, endorsement];
    
    // Clear hazmat_expiry if removing HAZMAT endorsement (H or X)
    if (isRemoving && (endorsement === 'H' || endorsement === 'X')) {
      setFormData({ ...formData, endorsements: updated, hazmat_expiry: null });
    } else {
      setFormData({ ...formData, endorsements: updated });
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false;
    const expiry = parseISO(date);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiry <= thirtyDaysFromNow;
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return format(parseISO(date), 'MM/dd/yyyy');
  };

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const parseExp = (d: any) => {
      const dates = [d.license_expiry, d.medical_card_expiry, (d as any).mvr_expiry]
        .filter(Boolean)
        .map((s: string) => new Date(s + 'T00:00:00').getTime());
      return dates.length ? Math.min(...dates) : Number.POSITIVE_INFINITY;
    };
    let list = (drivers as any[]).filter((d) => {
      if (statusFilter !== 'all' && (d.status || '').toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        d.first_name, d.last_name, `${d.first_name || ''} ${d.last_name || ''}`,
        d.email, d.phone, d.license_number, d.landstar_operator_id,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'name_asc' || sortBy === 'name_desc') {
        const av = `${a.last_name || ''} ${a.first_name || ''}`.trim().toLowerCase();
        const bv = `${b.last_name || ''} ${b.first_name || ''}`.trim().toLowerCase();
        return sortBy === 'name_asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (sortBy === 'hire_recent') {
        const av = a.hire_date ? new Date(a.hire_date + 'T00:00:00').getTime() : 0;
        const bv = b.hire_date ? new Date(b.hire_date + 'T00:00:00').getTime() : 0;
        return bv - av;
      }
      return parseExp(a) - parseExp(b);
    });
    return list;
  }, [drivers, search, statusFilter, sortBy]);

  const visibleIds = useMemo(() => filteredDrivers.map((d: any) => d.id), [filteredDrivers]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleSelectAllVisible = () =>
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  const clearSelection = () => setSelectedIds(new Set());
  const bulkArchive = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await archiveManyWithUndo({
      table: 'drivers',
      ids,
      queryClient,
      invalidateKeys: [['drivers']],
    });
    clearSelection();
  };

  const statusTone = (status: string): { cls: string; dot: string; label: string } => {
    const s = (status || '').toLowerCase();
    if (s === 'active') return { cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400', dot: 'bg-emerald-500', label: 'Active' };
    if (s === 'inactive') return { cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground', label: 'Inactive' };
    if (s === 'onboarding') return { cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400', dot: 'bg-amber-500', label: 'Onboarding' };
    if (s === 'archived') return { cls: 'bg-destructive/10 text-destructive border-destructive/30', dot: 'bg-destructive', label: 'Archived' };
    return { cls: 'bg-muted text-muted-foreground border-border', dot: 'bg-muted-foreground', label: status || 'Unknown' };
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="Drivers" description="Manage your drivers" />
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Drivers" description="Manage your drivers" action={{ label: 'Add Driver', onClick: () => openDialog() }}>
        <Button variant="outline" onClick={() => setCsvImportOpen(true)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Import CSV
        </Button>
      </PageHeader>

      {drivers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No drivers registered yet"
          description="Add your first driver to start managing your team."
          action={{ label: 'Add Driver', onClick: () => openDialog() }}
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone, CDL, Landstar ID…"
                className="pl-9 pr-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="w-full sm:w-[190px]">
                <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                <SelectItem value="hire_recent">Recently hired</SelectItem>
                <SelectItem value="compliance">Compliance (soonest)</SelectItem>
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
                className={`px-2.5 py-2 text-sm ${view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label="List view"
                aria-pressed={view === 'list'}
                className={`px-2.5 py-2 text-sm border-l border-border ${view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={toggleSelectAllVisible}
                aria-label="Select all visible"
              />
              <span className="text-sm font-medium">
                {selectedIds.size} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={bulkArchive}>
                  <Archive className="h-4 w-4 mr-2" /> Archive selected
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {filteredDrivers.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              No drivers match your filters.
            </div>
          ) : (
            <div className={view === 'grid' ? 'grid gap-6 md:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-3'}>
              {filteredDrivers.map((driver: any) => {
                const tone = statusTone(driver.status);
                const onb = getOnboardingStatus(driver);
                const selected = selectedIds.has(driver.id);
                return (
                  <Card
                    key={driver.id}
                    data-row-id={driver.id}
                    className={`card-elevated overflow-hidden group transition-colors ${selected ? 'ring-2 ring-primary/50' : ''}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`pt-1 transition-opacity ${selected || selectedIds.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleSelect(driver.id)}
                            aria-label={`Select ${driver.first_name} ${driver.last_name}`}
                          />
                        </div>
                        <div className="relative group/avatar shrink-0">
                          <DriverAvatar
                            avatarPath={driver.avatar_url}
                            initials={getInitials(driver.first_name, driver.last_name)}
                          />
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            id={`avatar-${driver.id}`}
                            onChange={(e) => handleAvatarUpload(e, driver.id)}
                          />
                          <label
                            htmlFor={`avatar-${driver.id}`}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Upload className="h-5 w-5 text-white" />
                          </label>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-lg truncate">
                            {driver.first_name} {driver.last_name}
                          </h3>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${tone.cls}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                              {tone.label}
                            </span>
                            <Badge
                              variant={onb.tone === 'ok' ? 'default' : onb.tone === 'warn' ? 'secondary' : 'outline'}
                              className="text-xs"
                            >
                              {onb.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {driver.landstar_operator_id && (
                              <>Landstar #<span className="font-mono">{driver.landstar_operator_id}</span></>
                            )}
                            {driver.landstar_operator_id && driver.license_number && <span className="mx-1.5">·</span>}
                            {driver.license_number && <>CDL {driver.license_number}</>}
                            {!driver.landstar_operator_id && !driver.license_number && <>No CDL on file</>}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isOwner && (
                              <DropdownMenuItem onClick={() => navigate(`/driver-view/${driver.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Dashboard
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setProfileDriver(driver)}>
                              <User className="h-4 w-4 mr-2" />
                              View Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSelectedDriver(driver)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Documents
                            </DropdownMenuItem>
                            {isOwner && (
                              <DropdownMenuItem onClick={() => setSignedDocsDriver(driver)}>
                                <FileSignature className="h-4 w-4 mr-2" />
                                Signed Documents
                              </DropdownMenuItem>
                            )}
                            {isOwner && !driver.user_id && (
                              <DropdownMenuItem
                                disabled={!driver.email || inviteDriverMutation.isPending}
                                onClick={() => inviteDriverMutation.mutate(driver)}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                {driver.email ? 'Invite to log in' : 'Add email to invite'}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Contact + link row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                        {driver.phone && (
                          <a href={`tel:${driver.phone}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                            <Phone className="h-4 w-4" />
                            <span>{driver.phone}</span>
                          </a>
                        )}
                        {driver.email && (
                          <a href={`mailto:${driver.email}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground min-w-0">
                            <Mail className="h-4 w-4 shrink-0" />
                            <span className="truncate">{driver.email}</span>
                          </a>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          {driver.user_id ? (
                            <><Link className="h-3.5 w-3.5 text-primary" /> Linked</>
                          ) : (
                            <><Link2Off className="h-3.5 w-3.5" /> No login</>
                          )}
                        </span>
                      </div>

                      {/* Credentials & Compliance */}
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                        <CredentialsCompliance driver={driver} variant="section" />
                        {((driver as any).mvr_expiry || driver.hazmat_expiry) && (
                          <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                            {(driver as any).mvr_expiry && (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground inline-flex items-center gap-2">
                                  <Shield className="h-4 w-4" /> Annual MVR
                                </span>
                                <span className={isExpiringSoon((driver as any).mvr_expiry) ? 'text-destructive font-medium' : 'font-medium'}>
                                  {formatDate((driver as any).mvr_expiry)}
                                </span>
                              </div>
                            )}
                            {driver.hazmat_expiry && (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground inline-flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4" /> HAZMAT
                                </span>
                                <span className={isExpiringSoon(driver.hazmat_expiry) ? 'text-destructive font-medium' : 'font-medium'}>
                                  {formatDate(driver.hazmat_expiry)}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Pay Rate</span>
                        <span className="font-medium">{formatPayRate(driver.pay_type, driver.pay_rate)}</span>
                      </div>

                      {/* Quick actions */}
                      <div className="pt-2 border-t flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setProfileDriver(driver)}>
                          <Eye className="h-4 w-4 mr-1.5" /> View
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => openDialog(driver)}>
                          <Pencil className="h-4 w-4 mr-1.5" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-destructive hover:text-destructive"
                          onClick={() => deleteWithUndo(driver)}
                        >
                          <Archive className="h-4 w-4 mr-1.5" /> Archive
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}


      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDriver ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input id="first_name" value={formData.first_name || ''} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input id="last_name" value={formData.last_name || ''} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Emergency Contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_name">Name</Label>
                  <Input
                    id="emergency_contact_name"
                    value={(formData as any).emergency_contact_name || ''}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_relationship">Relationship</Label>
                  <Input
                    id="emergency_contact_relationship"
                    placeholder="e.g. Spouse"
                    value={(formData as any).emergency_contact_relationship || ''}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_relationship: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_phone">Phone</Label>
                  <Input
                    id="emergency_contact_phone"
                    value={(formData as any).emergency_contact_phone || ''}
                    onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                  />
                </div>
              </div>
            </div>


            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Link to User Account</h4>
              <div className="space-y-2">
                <Label htmlFor="user_id">User Account</Label>
                <Select 
                  value={formData.user_id || 'none'} 
                  onValueChange={(v) => setFormData({ ...formData, user_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No linked user</SelectItem>
                    {users.map((user: any) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.email} {user.first_name && user.last_name ? `(${user.first_name} ${user.last_name})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Linking a driver to a user account allows them to log in and view their own data.
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">License & Credentials</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="license_number">License Number</Label>
                  <Input id="license_number" value={formData.license_number || ''} onChange={(e) => setFormData({ ...formData, license_number: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_state">License State</Label>
                  <Select
                    value={(formData as any).license_state || 'none'}
                    onValueChange={(v) => setFormData({ ...formData, license_state: v === 'none' ? null : v })}
                  >
                    <SelectTrigger id="license_state"><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="none">—</SelectItem>
                      {US_STATES.map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="landstar_operator_id">Landstar Operator ID</Label>
                  <Input
                    id="landstar_operator_id"
                    value={formData.landstar_operator_id || ''}
                    onChange={(e) => setFormData({ ...formData, landstar_operator_id: e.target.value })}
                    placeholder="e.g. 123456"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_expiry">License Expiry</Label>
                  <Input id="license_expiry" type="date" value={formData.license_expiry || ''} onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="medical_card_expiry">DOT Medical Card Expiry</Label>
                  <Input id="medical_card_expiry" type="date" value={formData.medical_card_expiry || ''} onChange={(e) => setFormData({ ...formData, medical_card_expiry: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mvr_expiry">Annual MVR Expiry</Label>
                  <Input id="mvr_expiry" type="date" value={(formData as any).mvr_expiry || ''} onChange={(e) => setFormData({ ...formData, mvr_expiry: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="hire_date">Hire Date</Label>
                  <Input id="hire_date" type="date" value={formData.hire_date || ''} onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax_state">Tax State (W-2 SUTA / SIT)</Label>
                  <Select
                    value={(formData as any).tax_state || ''}
                    onValueChange={(v) => setFormData({ ...formData, tax_state: v })}
                  >
                    <SelectTrigger id="tax_state">
                      <SelectValue placeholder="Use company default" />
                    </SelectTrigger>
                    <SelectContent>
                      {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>


            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Endorsements & HAZMAT</h4>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {endorsementOptions.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={opt.value}
                      checked={(formData.endorsements || []).includes(opt.value)}
                      onCheckedChange={() => toggleEndorsement(opt.value)}
                    />
                    <Label htmlFor={opt.value} className="text-sm font-normal cursor-pointer">{opt.label}</Label>
                  </div>
                ))}
              </div>
              {(formData.endorsements || []).some((e: string) => e === 'H' || e === 'X') && (
                <div className="space-y-2">
                  <Label htmlFor="hazmat_expiry">HAZMAT Certification Expiry</Label>
                  <Input id="hazmat_expiry" type="date" value={formData.hazmat_expiry || ''} onChange={(e) => setFormData({ ...formData, hazmat_expiry: e.target.value })} />
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">TWIC Card</h4>
              <div className="flex items-center space-x-2 mb-3">
                <Checkbox
                  id="has_twic"
                  checked={formData.has_twic || false}
                  onCheckedChange={(checked) => setFormData({ ...formData, has_twic: checked })}
                />
                <Label htmlFor="has_twic" className="font-normal cursor-pointer">Driver has TWIC Card</Label>
              </div>
              {formData.has_twic && (
                <div className="space-y-2">
                  <Label htmlFor="twic_expiry">TWIC Expiry Date</Label>
                  <Input id="twic_expiry" type="date" value={formData.twic_expiry || ''} onChange={(e) => setFormData({ ...formData, twic_expiry: e.target.value })} />
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Advanced Security & Border</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fast_card_passport_expiry">FAST Card / Passport Expiry</Label>
                  <Input
                    id="fast_card_passport_expiry"
                    type="date"
                    value={(formData as any).fast_card_passport_expiry || ''}
                    onChange={(e) => setFormData({ ...formData, fast_card_passport_expiry: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dod_clearance_level">DoD Security Clearance</Label>
                  <Select
                    value={(formData as any).dod_clearance_level || 'None'}
                    onValueChange={(v) => setFormData({ ...formData, dod_clearance_level: v })}
                  >
                    <SelectTrigger id="dod_clearance_level"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="None">None</SelectItem>
                      <SelectItem value="Interim Secret">Interim Secret</SelectItem>
                      <SelectItem value="Secret">Secret</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Classification</h4>
              <div className="space-y-2">
                <Label>Worker Type</Label>
                {formData.employment_type === 'lease_purchase' ? (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
                    <div className="font-medium">Lease-Purchase Operator</div>
                    <p className="text-xs text-muted-foreground">
                      This driver is on an active Lease-Purchase agreement. Switching worker
                      type will end that agreement and clear the lease terms below.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, employment_type: '1099_contractor' })}
                      >
                        Convert to 1099
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, employment_type: 'w2_company' })}
                      >
                        Convert to W-2
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex rounded-md border p-0.5 bg-muted">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, employment_type: 'w2_company' })}
                      className={`px-3 py-1.5 text-sm rounded ${
                        (formData.employment_type || 'w2_company') === 'w2_company'
                          ? 'bg-background shadow-sm font-medium'
                          : 'text-muted-foreground'
                      }`}
                    >
                      W-2 Employee
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, employment_type: '1099_contractor' })}
                      className={`px-3 py-1.5 text-sm rounded ${
                        formData.employment_type === '1099_contractor'
                          ? 'bg-background shadow-sm font-medium'
                          : 'text-muted-foreground'
                      }`}
                    >
                      1099 Contractor
                    </button>
                  </div>
                )}
              </div>

              {formData.employment_type === 'lease_purchase' && (
                <Card className="mt-4 border-primary/30">
                  <CardHeader className="pb-3">
                    <h5 className="font-medium text-sm">Lease Purchase Agreement Configuration</h5>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weekly_lease_amount">Weekly Fixed Lease Amount ($)</Label>
                      <Input
                        id="weekly_lease_amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={leaseForm.weekly_lease_amount || ''}
                        onChange={(e) => setLeaseForm({ ...leaseForm, weekly_lease_amount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="escrow_cpm_rate">Maintenance Escrow Rate Per Mile ($)</Label>
                      <Input
                        id="escrow_cpm_rate"
                        type="number"
                        step="0.0001"
                        min="0"
                        placeholder="0.10"
                        value={leaseForm.escrow_cpm_rate || ''}
                        onChange={(e) => setLeaseForm({ ...leaseForm, escrow_cpm_rate: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="total_weeks_remaining">Weeks Remaining on Agreement</Label>
                      <Input
                        id="total_weeks_remaining"
                        type="number"
                        step="1"
                        min="0"
                        value={leaseForm.total_weeks_remaining || ''}
                        onChange={(e) => setLeaseForm({ ...leaseForm, total_weeks_remaining: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Pay Information</h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pay_type">Pay Model</Label>
                  <Select value={formData.pay_type || 'per_mile'} onValueChange={(v) => setFormData({ ...formData, pay_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_mile">CPM (Cents Per Mile)</SelectItem>
                      <SelectItem value="percentage">Percentage of Line-Haul</SelectItem>
                      <SelectItem value="flat">Flat Salary</SelectItem>
                      {(formData.pay_type === 'hourly' || formData.pay_type === 'cpm') && (
                        <SelectItem value={formData.pay_type}>
                          {formData.pay_type === 'hourly' ? 'Hourly (legacy)' : 'CPM (legacy alias)'}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  {(() => {
                    const pt = formData.pay_type || 'per_mile';
                    const cfg =
                      pt === 'percentage'
                        ? { label: 'Driver Split', suffix: '%', step: '0.5', min: '0', max: '100', placeholder: '25' }
                        : pt === 'flat'
                          ? { label: 'Weekly Flat Rate', suffix: '$/week', step: '1', min: '0', max: undefined, placeholder: '1500' }
                          : pt === 'hourly'
                            ? { label: 'Hourly Rate', suffix: '$/hr', step: '0.25', min: '0', max: undefined, placeholder: '25.00' }
                            : { label: 'Rate per Mile', suffix: '$/mi', step: '0.01', min: '0', max: undefined, placeholder: '0.55' };
                    const rate = Number(formData.pay_rate) || 0;
                    const helper =
                      pt === 'per_mile' || pt === 'cpm'
                        ? `= $${rate.toFixed(2)} × booked miles per load`
                        : pt === 'percentage'
                          ? `= ${rate}% of line-haul (FSC excluded)`
                          : pt === 'flat'
                            ? `= $${rate.toLocaleString()} paid weekly`
                            : pt === 'hourly'
                              ? `= $${rate.toFixed(2)} × hours worked`
                              : '';
                    return (
                      <>
                        <Label htmlFor="pay_rate">{cfg.label}</Label>
                        <div className="relative">
                          <Input
                            id="pay_rate"
                            type="number"
                            step={cfg.step}
                            min={cfg.min}
                            max={cfg.max}
                            placeholder={cfg.placeholder}
                            value={formData.pay_rate ?? ''}
                            onChange={(e) => setFormData({ ...formData, pay_rate: parseFloat(e.target.value) || 0 })}
                            className="pr-16"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            {cfg.suffix}
                          </span>
                        </div>
                        {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
                      </>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status || 'active'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={createMutation.isPending || updateMutation.isPending}>
                Cancel
              </Button>
              <LoadingButton 
                type="submit" 
                className="gradient-gold text-primary-foreground"
                loading={createMutation.isPending || updateMutation.isPending}
                loadingText={editingDriver ? 'Saving...' : 'Adding...'}
              >
                {editingDriver ? 'Save Changes' : 'Add Driver'}
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      <Dialog open={!!selectedDriver} onOpenChange={(open) => !open && setSelectedDriver(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Documents for {selectedDriver?.first_name} {selectedDriver?.last_name}</DialogTitle>
          </DialogHeader>
          {selectedDriver && (
            <DocumentUpload
              relatedType="driver"
              relatedId={selectedDriver.id}
              documentTypes={['License', 'Medical Card', 'Drug Test', 'Training Certificate', 'Contract', 'Other']}
              title="Driver Documents"
            />
          )}
        </DialogContent>
      </Dialog>

      {isOwner && (
        <Dialog open={!!signedDocsDriver} onOpenChange={(open) => !open && setSignedDocsDriver(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Signed Onboarding Documents — {signedDocsDriver?.first_name} {signedDocsDriver?.last_name}
              </DialogTitle>
            </DialogHeader>
            {signedDocsDriver && <SignedOnboardingDocuments driverId={signedDocsDriver.id} />}
          </DialogContent>
        </Dialog>
      )}



      <DriverDetailSheet
        driver={profileDriver}
        open={!!profileDriver}
        onOpenChange={(open) => !open && setProfileDriver(null)}
        onEdit={(d) => {
          setProfileDriver(null);
          openDialog(d);
        }}
      />

      <CSVImportDialog
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        tableName="drivers"

        fields={driverFields}
        queryKey={['drivers']}
        title="Import Drivers from CSV"
      />
    </>
  );
}
