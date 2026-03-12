import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

import { DataTable } from '@/components/shared/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { UserPlus, Pencil, KeyRound, Trash2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface UserWithRole {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: AppRole | null;
  role_id: string | null;
}

const roleLabels: Record<AppRole, string> = {
  owner: 'Owner',
  payroll_admin: 'Payroll Admin',
  dispatcher: 'Dispatcher',
  safety: 'Safety',
  driver: 'Driver',
};

const roleBadgeVariant: Record<AppRole, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  payroll_admin: 'secondary',
  dispatcher: 'secondary',
  safety: 'outline',
  driver: 'outline',
};

export function TeamManagementTab() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Sheet / Dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);

  // Form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('driver');
  const [isInviting, setIsInviting] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('driver');

  const [userToEdit, setUserToEdit] = useState<UserWithRole | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('driver');
  const [isEditing, setIsEditing] = useState(false);

  const [userToDelete, setUserToDelete] = useState<UserWithRole | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [userToResetPassword, setUserToResetPassword] = useState<UserWithRole | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // ── Query ──
  const { data: usersWithRoles = [], isLoading } = useQuery({
    queryKey: ['users_with_roles'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*');
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase.from('user_roles').select('*');
      if (rolesError) throw rolesError;

      return profiles.map(p => {
        const userRole = roles.find(r => r.user_id === p.user_id);
        return {
          id: p.user_id,
          user_id: p.user_id,
          email: p.email || 'No email',
          first_name: p.first_name,
          last_name: p.last_name,
          role: userRole?.role || null,
          role_id: userRole?.id || null,
        };
      }) as UserWithRole[];
    },
  });

  // ── Mutations ──
  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data: existing } = await supabase.from('user_roles').select('*').eq('user_id', userId).maybeSingle();
      if (existing) {
        const { error } = await supabase.from('user_roles').update({ role }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('user_roles').insert({ user_id: userId, role });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
      toast.success('Role assigned successfully');
      setAssignDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  // ── Handlers ──
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteRole) { toast.error('Please enter an email and select a role'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) { toast.error('Please enter a valid email address'); return; }

    setIsInviting(true);
    try {
      const response = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail, role: inviteRole },
      });
      if (response.error) throw new Error(response.error.message || 'Failed to send invitation');
      if (response.data?.error) throw new Error(response.data.error);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('driver');
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit) return;
    setIsEditing(true);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ first_name: editFirstName || null, last_name: editLastName || null })
        .eq('user_id', userToEdit.user_id);
      if (profileError) throw profileError;

      if (editRole !== userToEdit.role) {
        if (userToEdit.role_id) {
          const { error } = await supabase.from('user_roles').update({ role: editRole }).eq('id', userToEdit.role_id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('user_roles').insert({ user_id: userToEdit.user_id, role: editRole });
          if (error) throw error;
        }
      }
      toast.success('User updated successfully');
      setEditDialogOpen(false);
      setUserToEdit(null);
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update user');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      const response = await supabase.functions.invoke('delete-user', { body: { userId: userToDelete.user_id } });
      if (response.error) throw new Error(response.error.message || 'Failed to delete user');
      if (response.data?.error) throw new Error(response.data.error);
      toast.success('User deleted successfully');
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleForcePasswordReset = async () => {
    if (!userToResetPassword) return;
    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userToResetPassword.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(`Password reset email sent to ${userToResetPassword.email}`);
      setResetPasswordDialogOpen(false);
      setUserToResetPassword(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send password reset email');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const openEditDialog = useCallback((usr: UserWithRole) => {
    setUserToEdit(usr);
    setEditFirstName(usr.first_name || '');
    setEditLastName(usr.last_name || '');
    setEditRole(usr.role || 'driver');
    setEditDialogOpen(true);
  }, []);

  // ── DataTable columns ──
  const columns = useMemo(() => [
    {
      key: 'name' as const,
      header: 'Name',
      render: (row: UserWithRole) => {
        const name = row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : null;
        return <span className="font-medium text-foreground">{name || '—'}</span>;
      },
    },
    {
      key: 'email' as const,
      header: 'Email',
      render: (row: UserWithRole) => (
        <span className="text-muted-foreground">{row.email}</span>
      ),
    },
    {
      key: 'role' as const,
      header: 'Role',
      width: '140px',
      render: (row: UserWithRole) =>
        row.role ? (
          <Badge variant={roleBadgeVariant[row.role]}>{roleLabels[row.role]}</Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedUserId(row.user_id);
              setAssignDialogOpen(true);
            }}
          >
            Assign Role
          </Button>
        ),
    },
    {
      key: 'status' as const,
      header: 'Status',
      width: '100px',
      render: (row: UserWithRole) => {
        const isActive = !!row.first_name;
        return (
          <Badge variant={isActive ? 'default' : 'outline'} className={isActive ? 'bg-emerald-600/15 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-800' : ''}>
            {isActive ? 'Active' : 'Invited'}
          </Badge>
        );
      },
    },
    {
      key: 'actions' as const,
      header: 'Actions',
      width: '120px',
      render: (row: UserWithRole) => {
        if (row.user_id === user?.id) return null;
        return (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={(e) => { e.stopPropagation(); openEditDialog(row); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Force Password Reset" onClick={(e) => { e.stopPropagation(); setUserToResetPassword(row); setResetPasswordDialogOpen(true); }}>
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setUserToDelete(row); setDeleteDialogOpen(true); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ], [user?.id, openEditDialog]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Team Members</h3>
          <p className="text-sm text-muted-foreground">Manage your organization's users and their roles</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gradient-gold text-primary-foreground">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Member
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={usersWithRoles}
        loading={isLoading}
        emptyMessage="No team members yet. Invite someone to get started."
        tableId="team-members"
        exportFilename="team-members"
      />

      {/* ── Invite Sheet ── */}
      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Invite Team Member</SheetTitle>
            <SheetDescription>Send an email invitation to add a new member. They'll receive a link to create their account.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleInviteUser} className="space-y-6 mt-6">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input id="invite-email" type="email" placeholder="user@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="dispatcher">Dispatcher</SelectItem>
                  <SelectItem value="payroll_admin">Payroll Admin</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The user will be assigned this role when they accept the invitation</p>
            </div>
            <SheetFooter>
              <Button type="submit" className="w-full gradient-gold text-primary-foreground" disabled={isInviting}>
                {isInviting ? 'Sending...' : 'Send Invitation'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Assign Role Dialog ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
            <DialogDescription>Select a role for this user</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); assignRoleMutation.mutate({ userId: selectedUserId, role: selectedRole }); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="payroll_admin">Payroll Admin</SelectItem>
                  <SelectItem value="dispatcher">Dispatcher</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
              <LoadingButton type="submit" className="gradient-gold text-primary-foreground" loading={assignRoleMutation.isPending}>Assign Role</LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information and role</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={userToEdit?.email || ''} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input placeholder="First name" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input placeholder="Last name" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="payroll_admin">Payroll Admin</SelectItem>
                  <SelectItem value="dispatcher">Dispatcher</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground" disabled={isEditing}>
                {isEditing ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the account for{' '}
              <span className="font-semibold">
                {userToDelete?.first_name && userToDelete?.last_name
                  ? `${userToDelete.first_name} ${userToDelete.last_name}`
                  : userToDelete?.email}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset Password Confirmation ── */}
      <AlertDialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force Password Reset</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a password reset email to{' '}
              <span className="font-semibold">{userToResetPassword?.email}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResettingPassword}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleForcePasswordReset} className="gradient-gold text-primary-foreground" disabled={isResettingPassword}>
              {isResettingPassword ? 'Sending...' : 'Send Reset Email'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
