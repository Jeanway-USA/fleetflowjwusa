import { useState } from 'react';
import { Phone, Mail, FileText, Users, Package, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useContactActivities, useCreateActivity, type CRMActivity } from '@/hooks/useCRMData';
import { useAuth } from '@/contexts/AuthContext';

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  note: <FileText className="h-4 w-4" />,
  meeting: <Users className="h-4 w-4" />,
  load_booked: <Package className="h-4 w-4" />,
};

const ACTIVITY_COLORS: Record<string, string> = {
  call: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  email: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
  note: 'bg-muted text-muted-foreground border-border',
  meeting: 'bg-green-500/10 text-green-500 border-green-500/30',
  load_booked: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
};

interface ActivityTimelineProps {
  contactId: string;
  readOnly?: boolean;
}

export function ActivityTimeline({ contactId, readOnly = false }: ActivityTimelineProps) {
  const { data: activities = [], isLoading } = useContactActivities(contactId);
  const createActivity = useCreateActivity();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ activity_type: 'note', subject: '', description: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await createActivity.mutateAsync({
      contact_id: contactId,
      user_id: user.id,
      activity_type: form.activity_type,
      subject: form.subject,
      description: form.description || null,
    });
    setForm({ activity_type: 'note', subject: '', description: '' });
    setShowForm(false);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Loading activities...</div>;
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div>
          {!showForm ? (
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Log Activity
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={form.activity_type} onValueChange={(v) => setForm({ ...form, activity_type: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subject *</Label>
                  <Input className="h-8 text-xs" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Details</Label>
                <Textarea className="text-xs min-h-[60px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={createActivity.isPending}>
                  {createActivity.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No activities logged yet.</p>
      ) : (
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
          {activities.map((activity) => (
            <div key={activity.id} className="relative flex gap-3 py-3">
              <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${ACTIVITY_COLORS[activity.activity_type] || ACTIVITY_COLORS.note}`}>
                {ACTIVITY_ICONS[activity.activity_type] || ACTIVITY_ICONS.note}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium truncate">{activity.subject}</span>
                  <span className="text-xs text-muted-foreground capitalize shrink-0">{activity.activity_type.replace('_', ' ')}</span>
                </div>
                {activity.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{activity.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(activity.activity_date), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
