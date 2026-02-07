import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Clock, Home, CalendarDays, Wrench } from 'lucide-react';

type RequestType = 'detention' | 'home_time' | 'pto' | 'maintenance';

interface DriverRequestFormProps {
  driverId: string;
  truckId?: string;
  activeLoadId?: string;
  activeLoadNumber?: string | null;
  defaultType?: RequestType;
  onSuccess: () => void;
  onCancel: () => void;
}

const REQUEST_TYPE_OPTIONS: { value: RequestType; label: string; icon: React.ReactNode }[] = [
  { value: 'detention', label: 'Detention', icon: <Clock className="h-4 w-4" /> },
  { value: 'home_time', label: 'Home Time', icon: <Home className="h-4 w-4" /> },
  { value: 'pto', label: 'PTO', icon: <CalendarDays className="h-4 w-4" /> },
  { value: 'maintenance', label: 'Report Issue', icon: <Wrench className="h-4 w-4" /> },
];

const ISSUE_TYPES = [
  'engine', 'brakes', 'tires', 'electrical', 'lights', 'transmission',
  'cooling_system', 'exhaust', 'body_damage', 'interior', 'other',
];

export function DriverRequestForm({
  driverId,
  truckId,
  activeLoadId,
  activeLoadNumber,
  defaultType = 'detention',
  onSuccess,
  onCancel,
}: DriverRequestFormProps) {
  const [requestType, setRequestType] = useState<RequestType>(defaultType);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [issueType, setIssueType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    if (requestType === 'maintenance' && !issueType) {
      toast.error('Please select an issue type');
      return;
    }

    if (requestType === 'maintenance' && !truckId) {
      toast.error('No truck assigned — cannot report a maintenance issue');
      return;
    }

    setIsSubmitting(true);
    try {
      const insertData: Record<string, unknown> = {
        driver_id: driverId,
        request_type: requestType,
        subject: subject.trim(),
        description: description.trim() || null,
        priority: requestType === 'maintenance' ? priority : 'medium',
      };

      if (requestType === 'detention' && activeLoadId) {
        insertData.load_id = activeLoadId;
      }

      if (requestType === 'maintenance' && truckId) {
        insertData.truck_id = truckId;
        insertData.subject = `${issueType.replace(/_/g, ' ')} — ${subject.trim()}`;
      }

      const { error } = await supabase.from('driver_requests').insert(insertData as any);
      if (error) throw error;

      toast.success('Request submitted');
      onSuccess();
    } catch (err) {
      console.error('Error submitting request:', err);
      toast.error('Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Type Selector */}
      <div className="grid grid-cols-2 gap-2">
        {REQUEST_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRequestType(opt.value)}
            className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium transition-colors ${
              requestType === opt.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* Context info */}
      {requestType === 'detention' && activeLoadId && (
        <div className="text-sm bg-muted/50 rounded-md p-2">
          Linked to load: <span className="font-medium">{activeLoadNumber || activeLoadId}</span>
        </div>
      )}

      {requestType === 'detention' && !activeLoadId && (
        <div className="text-sm bg-warning/10 border border-warning/30 rounded-md p-2 text-warning">
          No active load to link. The request will be submitted without a load reference.
        </div>
      )}

      {/* Issue Type (maintenance only) */}
      {requestType === 'maintenance' && (
        <div className="space-y-1.5">
          <Label>Issue Type</Label>
          <Select value={issueType} onValueChange={setIssueType}>
            <SelectTrigger><SelectValue placeholder="Select issue type" /></SelectTrigger>
            <SelectContent>
              {ISSUE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Priority (maintenance only) */}
      {requestType === 'maintenance' && (
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical — Safety Risk</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Subject */}
      <div className="space-y-1.5">
        <Label>Subject</Label>
        <Input
          placeholder={
            requestType === 'detention' ? 'e.g. Waiting at shipper over 2 hrs'
            : requestType === 'home_time' ? 'e.g. Home time Feb 14-16'
            : requestType === 'pto' ? 'e.g. PTO Mar 1-3'
            : 'Brief description of issue'
          }
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label>Details (optional)</Label>
        <Textarea
          placeholder="Provide any additional details..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Submit Request
        </Button>
      </div>
    </div>
  );
}
