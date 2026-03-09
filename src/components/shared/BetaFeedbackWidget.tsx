import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const feedbackSchema = z.object({
  feedback_type: z.enum(['bug_report', 'feature_request']),
  description: z
    .string()
    .trim()
    .min(10, 'Please provide at least 10 characters')
    .max(2000, 'Description must be under 2000 characters'),
});

type FeedbackForm = z.infer<typeof feedbackSchema>;

export function BetaFeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { user, orgId } = useAuth();

  const form = useForm<FeedbackForm>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      feedback_type: 'feature_request',
      description: '',
    },
  });

  const onSubmit = async (values: FeedbackForm) => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('user_feedback' as any).insert({
        user_id: user.id,
        org_id: orgId || null,
        feedback_type: values.feedback_type,
        description: values.description,
        page_url: window.location.pathname,
      } as any);

      if (error) throw error;

      toast({
        title: 'Feedback sent!',
        description: 'Thank you for helping improve the beta.',
      });
      form.reset();
      setOpen(false);
    } catch (err: any) {
      toast({
        title: 'Failed to send feedback',
        description: err.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <Button
        size="icon"
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
      >
        <MessageSquare className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Beta Feedback</DialogTitle>
            <DialogDescription>
              Help us improve — report a bug or suggest a feature.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="feedback_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="bug_report" id="bug" />
                          <Label htmlFor="bug">Bug Report</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="feature_request" id="feature" />
                          <Label htmlFor="feature">Feature Request</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the bug or feature…"
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit Feedback'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
