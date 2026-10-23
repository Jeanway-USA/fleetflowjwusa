import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { compressImage } from '@/lib/compress-image';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ImageIcon, Upload, X } from 'lucide-react';
import { useSignedUrl } from '@/hooks/useSignedUrl';

const COLOR_PRESETS = [
  { name: 'Gold', hsl: '45 80% 45%', dark: '45 80% 50%' },
  { name: 'Blue', hsl: '220 70% 50%', dark: '220 70% 55%' },
  { name: 'Green', hsl: '150 60% 40%', dark: '150 60% 45%' },
  { name: 'Red', hsl: '0 70% 50%', dark: '0 70% 55%' },
  { name: 'Purple', hsl: '270 60% 50%', dark: '270 60% 55%' },
  { name: 'Teal', hsl: '180 60% 40%', dark: '180 60% 45%' },
];

export function BrandingTab() {
  const { orgId, refreshOrgData, logoUrl, bannerUrl } = useAuth();
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const { url: signedLogoUrl } = useSignedUrl('branding-assets', logoUrl || null);
  const { url: signedBannerUrl } = useSignedUrl('branding-assets', bannerUrl || null);

  const validateFile = (file: File): boolean => {
    if (!file.type.startsWith('image/')) {
      toast.error('Only PNG, JPG, WebP or GIF images are accepted.');
      return false;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('File exceeds the 2MB limit.');
      return false;
    }
    return true;
  };

  const handleFileUpload = async (
    file: File,
    type: 'logo' | 'banner',
    setLoading: (v: boolean) => void
  ) => {
    if (!orgId) return;
    setLoading(true);

    try {
      const compressed = await compressImage(file);
      const ext = compressed.name.split('.').pop() || 'png';
      const filePath = `${orgId}/${type}.${ext}`;

      // Upload directly to built-in storage (not through provider)
      const { error: uploadError } = await supabase.storage
        .from('branding-assets')
        .upload(filePath, compressed, { upsert: true, contentType: compressed.type });
      if (uploadError) throw uploadError;
      const path = filePath;

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
        await supabase.storage.from('branding-assets').remove([path]);
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
      {/* Logo & Banner */}
      <Card className="bg-card border border-border rounded-lg">
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
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && validateFile(file)) handleFileUpload(file, 'logo', setIsUploadingLogo);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={isUploadingLogo}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {isUploadingLogo ? 'Uploading...' : logoUrl ? 'Change' : 'Upload'}
                </Button>
                {logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAsset('logo')}
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
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && validateFile(file)) handleFileUpload(file, 'banner', setIsUploadingBanner);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploadingBanner}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {isUploadingBanner ? 'Uploading...' : bannerUrl ? 'Change' : 'Upload'}
                </Button>
                {bannerUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAsset('banner')}
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
