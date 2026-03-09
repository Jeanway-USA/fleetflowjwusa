import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useContactMutations,
  useResourceMutations,
  useFacilityMutations,
  type UnifiedContact,
  type ContactType,
} from '@/hooks/useCRMData';

const CONTACT_TYPES: { value: string; label: string }[] = [
  { value: 'broker', label: 'Broker' },
  { value: 'agent', label: 'Agent / Load Agent' },
  { value: 'shipper', label: 'Shipper / Facility' },
  { value: 'receiver', label: 'Receiver / Facility' },
  { value: 'vendor-mechanic', label: 'Vendor — Mechanic' },
  { value: 'vendor-roadside', label: 'Vendor — Roadside' },
  { value: 'vendor-truck_wash', label: 'Vendor — Truck Wash' },
  { value: 'vendor-other', label: 'Vendor — Other' },
];

const FACILITY_SUB_TYPES = [
  { value: 'shipper', label: 'Shipper' },
  { value: 'receiver', label: 'Receiver' },
  { value: 'both', label: 'Shipper & Receiver' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'terminal', label: 'Terminal' },
];

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editContact?: UnifiedContact | null;
}

function getFormType(contact: UnifiedContact): string {
  if (contact.source === 'resource') {
    if (contact.resource_type === 'load_agent') return 'agent';
    return `vendor-${contact.resource_type || 'other'}`;
  }
  if (contact.source === 'facility') {
    return contact.contact_type === 'receiver' ? 'receiver' : 'shipper';
  }
  return contact.contact_type;
}

