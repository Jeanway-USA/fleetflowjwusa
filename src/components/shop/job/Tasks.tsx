import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useShopActions, type ShopJobDetail } from '@/hooks/useShop';
import { ShopEmpty } from '@/components/shop/shared';

/** The job's checklist. On the tablet each row is a big target you can hit with a glove. */
export function Tasks({ detail, touch }: { detail: ShopJobDetail; touch?: boolean }) {
  const actions = useShopActions();
  const [text, setText] = useState('');
  const tasks = detail.tasks.filter((t) => !t.hidden_at);
  const locked = detail.job.status === 'completed';

  const toggle = (t: (typeof tasks)[number]) =>
    actions.toggleTask.mutate({ workOrderId: detail.job.id, taskId: t.id, done: !t.is_done, label: t.label }, { onError: (e: any) => toast.error(e.message) });

  const add = () => {
    const label = text.trim();
    if (!label) return;
    actions.addTask.mutate(
      { id: detail.job.id, label, sortOrder: (tasks[tasks.length - 1]?.sort_order ?? 0) + 1 },
      { onSuccess: () => setText(''), onError: (e: any) => toast.error(e.message) },
    );
  };

  return (
    <div className="space-y-3">
      {tasks.length === 0 && <ShopEmpty title="No tasks yet">Add the steps for this job. Ticking them all moves the job to Ready to close.</ShopEmpty>}
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id} className={cn('flex items-stretch overflow-hidden rounded-xl border bg-card', t.is_done && 'bg-emerald-500/5')}>
            <button
              type="button"
              disabled={locked || actions.toggleTask.isPending}
              onClick={() => toggle(t)}
              className={cn('flex flex-1 items-center gap-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-60', touch ? 'min-h-[68px] px-4' : 'min-h-[48px] px-3')}
              aria-pressed={t.is_done}
            >
              <span className={cn('flex shrink-0 items-center justify-center rounded-md border-2 transition-colors', touch ? 'h-9 w-9' : 'h-6 w-6', t.is_done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/50')}>
                {t.is_done && <Check className={touch ? 'h-6 w-6' : 'h-4 w-4'} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block', touch ? 'text-lg' : 'text-sm', t.is_done && 'text-muted-foreground line-through')}>{t.label}</span>
                {t.is_done && t.done_by_name && <span className="block text-xs text-muted-foreground">{t.done_by_name}</span>}
              </span>
            </button>
            {!locked && !t.is_done && (
              <button type="button" aria-label={`Remove ${t.label}`} className="flex w-11 shrink-0 items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => actions.hideTask.mutate({ taskId: t.id }, { onError: (e: any) => toast.error(e.message) })}>
                <X className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step" className={touch ? 'h-14 text-lg' : 'h-11'} />
          <Button type="submit" variant="outline" className={touch ? 'h-14 px-5 text-base' : 'h-11'} disabled={actions.addTask.isPending}>
            <Plus className="mr-1.5 h-4 w-4" />Add
          </Button>
        </form>
      )}
    </div>
  );
}
