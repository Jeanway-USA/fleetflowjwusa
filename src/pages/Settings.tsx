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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Shield, Trash2 } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
type UserRole = Database['public']['Tables']['user_roles']['Row'];

interface UserWithRole {
  user_id: string;
  email: string;
  role: AppRole;
  role_id: string;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { isOwner } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<AppRole>('driver');

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
      });
    },
    enabled: isOwner,
  });

  const assignRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // Check if user already has a role
      const { data: existing } = await supabase.from('user_roles').select('*').eq('user_id', userId).maybeSingle();
      
      if (existing) {
        // Update existing role
        const { error } = await supabase.from('user_roles').update({ role }).eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert new role
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

  const usersWithoutRoles = usersWithRoles.filter(u => !u.role);

  if (!isOwner) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Shield className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">Only owners can access settings.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader title="Settings" description="Manage users, roles, and system configuration" />

      <div className="grid gap-6">
        {/* User Role Management */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Role Management
            </CardTitle>
            <CardDescription>Assign and manage user roles</CardDescription>
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
              {usersWithRoles.map(user => (
                <div key={user.user_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">
                      {user.first_name && user.last_name 
                        ? `${user.first_name} ${user.last_name}` 
                        : user.email}
                    </p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.role ? (
                      <>
                        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm capitalize">
                          {user.role.replace(/_/g, ' ')}
                        </span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="text-destructive"
                          onClick={() => user.role_id && removeRoleMutation.mutate(user.role_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setSelectedUserId(user.user_id);
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
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Role</DialogTitle>
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
    </DashboardLayout>
  );
}
