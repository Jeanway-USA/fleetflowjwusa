import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ShieldAlert, Play } from 'lucide-react';
import { toast } from 'sonner';

export function BetaLifecycleCard() {
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const queryClient = useQueryClient();

  const endBeta = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('super_admin_end_beta' as any);
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-dashboard'] });
      toast.success(`Open Beta ended. ${count} organization${count !== 1 ? 's' : ''} deactivated.`);
      setEndDialogOpen(false);
      setConfirmText('');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to end beta'),
  });

  const resumeBeta = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('super_admin_resume_beta' as any);
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-dashboard'] });
      toast.success(`Open Beta resumed. ${count} organization${count !== 1 ? 's' : ''} reactivated.`);
      setResumeDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to resume beta'),
  });

  return (
    <>
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Global Beta Lifecycle
          </CardTitle>
          <CardDescription>
            Manage the Open Beta phase for all organizations. Ending the beta will deactivate every org on the Open Beta tier.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="destructive"
            className="font-semibold"
            onClick={() => setEndDialogOpen(true)}
          >
            End Open Beta Phase
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            onClick={() => setResumeDialogOpen(true)}
          >
            <Play className="h-4 w-4 mr-1" />
            Resume Open Beta
          </Button>
        </CardContent>
      </Card>

      {/* End Beta — strict confirmation */}
      <AlertDialog open={endDialogOpen} onOpenChange={(open) => { setEndDialogOpen(open); if (!open) setConfirmText(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">End Open Beta Phase</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block font-semibold text-foreground">
                Warning: This will instantly deactivate all organizations currently on the Open Beta tier. Are you sure?
              </span>
              <span className="block text-sm">
                Type <span className="font-mono font-bold">END BETA</span> below to confirm.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type END BETA"
            className="font-mono"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== 'END BETA' || endBeta.isPending}
              onClick={(e) => { e.preventDefault(); endBeta.mutate(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {endBeta.isPending ? 'Processing…' : 'Confirm — End Beta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resume Beta — simple confirmation */}
      <AlertDialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume Open Beta</AlertDialogTitle>
            <AlertDialogDescription>
              This will reactivate all organizations on the Open Beta tier that were previously deactivated. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resumeBeta.isPending}
              onClick={(e) => { e.preventDefault(); resumeBeta.mutate(); }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {resumeBeta.isPending ? 'Processing…' : 'Resume Beta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
