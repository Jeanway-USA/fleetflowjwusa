import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Loader2, ArrowLeft, ArrowRight, CheckCircle2, Building2, Truck, Container,
  Users, Plus, X, SkipForward, Upload, ImageIcon,
} from 'lucide-react';
import confetti from 'canvas-confetti';

const TRAILER_TYPES = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Lowboy', 'Tanker', 'Hopper', 'Other'];
const INVITE_ROLES = [
  { value: 'dispatcher', label: 'Dispatcher' },
  { value: 'payroll_admin', label: 'Payroll Admin' },
  { value: 'safety', label: 'Safety' },
  { value: 'driver', label: 'Driver' },
];

export default function Onboarding() {
  const { refreshOrgData, refreshRoles } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [companyName, setCompanyName] = useState('');
  const [dotNumber, setDotNumber] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Step 2
  const [truckUnit, setTruckUnit] = useState('');
  const [truckMake, setTruckMake] = useState('');
  const [truckModel, setTruckModel] = useState('');
  const [truckYear, setTruckYear] = useState('');
  const [truckVin, setTruckVin] = useState('');
  const [trailerUnit, setTrailerUnit] = useState('');
  const [trailerType, setTrailerType] = useState('Dry Van');
  const [trailerMake, setTrailerMake] = useState('');
  const [trailerYear, setTrailerYear] = useState('');

  // Step 3
  const [invites, setInvites] = useState<Array<{ email: string; role: string }>>([
    { email: '', role: 'dispatcher' },
  ]);

  const [orgId, setOrgId] = useState<string | null>(null);

  
  const totalSteps = 3;
  const progress = (step / totalSteps) * 100;
  const stepLabels = ['Organization', 'Fleet Setup', 'Invite Team'];

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleStep1 = async () => {
    if (!companyName.trim()) {
      toast.error('Please enter your company name');
      return;
    }
    if (companyName.trim().length > 100) {
      toast.error('Company name must be under 100 characters');
      return;
    }

    setLoading(true);
    try {
      // Create org via RPC (bypasses RLS)
      const { data: newOrgId, error } = await supabase.rpc('create_onboarding_org', {
        _name: companyName.trim(),
      });
      if (error) throw error;

      setOrgId(newOrgId);

      // Update org with DOT/MC numbers
      const updates: Record<string, string | null> = {};
      if (dotNumber.trim()) updates.dot_number = dotNumber.trim();
      if (mcNumber.trim()) updates.mc_number = mcNumber.trim();

      // Upload logo if provided
      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const path = `${newOrgId}/logo.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('branding-assets')
          .upload(path, logoFile, { upsert: true });
        if (!uploadError) {
          updates.logo_url = path;
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('organizations')
          .update(updates)
          .eq('id', newOrgId);
      }

      setStep(2);
    } catch {
      toast.error('Failed to create organization. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async (skip = false) => {
    if (!orgId) return;

    if (!skip) {
      if (!truckUnit.trim() && !trailerUnit.trim()) {
        toast.error('Please add at least a truck or trailer, or skip this step');
        return;
      }
    }

    setLoading(true);
    try {
      if (!skip) {
        if (truckUnit.trim()) {
          const { error } = await supabase.from('trucks').insert({
            org_id: orgId,
            unit_number: truckUnit.trim(),
            make: truckMake.trim() || null,
            model: truckModel.trim() || null,
            year: truckYear ? parseInt(truckYear) : null,
            vin: truckVin.trim() || null,
          });
          if (error) throw error;
        }

        if (trailerUnit.trim()) {
          const { error } = await supabase.from('trailers').insert({
            org_id: orgId,
            unit_number: trailerUnit.trim(),
            trailer_type: trailerType,
            make: trailerMake.trim() || null,
            year: trailerYear ? parseInt(trailerYear) : null,
          });
          if (error) throw error;
        }
      }

      setStep(3);
    } catch {
      toast.error('Failed to save fleet data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async (skip = false) => {
    setLoading(true);
    try {
      if (!skip) {
        const validInvites = invites.filter((i) => i.email.trim());
        for (const invite of validInvites) {
          try {
            const { data, error } = await supabase.functions.invoke('invite-user', {
              body: { email: invite.email.trim(), role: invite.role },
            });
            if (error) {
              console.error('Invite error:', error);
              toast.error(`Failed to invite ${invite.email}`);
            } else if (data?.error) {
              toast.error(`${invite.email}: ${data.error}`);
            } else {
              toast.success(`Invited ${invite.email}`);
            }
          } catch {
            toast.error(`Failed to invite ${invite.email}`);
          }
        }
      }

      await refreshOrgData();
      await refreshRoles();

      confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      toast.success('Welcome aboard! 🚀');
      setTimeout(() => navigate('/dispatcher'), 1500);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addInviteRow = () => {
    if (invites.length >= 10) return;
    setInvites([...invites, { email: '', role: 'dispatcher' }]);
  };

  const removeInviteRow = (index: number) => {
    if (invites.length <= 1) return;
    setInvites(invites.filter((_, i) => i !== index));
  };

  const updateInvite = (index: number, field: 'email' | 'role', value: string) => {
    setInvites(invites.map((inv, i) => (i === index ? { ...inv, [field]: value } : inv)));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-gradient-gold tracking-tight">Fleet Flow TMS</h1>
            <p className="text-xs text-muted-foreground mt-0.5">by JeanWayUSA</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {/* Stepper */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              {stepLabels.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                      i + 1 < step
                        ? 'bg-primary text-primary-foreground'
                        : i + 1 === step
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {i + 1 < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span
                    className={`text-sm font-medium hidden sm:inline ${
                      i + 1 <= step ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Step 1: Organization Profile */}
          {step === 1 && (
            <Card className="border-border bg-card">
              <CardContent className="pt-6 space-y-6">
                <div className="text-center mb-2">
                  <Building2 className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h2 className="text-2xl font-bold">Organization Profile</h2>
                  <p className="text-muted-foreground mt-1">Tell us about your trucking business</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-name">Company Name *</Label>
                    <Input
                      id="company-name"
                      placeholder="Your Trucking Co."
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="bg-background"
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dot-number">DOT Number</Label>
                      <Input
                        id="dot-number"
                        placeholder="1234567"
                        value={dotNumber}
                        onChange={(e) => setDotNumber(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mc-number">MC Number</Label>
                      <Input
                        id="mc-number"
                        placeholder="MC-123456"
                        value={mcNumber}
                        onChange={(e) => setMcNumber(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                  </div>

                  {/* Logo Upload */}
                  <div className="space-y-2">
                    <Label>Company Logo</Label>
                    <div className="flex items-center gap-4">
                      <label
                        htmlFor="logo-upload"
                        className="flex items-center justify-center w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted/50 cursor-pointer hover:border-primary/50 transition-colors overflow-hidden"
                      >
                        {logoPreview ? (
                          <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        )}
                        <input
                          id="logo-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleLogoSelect}
                        />
                      </label>
                      <div className="text-sm text-muted-foreground">
                        <p>Upload your company logo</p>
                        <p className="text-xs">PNG, JPG up to 2MB</p>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full gradient-gold text-primary-foreground hover:opacity-90"
                  onClick={handleStep1}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Fleet Setup */}
          {step === 2 && (
            <Card className="border-border bg-card">
              <CardContent className="pt-6 space-y-6">
                <div className="text-center mb-2">
                  <Truck className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h2 className="text-2xl font-bold">Fleet Setup</h2>
                  <p className="text-muted-foreground mt-1">Quick-add your first truck and trailer</p>
                </div>

                {/* Truck Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" /> Truck
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="truck-unit" className="text-xs">Unit #</Label>
                      <Input id="truck-unit" placeholder="101" value={truckUnit} onChange={(e) => setTruckUnit(e.target.value)} className="bg-background" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Make</Label>
                      <Input placeholder="Freightliner" value={truckMake} onChange={(e) => setTruckMake(e.target.value)} className="bg-background" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Model</Label>
                      <Input placeholder="Cascadia" value={truckModel} onChange={(e) => setTruckModel(e.target.value)} className="bg-background" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Year</Label>
                      <Input type="number" placeholder="2024" value={truckYear} onChange={(e) => setTruckYear(e.target.value)} className="bg-background" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">VIN</Label>
                      <Input placeholder="1FUJGLDR..." value={truckVin} onChange={(e) => setTruckVin(e.target.value)} className="bg-background" />
                    </div>
                  </div>
                </div>

                {/* Trailer Section */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Container className="h-4 w-4 text-primary" /> Trailer
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Unit #</Label>
                      <Input placeholder="T-01" value={trailerUnit} onChange={(e) => setTrailerUnit(e.target.value)} className="bg-background" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={trailerType} onValueChange={setTrailerType}>
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRAILER_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Make</Label>
                      <Input placeholder="Wabash" value={trailerMake} onChange={(e) => setTrailerMake(e.target.value)} className="bg-background" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Year</Label>
                      <Input type="number" placeholder="2023" value={trailerYear} onChange={(e) => setTrailerYear(e.target.value)} className="bg-background" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button variant="ghost" onClick={() => handleStep2(true)} disabled={loading} className="flex-1">
                    <SkipForward className="mr-2 h-4 w-4" /> Skip
                  </Button>
                  <Button
                    className="flex-1 gradient-gold text-primary-foreground hover:opacity-90"
                    onClick={() => handleStep2(false)}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Invite Team */}
          {step === 3 && (
            <Card className="border-border bg-card">
              <CardContent className="pt-6 space-y-6">
                <div className="text-center mb-2">
                  <Users className="h-10 w-10 text-primary mx-auto mb-3" />
                  <h2 className="text-2xl font-bold">Invite Your Team</h2>
                  <p className="text-muted-foreground mt-1">Add team members by email, or skip for now</p>
                </div>

                <div className="space-y-3">
                  {invites.map((invite, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <div className="flex-1 space-y-1">
                        {i === 0 && <Label className="text-xs">Email</Label>}
                        <Input
                          type="email"
                          placeholder="team@company.com"
                          value={invite.email}
                          onChange={(e) => updateInvite(i, 'email', e.target.value)}
                          className="bg-background"
                        />
                      </div>
                      <div className="w-40 space-y-1">
                        {i === 0 && <Label className="text-xs">Role</Label>}
                        <Select value={invite.role} onValueChange={(v) => updateInvite(i, 'role', v)}>
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVITE_ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeInviteRow(i)}
                        disabled={invites.length <= 1}
                        className="shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {invites.length < 10 && (
                    <Button variant="outline" size="sm" onClick={addInviteRow} className="w-full">
                      <Plus className="mr-2 h-4 w-4" /> Add Another
                    </Button>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                  <Button variant="ghost" onClick={() => handleStep3(true)} disabled={loading} className="flex-1">
                    <SkipForward className="mr-2 h-4 w-4" /> Skip
                  </Button>
                  <Button
                    className="flex-1 gradient-gold text-primary-foreground hover:opacity-90"
                    onClick={() => handleStep3(false)}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Finish
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
