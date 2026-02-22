import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

export function ResetDemoDialog() {
  const [confirmText, setConfirmText] = useState('');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const resetDemo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('super_admin_reset_demo' as any);
      if (error) throw error;
    },
  });

  const handleReset = () => {
    toast.promise(resetDemo.mutateAsync(), {
      loading: 'Resetting demo environment…',
      success: () => {
        queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
        queryClient.invalidateQueries({ queryKey: ['super-admin-dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['super-admin-usage-metrics'] });
        setConfirmText('');
        setOpen(false);
        return 'Demo environment reset successfully';
      },
      error: (err) => err.message || 'Failed to reset demo',
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmText(''); }}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Reset Demo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Public Demo Environment</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete all data for the demo organization and re-seed it with fresh sample data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <label className="text-sm font-medium">Type <span className="font-mono font-bold">RESET</span> to confirm</label>
          <Input className="mt-1.5" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={confirmText !== 'RESET' || resetDemo.isPending}
            onClick={(e) => { e.preventDefault(); handleReset(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {resetDemo.isPending ? 'Resetting…' : 'Reset Demo'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
