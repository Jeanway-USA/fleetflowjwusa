import { todayLocal } from '@/lib/datetime';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithAuth } from '@/lib/invoke-with-auth';

import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

import { Roster, type RosterEntry } from '@/components/fleet/Roster';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Briefcase, ClipboardCheck, UserPlus, Pencil, KeyRound, UserX, UserCheck, MoreHorizontal } from 'lucide-react';
import { usePositions } from '@/hooks/usePositions';
import { usePayPackages } from '@/hooks/usePayPackages';
import { createHirePlan } from '@/lib/positions/api';
import { StaffOnboardingDialog } from '@/components/settings/StaffOnboardingDialog';
import { suggestFromPosition } from '@/lib/positions/defaults';
import { DriverPositionSection } from '@/components/drivers/DriverPositionSection';
import { DriverPayPackageSection } from '@/components/drivers/DriverPayPackageSection';
import { useOnboardingDefaults, ONBOARDING_PREF_DEFAULTS } from '@/components/settings/OnboardingPreferencesCard';
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
  /** Still has to finish onboarding. */
  onboardingPending: boolean;
  /** Their current position, if one is set. */
  position: string | null;
  /** Switched off by an owner: cannot sign in, everything they did stays. */
  deactivated: boolean;
}

const roleLabels: Record<AppRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  payroll_admin: 'Payroll Admin',
  dispatcher: 'Dispatcher',
  safety: 'Safety',
  driver: 'Driver',
  maintenance: 'Maintenance Staff',
};

const roleBadgeVariant: Record<AppRole, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'default',
  payroll_admin: 'secondary',
  dispatcher: 'secondary',
  safety: 'outline',
  driver: 'outline',
  maintenance: 'outline',
};

