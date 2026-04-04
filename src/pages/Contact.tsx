import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import RevealOnScroll from '@/components/shared/RevealOnScroll';
import logoIcon from '@/assets/Logo.png';
import textLogo from '@/assets/Text_Logo.png';

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().email('Please enter a valid email').max(255),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(2000),
});

type ContactFormData = z.infer<typeof contactSchema>;

export default function Contact() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = async (data: ContactFormData) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('contact-form', {
        body: data,
      });
      if (error) throw error;
      toast.success('Message sent! We\'ll get back to you soon.');
      reset();
    } catch {
      toast.error('Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <img src={logoIcon} alt="" className="h-7 w-auto" />
            <img src={textLogo} alt="FleetFlow TMS" className="h-7 w-auto" />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-16 space-y-10">
        <RevealOnScroll>
          <div className="text-center space-y-3">
            <h1 className="text-4xl font-bold">Contact Us</h1>
            <p className="text-muted-foreground">Have a question or feedback? We'd love to hear from you.</p>
          </div>
        </RevealOnScroll>

        <RevealOnScroll>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Your name" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" placeholder="What's this about?" {...register('subject')} />
              {errors.subject && <p className="text-sm text-destructive">{errors.subject.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" placeholder="Tell us more..." rows={6} {...register('message')} />
              {errors.message && <p className="text-sm text-destructive">{errors.message.message}</p>}
            </div>

            <Button type="submit" className="w-full gradient-gold text-primary-foreground" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {submitting ? 'Sending...' : 'Send Message'}
            </Button>
          </form>
        </RevealOnScroll>

        <RevealOnScroll>
          <div className="text-center text-sm text-muted-foreground space-y-1">
            <p>You can also reach us directly at</p>
            <a href="mailto:hr@jeanwayusa.com" className="text-primary hover:underline">hr@jeanwayusa.com</a>
          </div>
        </RevealOnScroll>
      </main>
    </div>
  );
}
