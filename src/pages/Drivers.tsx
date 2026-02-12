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
import { Pencil, Trash2, FileText, Phone, Mail, Calendar, CreditCard, Shield, Upload, User, Users, AlertTriangle, Link, Link2Off, Eye } from 'lucide-react';
import { format, parseISO } from 'date-fns';


const endorsementOptions = ['H - Hazmat', 'N - Tank', 'P - Passenger', 'S - School Bus', 'T - Double/Triple', 'X - Hazmat + Tank'];

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
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('drivers').select('*').order('last_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch all users/profiles for linking
  const { data: users = [] } = useQuery({
    queryKey: ['profiles-for-linking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, email, first_name, last_name')
        .order('email');
      if (error) throw error;
      return data;
    },
  });

  // Get linked user info for display
  const getLinkedUser = (userId: string | null) => {
    if (!userId) return null;
    return users.find((u: any) => u.user_id === userId);
  };

  const createMutation = useMutation({
    mutationFn: async (driver: any) => {
      const { error } = await supabase.from('drivers').insert(driver);
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

  const openDialog = (driver?: any) => {
    setEditingDriver(driver || null);
    setFormData(driver || { status: 'active', pay_type: 'percentage', pay_rate: 0, has_twic: false, endorsements: [] });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingDriver(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.first_name || !formData.last_name) {
      toast.error('First and last name are required');
      return;
    }
    if (editingDriver) {
      updateMutation.mutate({ id: editingDriver.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>, driverId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `avatars/${driverId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, file);

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
    
    // Clear hazmat_expiry if removing HAZMAT endorsement
    if (isRemoving && endorsement.includes('Hazmat')) {
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
      <PageHeader title="Drivers" description="Manage your drivers" action={{ label: 'Add Driver', onClick: () => openDialog() }} />

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
                      <StatusBadge status={driver.status} />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {isOwner && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => navigate(`/driver-view/${driver.id}`)} 
                        title="View driver dashboard"
                        className="text-primary"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => setSelectedDriver(driver)}>
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openDialog(driver)} title="Edit driver">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteWithUndo(driver)} title="Delete driver">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
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
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>{driver.phone}</span>
                  </div>
                )}
                {driver.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span className="truncate">{driver.email}</span>
                  </div>
                )}

                <div className="pt-2 border-t space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      License
                    </span>
                    <span className={isExpiringSoon(driver.license_expiry) ? 'text-destructive font-medium' : ''}>
                      {formatDate(driver.license_expiry)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Medical Card
                    </span>
                    <span className={isExpiringSoon(driver.medical_card_expiry) ? 'text-destructive font-medium' : ''}>
                      {formatDate(driver.medical_card_expiry)}
                    </span>
                  </div>

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

                  {driver.has_twic && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">TWIC Card</span>
                      <span className={isExpiringSoon(driver.twic_expiry) ? 'text-destructive font-medium' : ''}>
                        {driver.twic_expiry ? formatDate(driver.twic_expiry) : 'Yes'}
                      </span>
                    </div>
                  )}
                </div>

                {driver.endorsements && driver.endorsements.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Endorsements</p>
                    <div className="flex flex-wrap gap-1">
                      {driver.endorsements.map((e: string) => (
                        <Badge key={e} variant="secondary" className="text-xs">
                          {e.split(' - ')[0]}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pay Rate</span>
                  <span className="font-medium">
                    {driver.pay_type === 'percentage' ? `${driver.pay_rate}%` : `$${driver.pay_rate}`}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name *</Label>
                <Input id="first_name" value={formData.first_name || ''} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name *</Label>
                <Input id="last_name" value={formData.last_name || ''} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="license_number">License Number</Label>
                  <Input id="license_number" value={formData.license_number || ''} onChange={(e) => setFormData({ ...formData, license_number: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="license_expiry">License Expiry</Label>
                  <Input id="license_expiry" type="date" value={formData.license_expiry || ''} onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="medical_card_expiry">DOT Medical Card Expiry</Label>
                  <Input id="medical_card_expiry" type="date" value={formData.medical_card_expiry || ''} onChange={(e) => setFormData({ ...formData, medical_card_expiry: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hire_date">Hire Date</Label>
                  <Input id="hire_date" type="date" value={formData.hire_date || ''} onChange={(e) => setFormData({ ...formData, hire_date: e.target.value })} />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-3">Endorsements & HAZMAT</h4>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {endorsementOptions.map((endorsement) => (
                  <div key={endorsement} className="flex items-center space-x-2">
                    <Checkbox
                      id={endorsement}
                      checked={(formData.endorsements || []).includes(endorsement)}
                      onCheckedChange={() => toggleEndorsement(endorsement)}
                    />
                    <Label htmlFor={endorsement} className="text-sm font-normal cursor-pointer">{endorsement}</Label>
                  </div>
                ))}
              </div>
              {(formData.endorsements || []).some((e: string) => e.includes('Hazmat')) && (
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
              <h4 className="font-medium mb-3">Pay Information</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pay_type">Pay Type</Label>
                  <Select value={formData.pay_type || 'percentage'} onValueChange={(v) => setFormData({ ...formData, pay_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="per_mile">Per Mile</SelectItem>
                      <SelectItem value="flat">Flat Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pay_rate">Pay Rate</Label>
                  <Input id="pay_rate" type="number" step="0.01" value={formData.pay_rate || ''} onChange={(e) => setFormData({ ...formData, pay_rate: parseFloat(e.target.value) || 0 })} />
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
    </>
  );
}