export function ContactFormDialog({ open, onOpenChange, editContact }: ContactFormDialogProps) {
  const { orgId } = useAuth();
  const { createContact, updateContact } = useContactMutations();
  const { createResource, updateResource } = useResourceMutations();
  const { createFacility, updateFacility } = useFacilityMutations();
  const isEditing = !!editContact;

  const [formType, setFormType] = useState('broker');
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    website: '',
    agent_code: '',
    agent_status: 'safe',
    notes: '',
    tags: '',
    // Facility-specific
    facility_type: 'shipper',
    zip: '',
    operating_hours: '',
    dock_info: '',
    appointment_required: false,
    // Resource-specific
    service_area: '',
  });

  useEffect(() => {
    if (editContact) {
      setFormType(getFormType(editContact));
      setForm({
        company_name: editContact.company_name || '',
        contact_name: editContact.contact_name || '',
        phone: editContact.phone || '',
        email: editContact.email || '',
        address: editContact.address || '',
        city: editContact.city || '',
        state: editContact.state || '',
        website: editContact.website || '',
        agent_code: editContact.agent_code || '',
        agent_status: editContact.agent_status || 'safe',
        notes: editContact.notes || '',
        tags: (editContact.tags || []).join(', '),
        facility_type: editContact.facility_type || 'shipper',
        zip: editContact.zip || '',
        operating_hours: editContact.operating_hours || '',
        dock_info: editContact.dock_info || '',
        appointment_required: editContact.appointment_required || false,
        service_area: editContact.service_area || '',
      });
    } else {
      setFormType('broker');
      setForm({
        company_name: '', contact_name: '', phone: '', email: '',
        address: '', city: '', state: '', website: '', agent_code: '',
        agent_status: 'safe', notes: '', tags: '', facility_type: 'shipper',
        zip: '', operating_hours: '', dock_info: '', appointment_required: false,
        service_area: '',
      });
    }
  }, [editContact, open]);

  const isFacility = formType === 'shipper' || formType === 'receiver';
  const isAgent = formType === 'agent';
  const isVendor = formType.startsWith('vendor-');
  const isRoadside = formType === 'vendor-roadside';
  const isBroker = formType === 'broker';

  // Determine which table to target
  function getTargetTable(): 'crm' | 'resource' | 'facility' {
    if (isEditing && editContact) return editContact.source;
    if (isFacility) return 'facility';
    if (isAgent) return 'resource';
    if (isVendor) return 'resource';
    return 'crm'; // broker and vendor-other
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = getTargetTable();

    if (target === 'facility') {
      const facilityPayload = {
        name: form.company_name,
        facility_type: isFacility && !isEditing ? (formType === 'receiver' ? 'receiver' : form.facility_type) : form.facility_type,
        address: form.address,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        contact_name: form.contact_name || null,
        contact_phone: form.phone || null,
        contact_email: form.email || null,
        operating_hours: form.operating_hours || null,
        dock_info: form.dock_info || null,
        appointment_required: form.appointment_required,
        notes: form.notes || null,
        org_id: orgId,
      };
      if (isEditing && editContact) {
        await updateFacility.mutateAsync({ id: editContact.id, ...facilityPayload });
      } else {
        await createFacility.mutateAsync(facilityPayload);
      }
    } else if (target === 'resource') {
      const resourceType = isAgent ? 'load_agent' : formType.replace('vendor-', '');
      const resourcePayload = {
        resource_type: resourceType,
        name: isAgent ? (form.agent_code || form.company_name) : form.company_name,
        phone: form.phone || null,
        email: form.email || null,
        website: form.website || null,
        address: isRoadside ? null : (form.address || null),
        service_area: isRoadside ? (form.service_area || null) : null,
        agent_code: isAgent ? (form.agent_code || null) : null,
        agent_status: isAgent ? form.agent_status : null,
        notes: form.notes || null,
        org_id: orgId,
      };
      if (isEditing && editContact) {
        await updateResource.mutateAsync({ id: editContact.id, ...resourcePayload });
      } else {
        await createResource.mutateAsync(resourcePayload);
      }
    } else {
      // CRM contact (broker or vendor-other)
      const crmPayload = {
        contact_type: isBroker ? 'broker' : 'vendor',
        company_name: form.company_name,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        website: form.website || null,
        agent_code: null,
        agent_status: null,
        notes: form.notes || null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        org_id: orgId,
      };
      if (isEditing && editContact) {
        await updateContact.mutateAsync({ id: editContact.id, ...crmPayload });
      } else {
        await createContact.mutateAsync(crmPayload);
      }
    }
    onOpenChange(false);
  };

  const isLoading = createContact.isPending || updateContact.isPending ||
    createResource.isPending || updateResource.isPending ||
    createFacility.isPending || updateFacility.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contact Type */}
          {!isEditing && (
            <div className="space-y-2">
              <Label>Contact Type</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Agent-specific fields */}
          {isAgent && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Agent Code *</Label>
                <Input
                  value={form.agent_code}
                  onChange={(e) => setForm({ ...form, agent_code: e.target.value.toUpperCase().slice(0, 3) })}
                  placeholder="JNS"
                  maxLength={3}
                  className="font-mono uppercase"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Agent Status</Label>
                <Select value={form.agent_status} onValueChange={(v) => setForm({ ...form, agent_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safe">Safe</SelectItem>
                    <SelectItem value="unsafe">Unsafe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Facility sub-type */}
          {isFacility && !isEditing && (
            <div className="space-y-2">
              <Label>Facility Type</Label>
              <Select value={form.facility_type} onValueChange={(v) => setForm({ ...form, facility_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FACILITY_SUB_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Company / Name */}
          <div className="space-y-2">
            <Label>{isFacility ? 'Facility Name *' : isAgent ? 'Notes / Name' : 'Company Name *'}</Label>
            <Input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              required={!isAgent}
            />
          </div>

          {/* Contact person */}
          {!isAgent && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isFacility ? 'Contact Name' : 'Contact Person'}</Label>
                <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
          )}

          {!isAgent && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              {!isFacility && (
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                </div>
              )}
            </div>
          )}

          {/* Address fields */}
          {isRoadside ? (
            <div className="space-y-2">
              <Label>Service Area (States)</Label>
              <Input
                value={form.service_area}
                onChange={(e) => setForm({ ...form, service_area: e.target.value.toUpperCase() })}
                placeholder="TX, OK, AR"
              />
            </div>
          ) : !isAgent && (
            <>
              <div className="space-y-2">
                <Label>{isFacility ? 'Address *' : 'Address'}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required={isFacility}
                />
              </div>
              <div className={`grid gap-4 ${isFacility ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
                </div>
                {isFacility && (
                  <div className="space-y-2">
                    <Label>ZIP</Label>
                    <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Facility-specific fields */}
          {isFacility && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Operating Hours</Label>
                  <Input value={form.operating_hours} onChange={(e) => setForm({ ...form, operating_hours: e.target.value })} placeholder="Mon-Fri 6AM-6PM" />
                </div>
                <div className="space-y-2">
                  <Label>Dock Info</Label>
                  <Input value={form.dock_info} onChange={(e) => setForm({ ...form, dock_info: e.target.value })} placeholder="4 docks, back-in only" />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="appointment_required"
                  checked={form.appointment_required}
                  onCheckedChange={(checked) => setForm({ ...form, appointment_required: !!checked })}
                />
                <Label htmlFor="appointment_required">Appointment Required</Label>
              </div>
            </>
          )}

          {/* Tags (CRM contacts only) */}
          {(isBroker || formType === 'vendor-other') && (
            <div className="space-y-2">
              <Label>Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. preferred, flatbed, regional" />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>{isAgent ? 'Information' : 'Notes'}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Update' : 'Add Contact'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
