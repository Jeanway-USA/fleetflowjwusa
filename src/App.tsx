import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

// Pages
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Trucks from "./pages/Trucks";
import Drivers from "./pages/Drivers";
import FleetLoads from "./pages/FleetLoads";
import AgencyLoads from "./pages/AgencyLoads";
import Payroll from "./pages/Payroll";
import Commissions from "./pages/Commissions";
import Finance from "./pages/Finance";
import CompanyInsights from "./pages/CompanyInsights";
import Resources from "./pages/Resources";
import Maintenance from "./pages/Maintenance";
import Documents from "./pages/Documents";
import Safety from "./pages/Safety";
import Settings from "./pages/Settings";
import DriverDashboard from "./pages/DriverDashboard";
import DispatcherDashboard from "./pages/DispatcherDashboard";
import ExecutiveDashboard from "./pages/ExecutiveDashboard";
import DriverSettings from "./pages/DriverSettings";
import NotFound from "./pages/NotFound";

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
                  <Route path="/" element={<Navigate to="/executive-dashboard" replace />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/trucks" element={<Trucks />} />
                  <Route path="/drivers" element={<Drivers />} />
                  <Route path="/fleet-loads" element={<FleetLoads />} />
                  <Route path="/agency-loads" element={<AgencyLoads />} />
                  <Route path="/payroll" element={<Payroll />} />
                  <Route path="/commissions" element={<Commissions />} />
                  <Route path="/finance" element={<Finance />} />
                  <Route path="/ledger" element={<Finance />} />
                  <Route path="/insights" element={<CompanyInsights />} />
                  <Route path="/resources" element={<Resources />} />
                  <Route path="/maintenance" element={<Maintenance />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/safety" element={<Safety />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/driver-dashboard" element={<DriverDashboard />} />
                  <Route path="/dispatcher-dashboard" element={<DispatcherDashboard />} />
                  <Route path="/executive-dashboard" element={<ExecutiveDashboard />} />
                  <Route path="/driver-settings" element={<DriverSettings />} />
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