export function TeamManagementTab() {
  const queryClient = useQueryClient();
  const { user, orgId, hasPayrollAccess } = useAuth();

  // Sheet / Dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);

  // Form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFirstName, setInviteFirstName] = useState('');
  const [inviteLastName, setInviteLastName] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('driver');
  const [inviteRequiresOnboarding, setInviteRequiresOnboarding] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  const { data: onboardingDefaults } = useOnboardingDefaults();
  const { data: positions = [] } = usePositions();
  const [invitePositionId, setInvitePositionId] = useState('');
  const [invitePackageId, setInvitePackageId] = useState('');
  const [inviteLimitAreas, setInviteLimitAreas] = useState(false);
  const [inviteEmploymentType, setInviteEmploymentType] = useState<'w2' | '1099' | 'lease_purchase'>('w2');
  const { data: payPackages = [] } = usePayPackages();
  const [peopleUser, setPeopleUser] = useState<UserWithRole | null>(null);
  const [onboardingUser, setOnboardingUser] = useState<UserWithRole | null>(null);
  const [peopleSuggestedPackage, setPeopleSuggestedPackage] = useState<string | null>(null);
  const invitePosition = positions.find((p) => p.id === invitePositionId) ?? null;

  // Every role can be onboarded now: drivers in the driver flow, everyone else in staff onboarding.
  const onboardingApplies = true;

  // Auto-default the checkbox whenever role changes or sheet opens
  useEffect(() => {
    const defaults = onboardingDefaults ?? ONBOARDING_PREF_DEFAULTS;
    // A chosen position suggests onboarding; the checkbox below can still be changed.
    if (invitePosition) setInviteRequiresOnboarding(invitePosition.requires_onboarding);
    else setInviteRequiresOnboarding(inviteRole === 'owner' ? false : (defaults as Record<string, boolean>)[inviteRole] ?? true);
  }, [inviteRole, onboardingDefaults, inviteOpen, invitePosition]);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('driver');

  const [userToEdit, setUserToEdit] = useState<UserWithRole | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('driver');
  const [isEditing, setIsEditing] = useState(false);

  const [userToDeactivate, setUserToDeactivate] = useState<UserWithRole | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const [userToResetPassword, setUserToResetPassword] = useState<UserWithRole | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // ── Query ──
  const { data: usersWithRoles = [], isLoading } = useQuery({
    queryKey: ['users_with_roles', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return [] as UserWithRole[];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('org_id', orgId);
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('org_id', orgId);
      if (rolesError) throw rolesError;

      // Their position, newest first. Not every viewer can read these, so a failure just leaves the column empty.
      const positionByUser = new Map<string, string>();
      const { data: assignments } = await supabase
        .from('position_assignments')
        .select('user_id, effective_start, positions(name)')
        .not('user_id', 'is', null)
        .is('effective_end', null)
        .order('effective_start', { ascending: false });
      for (const a of (assignments ?? []) as Array<{ user_id: string | null; positions: { name: string } | null }>) {
        if (a.user_id && a.positions?.name && !positionByUser.has(a.user_id)) positionByUser.set(a.user_id, a.positions.name);
      }

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
          onboardingPending: !!p.requires_onboarding && !p.onboarding_completed,
          position: positionByUser.get(p.user_id) ?? null,
          deactivated: !!(p as { deactivated_at?: string | null }).deactivated_at,
        };
      }) as UserWithRole[];
    },
  });

  // ── Mutations ──
  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      if (!orgId) throw new Error('No organization context');

      // Look for ANY existing role row for this user (regardless of org_id),
      // because the (user_id, role) unique constraint will cause a duplicate-key
      // error otherwise — including legacy rows where org_id was never set.
      const { data: existingRows } = await supabase
        .from('user_roles')
        .select('id, role, org_id')
        .eq('user_id', userId);

      const sameRole = existingRows?.find((r) => r.role === role);
      const orgScoped = existingRows?.find((r) => r.org_id === orgId);
      const target = sameRole ?? orgScoped ?? null;

      if (target) {
        const { error } = await supabase
          .from('user_roles')
          .update({ role, org_id: orgId })
          .eq('id', target.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role, org_id: orgId });
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
    if (!inviteFirstName.trim() || !inviteLastName.trim()) { toast.error('Please enter a first and last name'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) { toast.error('Please enter a valid email address'); return; }

    setIsInviting(true);
    try {
      // The plan (position, pay package, classification, limits) is saved first: the invitation applies it straight away
      // for a brand-new person, and when they accept for someone who already has an account.
      if (orgId && (invitePosition || invitePackageId || inviteRole === 'driver' || inviteEmploymentType !== 'w2')) {
        try {
          await createHirePlan({
            orgId,
            email: inviteEmail,
            positionId: invitePosition?.id ?? null,
            payPackageId: invitePackageId || null,
            start: todayLocal(),
            limitToAreas: inviteLimitAreas,
            areas: invitePosition?.default_permissions ?? [],
            employmentType: inviteRole === 'driver' ? inviteEmploymentType : inviteEmploymentType === 'w2' ? 'w2' : '1099',
          });
        } catch (planError: any) {
          throw new Error('The position and pay package could not be saved, so no invitation was sent: ' + planError.message);
        }
      }
      const response = await invokeWithAuth<{ error?: string }>('invite-user', {
        body: {
          email: inviteEmail,
          role: inviteRole,
          first_name: inviteFirstName.trim(),
          last_name: inviteLastName.trim(),
          requires_onboarding: inviteRequiresOnboarding,
        },
      });
      if (response.sessionExpired) return;
      if (response.error) throw new Error(response.error.message || 'Failed to send invitation');
      if (response.data?.error) throw new Error(response.data.error);

      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteFirstName('');
      setInviteLastName('');
      setInviteRole('driver');
      setInvitePositionId('');
      setInvitePackageId('');
      setInviteLimitAreas(false);
      setInviteEmploymentType('w2');
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
        if (!orgId) throw new Error('No organization context');
        if (userToEdit.role_id) {
          const { error } = await supabase.from('user_roles').update({ role: editRole, org_id: orgId }).eq('id', userToEdit.role_id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('user_roles').insert({ user_id: userToEdit.user_id, role: editRole, org_id: orgId });
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

  const setUserActive = async (target: UserWithRole, active: boolean) => {
    setIsDeactivating(true);
    try {
      const { error } = await supabase.rpc((active ? 'reactivate_user' : 'deactivate_user') as never, { _user_id: target.user_id } as never);
      if (error) {
        const missing = /deactivate_user|reactivate_user|deactivated_at/.test(error.message);
        throw new Error(missing ? 'This needs the latest database update (docs/APPLY_DEACTIVATE_USERS.sql).' : error.message);
      }
      toast.success(active ? 'Reactivated. They can sign in again.' : 'Deactivated. They are signed out and cannot sign in. Their records are kept.');
      setUserToDeactivate(null);
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update that person');
    } finally {
      setIsDeactivating(false);
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

  const deactivatedCount = usersWithRoles.filter((u) => u.deactivated).length;
  const entries: RosterEntry[] = usersWithRoles.filter((u) => showDeactivated || !u.deactivated).map((row) => {
    const isActive = !!row.first_name;
    const name = row.first_name && row.last_name ? `${row.first_name} ${row.last_name}` : row.email;
    return {
      id: row.user_id,
      title: name,
      subtitle: row.position ? `${row.email} · ${row.position}` : row.email,
      facts: [],
      chips: (
        <>
          {row.role ? (
            <Badge variant={roleBadgeVariant[row.role]}>{roleLabels[row.role]}</Badge>
          ) : (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setSelectedUserId(row.user_id); setAssignDialogOpen(true); }}>
              Assign role
            </Button>
          )}
          {row.deactivated ? (
            <Badge variant="outline" className="text-muted-foreground">Deactivated</Badge>
          ) : row.onboardingPending ? (
            <Badge variant="outline" className="border-warning/50 bg-warning/15 text-warning">Onboarding pending</Badge>
          ) : (
            <Badge variant={isActive ? 'default' : 'outline'} className={isActive ? 'bg-success/15 text-success border-success/30' : ''}>
              {isActive ? 'Active' : 'Invited'}
            </Badge>
          )}
        </>
      ),
      menu: row.user_id === user?.id ? undefined : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for ${name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.deactivated ? (
              <DropdownMenuItem onClick={() => void setUserActive(row, true)}><UserCheck className="mr-2 h-4 w-4" /> Reactivate</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => openEditDialog(row)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
            )}
            {hasPayrollAccess && <DropdownMenuItem onClick={() => { setPeopleSuggestedPackage(null); setPeopleUser(row); }}><Briefcase className="mr-2 h-4 w-4" /> Position & pay</DropdownMenuItem>}
            {hasPayrollAccess && row.role !== 'driver' && <DropdownMenuItem onClick={() => setOnboardingUser(row)}><ClipboardCheck className="mr-2 h-4 w-4" /> Onboarding</DropdownMenuItem>}
            <DropdownMenuItem onClick={() => { setUserToResetPassword(row); setResetPasswordDialogOpen(true); }}><KeyRound className="mr-2 h-4 w-4" /> Force password reset</DropdownMenuItem>
            <DropdownMenuSeparator />
            {!row.deactivated && <DropdownMenuItem className="text-destructive" onClick={() => setUserToDeactivate(row)}><UserX className="mr-2 h-4 w-4" /> Deactivate</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-condensed text-xl font-bold leading-tight text-foreground">Team members</h3>
          <p className="text-[13px] text-muted-foreground">Manage your organization's users and their roles</p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="h-11 bg-primary text-primary-foreground hover:bg-primary/90">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite Member
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : (
        <>
        {deactivatedCount > 0 && (
          <label className="flex min-h-11 items-center gap-2 px-1 text-sm text-muted-foreground">
            <Switch checked={showDeactivated} onCheckedChange={setShowDeactivated} />
            Show deactivated people ({deactivatedCount})
          </label>
        )}
        <Roster entries={entries} empty="No team members yet. Invite someone to get started." />
        </>
      )}

      {/* ── Invite Sheet ── */}
      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent className="flex flex-col p-0 gap-0 overflow-hidden">
          <SheetHeader className="shrink-0 mx-0 mt-0 px-6 pt-6 pb-4 pr-12 border-b static">
            <SheetTitle>Invite Team Member</SheetTitle>
            <SheetDescription>Send an email invitation to add a new member. They'll receive a link to create their account.</SheetDescription>
          </SheetHeader>
          <form onSubmit={handleInviteUser} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-first-name">First Name</Label>
                <Input id="invite-first-name" type="text" placeholder="Jane" value={inviteFirstName} onChange={(e) => setInviteFirstName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-last-name">Last Name</Label>
                <Input id="invite-last-name" type="text" placeholder="Doe" value={inviteLastName} onChange={(e) => setInviteLastName(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input id="invite-email" type="email" placeholder="user@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            </div>
            {positions.some((p) => !p.archived_at) && (
              <div className="space-y-2">
                <Label>Position (optional)</Label>
                <Select
                  value={invitePositionId}
                  onValueChange={(id) => {
                    setInvitePositionId(id);
                    const pos = positions.find((p) => p.id === id);
                    if (pos?.default_role) setInviteRole(pos.default_role as AppRole);
                    const suggestedType = (pos as { default_employment_type?: 'w2' | '1099' | 'lease_purchase' | null } | undefined)?.default_employment_type;
                    if (suggestedType) setInviteEmploymentType(suggestedType);
                    const usable = new Set(payPackages.filter((p) => !p.archived_at && p.is_active).map((p) => p.id));
                    setInvitePackageId(pos ? suggestFromPosition(pos, usable).payPackageId ?? '' : '');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Choose a position to fill in the defaults" /></SelectTrigger>
                  <SelectContent>
                    {positions.filter((p) => !p.archived_at).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {invitePosition && (
                  <>
                    <Label className="pt-1">Pay package</Label>
                    <Select value={invitePackageId || '__none__'} onValueChange={(v) => setInvitePackageId(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No pay package yet</SelectItem>
                        {payPackages.filter((p) => !p.archived_at && p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <label className="flex min-h-[44px] items-center gap-2 text-sm">
                      <Checkbox checked={inviteLimitAreas} onCheckedChange={(v) => setInviteLimitAreas(v === true)} />
                      Limit them to this position's areas
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Role, onboarding and pay package are suggested from the position and can all be changed. The position, package, classification and limit are applied when the invitation goes out (or when they accept, if they already have an account).
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="dispatcher">Dispatcher</SelectItem>
                  <SelectItem value="payroll_admin">Payroll Admin</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="maintenance">Maintenance Staff</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The user will be assigned this role when they accept the invitation</p>
            </div>
            <div className="space-y-2">
              <Label>How they are paid and taxed</Label>
              {inviteRole === 'driver' ? (
                <Select value={inviteEmploymentType} onValueChange={(v) => setInviteEmploymentType(v as 'w2' | '1099' | 'lease_purchase')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="w2">Company driver (W-2 employee)</SelectItem>
                    <SelectItem value="1099">Owner-operator (1099 contractor)</SelectItem>
                    <SelectItem value="lease_purchase">Lease purchase (1099 contractor)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select value={inviteEmploymentType === 'w2' ? 'w2' : '1099'} onValueChange={(v) => setInviteEmploymentType(v as 'w2' | '1099')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="w2">Employee (W-2)</SelectItem>
                    <SelectItem value="1099">Contractor (1099)</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">You decide this, not the person. It decides which tax forms they fill in.</p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border p-4">
              <Checkbox
                id="invite-requires-onboarding"
                checked={inviteRequiresOnboarding}
                disabled={!onboardingApplies}
                onCheckedChange={(checked) => setInviteRequiresOnboarding(checked === true)}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label htmlFor="invite-requires-onboarding" className="font-medium cursor-pointer">
                  Require onboarding before activation
                </Label>
                <p className="text-xs text-muted-foreground">
                  {onboardingApplies
                    ? 'Drivers fill in their driver profile and forms. Everyone else fills in their details, tax forms and your staff documents.'
                    : ''}
                </p>
              </div>
            </div>
            </div>
            <SheetFooter className="shrink-0 mx-0 mb-0 px-6 pt-4 pb-6 border-t static">
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" disabled={isInviting}>
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
                  <SelectItem value="maintenance">Maintenance Staff</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
              <LoadingButton type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" loading={assignRoleMutation.isPending}>Assign Role</LoadingButton>
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
                  <SelectItem value="maintenance">Maintenance Staff</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <LoadingButton type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" loading={isEditing}>
                Save Changes
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Deactivate Confirmation ── */}
      <AlertDialog open={!!userToDeactivate} onOpenChange={(v) => !v && setUserToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this person?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">
                {userToDeactivate?.first_name && userToDeactivate?.last_name ? `${userToDeactivate.first_name} ${userToDeactivate.last_name}` : userToDeactivate?.email}
              </span>{' '}
              will be signed out and cannot sign in again until you reactivate them. Their loads, pay records, signed documents and history all stay. A driver is marked inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivating}>Keep active</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (userToDeactivate) void setUserActive(userToDeactivate, false); }} disabled={isDeactivating}>
              {isDeactivating ? 'Deactivating…' : 'Deactivate'}
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
            <AlertDialogAction onClick={handleForcePasswordReset} className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={isResettingPassword}>
              {isResettingPassword ? 'Sending...' : 'Send Reset Email'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StaffOnboardingDialog
        open={!!onboardingUser}
        onOpenChange={(v) => !v && setOnboardingUser(null)}
        userId={onboardingUser?.user_id ?? null}
        name={onboardingUser ? `${onboardingUser.first_name ?? ''} ${onboardingUser.last_name ?? ''}`.trim() || onboardingUser.email : ''}
      />

      <Dialog open={!!peopleUser} onOpenChange={(v) => !v && setPeopleUser(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-xl flex-col">
          <DialogHeader>
            <DialogTitle>Position & pay</DialogTitle>
            <DialogDescription>{peopleUser ? `${peopleUser.first_name ?? ''} ${peopleUser.last_name ?? ''}`.trim() || peopleUser.email : ''}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {peopleUser && (
              <>
                <DriverPositionSection userId={peopleUser.user_id} onSuggestPackage={setPeopleSuggestedPackage} />
                <DriverPayPackageSection userId={peopleUser.user_id} suggestedPackageId={peopleSuggestedPackage} />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
