import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  MessageSquare,
  Send,
  Wrench,
  Loader2,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMaintenanceThread,
  useSendMaintenanceMessage,
  type ThreadMessage,
  type ThreadSenderRole,
} from '@/hooks/useMaintenanceThread';
import { RECOMMENDATION_PRESETS } from '@/lib/maintenanceRecommendations';

interface MaintenanceThreadProps {
  requestId: string;
  viewerRole: 'driver' | 'maintenance';
  showRecommendations?: boolean;
}

const ROLE_LABEL: Record<ThreadSenderRole, string> = {
  driver: 'Driver',
  maintenance: 'Maintenance',
  owner: 'Owner',
  safety: 'Safety',
  dispatcher: 'Dispatcher',
  payroll_admin: 'Payroll',
};

function MessageBubble({
  msg,
  viewerRole,
}: {
  msg: ThreadMessage;
  viewerRole: 'driver' | 'maintenance';
}) {
  const isDriverMsg = msg.sender_role === 'driver';
  const isOwnSide =
    (viewerRole === 'driver' && isDriverMsg) ||
    (viewerRole === 'maintenance' && !isDriverMsg);
  const isRecommendation = msg.message_type === 'recommendation';

  if (isRecommendation) {
    return (
      <div className="w-full">
        <div className="rounded-lg border border-primary/30 bg-primary/5 border-l-4 border-l-primary px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <Wrench className="h-3.5 w-3.5 text-primary" />
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide border-primary/40 text-primary bg-primary/10"
            >
              Recommendation
            </Badge>
            {msg.recommendation?.title && (
              <span className="text-sm font-semibold text-foreground">
                {msg.recommendation.title}
              </span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {ROLE_LABEL[msg.sender_role]} · {msg.sender_name || 'Staff'}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-foreground/90">{msg.body}</p>
          <time
            className="block text-[11px] text-muted-foreground mt-1.5"
            title={format(new Date(msg.created_at), 'PPpp')}
          >
            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
          </time>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex w-full', isOwnSide ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] space-y-1', isOwnSide && 'items-end text-right')}>
        <div className={cn('flex items-center gap-1.5 text-[11px]', isOwnSide && 'justify-end')}>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] uppercase tracking-wide',
              isDriverMsg
                ? 'border-primary/40 text-primary bg-primary/5'
                : 'border-border text-muted-foreground'
            )}
          >
            {ROLE_LABEL[msg.sender_role]}
          </Badge>
          <span className="text-muted-foreground">{msg.sender_name || ROLE_LABEL[msg.sender_role]}</span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
            isOwnSide
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-foreground rounded-tl-sm'
          )}
        >
          {msg.body}
        </div>
        <time
          className="block text-[11px] text-muted-foreground"
          title={format(new Date(msg.created_at), 'PPpp')}
        >
          {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
        </time>
      </div>
    </div>
  );
}

export function MaintenanceThread({
  requestId,
  viewerRole,
  showRecommendations = false,
}: MaintenanceThreadProps) {
  const { user, roles, simulatedRole } = useAuth();
  const { data: messages, isLoading } = useMaintenanceThread(requestId);
  const send = useSendMaintenanceMessage();

  const [body, setBody] = useState('');
  const [activeRecommendation, setActiveRecommendation] = useState<{
    title: string;
    category: string;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Resolve sender role + name from auth context
  const senderRole: ThreadSenderRole = useMemo(() => {
    if (viewerRole === 'driver') return 'driver';
    const effective = simulatedRole || roles[0];
    if (
      effective === 'maintenance' ||
      effective === 'owner' ||
      effective === 'safety' ||
      effective === 'dispatcher' ||
      effective === 'payroll_admin'
    ) {
      return effective;
    }
    return 'maintenance';
  }, [viewerRole, simulatedRole, roles]);

  const senderName = useMemo(() => {
    const meta = (user?.user_metadata || {}) as Record<string, any>;
    const first = meta.first_name || '';
    const last = meta.last_name || '';
    const full = `${first} ${last}`.trim();
    return full || user?.email?.split('@')[0] || null;
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    send.mutate(
      {
        request_id: requestId,
        body: trimmed,
        sender_role: senderRole,
        sender_name: senderName,
        message_type: activeRecommendation ? 'recommendation' : 'chat',
        recommendation: activeRecommendation,
      },
      {
        onSuccess: () => {
          setBody('');
          setActiveRecommendation(null);
        },
        onError: (e: any) =>
          toast.error('Failed to send: ' + (e?.message ?? 'Unknown error')),
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const pickPreset = (preset: (typeof RECOMMENDATION_PRESETS)[number]) => {
    setBody(preset.template);
    setActiveRecommendation({ title: preset.title, category: preset.category });
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">Driver Communications Log</h4>
        {messages && messages.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {messages.length}
          </Badge>
        )}
      </div>

      <div
        ref={scrollRef}
        className="max-h-80 overflow-y-auto p-3 space-y-3 bg-background"
      >
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-2/3 ml-auto" />
          </>
        ) : !messages || messages.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-50" />
            Start the conversation. Messages are visible to the driver and maintenance team.
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} msg={m} viewerRole={viewerRole} />
          ))
        )}
      </div>

      <div className="border-t p-2.5 space-y-2 bg-muted/20">
        {activeRecommendation && (
          <div className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-primary/10 border border-primary/30">
            <Sparkles className="h-3 w-3 text-primary" />
            <span className="font-medium text-primary">
              Recommendation: {activeRecommendation.title}
            </span>
            <button
              type="button"
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => setActiveRecommendation(null)}
            >
              Clear
            </button>
          </div>
        )}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            viewerRole === 'driver'
              ? 'Reply to the maintenance team…'
              : 'Type a message or pick a recommendation…'
          }
          rows={2}
          className="resize-none text-sm"
          disabled={send.isPending}
        />
        <div className="flex items-center gap-2">
          {showRecommendations && viewerRole !== 'driver' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-1.5">
                  <Wrench className="h-3.5 w-3.5" />
                  Recommend OTR Service
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-1">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 py-1.5">
                  Quick recommendations
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {RECOMMENDATION_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPreset(p)}
                      className="w-full text-left px-2 py-2 rounded hover:bg-accent transition-colors"
                    >
                      <div className="text-sm font-medium">{p.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {p.template}
                      </div>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleSend}
            disabled={send.isPending || !body.trim()}
            className="ml-auto gap-1.5"
          >
            {send.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {activeRecommendation ? 'Post Recommendation' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
