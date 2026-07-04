import { type ReactNode } from 'react';
import { GustoProvider } from '@gusto/embedded-react-sdk';
import { gustoFleetFlowTheme } from '@/lib/gusto/theme';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/**
 * Wraps the app in Gusto's embedded provider so any dialog (Run Payroll,
 * My Paystubs) can render `<Payroll.PayrollFlow>` or
 * `<EmployeeManagement.PaystubsCard>` without wiring the SDK repeatedly.
 *
 * The `baseUrl` points at our `run-w2-payroll` edge function, which acts as
 * a server-side proxy that attaches the Gusto Bearer token before
 * forwarding requests upstream. The browser never sees Gusto credentials.
 */
export function GustoAppProvider({ children }: { children: ReactNode }) {
  const baseUrl = `${SUPABASE_URL}/functions/v1/run-w2-payroll`;

  return (
    <GustoProvider
      config={{ baseUrl }}
      theme={gustoFleetFlowTheme}
    >
      {children}
    </GustoProvider>
  );
}
