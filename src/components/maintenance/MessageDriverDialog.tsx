import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { useActiveDrivers, useMessageDriver } from '@/hooks/useMaintenanceData';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_LEN = 1000;

export function MessageDriverDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: drivers = [], isLoading } = useActiveDrivers();
  const send = useMessageDriver();

  const [driverId, setDriverId] = useState('');
  const [body, setBody] = useState('');

  const reset = () => {
    setDriverId('');
    setBody('');
  };

  const handleSubmit = async () => {
    if (!driverId || !body.trim()) return;
    try {
      await send.mutateAsync({ driver_id: driverId, body: body.trim() });
      const driver = drivers.find((d) => d.id === driverId);
      toast({
        title: 'Message sent',
        description: driver
          ? `${driver.first_name} ${driver.last_name} will see it in their communications log.`
          : 'Posted to the driver communications log.',
      });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Could not send message',
        description: err?.message ?? 'Try again',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message a Driver</DialogTitle>
          <DialogDescription>
            Posts to the existing communications thread or starts a new one if none is open.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="driver">Driver</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger id="driver">
                <SelectValue placeholder={isLoading ? 'Loading drivers…' : 'Select a driver'} />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.first_name} {d.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              rows={5}
              maxLength={MAX_LEN}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message…"
            />
            <p className="text-xs text-muted-foreground text-right">
              {body.length}/{MAX_LEN}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoadingButton
            loading={send.isPending}
            disabled={!driverId || !body.trim()}
            onClick={handleSubmit}
          >
            Send message
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
