import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function Unauthorized() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
      <h1 className="text-2xl font-semibold mb-2">401 — Unauthorized</h1>
      <p className="text-muted-foreground max-w-md mb-6">
        You don't have permission to view this page. If you believe this is an error,
        contact your organization owner.
      </p>
      <Button onClick={() => navigate('/')}>Return Home</Button>
    </div>
  );
}
