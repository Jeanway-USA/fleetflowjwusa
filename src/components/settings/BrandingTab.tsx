import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Palette, ImageIcon, Upload, X } from 'lucide-react';
import { useSignedUrl } from '@/hooks/useSignedUrl';

const COLOR_PRESETS = [
  { name: 'Gold', hsl: '45 80% 45%', dark: '45 80% 50%' },
  { name: 'Blue', hsl: '220 70% 50%', dark: '220 70% 55%' },
  { name: 'Green', hsl: '150 60% 40%', dark: '150 60% 45%' },
  { name: 'Red', hsl: '0 70% 50%', dark: '0 70% 55%' },
  { name: 'Purple', hsl: '270 60% 50%', dark: '270 60% 55%' },
  { name: 'Teal', hsl: '180 60% 40%', dark: '180 60% 45%' },
];

function hslToHex(hslStr: string): string {
  const parts = hslStr.trim().split(/\s+/);
  if (parts.length !== 3) return '#b8860b';
  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '45 80% 45%';
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function BrandingTab() {
  const { orgId, isDemoMode, refreshOrgData, primaryColor, logoUrl, bannerUrl } = useAuth();
  const [selectedColor, setSelectedColor] = useState(primaryColor || '45 80% 45%');
  const [isSavingColor, setIsSavingColor] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const { url: signedLogoUrl } = useProviderSignedUrl('branding-assets', logoUrl || null);
  const { url: signedBannerUrl } = useProviderSignedUrl('branding-assets', bannerUrl || null);

  const handleSaveColor = async () => {
    if (!orgId) return;
    setIsSavingColor(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ primary_color: selectedColor })
        .eq('id', orgId);
      if (error) throw error;
      await refreshOrgData();
      toast.success('Color scheme updated');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update color');
    } finally {
      setIsSavingColor(false);
    }
  };

  const handleFileUpload = async (
    file: File,
    type: 'logo' | 'banner',
    setLoading: (v: boolean) => void
  ) => {
    if (!orgId) return;
    setLoading(true);

    try {
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${orgId}/${type}.${ext}`;

      // Upload through storage provider
      const { path, error: uploadError } = await storageUpload('branding-assets', filePath, file);
      if (uploadError || !path) throw uploadError || new Error('Upload failed');

      const updateCol = type === 'logo' ? 'logo_url' : 'banner_url';
      const { error: dbError } = await supabase
        .from('organizations')
        .update({ [updateCol]: path })
        .eq('id', orgId);
      if (dbError) throw dbError;

      await refreshOrgData();
      toast.success(`${type === 'logo' ? 'Logo' : 'Banner'} updated`);
    } catch (error: any) {
      toast.error(error.message || `Failed to upload ${type}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAsset = async (type: 'logo' | 'banner') => {
    if (!orgId) return;
    try {
      const path = type === 'logo' ? logoUrl : bannerUrl;
      if (path) {
        await storageRemove('branding-assets', path);
      }
      const updateCol = type === 'logo' ? 'logo_url' : 'banner_url';
      await supabase
        .from('organizations')
        .update({ [updateCol]: null })
        .eq('id', orgId);
      await refreshOrgData();
      toast.success(`${type === 'logo' ? 'Logo' : 'Banner'} removed`);
    } catch (error: any) {
      toast.error(error.message || `Failed to remove ${type}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Color Scheme */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Color Scheme
          </CardTitle>
          <CardDescription>Choose a primary accent color for your TMS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setSelectedColor(preset.hsl)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  selectedColor === preset.hsl
                    ? 'border-foreground ring-2 ring-foreground/20'
                    : 'border-border hover:border-foreground/30'
                }`}
                disabled={isDemoMode}
              >
                <div
                  className="w-10 h-10 rounded-full border border-border"
                  style={{ backgroundColor: `hsl(${preset.hsl})` }}
                />
                <span className="text-xs font-medium">{preset.name}</span>
              </button>
            ))}
          </div>

          {/* Custom color picker */}
          <div className="flex items-center gap-3">
            <Label className="text-sm whitespace-nowrap">Custom Color</Label>
            <input
              type="color"
              value={hslToHex(selectedColor)}
              onChange={(e) => setSelectedColor(hexToHsl(e.target.value))}
              disabled={isDemoMode}
              className="h-10 w-14 rounded-md border border-border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-xs text-muted-foreground font-mono">{hslToHex(selectedColor)}</span>
          </div>

          {/* Live preview */}
          <div className="p-4 rounded-lg border border-border bg-muted/30">
            <p className="text-sm text-muted-foreground mb-2">Preview</p>
            <div className="flex items-center gap-3">
              <div
                className="h-8 px-4 rounded-md flex items-center text-sm font-medium"
                style={{
                  backgroundColor: `hsl(${selectedColor})`,
                  color: 'white',
                }}
              >
                Primary Button
              </div>
              <div
                className="h-8 px-4 rounded-md flex items-center text-sm font-medium border"
                style={{
                  borderColor: `hsl(${selectedColor})`,
                  color: `hsl(${selectedColor})`,
                }}
              >
                Outline Button
              </div>
              <span
                className="text-sm font-semibold"
                style={{ color: `hsl(${selectedColor})` }}
              >
                Accent Text
              </span>
            </div>
          </div>

          <Button
            onClick={handleSaveColor}
            disabled={isSavingColor || isDemoMode || selectedColor === primaryColor}
            className="gradient-gold text-primary-foreground"
          >
            {isSavingColor ? 'Saving...' : 'Apply Color'}
          </Button>
        </CardContent>
      </Card>

      {/* Logo & Banner */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Logo & Banner
          </CardTitle>
          <CardDescription>Upload your company logo and sidebar banner</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo */}
          <div className="space-y-3">
            <Label>Company Logo (Square, 512×512px recommended, max 2MB)</Label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
                {signedLogoUrl ? (
                  <img src={signedLogoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'logo', setIsUploadingLogo);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isDemoMode || isUploadingLogo}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {isUploadingLogo ? 'Uploading...' : logoUrl ? 'Change' : 'Upload'}
                </Button>
                {logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAsset('logo')}
                    disabled={isDemoMode}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Banner */}
          <div className="space-y-3">
            <Label>Sidebar Banner (Wide, 800×200px recommended, max 2MB)</Label>
            <div className="flex items-center gap-4">
              <div className="w-48 h-16 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
                {signedBannerUrl ? (
                  <img src={signedBannerUrl} alt="Banner" className="w-full h-full object-contain" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex gap-2">
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'banner', setIsUploadingBanner);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isDemoMode || isUploadingBanner}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {isUploadingBanner ? 'Uploading...' : bannerUrl ? 'Change' : 'Upload'}
                </Button>
                {bannerUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAsset('banner')}
                    disabled={isDemoMode}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
