import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { Camera, CheckCircle2, ListChecks, MessageSquare, PackageMinus, Pause, Play, UserRound, AlertCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useProviderSignedUrl } from '@/hooks/useStorageProvider';
import { useShopActions, type ShopEvent, type ShopJobDetail } from '@/hooks/useShop';
import { ShopEmpty } from '@/components/shop/shared';

const ICON: Record<string, typeof MessageSquare> = {
  note: MessageSquare,
  photo: Camera,
  status: CheckCircle2,
  assign: UserRound,
  blocked: AlertCircle,
  part: PackageMinus,
  task: ListChecks,
  timer: Play,
};

function Photo({ path }: { path: string }) {
  const { url } = useProviderSignedUrl('documents', path);
  if (!url) return <div className="h-28 w-40 animate-pulse rounded-lg bg-muted" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Job photo" className="max-h-44 rounded-lg border object-cover" loading="lazy" />
    </a>
  );
}

function Row({ e }: { e: ShopEvent }) {
  const Icon = e.kind === 'timer' && e.body?.startsWith('Paused') ? Pause : ICON[e.kind] ?? MessageSquare;
  return (
    <li className="flex gap-3">
      <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', e.kind === 'blocked' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground')}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 pb-1">
        {e.body && <p className="text-sm">{e.body}</p>}
        {e.photo_path && <div className="mt-1.5"><Photo path={e.photo_path} /></div>}
        <p className="mt-0.5 text-xs text-muted-foreground">{[e.user_name, formatDistanceToNow(new Date(e.created_at), { addSuffix: true })].filter(Boolean).join(' · ')}</p>
      </div>
    </li>
  );
}

/** Notes, photos and everything that happened on the job, newest first. Anyone can add a note or snap a photo. */
export function Activity({ detail, touch }: { detail: ShopJobDetail; touch?: boolean }) {
  const actions = useShopActions();
  const [text, setText] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const locked = detail.job.status === 'completed';

  const send = () => {
    const body = text.trim();
    if (!body) return;
    actions.note.mutate({ id: detail.job.id, text: body }, { onSuccess: () => setText(''), onError: (e: any) => toast.error(e.message) });
  };

  const upload = (f: File | undefined) => {
    if (!f) return;
    actions.photo.mutate({ id: detail.job.id, file: f }, { onSuccess: () => toast.success('Photo added.'), onError: (e: any) => toast.error(e.message) });
    if (file.current) file.current.value = '';
  };

  return (
    <div className="space-y-4">
      {!locked && (
        <div className="space-y-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={touch ? 3 : 2} placeholder="Write a note: what you found, what you did, what is left" className={touch ? 'text-lg' : ''} />
          <div className="flex gap-2">
            <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
            <Button type="button" variant="outline" className={cn('flex-1', touch ? 'h-14 text-base' : 'h-11')} disabled={actions.photo.isPending} onClick={() => file.current?.click()}>
              <Camera className="mr-2 h-5 w-5" />{actions.photo.isPending ? 'Uploading…' : 'Take a photo'}
            </Button>
            <Button type="button" className={cn('flex-1', touch ? 'h-14 text-base' : 'h-11')} disabled={!text.trim() || actions.note.isPending} onClick={send}>Add note</Button>
          </div>
        </div>
      )}
      {detail.events.length === 0 ? (
        <ShopEmpty icon={MessageSquare} title="Nothing logged yet">Notes, photos and each step show up here.</ShopEmpty>
      ) : (
        <ul className="space-y-3">{detail.events.map((e) => <Row key={e.id} e={e} />)}</ul>
      )}
    </div>
  );
}
