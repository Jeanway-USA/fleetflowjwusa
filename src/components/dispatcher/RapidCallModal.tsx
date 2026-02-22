import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Phone, PhoneOff, AlertTriangle, MapPin, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

interface RapidCallLoad {
  id: string;
  landstar_load_id: string | null;
  origin: string;
  destination: string;
  status: string;
  rate: number | null;
  booked_miles: number | null;
  agency_code: string | null;
  pickup_date: string | null;
}

interface RapidCallModalProps {
  load: RapidCallLoad | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RapidCallModal({ load, open, onOpenChange }: RapidCallModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [logging, setLogging] = useState<string | null>(null);

  // Find CRM contact for this load's agency
  const { data: contact } = useQuery({
    queryKey: ['rapid-call-contact', load?.agency_code],
    queryFn: async () => {
      if (!load?.agency_code) return null;
      const { data } = await supabase
        .from('crm_contacts')
        .select('id, company_name, contact_name, phone')
        .or(`agent_code.eq.${load.agency_code},company_name.ilike.%${load.agency_code}%`)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!load?.agency_code && open,
  });

  // Recent activities for this contact
  const { data: recentActivities } = useQuery({
    queryKey: ['rapid-call-activities', contact?.id],
    queryFn: async () => {
      if (!contact?.id) return [];
      const { data } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('contact_id', contact.id)
        .order('activity_date', { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!contact?.id && open,
  });

  const logActivity = useMutation({
    mutationFn: async ({ type, subject, description }: { type: string; subject: string; description: string }) => {
      if (!contact?.id || !user?.id) {
        toast.error('No CRM contact found for this agent');
        return;
      }

      const { error } = await supabase.from('crm_activities').insert({
        contact_id: contact.id,
        user_id: user.id,
        activity_type: type,
        subject,
        description: `${description} | Load: ${load?.landstar_load_id || load?.id?.slice(0, 8)}`,
      });
      if (error) throw error;

      // If flagging bait & switch, also tag the contact
      if (type === 'flag') {
        const { data: currentContact } = await supabase
          .from('crm_contacts')
          .select('tags')
          .eq('id', contact.id)
          .single();

        const existingTags = currentContact?.tags || [];
        if (!existingTags.includes('bait_switch')) {
          await supabase
            .from('crm_contacts')
            .update({ tags: [...existingTags, 'bait_switch'] })
            .eq('id', contact.id);
        }
      }
    },
    onSuccess: () => {
      toast.success('Activity logged');
      queryClient.invalidateQueries({ queryKey: ['rapid-call-activities'] });
      queryClient.invalidateQueries({ queryKey: ['agent-trust-score'] });
      setLogging(null);
    },
    onError: () => {
      toast.error('Failed to log activity');
      setLogging(null);
    },
  });

  const handleAction = (action: string) => {
    setLogging(action);
    switch (action) {
      case 'voicemail':
        logActivity.mutate({ type: 'call', subject: 'Left Voicemail', description: 'Called agent, left voicemail.' });
        break;
      case 'load_gone':
        logActivity.mutate({ type: 'note', subject: 'Load Gone', description: 'Load no longer available when called.' });
        break;
      case 'bait_switch':
        logActivity.mutate({ type: 'flag', subject: '🚨 Bait & Switch', description: 'Load details did not match listing. Flagged as bait & switch.' });
        break;
    }
  };

  if (!load) return null;

  const rpm = load.rate && load.booked_miles && load.booked_miles > 0
    ? (load.rate / load.booked_miles).toFixed(2)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Rapid Call Workflow
          </DialogTitle>
        </DialogHeader>

        {/* Load Summary */}
        <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{load.landstar_load_id || load.id.slice(0, 8)}</span>
            {rpm && <Badge variant="outline" className="text-xs">${rpm}/mi</Badge>}
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{load.origin}</span>
            <span className="mx-1">→</span>
            <span className="truncate">{load.destination}</span>
          </div>
          {load.agency_code && (
            <p className="text-xs text-muted-foreground">Agent: {load.agency_code}</p>
          )}
          {contact && (
            <div className="text-xs text-muted-foreground">
              Contact: {contact.contact_name || contact.company_name}
              {contact.phone && <> · {contact.phone}</>}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 gap-2">
          <Button
            variant="outline"
            className="justify-start gap-2 h-10"
            onClick={() => handleAction('voicemail')}
            disabled={logging !== null}
          >
            <Phone className="h-4 w-4 text-primary" />
            📞 Log Voicemail
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 h-10"
            onClick={() => handleAction('load_gone')}
            disabled={logging !== null}
          >
            <PhoneOff className="h-4 w-4 text-muted-foreground" />
            ❌ Load Gone
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2 h-10 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => handleAction('bait_switch')}
            disabled={logging !== null}
          >
            <AlertTriangle className="h-4 w-4" />
            🚨 Flag Bait & Switch
          </Button>
        </div>

        {/* Recent Activity Timeline */}
        {recentActivities && recentActivities.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Recent Activity
              </p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {recentActivities.map((a) => (
                  <div key={a.id} className="text-xs p-1.5 rounded bg-muted/30">
                    <span className="font-medium">{a.subject}</span>
                    <span className="text-muted-foreground ml-1">
                      · {formatDistanceToNow(new Date(a.activity_date), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
