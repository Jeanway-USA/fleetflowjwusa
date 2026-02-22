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

// Pages
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Trucks from "./pages/Trucks";
import Trailers from "./pages/Trailers";
import Drivers from "./pages/Drivers";
import FleetLoads from "./pages/FleetLoads";
import AgencyLoads from "./pages/AgencyLoads";
import Finance from "./pages/Finance";
import CompanyInsights from "./pages/CompanyInsights";
import MaintenanceManagement from "./pages/MaintenanceManagement";
import Documents from "./pages/Documents";
import Safety from "./pages/Safety";
import Settings from "./pages/Settings";
import DriverDashboard from "./pages/DriverDashboard";
import DispatcherDashboard from "./pages/DispatcherDashboard";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import DriverSettings from "./pages/DriverSettings";
import DriverStats from "./pages/DriverStats";
import Incidents from "./pages/Incidents";
import DriverPerformance from "./pages/DriverPerformance";
import DriverSpectatorView from "./pages/DriverSpectatorView";
import IFTA from "./pages/IFTA";
import CRM from "./pages/CRM";
import NotFound from "./pages/NotFound";
import PendingAccess from "./pages/PendingAccess";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import Onboarding from "./pages/Onboarding";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import { SuperAdminGuard } from "@/components/shared/SuperAdminGuard";

const queryClient = new QueryClient();

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
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
