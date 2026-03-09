import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MessageSquare, Camera, Loader2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
  include_screenshot: z.boolean(),
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
      include_screenshot: true,
    },
  });

  const captureScreenshot = async (): Promise<string | null> => {
    try {
      // Dynamically import to keep initial bundle small
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: 0.75, // Reduce size for faster upload
      });

      return await new Promise<string | null>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (!blob) { resolve(null); return; }

          const fileName = `${user!.id}/feedback-${Date.now()}.png`;
          const { data, error } = await supabase.storage
            .from('beta_feedback')
            .upload(fileName, blob, { contentType: 'image/png', upsert: false });

          if (error || !data) { resolve(null); return; }

          const { data: urlData } = supabase.storage
            .from('beta_feedback')
            .getPublicUrl(data.path);

          resolve(urlData?.publicUrl ?? null);
        }, 'image/png');
      });
    } catch {
      return null;
    }
  };

  const onSubmit = async (values: FeedbackForm) => {
    if (!user) return;
    setSubmitting(true);

    try {
      let screenshotUrl: string | null = null;

      if (values.include_screenshot) {
        // Temporarily hide the dialog so it's not in the screenshot
        setOpen(false);
        await new Promise((r) => setTimeout(r, 300));
        screenshotUrl = await captureScreenshot();
        setOpen(true);
      }

      const { error } = await supabase.from('user_feedback' as any).insert({
        user_id: user.id,
        org_id: orgId || null,
        feedback_type: values.feedback_type,
        description: values.description,
        page_url: window.location.href,
        screenshot_url: screenshotUrl,
      } as any);

      if (error) throw error;

      toast({
        title: 'Feedback submitted!',
        description: screenshotUrl
          ? 'Thanks! We received your feedback with a screenshot.'
          : 'Thank you for helping improve the beta.',
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

  const includeScreenshot = form.watch('include_screenshot');

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
              {/* Feedback Type */}
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
                          <Label htmlFor="bug">🐛 Bug Report</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="feature_request" id="feature" />
                          <Label htmlFor="feature">✨ Feature Request</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
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

              {/* Screenshot toggle */}
              <FormField
                control={form.control}
                name="include_screenshot"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                      <FormControl>
                        <Checkbox
                          id="screenshot-check"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4 text-muted-foreground" />
                        <Label
                          htmlFor="screenshot-check"
                          className="cursor-pointer text-sm font-normal"
                        >
                          Include a screenshot of my current page
                        </Label>
                      </div>
                    </div>
                  </FormItem>
                )}
              />

              {includeScreenshot && (
                <p className="text-xs text-muted-foreground -mt-1 pl-1">
                  The dialog will briefly hide while your screen is captured.
                </p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {includeScreenshot ? 'Capturing & Sending…' : 'Sending…'}
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
