import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CheckCircle, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { PreTripForm } from './PreTripForm';
import { PostTripForm } from './PostTripForm';

interface DVIRButtonsProps {
  driverId: string;
  truckId: string | undefined;
  hasPreTrip: boolean;
  hasPostTrip: boolean;
}

export function DVIRButtons({ driverId, truckId, hasPreTrip, hasPostTrip }: DVIRButtonsProps) {
  const [preOpen, setPreOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);

  return (
    <>
      {/* Pre-Trip Button */}
      <Dialog open={preOpen} onOpenChange={setPreOpen}>
        <DialogTrigger asChild>
          <Button 
            variant={hasPreTrip ? 'secondary' : 'default'}
            className="h-16 flex-col gap-1"
            disabled={!truckId}
          >
            {hasPreTrip ? (
              <CheckCircle className="h-5 w-5 text-success" />
            ) : (
              <ClipboardCheck className="h-5 w-5" />
            )}
            <span className="text-xs">Pre-Trip</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pre-Trip Inspection (DVIR)</DialogTitle>
          </DialogHeader>
          <PreTripForm 
            driverId={driverId} 
            truckId={truckId!}
            onComplete={() => setPreOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Post-Trip Button */}
      <Dialog open={postOpen} onOpenChange={setPostOpen}>
        <DialogTrigger asChild>
          <Button 
            variant={hasPostTrip ? 'secondary' : 'outline'}
            className="h-16 flex-col gap-1"
            disabled={!truckId}
          >
            {hasPostTrip ? (
              <CheckCircle className="h-5 w-5 text-success" />
            ) : (
              <ClipboardCheck className="h-5 w-5" />
            )}
            <span className="text-xs">Post-Trip</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post-Trip Inspection (DVIR)</DialogTitle>
          </DialogHeader>
          <PostTripForm 
            driverId={driverId} 
            truckId={truckId!}
            onComplete={() => setPostOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
