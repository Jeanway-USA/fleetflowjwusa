import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Pencil, Trash2, Search, Plus, Wrench, Truck, Droplets, Users, Shield, AlertTriangle, CheckCircle, ExternalLink, Phone, Mail, MapPin } from 'lucide-react';

const RESOURCE_TYPES = [
  { value: 'mechanic', label: 'Mechanic', icon: Wrench },
  { value: 'roadside', label: 'Roadside', icon: Truck },
  { value: 'truck_wash', label: 'Truck Wash', icon: Droplets },
  { value: 'load_agent', label: 'Load Agent', icon: Users },
];

const AGENT_STATUSES = [
  { value: 'safe', label: 'Safe Load Agent', color: 'bg-success text-success-foreground' },
  { value: 'unsafe', label: 'Unsafe Load Agent', color: 'bg-destructive text-destructive-foreground' },
];

export default function Resources() {
  const { hasRole, isAdmin } = useAuth();
  const isDriver = hasRole('driver') && !isAdmin;
  const canEdit = !isDriver; // Drivers can only view, not edit
  
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  const [activeTab, setActiveTab] = useState('load_agent');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['company_resources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_resources')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (resource: any) => {
      const { error } = await supabase.from('company_resources').insert(resource);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_resources'] });
      toast.success('Resource created successfully');
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await supabase.from('company_resources').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_resources'] });
      toast.success('Resource updated successfully');
      closeDialog();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_resources').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company_resources'] });
      toast.success('Resource deleted');
    },
    onError: (error: any) => toast.error(error.message),
  });

  const openDialog = (resource?: any) => {
    setEditingResource(resource || null);
    setFormData(resource || { resource_type: activeTab });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingResource(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('Name is required');
      return;
    }

    if (editingResource) {
      updateMutation.mutate({ id: editingResource.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Filter resources by type and search
  const filteredResources = resources.filter((r: any) => {
    const matchesType = r.resource_type === activeTab;
    const matchesSearch = searchQuery === '' || 
      r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.agent_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.service_area?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.notes?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  // Stats for load agents
  const loadAgents = resources.filter((r: any) => r.resource_type === 'load_agent');
  const safeAgents = loadAgents.filter((r: any) => r.agent_status === 'safe');
  const unsafeAgents = loadAgents.filter((r: any) => r.agent_status === 'unsafe');

  const getResourceTypeIcon = (type: string) => {
    const found = RESOURCE_TYPES.find(t => t.value === type);
    return found ? found.icon : Wrench;
  };

  const renderAgentStatus = (status: string) => {
    if (status === 'safe') {
      return (
        <Badge className="bg-success/20 text-success border-success/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Safe
        </Badge>
      );
    }
    return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Unsafe
      </Badge>
    );
  };

  const renderLoadAgentCards = () => (
    <div className="grid gap-3 p-4 sm:hidden">
      {filteredResources.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No load agents found</p>
      ) : (
        filteredResources.map((resource: any) => (
          <Card key={resource.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-xl">{resource.agent_code}</span>
                {renderAgentStatus(resource.agent_status)}
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDialog(resource)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(resource.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            {resource.notes && <p className="text-sm text-muted-foreground mt-2">{resource.notes}</p>}
          </Card>
        ))
      )}
    </div>
  );

  const renderLoadAgentTable = () => (
    <div className="hidden sm:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Information</TableHead>
            {canEdit && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredResources.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 4 : 3} className="text-center py-8 text-muted-foreground">
                No load agents found
              </TableCell>
            </TableRow>
          ) : (
            filteredResources.map((resource: any) => (
              <TableRow key={resource.id}>
                <TableCell className="font-mono font-bold text-lg">{resource.agent_code}</TableCell>
                <TableCell>{renderAgentStatus(resource.agent_status)}</TableCell>
                <TableCell className="max-w-md">{resource.notes || '-'}</TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openDialog(resource)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(resource.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  const renderResourceCards = () => (
    <div className="grid gap-3 p-4 sm:hidden">
      {filteredResources.length === 0 ? (
        <p className="text-center py-8 text-muted-foreground">No resources found</p>
      ) : (
        filteredResources.map((resource: any) => (
          <Card key={resource.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="font-medium truncate">{resource.name}</p>
                {resource.website && resource.website !== 'N/A' && (
                  <a href={resource.website.startsWith('http') ? resource.website : `https://${resource.website}`} 
                     target="_blank" 
                     rel="noopener noreferrer"
                     className="text-xs text-primary hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Website
                  </a>
                )}
              </div>
              {canEdit && (
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openDialog(resource)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(resource.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {resource.phone && (
                <a href={`tel:${resource.phone}`} className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  {resource.phone}
                </a>
              )}
              {resource.email && resource.email !== 'N/A' && (
                <a href={`mailto:${resource.email}`} className="flex items-center gap-2 text-muted-foreground truncate">
                  <Mail className="h-4 w-4 shrink-0" />
                  {resource.email}
                </a>
              )}
              {activeTab === 'roadside' ? (
                resource.service_area && <Badge variant="outline">{resource.service_area}</Badge>
              ) : (
                resource.address && (
                  <p className="text-muted-foreground flex items-start gap-2">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{resource.address}</span>
                  </p>
                )
              )}
              {resource.notes && <p className="text-muted-foreground text-xs pt-1 border-t">{resource.notes}</p>}
            </div>
          </Card>
        ))
      )}
    </div>
  );

  const renderResourceTable = () => (
    <div className="hidden sm:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>{activeTab === 'roadside' ? 'Service Area' : 'Address'}</TableHead>
            <TableHead>Notes</TableHead>
            {canEdit && <TableHead>Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredResources.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canEdit ? 5 : 4} className="text-center py-8 text-muted-foreground">
                No resources found
              </TableCell>
            </TableRow>
          ) : (
            filteredResources.map((resource: any) => (
              <TableRow key={resource.id}>
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium">{resource.name}</p>
                    {resource.website && resource.website !== 'N/A' && (
                      <a href={resource.website.startsWith('http') ? resource.website : `https://${resource.website}`} 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="text-xs text-primary hover:underline flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        Website
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1 text-sm">
                    {resource.phone && (
                      <a href={`tel:${resource.phone}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                        <Phone className="h-3 w-3" />
                        {resource.phone}
                      </a>
                    )}
                    {resource.email && resource.email !== 'N/A' && (
                      <a href={`mailto:${resource.email}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                        <Mail className="h-3 w-3" />
                        {resource.email}
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {activeTab === 'roadside' ? (
                    <Badge variant="outline">{resource.service_area}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {resource.address || '-'}
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-xs truncate">{resource.notes || '-'}</TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openDialog(resource)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(resource.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <DashboardLayout>
      <PageHeader 
        title="Company Resources" 
        description="Searchable database of vendors, services, and load agents" 
        action={canEdit ? { label: 'Add Resource', onClick: () => openDialog() } : undefined} 
      />

      {/* Load Agent Scorecard Summary - Compact on mobile */}
      {activeTab === 'load_agent' && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <Card className="card-elevated p-3 sm:p-0">
            <CardHeader className="hidden sm:flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold text-center sm:text-left">{loadAgents.length}</div>
              <p className="text-xs text-muted-foreground text-center sm:text-left">Total</p>
            </CardContent>
          </Card>
          <Card className="card-elevated border-success/30 p-3 sm:p-0">
            <CardHeader className="hidden sm:flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Safe Agents</CardTitle>
              <CheckCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold text-success text-center sm:text-left">{safeAgents.length}</div>
              <p className="text-xs text-muted-foreground text-center sm:text-left">Safe</p>
            </CardContent>
          </Card>
          <Card className="card-elevated border-destructive/30 p-3 sm:p-0">
            <CardHeader className="hidden sm:flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Unsafe Agents</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <div className="text-xl sm:text-2xl font-bold text-destructive text-center sm:text-left">{unsafeAgents.length}</div>
              <p className="text-xs text-muted-foreground text-center sm:text-left">Unsafe</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearchQuery(''); }}>
        <TabsList className="w-full grid grid-cols-4 h-auto">
          {RESOURCE_TYPES.map(type => {
            const Icon = type.icon;
            const count = resources.filter((r: any) => r.resource_type === type.value).length;
            return (
              <TabsTrigger key={type.value} value={type.value} className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 py-2 text-xs sm:text-sm">
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{type.label}</span>
                <Badge variant="secondary" className="text-[10px] sm:text-xs">{count}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="load_agent" className="mt-4">
          <Card className="card-elevated">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Loading...</div>
              ) : (
                <>
                  {renderLoadAgentCards()}
                  {renderLoadAgentTable()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {['mechanic', 'roadside', 'truck_wash'].map(type => (
          <TabsContent key={type} value={type} className="mt-4">
            <Card className="card-elevated">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Loading...</div>
                ) : (
                  <>
                    {renderResourceCards()}
                    {renderResourceTable()}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Add/Edit Resource Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingResource ? 'Edit Resource' : 'Add New Resource'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resource_type">Resource Type</Label>
              <Select 
                value={formData.resource_type || 'mechanic'} 
                onValueChange={(v) => setFormData({ ...formData, resource_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.resource_type === 'load_agent' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agent_code">Agent Code *</Label>
                    <Input 
                      id="agent_code"
                      value={formData.agent_code || ''}
                      onChange={(e) => setFormData({ ...formData, agent_code: e.target.value.toUpperCase().slice(0, 3), name: e.target.value.toUpperCase().slice(0, 3) })}
                      placeholder="JNS"
                      maxLength={3}
                      className="font-mono uppercase"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent_status">Status *</Label>
                    <Select 
                      value={formData.agent_status || 'safe'} 
                      onValueChange={(v) => setFormData({ ...formData, agent_status: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AGENT_STATUSES.map(status => (
                          <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Information</Label>
                  <Textarea 
                    id="notes"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="High Paying Agent, Hazmat, I-5 Corridor, etc."
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Company Name *</Label>
                  <Input 
                    id="name"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Company Name"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input 
                      id="phone"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="555-123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input 
                      id="email"
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input 
                    id="website"
                    value={formData.website || ''}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
                {formData.resource_type === 'roadside' ? (
                  <div className="space-y-2">
                    <Label htmlFor="service_area">Service Area (State)</Label>
                    <Input 
                      id="service_area"
                      value={formData.service_area || ''}
                      onChange={(e) => setFormData({ ...formData, service_area: e.target.value.toUpperCase() })}
                      placeholder="TX, OK, AR"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input 
                      id="address"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="123 Main St, City, ST 12345"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea 
                    id="notes"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes..."
                    rows={2}
                  />
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit">{editingResource ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
