import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContactMutations, type CRMContact, type ContactType } from '@/hooks/useCRMData';
import type { TablesInsert } from '@/integrations/supabase/types';

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'broker', label: 'Broker' },
  { value: 'agent', label: 'Agent' },
  { value: 'shipper', label: 'Shipper' },
  { value: 'receiver', label: 'Receiver' },
  { value: 'vendor', label: 'Vendor' },
];

interface ContactFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editContact?: CRMContact | null;
}

export function ContactFormDialog({ open, onOpenChange, editContact }: ContactFormDialogProps) {
  const { createContact, updateContact } = useContactMutations();
  const isEditing = !!editContact;

  const [form, setForm] = useState({
    contact_type: 'broker' as ContactType,
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
    tags: '' as string,
  });

  useEffect(() => {
    if (editContact) {
      setForm({
        contact_type: editContact.contact_type as ContactType,
        company_name: editContact.company_name,
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
      });
    } else {
      setForm({
        contact_type: 'broker',
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
      });
    }
  }, [editContact, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: TablesInsert<'crm_contacts'> = {
      contact_type: form.contact_type,
      company_name: form.company_name,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      website: form.website || null,
      agent_code: form.contact_type === 'agent' ? (form.agent_code || null) : null,
      agent_status: form.contact_type === 'agent' ? form.agent_status : null,
      notes: form.notes || null,
      tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    };

    if (isEditing && editContact) {
      await updateContact.mutateAsync({ id: editContact.id, ...payload });
    } else {
      await createContact.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const isLoading = createContact.isPending || updateContact.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Type</Label>
              <Select value={form.contact_type} onValueChange={(v) => setForm({ ...form, contact_type: v as ContactType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Company Name *</Label>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
            </div>
          </div>

          {form.contact_type === 'agent' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Agent Code</Label>
                <Input value={form.agent_code} onChange={(e) => setForm({ ...form, agent_code: e.target.value })} />
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

          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="e.g. preferred, flatbed, regional" />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditing ? 'Update Contact' : 'Add Contact'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
