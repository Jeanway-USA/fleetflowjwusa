import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Users, Shield, Sun, Moon, Building2, Palette, CreditCard, HardDrive } from 'lucide-react';
import { CompanyTab } from '@/components/settings/CompanyTab';
import { BrandingTab } from '@/components/settings/BrandingTab';
import { BillingTab } from '@/components/settings/BillingTab';
import { StorageTab } from '@/components/settings/StorageTab';
import { TeamManagementTab } from '@/components/settings/TeamManagementTab';

export default function Settings() {
  const { canSimulateRoles, isDemoMode } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const hasAdminAccess = canSimulateRoles;

  // Access denied for non-owners (but still show personal settings)
  if (!hasAdminAccess) {
    return (
      <>
        <PageHeader title="Settings" description="Manage your preferences" />
        <div className="max-w-2xl space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
                Appearance
              </CardTitle>
              <CardDescription>Customize how the app looks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="theme-toggle" className="font-medium">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                </div>
                <Switch id="theme-toggle" checked={theme === 'dark'} onCheckedChange={toggleTheme} />
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Admin Settings Restricted</h3>
                <p className="text-muted-foreground text-sm">Contact an owner for user management access.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Manage users, roles, and system configuration" />

      {isDemoMode && (
        <div className="mb-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
          <p className="text-sm font-medium">🔒 Settings are read-only in demo mode. Sign up for a real account to manage your organization.</p>
        </div>
      )}

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team
          </TabsTrigger>
          <TabsTrigger value="company" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="storage" className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            Storage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          <TeamManagementTab />
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {theme === 'dark' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
                Theme
              </CardTitle>
              <CardDescription>Choose your preferred color scheme</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="theme-switch" className="font-medium">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                </div>
                <Switch id="theme-switch" checked={theme === 'dark'} onCheckedChange={toggleTheme} />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <button
                  onClick={() => theme !== 'light' && toggleTheme()}
                  className={`p-4 rounded-lg border-2 transition-all ${theme === 'light' ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'}`}
                >
                  <div className="bg-white rounded-md p-3 mb-2 border">
                    <div className="h-2 w-12 bg-amber-500 rounded mb-2" />
                    <div className="h-2 w-20 bg-gray-200 rounded mb-1" />
                    <div className="h-2 w-16 bg-gray-200 rounded" />
                  </div>
                  <span className="text-sm font-medium">Light</span>
                </button>
                <button
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  className={`p-4 rounded-lg border-2 transition-all ${theme === 'dark' ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'}`}
                >
                  <div className="bg-zinc-900 rounded-md p-3 mb-2 border border-zinc-700">
                    <div className="h-2 w-12 bg-amber-500 rounded mb-2" />
                    <div className="h-2 w-20 bg-zinc-700 rounded mb-1" />
                    <div className="h-2 w-16 bg-zinc-700 rounded" />
                  </div>
                  <span className="text-sm font-medium">Dark</span>
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="company">
          <CompanyTab />
        </TabsContent>

        <TabsContent value="branding">
          <BrandingTab />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>

        <TabsContent value="storage">
          <StorageTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
