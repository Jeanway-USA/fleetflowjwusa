import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { HardDrive, CloudOff, CheckCircle, Loader2, ExternalLink, AlertTriangle, FolderOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface StorageConfig {
  provider: string;
  is_active: boolean;
  connected_at: string | null;
  root_folder_id: string | null;
}

export function StorageTab() {
  const { orgId, isDemoMode } = useAuth();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Fetch storage status
  const { data: config, isLoading } = useQuery({
    queryKey: ['storage-config', orgId],
    queryFn: async (): Promise<StorageConfig> => {
      const { data, error } = await supabase.functions.invoke('google-drive-auth', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const isConnected = config?.provider === 'google_drive' && config?.is_active;

  const handleConnect = async () => {
    if (!clientId || !clientSecret) {
      toast.error('Please enter both Client ID and Client Secret');
      return;
    }

    setIsConnecting(true);

    try {
      // Build Google OAuth URL
      const redirectUri = `${window.location.origin}/settings`;
      const scope = 'https://www.googleapis.com/auth/drive.file';
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', JSON.stringify({ clientId, clientSecret }));

      // Store credentials temporarily in sessionStorage for the callback
      sessionStorage.setItem('gdrive_client_id', clientId);
      sessionStorage.setItem('gdrive_client_secret', clientSecret);

      // Redirect to Google OAuth
      window.location.href = authUrl.toString();
    } catch (error: any) {
      toast.error(error.message || 'Failed to initiate connection');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('google-drive-auth', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['storage-config'] });
      queryClient.invalidateQueries({ queryKey: ['storage-status'] });
      toast.success('Google Drive disconnected. New uploads will use built-in storage.');
      setDisconnectDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to disconnect');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Handle OAuth callback
  const urlParams = new URLSearchParams(window.location.search);
  const authCode = urlParams.get('code');

  if (authCode && !isConnected) {
    // Process OAuth callback
    const storedClientId = sessionStorage.getItem('gdrive_client_id');
    const storedClientSecret = sessionStorage.getItem('gdrive_client_secret');

    if (storedClientId && storedClientSecret) {
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname);

      // Exchange code
      const exchangeCode = async () => {
        try {
          const { data, error } = await supabase.functions.invoke('google-drive-auth', {
            body: {
              action: 'exchange_code',
              code: authCode,
              redirect_uri: `${window.location.origin}/settings`,
              client_id: storedClientId,
              client_secret: storedClientSecret,
            },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          sessionStorage.removeItem('gdrive_client_id');
          sessionStorage.removeItem('gdrive_client_secret');

          queryClient.invalidateQueries({ queryKey: ['storage-config'] });
          queryClient.invalidateQueries({ queryKey: ['storage-status'] });
          toast.success('Google Drive connected successfully!');
        } catch (err: any) {
          toast.error(err.message || 'Failed to complete connection');
        }
      };

      exchangeCode();
    }
  }

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Storage Provider
          </CardTitle>
          <CardDescription>
            Configure where your organization's files are stored
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              {isConnected ? (
                <>
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Google Drive</p>
                    <p className="text-sm text-muted-foreground">
                      Connected {config?.connected_at ? new Date(config.connected_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <HardDrive className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">Built-in Storage</p>
                    <p className="text-sm text-muted-foreground">Platform-managed storage</p>
                  </div>
                </>
              )}
            </div>
            <Badge variant={isConnected ? 'default' : 'secondary'}>
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Active
                </span>
              ) : (
                'Default'
              )}
            </Badge>
          </div>

          {isConnected && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDisconnectDialogOpen(true)}
            >
              <CloudOff className="h-4 w-4 mr-2" />
              Disconnect Google Drive
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Connect Google Drive */}
      {!isConnected && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Connect Google Drive
            </CardTitle>
            <CardDescription>
              Store all your organization's documents in your own Google Drive account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You'll need a Google Cloud project with the Drive API enabled and OAuth 2.0 credentials.{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Google Cloud Console <ExternalLink className="h-3 w-3" />
                </a>
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="client-id">OAuth Client ID</Label>
                <Input
                  id="client-id"
                  type="text"
                  placeholder="xxxx.apps.googleusercontent.com"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={isDemoMode}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-secret">OAuth Client Secret</Label>
                <Input
                  id="client-secret"
                  type="password"
                  placeholder="Enter your client secret"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  disabled={isDemoMode}
                />
              </div>

              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Redirect URI:</strong> Add this to your Google Cloud OAuth settings:</p>
                <code className="block px-3 py-2 bg-muted rounded text-xs break-all">
                  {window.location.origin}/settings
                </code>
              </div>
            </div>

            <Button
              onClick={handleConnect}
              disabled={!clientId || !clientSecret || isConnecting || isDemoMode}
              className="w-full"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Connect Google Drive
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground mt-0.5">1.</span>
              Create a Google Cloud project and enable the Google Drive API
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground mt-0.5">2.</span>
              Create OAuth 2.0 credentials (Web application type) and add the redirect URI shown above
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground mt-0.5">3.</span>
              Enter your Client ID and Secret above, then authorize with your Google account
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground mt-0.5">4.</span>
              All new uploads will be stored in a "FleetFlow Storage" folder in your Google Drive
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground mt-0.5">5.</span>
              Existing files in built-in storage continue to work — they won't be moved automatically
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Disconnect Dialog */}
      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Google Drive?</AlertDialogTitle>
            <AlertDialogDescription>
              New uploads will use built-in storage. Files already stored in Google Drive will remain
              accessible as long as the Drive account exists, but cannot be managed from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDisconnecting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
