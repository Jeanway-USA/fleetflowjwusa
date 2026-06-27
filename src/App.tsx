import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TimeDisplayProvider } from "@/contexts/TimeDisplayContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { RoleBasedRedirect } from "@/components/shared/RoleBasedRedirect";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { SuperAdminGuard } from "@/components/shared/SuperAdminGuard";
import { BrandColorInjector } from "@/components/shared/BrandColorInjector";
import { RouteTitle } from "@/components/shared/RouteTitle";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Trucks = lazy(() => import("./pages/Trucks"));
const Trailers = lazy(() => import("./pages/Trailers"));
const Drivers = lazy(() => import("./pages/Drivers"));
const FleetLoads = lazy(() => import("./pages/FleetLoads"));
const AgencyLoads = lazy(() => import("./pages/AgencyLoads"));
const Finance = lazy(() => import("./pages/Finance"));
const CompanyInsights = lazy(() => import("./pages/CompanyInsights"));
const MaintenanceManagement = lazy(() => import("./pages/MaintenanceManagement"));
const MaintenanceDashboardHome = lazy(() => import("./pages/MaintenanceDashboardHome"));
const Documents = lazy(() => import("./pages/Documents"));
const Safety = lazy(() => import("./pages/Safety"));
const Settings = lazy(() => import("./pages/Settings"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const DriverLoads = lazy(() => import("./pages/DriverLoads"));
const DriverSettlements = lazy(() => import("./pages/DriverSettlements"));
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
const PublicLoadTracker = lazy(() => import("./pages/PublicLoadTracker"));
const AccountDeactivated = lazy(() => import("./pages/AccountDeactivated"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const DocumentTemplates = lazy(() => import("./pages/admin/DocumentTemplates"));
const DriverOnboarding = lazy(() => import("./pages/DriverOnboarding"));
const SettlementPrint = lazy(() => import("./pages/SettlementPrint"));
const AuditTrail = lazy(() => import("./pages/AuditTrail"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
      networkMode: 'offlineFirst',
      gcTime: 1000 * 60 * 60 * 24, // 24 hours — persist cache for offline use
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

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
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <TimeDisplayProvider>
                <BrandColorInjector />
                <RouteTitle />
                <ErrorBoundary>
                  <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    {/* Public routes */}
                    <Route path="/" element={<RoleBasedRedirect />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/auth/accept-invite" element={<AcceptInvite />} />
                    <Route path="/pending-access" element={<PendingAccess />} />
                    <Route path="/landing" element={<Navigate to="/" replace />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/track" element={<PublicLoadTracker />} />
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="/account-deactivated" element={<AccountDeactivated />} />
                    <Route path="/checkout-success" element={<CheckoutSuccess />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/terms" element={<TermsOfService />} />

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
                    <Route path="/driver/loads" element={
                      <ProtectedRoute allowedRoles={['owner', 'driver']}>
                        <DriverLoads />
                      </ProtectedRoute>
                    } />
                    <Route path="/driver/onboarding" element={
                      <ProtectedRoute allowedRoles={['driver']}>
                        <DriverOnboarding />
                      </ProtectedRoute>
                    } />

                    {/* Fleet management */}
                    <Route path="/trucks" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety', 'maintenance']} requiredFeature="trucks">

                        <Trucks />
                      </ProtectedRoute>
                    } />
                    <Route path="/trailers" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety', 'maintenance']} requiredFeature="trailers">
                        <Trailers />
                      </ProtectedRoute>
                    } />
                    <Route path="/drivers" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin']} requiredFeature="drivers">
                        <Drivers />
                      </ProtectedRoute>
                    } />

                    {/* Loads */}
                    <Route path="/fleet-loads" element={
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher', 'safety']} requiredFeature="loads">
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
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher']} requiredFeature="crm">
                        <CRM />
                      </ProtectedRoute>
                    } />
                    <Route path="/resources" element={<Navigate to="/crm" replace />} />
                    <Route path="/maintenance" element={
                      <ProtectedRoute allowedRoles={['owner', 'maintenance']} requiredFeature="maintenance_full">
                        <MaintenanceManagement />
                      </ProtectedRoute>
                    } />
                    <Route path="/maintenance-home" element={
                      <ProtectedRoute allowedRoles={['owner', 'maintenance']} requiredFeature="maintenance_full">
                        <MaintenanceDashboardHome />
                      </ProtectedRoute>
                    } />
                    <Route path="/documents" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin', 'dispatcher', 'safety']} requiredFeature="documents">
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
                      <ProtectedRoute allowedRoles={['owner', 'safety']} requiredFeature="incidents">
                        <Incidents />
                      </ProtectedRoute>
                    } />
                    <Route path="/driver-performance" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety']} requiredFeature="driver_performance">
                        <DriverPerformance />
                      </ProtectedRoute>
                    } />
                    <Route path="/driver-view/:driverId" element={
                      <ProtectedRoute allowedRoles={['owner', 'safety']}>
                        <DriverSpectatorView />
                      </ProtectedRoute>
                    } />


                    {/* Settings */}
                    <Route path="/settings" element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <Settings />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin/document-templates" element={
                      <ProtectedRoute allowedRoles={['owner']}>
                        <DocumentTemplates />
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

                    <Route path="/settlements/:id/print" element={
                      <ProtectedRoute allowedRoles={['owner', 'dispatcher', 'payroll_admin', 'driver']}>
                        <SettlementPrint />
                      </ProtectedRoute>
                    } />

                    <Route path="/audit-trail" element={
                      <ProtectedRoute allowedRoles={['owner', 'payroll_admin']}>
                        <AuditTrail />
                      </ProtectedRoute>
                    } />
                    <Route path="/401" element={<Unauthorized />} />

                    <Route path="/super-admin" element={
                      <SuperAdminGuard>
                        <SuperAdminDashboard />
                      </SuperAdminGuard>
                    } />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
              </TimeDisplayProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
