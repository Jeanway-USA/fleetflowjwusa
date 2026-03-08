import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { RoleBasedRedirect } from "@/components/shared/RoleBasedRedirect";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { SuperAdminGuard } from "@/components/shared/SuperAdminGuard";
import { BrandColorInjector } from "@/components/shared/BrandColorInjector";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Trucks = lazy(() => import("./pages/Trucks"));
const Trailers = lazy(() => import("./pages/Trailers"));
const Drivers = lazy(() => import("./pages/Drivers"));
const FleetLoads = lazy(() => import("./pages/FleetLoads"));
const AgencyLoads = lazy(() => import("./pages/AgencyLoads"));
const Finance = lazy(() => import("./pages/Finance"));
const CompanyInsights = lazy(() => import("./pages/CompanyInsights"));
const MaintenanceManagement = lazy(() => import("./pages/MaintenanceManagement"));
const Documents = lazy(() => import("./pages/Documents"));
const Safety = lazy(() => import("./pages/Safety"));
const Settings = lazy(() => import("./pages/Settings"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const DispatcherDashboard = lazy(() => import("./pages/DispatcherDashboard"));
const ExecutiveDashboard = lazy(() => import("./pages/ExecutiveDashboard"));
const DriverSettings = lazy(() => import("./pages/DriverSettings"));
const DriverStats = lazy(() => import("./pages/DriverStats"));
const Incidents = lazy(() => import("./pages/Incidents"));
const DriverPerformance = lazy(() => import("./pages/DriverPerformance"));
const DriverSpectatorView = lazy(() => import("./pages/DriverSpectatorView"));
const IFTA = lazy(() => import("./pages/IFTA"));
const CRM = lazy(() => import("./pages/CRM"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PendingAccess = lazy(() => import("./pages/PendingAccess"));
const Landing = lazy(() => import("./pages/Landing"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));

const queryClient = new QueryClient();

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <ErrorBoundary>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    {/* Public routes */}
                    <Route path="/" element={<RoleBasedRedirect />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/pending-access" element={<PendingAccess />} />
                    <Route path="/landing" element={<Navigate to="/" replace />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/onboarding" element={<Onboarding />} />

                    {/* Dashboard routes */}
                    <Route path="/executive-dashboard" element={
                      <ProtectedRoute allowedRoles={['owner']} requiredFeature="executive_dashboard">
                        <ExecutiveDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/dispatcher-dashboard" element={
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher']} requiredFeature="dispatch">
                        <DispatcherDashboard />
                      </ProtectedRoute>
                    } />
                    <Route path="/driver-dashboard" element={
                      <ProtectedRoute allowedRoles={['owner', 'driver']}>
                        <DriverDashboard />
                      </ProtectedRoute>
                    } />

                    {/* Fleet management */}
                    <Route path="/trucks" element={
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher', 'safety']} requiredFeature="trucks">
                        <Trucks />
                      </ProtectedRoute>
                    } />
                    <Route path="/trailers" element={
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher', 'safety']} requiredFeature="trailers">
                        <Trailers />
                      </ProtectedRoute>
                    } />
                    <Route path="/drivers" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin', 'dispatcher', 'safety']} requiredFeature="drivers">
                        <Drivers />
                      </ProtectedRoute>
                    } />

                    {/* Loads */}
                    <Route path="/fleet-loads" element={
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher', 'safety', 'driver']} requiredFeature="loads">
                        <FleetLoads />
                      </ProtectedRoute>
                    } />
                    <Route path="/agency-loads" element={
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher']} requiredFeature="agency_loads">
                        <AgencyLoads />
                      </ProtectedRoute>
                    } />

                    {/* Finance */}
                    <Route path="/finance" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin']} requiredFeature="profit_loss">
                        <Finance />
                      </ProtectedRoute>
                    } />
                    <Route path="/ledger" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin']} requiredFeature="profit_loss">
                        <Finance />
                      </ProtectedRoute>
                    } />
                    <Route path="/insights" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin']} requiredFeature="insights">
                        <CompanyInsights />
                      </ProtectedRoute>
                    } />
                    <Route path="/ifta" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin']} requiredFeature="ifta">
                        <IFTA />
                      </ProtectedRoute>
                    } />

                    {/* Operations */}
                    <Route path="/crm" element={
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher', 'safety', 'driver']} requiredFeature="crm">
                        <CRM />
                      </ProtectedRoute>
                    } />
                    <Route path="/resources" element={<Navigate to="/crm" replace />} />
                    <Route path="/maintenance" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety']} requiredFeature="maintenance_full">
                        <MaintenanceManagement />
                      </ProtectedRoute>
                    } />
                    <Route path="/documents" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin', 'dispatcher', 'safety', 'driver']} requiredFeature="documents">
                        <Documents />
                      </ProtectedRoute>
                    } />

                    {/* Safety */}
                    <Route path="/safety" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety']} requiredFeature="safety">
                        <Safety />
                      </ProtectedRoute>
                    } />
                    <Route path="/incidents" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety', 'dispatcher']} requiredFeature="incidents">
                        <Incidents />
                      </ProtectedRoute>
                    } />
                    <Route path="/driver-performance" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety', 'dispatcher']} requiredFeature="driver_performance">
                        <DriverPerformance />
                      </ProtectedRoute>
                    } />
                    <Route path="/driver-view/:driverId" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety', 'dispatcher']}>
                        <DriverSpectatorView />
                      </ProtectedRoute>
                    } />

                    {/* Settings */}
                    <Route path="/settings" element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <Settings />
                      </ProtectedRoute>
                    } />
                    <Route path="/driver-settings" element={
                      <ProtectedRoute allowedRoles={['driver']}>
                        <DriverSettings />
                      </ProtectedRoute>
                    } />
                    <Route path="/driver-stats" element={
                      <ProtectedRoute allowedRoles={['driver']}>
                        <DriverStats />
                      </ProtectedRoute>
                    } />

                    <Route path="/super-admin" element={
                      <SuperAdminGuard>
                        <SuperAdminDashboard />
                      </SuperAdminGuard>
                    } />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
