import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Users, Shield, Trash2, UserPlus, Sun, Moon, Settings2, Mail, Building2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface UserWithRole {
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

export default function Settings() {
  const queryClient = useQueryClient();
  const { isOwner, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('driver');
  
  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('driver');
  const [isInviting, setIsInviting] = useState(false);

  // Get all profiles with their roles
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
          user_id: p.user_id,
          email: p.email || 'No email',
          first_name: p.first_name,
          last_name: p.last_name,
          role: userRole?.role || null,
          role_id: userRole?.id || null,
        };
      }) as UserWithRole[];
    },
    enabled: isOwner,
  });

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
      setDialogOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const removeRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
      toast.success('Role removed');
    },
    onError: (error) => toast.error(error.message),
  });

  const handleAssignRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedRole) {
      toast.error('Please select a user and role');
      return;
    }
    assignRoleMutation.mutate({ userId: selectedUserId, role: selectedRole });
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteEmail || !inviteRole) {
      toast.error('Please enter an email and select a role');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsInviting(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail, role: inviteRole },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to send invitation');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteDialogOpen(false);
      setInviteEmail('');
      setInviteRole('driver');
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const usersWithoutRoles = usersWithRoles.filter(u => !u.role);

  // Access denied for non-owners (but still show personal settings)
  if (!isOwner) {
    return (
      <DashboardLayout>
        <PageHeader title="Settings" description="Manage your preferences" />
        
        <div className="max-w-2xl space-y-6">
          {/* Appearance Settings - Available to all users */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
                Appearance
              </CardTitle>
              <CardDescription>Customize how the app looks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="theme-toggle" className="font-medium">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                </div>
                <Switch 
                  id="theme-toggle"
                  checked={theme === 'dark'}
                  onCheckedChange={toggleTheme}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Admin Settings Restricted</h3>
                <p className="text-muted-foreground text-sm">Contact an owner for user management access.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader title="Settings" description="Manage users, roles, and system configuration" />

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users & Roles
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            General
          </TabsTrigger>
        </TabsList>

        {/* Users & Roles Tab */}
        <TabsContent value="users" className="space-y-6">
          {/* Invite Users Card */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Invite New User
              </CardTitle>
              <CardDescription>Send an email invitation to add a new team member</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setInviteDialogOpen(true)} className="gradient-gold text-primary-foreground">
                <Mail className="h-4 w-4 mr-2" />
                Send Invitation
              </Button>
            </CardContent>
          </Card>

          {/* User Role Management */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                User Role Management
              </CardTitle>
              <CardDescription>View and manage user roles</CardDescription>
            </CardHeader>
            <CardContent>
              {usersWithoutRoles.length > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <p className="text-sm text-warning">
                    {usersWithoutRoles.length} user(s) without assigned roles
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {usersWithRoles.map(usr => (
                  <div key={usr.user_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {usr.first_name && usr.last_name 
                          ? `${usr.first_name} ${usr.last_name}` 
                          : usr.email}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{usr.email}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {usr.role ? (
                        <>
                          <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm whitespace-nowrap">
                            {roleLabels[usr.role]}
                          </span>
                          {usr.user_id !== user?.id && (
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="text-destructive shrink-0"
                              onClick={() => usr.role_id && removeRoleMutation.mutate(usr.role_id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button 
                          size="sm" 
                          onClick={() => {
                            setSelectedUserId(usr.user_id);
                            setDialogOpen(true);
                          }}
                        >
                          Assign Role
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {usersWithRoles.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No users registered yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
                Theme
              </CardTitle>
              <CardDescription>Choose your preferred color scheme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="theme-switch" className="font-medium">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                </div>
                <Switch 
                  id="theme-switch"
                  checked={theme === 'dark'}
                  onCheckedChange={toggleTheme}
                />
              </div>

              {/* Theme Preview */}
              <div className="grid grid-cols-2 gap-4 pt-4">
                <button
                  onClick={() => theme !== 'light' && toggleTheme()}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    theme === 'light' ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="bg-white rounded-md p-3 mb-2 border">
                    <div className="h-2 w-12 bg-amber-500 rounded mb-2" />
                    <div className="h-2 w-20 bg-gray-200 rounded mb-1" />
                    <div className="h-2 w-16 bg-gray-200 rounded" />
                  </div>
                  <span className="text-sm font-medium">Light</span>
                </button>
                <button
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    theme === 'dark' ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="bg-zinc-900 rounded-md p-3 mb-2 border border-zinc-700">
                    <div className="h-2 w-12 bg-amber-500 rounded mb-2" />
                    <div className="h-2 w-20 bg-zinc-700 rounded mb-1" />
                    <div className="h-2 w-16 bg-zinc-700 rounded" />
                  </div>
                  <span className="text-sm font-medium">Dark</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Company Information
              </CardTitle>
              <CardDescription>Basic company settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input value="JeanWay USA" disabled className="bg-muted" />
                <p className="text-xs text-muted-foreground">Contact support to change company name</p>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select defaultValue="america-chicago">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="america-new_york">Eastern Time (ET)</SelectItem>
                    <SelectItem value="america-chicago">Central Time (CT)</SelectItem>
                    <SelectItem value="america-denver">Mountain Time (MT)</SelectItem>
                    <SelectItem value="america-los_angeles">Pacific Time (PT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date Format</Label>
                <Select defaultValue="mm-dd-yyyy">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mm-dd-yyyy">MM/DD/YYYY</SelectItem>
                    <SelectItem value="dd-mm-yyyy">DD/MM/YYYY</SelectItem>
                    <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
            <DialogDescription>Select a role for this user</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignRole} className="space-y-4">
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
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground">Assign Role</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
            <DialogDescription>
              Send an email invitation to add a team member. They'll receive a link to create their account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input 
                id="invite-email"
                type="email" 
                placeholder="user@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Assign Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="payroll_admin">Payroll Admin</SelectItem>
                  <SelectItem value="dispatcher">Dispatcher</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The user will be assigned this role when they accept the invitation</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="gradient-gold text-primary-foreground" disabled={isInviting}>
                {isInviting ? 'Sending...' : 'Send Invitation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
