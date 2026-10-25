import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { cn } from '@/lib/utils';
import { BLOCK_REASONS } from '@/lib/shop/templates';
import { formatMinutes, money } from '@/lib/shop/board';
import { useShopActions, type ShopJobDetail } from '@/hooks/useShop';

/** Stop the job and say why, so the board shows what it is waiting on. */
export function BlockDialog({ detail, open, onOpenChange, touch }: { detail: ShopJobDetail; open: boolean; onOpenChange: (v: boolean) => void; touch?: boolean }) {
  const actions = useShopActions();
  const [reason, setReason] = useState('');
  const [extra, setExtra] = useState('');
  useEffect(() => {
    if (open) {
      setReason('');
      setExtra('');
    }
  }, [open]);

  const submit = () => {
    const text = [reason, extra.trim()].filter(Boolean).join(': ');
    if (!text) return toast.error('Pick a reason, or write one.');
    actions.block.mutate({ id: detail.job.id, reason: text }, { onSuccess: () => { toast.success('Job moved to Waiting.'); onOpenChange(false); }, onError: (e: any) => toast.error(e.message) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-condensed text-2xl">What is it waiting on?</DialogTitle>
          <DialogDescription>The clock stops and the job moves to Waiting on the shop board.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {BLOCK_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className={cn('rounded-lg border px-4 text-left font-medium transition-colors', touch ? 'min-h-[60px] text-lg' : 'min-h-[48px]', reason === r ? 'border-warning bg-warning/10 ring-1 ring-warning' : 'hover:bg-accent')}>
              {r}
            </button>
          ))}
        </div>
        <Textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} placeholder="Which part, or anything else (optional)" className={touch ? 'text-lg' : ''} />
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <LoadingButton loading={actions.block.isPending} disabled={actions.block.isPending} onClick={submit} className="h-12 flex-[2] bg-warning text-white hover:bg-warning">Move to Waiting</LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Close the job out. Shows what it cost in parts and time, and asks only for what the shop cannot know. */
export function FinishDialog({ detail, open, onOpenChange, onDone, touch }: { detail: ShopJobDetail; open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void; touch?: boolean }) {
  const actions = useShopActions();
  const [summary, setSummary] = useState('');
  const [outside, setOutside] = useState('');
  const { job } = detail;
  const open_tasks = job.tasksTotal - job.tasksDone;
  useEffect(() => {
    if (open) {
      setSummary('');
      setOutside('');
    }
  }, [open]);

  const outsideCost = Number(outside.replace(/[^0-9.]/g, '')) || 0;

  const submit = () => {
    actions.finish.mutate(
      { id: job.id, outsideCost, partsCost: job.partsCost, summary: summary.trim() },
      { onSuccess: () => { toast.success(`Unit ${job.unit} is done.`); onOpenChange(false); onDone(); }, onError: (e: any) => toast.error(e.message) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !actions.finish.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className="font-condensed text-2xl">Finish unit {job.unit}?</DialogTitle>
          <DialogDescription>This closes the job and updates the service schedule.</DialogDescription>
        </DialogHeader>

        {open_tasks > 0 && (
          <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{open_tasks} task{open_tasks === 1 ? ' is' : 's are'} not ticked yet. You can still finish.</p>
        )}

        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">Time</dt><dd className="font-condensed text-2xl font-bold">{formatMinutes(job.laborMinutes)}</dd></div>
          <div className="rounded-lg bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">Parts</dt><dd className="font-condensed text-2xl font-bold">{money(job.partsCost)}</dd></div>
          <div className="rounded-lg bg-muted/60 p-3"><dt className="text-xs text-muted-foreground">Tasks</dt><dd className="font-condensed text-2xl font-bold">{job.tasksDone}/{job.tasksTotal}</dd></div>
        </dl>

        <label className="block space-y-1.5 text-sm font-medium">
          Outside costs <span className="font-normal text-muted-foreground">(a vendor invoice, a tow, anything not from the shelf)</span>
          <Input inputMode="decimal" value={outside} onChange={(e) => setOutside(e.target.value)} placeholder="0.00" className={touch ? 'h-14 text-lg' : 'h-11'} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium">
          What was done <span className="font-normal text-muted-foreground">(optional)</span>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="A line for the truck's service history" className={touch ? 'text-lg' : ''} />
        </label>
        <p className="text-sm text-muted-foreground">Total cost recorded: <strong className="text-foreground">{money(job.partsCost + outsideCost)}</strong></p>

        <div className="flex gap-2">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)} disabled={actions.finish.isPending}>Not yet</Button>
          <LoadingButton loading={actions.finish.isPending} disabled={actions.finish.isPending} onClick={submit} className="h-12 flex-[2] bg-success text-white hover:bg-success">
            <CheckCheck className="mr-2 h-5 w-5" />Finish the job
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
