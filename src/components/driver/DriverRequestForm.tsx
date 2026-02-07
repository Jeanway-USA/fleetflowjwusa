import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Clock, Home, CalendarDays, Wrench, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

const needsDates = (type: RequestType) => type === 'home_time' || type === 'pto';

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
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }

    if (needsDates(requestType) && !startDate) {
      toast.error('Please select a start date');
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
      let finalSubject = subject.trim();
      
      if (requestType === 'maintenance' && truckId) {
        finalSubject = `${issueType.replace(/_/g, ' ')} — ${subject.trim()}`;
      }

      const { error } = await supabase.from('driver_requests').insert({
        driver_id: driverId,
        request_type: requestType,
        subject: finalSubject,
        description: description.trim() || null,
        priority: requestType === 'maintenance' ? priority : 'medium',
        load_id: requestType === 'detention' && activeLoadId ? activeLoadId : null,
        truck_id: requestType === 'maintenance' && truckId ? truckId : null,
        start_date: startDate ? format(startDate, 'yyyy-MM-dd') : null,
        end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
      });

      if (error) throw error;

      toast.success('Request submitted');
      onSuccess();
    } catch (err: any) {
      console.error('Error submitting request:', err);
      toast.error(`Failed to submit: ${err?.message || 'Unknown error'}`);
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
            : requestType === 'home_time' ? 'e.g. Home time request'
            : requestType === 'pto' ? 'e.g. PTO request'
            : 'Brief description of issue'
          }
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* Date Pickers (home_time & pto only) */}
      {needsDates(requestType) && (
        <div className="grid grid-cols-2 gap-3">
          <DatePickerField
            label="Start Date"
            date={startDate}
            onSelect={setStartDate}
            placeholder="Select start"
          />
          <DatePickerField
            label="End Date"
            date={endDate}
            onSelect={setEndDate}
            placeholder="Select end"
            minDate={startDate}
          />
        </div>
      )}

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

function DatePickerField({
  label,
  date,
  onSelect,
  placeholder,
  minDate,
}: {
  label: string;
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  placeholder: string;
  minDate?: Date;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !date && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? format(date, 'MMM d, yyyy') : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onSelect}
            disabled={(d) => d < today || (minDate ? d < minDate : false)}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
