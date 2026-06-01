import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DriverChatSheetProps {
  driver: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

function ChatAvatar({ avatarPath, initials }: { avatarPath: string | null; initials: string }) {
  const { url } = useSignedUrl(
    avatarPath && !avatarPath.startsWith('http') ? 'documents' : null,
    avatarPath && !avatarPath.startsWith('http') ? avatarPath : null,
  );
  const imageSrc = avatarPath?.startsWith('http') ? avatarPath : url;
  return (
    <Avatar className="h-10 w-10 border-2 border-primary/20">
      <AvatarImage src={imageSrc || undefined} />
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}

export function DriverChatSheet({ driver, open, onOpenChange }: DriverChatSheetProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const me = user?.id ?? null;
  const driverUserId: string | null = driver?.user_id ?? null;
  const canChat = Boolean(me && driverUserId);

  const queryKey = useMemo(() => ['driver-chat', me, driverUserId], [me, driverUserId]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    enabled: open && canChat,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, is_read, created_at')
        .or(
          `and(sender_id.eq.${me},receiver_id.eq.${driverUserId}),and(sender_id.eq.${driverUserId},receiver_id.eq.${me})`,
        )
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Mark incoming messages as read when sheet is open
  useEffect(() => {
    if (!open || !canChat) return;
    const unread = messages.filter((m) => m.receiver_id === me && m.sender_id === driverUserId && !m.is_read);
    if (unread.length === 0) return;
    supabase
      .from('messages')
      .update({ is_read: true })
      .in(
        'id',
        unread.map((m) => m.id),
      )
      .then(({ error }) => {
        if (error) console.error('Failed to mark messages read', error);
      });
  }, [messages, open, canChat, me, driverUserId]);

  // Realtime subscription
  useEffect(() => {
    if (!open || !canChat) return;
    const channel = supabase
      .channel(`direct-msgs-${me}-${driverUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${me}`,
        },
        (payload) => {
          const m = payload.new as Message;
          if (m.sender_id !== driverUserId) return;
          queryClient.setQueryData<Message[]>(queryKey, (prev = []) =>
            prev.some((x) => x.id === m.id) ? prev : [...prev, m],
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, canChat, me, driverUserId, queryClient, queryKey]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!me || !driverUserId) throw new Error('Missing recipient');
      const { data, error } = await supabase
        .from('messages')
        .insert({ sender_id: me, receiver_id: driverUserId, content })
        .select('id, sender_id, receiver_id, content, is_read, created_at')
        .single();
      if (error) throw error;
      return data as Message;
    },
    onSuccess: (m) => {
      queryClient.setQueryData<Message[]>(queryKey, (prev = []) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      );
      setDraft('');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to send message');
    },
  });

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  if (!driver) return null;

  const initials =
    `${(driver.first_name?.[0] ?? '').toUpperCase()}${(driver.last_name?.[0] ?? '').toUpperCase()}` || 'D';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <ChatAvatar avatarPath={driver.avatar_url ?? null} initials={initials} />
            <div className="min-w-0">
              <SheetTitle className="text-base leading-tight truncate">
                {driver.first_name} {driver.last_name}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">Direct message</p>
            </div>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {!canChat ? (
            <div className="text-sm text-muted-foreground text-center py-12 px-6">
              This driver doesn't have a linked login account yet. They'll see messages once they accept their invitation.
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">No messages yet. Say hello.</div>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === me;
              return (
                <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words',
                      mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                    )}
                  >
                    {m.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-3 bg-background">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={canChat ? 'Type a message…' : 'Messaging disabled'}
              disabled={!canChat || sendMutation.isPending}
              rows={1}
              className="min-h-[44px] max-h-32 resize-none pl-4 sm:pl-3"
            />
            <Button
              type="button"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={handleSend}
              disabled={!canChat || !draft.trim() || sendMutation.isPending}
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
