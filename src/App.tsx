import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";

// Pages
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Trucks from "./pages/Trucks";
import Drivers from "./pages/Drivers";
import FleetLoads from "./pages/FleetLoads";
import AgencyLoads from "./pages/AgencyLoads";
import Payroll from "./pages/Payroll";
import Commissions from "./pages/Commissions";
import Ledger from "./pages/Ledger";
import Finance from "./pages/Finance";
import Resources from "./pages/Resources";
import Maintenance from "./pages/Maintenance";
import Documents from "./pages/Documents";
import Safety from "./pages/Safety";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/trucks" element={<Trucks />} />
            <Route path="/drivers" element={<Drivers />} />
            <Route path="/fleet-loads" element={<FleetLoads />} />
            <Route path="/agency-loads" element={<AgencyLoads />} />
            <Route path="/payroll" element={<Payroll />} />
            <Route path="/commissions" element={<Commissions />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/safety" element={<Safety />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
