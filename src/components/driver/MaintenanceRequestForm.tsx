import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

interface MaintenanceRequestFormProps {
  driverId: string;
  truckId: string;
  onComplete: () => void;
}

const ISSUE_TYPES = [
  { value: 'tire', label: 'Tire Issue' },
  { value: 'brake', label: 'Brake Problem' },
  { value: 'engine', label: 'Engine Issue' },
  { value: 'electrical', label: 'Electrical Problem' },
  { value: 'lights', label: 'Lights Not Working' },
  { value: 'trailer', label: 'Trailer Issue' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low - Can wait for scheduled maintenance' },
  { value: 'medium', label: 'Medium - Should be addressed soon' },
  { value: 'high', label: 'High - Needs attention quickly' },
  { value: 'critical', label: 'Critical - Safety concern, needs immediate attention' },
];

export function MaintenanceRequestForm({ driverId, truckId, onComplete }: MaintenanceRequestFormProps) {
  const queryClient = useQueryClient();
  const [issueType, setIssueType] = useState('');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('maintenance_requests').insert({
        driver_id: driverId,
        truck_id: truckId,
        issue_type: issueType,
        priority,
        description,
        status: 'submitted',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-maintenance-requests'] });
      toast.success('Maintenance request submitted successfully');
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to submit request: ' + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueType || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    submitMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Issue Type */}
      <div className="space-y-2">
        <Label htmlFor="issueType">Issue Type *</Label>
        <Select value={issueType} onValueChange={setIssueType}>
          <SelectTrigger>
            <SelectValue placeholder="Select issue type" />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <Label htmlFor="priority">Priority</Label>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          placeholder="Describe the issue in detail. Include location, symptoms, when it started..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          required
        />
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={submitMutation.isPending}
      >
        {submitMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Submit Request
          </>
        )}
      </Button>
    </form>
  );
}
