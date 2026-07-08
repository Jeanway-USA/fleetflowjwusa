import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DocumentUpload } from '@/components/shared/DocumentUpload';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { EmptyState } from '@/components/shared/EmptyState';
import { useUndoableDelete } from '@/hooks/useUndoableDelete';
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
import { Pencil, Trash2, FileText, Phone, Mail, Calendar, CreditCard, Shield, Upload, User, Users, AlertTriangle, Link, Link2Off, Eye, MoreHorizontal, FileSpreadsheet, FileSignature } from 'lucide-react';
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
      const { data, error } = await supabase.from('drivers').select('*').order('last_name');
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


  // Undoable delete hook
  const { deleteWithUndo } = useUndoableDelete<any>({
    onDelete: async (id) => {
      const { error } = await supabase.from('drivers').delete().eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    onRestore: async (driver) => {
      const { error } = await supabase.from('drivers').insert(driver);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    },
    getItemName: (driver) => `${driver.first_name} ${driver.last_name}`,
    entityName: 'Driver',
  });

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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {drivers.map((driver: any) => (
            <Card key={driver.id} className="card-elevated overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative group">
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
                        className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Upload className="h-5 w-5 text-white" />
                      </label>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{driver.first_name} {driver.last_name}</h3>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <StatusBadge status={driver.status} />
                        {(() => {
                          const s = getOnboardingStatus(driver);
                          const variant = s.tone === 'ok' ? 'default' : s.tone === 'warn' ? 'secondary' : 'outline';
                          return <Badge variant={variant as any} className="text-xs">{s.label}</Badge>;
                        })()}
                      </div>
                      {driver.landstar_operator_id && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Landstar ID: <span className="font-mono">{driver.landstar_operator_id}</span>
                        </p>
                      )}
                    </div>

                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
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
                      <DropdownMenuItem onClick={() => openDialog(driver)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      {isOwner && !driver.user_id && (
                        <DropdownMenuItem
                          disabled={!driver.email || inviteDriverMutation.isPending}
                          onClick={() => inviteDriverMutation.mutate(driver)}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          {driver.email ? 'Invite to log in' : 'Add email to invite'}
                        </DropdownMenuItem>
                      )}

                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => deleteWithUndo(driver)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Linked User Account */}
                <div className="flex items-center gap-2 text-sm">
                  {driver.user_id ? (
                    <>
                      <Link className="h-4 w-4 text-primary" />
                      <span className="text-primary font-medium">
                        Linked to: {getLinkedUser(driver.user_id)?.email || 'Unknown User'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Link2Off className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">No linked user account</span>
                    </>
                  )}
                </div>

                {driver.phone && (
                  <a
                    href={`tel:${driver.phone}`}
                    className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{driver.phone}</span>
                  </a>
                )}
                {driver.email && (
                  <a
                    href={`mailto:${driver.email}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="h-4 w-4" />
                    <span className="truncate">{driver.email}</span>
                  </a>
                )}

                <div className="pt-2 border-t">
                  <CredentialsCompliance driver={driver} variant="section" />
                </div>

                {(driver as any).mvr_expiry && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Annual MVR
                    </span>
                    <span className={isExpiringSoon((driver as any).mvr_expiry) ? 'text-destructive font-medium' : ''}>
                      {formatDate((driver as any).mvr_expiry)}
                    </span>
                  </div>
                )}

                {driver.hazmat_expiry && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      HAZMAT
                    </span>
                    <span className={isExpiringSoon(driver.hazmat_expiry) ? 'text-destructive font-medium' : ''}>
                      {formatDate(driver.hazmat_expiry)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pay Rate</span>
                  <span className="font-medium">
                    {formatPayRate(driver.pay_type, driver.pay_rate)}
                  </span>
                </div>

              </CardContent>
            </Card>
          ))}
        </div>
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
