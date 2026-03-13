import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Rocket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface WelcomeBetaModalProps {
  open: boolean;
  userId: string;
  onStartTour: () => void;
  onClose: () => void;
}

export function WelcomeBetaModal({ open, userId, onStartTour, onClose }: WelcomeBetaModalProps) {
  const markCompleted = async () => {
    await supabase
      .from('profiles')
      .update({ has_completed_onboarding_tour: true } as any)
      .eq('user_id', userId);
  };

  const handleStartTour = async () => {
    await markCompleted();
    onClose();
    // Small delay so modal closes before tour starts
    setTimeout(onStartTour, 300);
  };

  const handleSkip = async () => {
    await markCompleted();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border border-amber-500/30 flex items-center justify-center">
              <Sparkles className="h-7 w-7 text-amber-500" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Welcome to the Beta!</DialogTitle>
        </DialogHeader>

        <p className="text-center text-sm text-muted-foreground leading-relaxed">
          You're one of the first BCOs to access FleetFlow. Let us give you a quick
          walkthrough of the tools built for your operation.
        </p>

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={handleStartTour} className="gap-2 gradient-gold text-primary-foreground">
            <Rocket className="h-4 w-4" />
            Start Quick Tour
          </Button>
          <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
            Skip
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
