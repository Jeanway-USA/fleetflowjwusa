import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const SUPER_ADMIN_EMAILS = ["andrew@jeanwayusa.com", "siadrak@jeanwayusa.com", "hr@jeanwayusa.com"];

export function SuperAdminGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user || !SUPER_ADMIN_EMAILS.includes(user.email || "")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
