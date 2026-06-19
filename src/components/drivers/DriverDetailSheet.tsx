import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Phone,
  Mail,
  Edit2,
  CreditCard,
  Calendar,
  FileSignature,
  MessageSquare,
  AlertTriangle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { CredentialsCompliance } from './CredentialsCompliance';
import { SignedOnboardingDocuments } from './SignedOnboardingDocuments';
import { DriverBankingDetails } from './DriverBankingDetails';
import { DriverChatSheet } from './DriverChatSheet';
import { CredentialsReviewCard } from './CredentialsReviewCard';



interface DriverDetailSheetProps {
  driver: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (driver: any) => void;
  readOnly?: boolean;
}

function parseDateSafe(date: string | null | undefined): Date | null {
  if (!date) return null;
  const iso = date.length === 10 ? `${date}T00:00:00` : date;
  try {
    return parseISO(iso);
  } catch {
    return null;
  }
}

function SheetAvatar({ avatarPath, initials }: { avatarPath: string | null; initials: string }) {
  const { url } = useSignedUrl(
    avatarPath && !avatarPath.startsWith('http') ? 'documents' : null,
    avatarPath && !avatarPath.startsWith('http') ? avatarPath : null,
  );
  const imageSrc = avatarPath?.startsWith('http') ? avatarPath : url;
  return (
    <Avatar className="h-14 w-14 border-2 border-primary/20">
      <AvatarImage src={imageSrc || undefined} />
      <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}

export function DriverDetailSheet({
  driver,
  open,
  onOpenChange,
  onEdit,
  readOnly = false,
}: DriverDetailSheetProps) {
  const { isOwner, hasRole } = useAuth();
  const canViewSignedDocs = isOwner || hasRole('safety') || hasRole('payroll_admin');
  const canForceReonboard = isOwner || hasRole('payroll_admin');
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmReonboardOpen, setConfirmReonboardOpen] = useState(false);
  const queryClient = useQueryClient();

  const reonboardMutation = useMutation({
    mutationFn: async () => {
      if (!driver?.user_id) throw new Error('Driver has no linked account yet');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: false })
        .eq('user_id', driver.user_id);
      if (profileError) throw new Error(`Profile reset failed: ${profileError.message}`);

      const { error: docsError } = await supabase
        .from('driver_signed_documents')
        .delete()
        .eq('driver_id', driver.id)
        .eq('org_id', driver.org_id);
      if (docsError) throw new Error(`Clearing signed documents failed: ${docsError.message}`);

      const { error: driverError } = await supabase
        .from('drivers')
        .update({ direct_deposit_attachment_url: null })
        .eq('id', driver.id);
      if (driverError) throw new Error(`Driver record reset failed: ${driverError.message}`);
    },
    onSuccess: () => {
      toast.success('Driver onboarding has been reset.');
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      queryClient.invalidateQueries({ queryKey: ['signed-documents', driver.id] });
      setConfirmReonboardOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to reset onboarding');
    },
  });

  if (!driver) return null;


  const initials = `${(driver.first_name?.[0] ?? '').toUpperCase()}${(driver.last_name?.[0] ?? '').toUpperCase()}` || 'D';
  const hireDate = parseDateSafe(driver.hire_date);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0 overflow-hidden">
        <SheetHeader className="shrink-0 mx-0 mt-0 px-6 pt-6 pb-4 pr-12 border-b static">

          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <SheetAvatar avatarPath={driver.avatar_url ?? null} initials={initials} />
              <div className="min-w-0">
                <SheetTitle className="text-lg leading-tight">
                  {driver.first_name} {driver.last_name}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={driver.status === 'active' ? 'default' : 'secondary'} className="text-[10px] capitalize">
                    {driver.status || 'active'}
                  </Badge>
                  {hireDate && (
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Hired {format(hireDate, 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setChatOpen(true)} className="gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Message</span>
                </Button>
                {onEdit && (
                  <Button variant="ghost" size="icon" onClick={() => onEdit(driver)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Contact strip */}
        <div className="space-y-2 pb-4 border-b border-border">

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {driver.phone ? (
              <a
                href={`tel:${driver.phone}`}
                className="flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <Phone className="h-4 w-4" /> {driver.phone}
              </a>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-4 w-4" /> No phone on file
              </span>
            )}
            {driver.email && (
              <a
                href={`mailto:${driver.email}`}
                className="flex items-center gap-1.5 text-sm hover:text-foreground text-muted-foreground"
              >
                <Mail className="h-4 w-4" /> {driver.email}
              </a>
            )}
          </div>
          {driver.license_number && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> CDL #{driver.license_number}
            </p>
          )}
        </div>

        {/* Emergency Contact */}
        <Separator />
        <div className="py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <h4 className="font-medium text-sm">Emergency Contact</h4>
          </div>
          {(driver as any).emergency_contact_name || (driver as any).emergency_contact_phone || (driver as any).emergency_contact_relationship ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{(driver as any).emergency_contact_name || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Relationship</span>
                <span className="font-medium">{(driver as any).emergency_contact_relationship || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Phone</span>
                {(driver as any).emergency_contact_phone ? (
                  <a href={`tel:${(driver as any).emergency_contact_phone}`} className="font-medium hover:underline">
                    {(driver as any).emergency_contact_phone}
                  </a>
                ) : (
                  <span className="font-medium">—</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No emergency contact on file</p>
          )}
        </div>

        {/* Credentials & Compliance */}
        <Separator />
        <div className="py-4">
          <CredentialsCompliance driver={driver} variant="section" />
        </div>

        {/* Signed Documents — admin only */}
        {canViewSignedDocs && (
          <>
            <Separator />
            <div className="pt-4 pb-2 space-y-3">
              <div className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-primary" />
                <h4 className="font-medium text-sm">Onboarding Review</h4>
              </div>
              <CredentialsReviewCard
                driverId={driver.id}
                status={(driver.credentials_review_status ?? 'pending') as 'pending' | 'approved' | 'revision_requested'}
                notes={driver.credentials_revision_notes ?? null}
              />
              <SignedOnboardingDocuments driverId={driver.id} />
              {(isOwner || hasRole('payroll_admin')) && (
                <DriverBankingDetails driverId={driver.id} />
              )}
            </div>


            {canForceReonboard && !readOnly && (
              <>
                <Separator />
                <div className="pt-4 pb-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <h4 className="font-medium text-sm text-destructive">Danger Zone</h4>
                  </div>
                  {driver.user_id ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Reset this driver's onboarding. They will be locked out of their dashboard
                        until they re-sign all required documents.
                      </p>
                      <AlertDialog open={confirmReonboardOpen} onOpenChange={setConfirmReonboardOpen}>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={reonboardMutation.isPending}
                            className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground gap-1.5"
                          >
                            {reonboardMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            Force Re-Onboarding
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Force re-onboarding?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure? This will lock the driver out of their dashboard until
                              they re-sign all documents for this organization.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={reonboardMutation.isPending}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(e) => {
                                e.preventDefault();
                                reonboardMutation.mutate();
                              }}
                              disabled={reonboardMutation.isPending}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {reonboardMutation.isPending ? 'Resetting…' : 'Continue'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This driver has no linked account yet — nothing to reset.
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}

        </div>
        </SheetContent>
      </Sheet>

      <DriverChatSheet driver={driver} open={chatOpen} onOpenChange={setChatOpen} />
    </>
  );
}
