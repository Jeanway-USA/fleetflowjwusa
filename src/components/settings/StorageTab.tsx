import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { HardDrive, CloudOff, CheckCircle, Loader2, FolderOpen, ExternalLink } from 'lucide-react';
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
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

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

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');

    if (authCode && !isConnected) {
      window.history.replaceState({}, '', window.location.pathname);

      const exchangeCode = async () => {
        try {
          const { data, error } = await supabase.functions.invoke('google-drive-auth', {
            body: {
              action: 'exchange_code',
              code: authCode,
              redirect_uri: `${window.location.origin}/settings`,
            },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          queryClient.invalidateQueries({ queryKey: ['storage-config'] });
          queryClient.invalidateQueries({ queryKey: ['storage-status'] });
          toast.success('Google Drive connected successfully!');
        } catch (err: any) {
          toast.error(err.message || 'Failed to complete connection');
        }
      };

      exchangeCode();
    }
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-auth', {
        body: {
          action: 'get_auth_url',
          redirect_uri: `${window.location.origin}/settings`,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      window.location.href = data.auth_url;
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
            <div className="flex flex-wrap gap-2">
              {config?.root_folder_id && config.root_folder_id !== 'root' && (
                <Button
                  variant="outline"
                  asChild
                >
                  <a
                    href={`https://drive.google.com/drive/folders/${config.root_folder_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Google Drive
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDisconnectDialogOpen(true)}
              >
                <CloudOff className="h-4 w-4 mr-2" />
                Disconnect Google Drive
              </Button>
            </div>
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
            <p className="text-sm text-muted-foreground">
              Sign in with your Google account to store all uploads in a dedicated "FleetFlow Storage" folder in your Drive.
            </p>

            <Button
              onClick={handleConnect}
              disabled={isConnecting || isDemoMode}
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
              Click "Connect Google Drive" and sign in with your Google account
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground mt-0.5">2.</span>
              Grant FleetFlow permission to manage files in a dedicated folder
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground mt-0.5">3.</span>
              All new uploads will be stored in a "FleetFlow Storage" folder in your Google Drive
            </li>
            <li className="flex items-start gap-2">
              <span className="font-medium text-foreground mt-0.5">4.</span>
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
