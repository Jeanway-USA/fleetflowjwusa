import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, Package, Users, DollarSign, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, Navigate } from 'react-router-dom';

export default function Dashboard() {
  const { roles, hasRole, isOwner, user } = useAuth();
  const navigate = useNavigate();

  // Fetch actual data from database
  const { data: trucks } = useQuery({
    queryKey: ['trucks-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('id, status');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, status');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: loads } = useQuery({
    queryKey: ['loads-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleet_loads')
        .select('id, status, net_revenue, pickup_date');
      if (error) throw error;
      return data || [];
    },
  });

  // Auto-redirect drivers who only have the driver role to driver dashboard
  const isDriverOnly = roles.length === 1 && roles[0] === 'driver';
  if (isDriverOnly) {
    return <Navigate to="/driver-dashboard" replace />;
  }

  // Calculate stats
  const activeTrucks = trucks?.filter(t => t.status === 'active').length || 0;
  const totalTrucks = trucks?.length || 0;
  const activeDrivers = drivers?.filter(d => d.status === 'active').length || 0;
  const totalDrivers = drivers?.length || 0;
  const activeLoads = loads?.filter(l => ['booked', 'in_transit', 'loading', 'unloading'].includes(l.status)).length || 0;
  
  // Calculate YTD revenue
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const ytdRevenue = Math.round((loads?.filter(l => {
    if (!l.pickup_date) return false;
    const pickupDate = new Date(l.pickup_date);
    return pickupDate >= startOfYear && pickupDate <= now;
  }).reduce((sum, l) => sum + (l.net_revenue || 0), 0) || 0) * 100) / 100;

  const stats = [
    { 
      title: 'Active Trucks', 
      value: `${activeTrucks}/${totalTrucks}`, 
      change: totalTrucks > 0 ? '+' + Math.round((activeTrucks / totalTrucks) * 100) + '%' : '0%',
      trend: 'up' as const,
      icon: Truck,
      description: 'Fleet vehicles'
    },
    { 
      title: 'Active Loads', 
      value: String(activeLoads), 
      change: '+0%',
      trend: 'up' as const,
      icon: Package,
      description: 'In transit'
    },
    { 
      title: 'Drivers', 
      value: `${activeDrivers}/${totalDrivers}`, 
      change: totalDrivers > 0 ? '+' + Math.round((activeDrivers / totalDrivers) * 100) + '%' : '0%',
      trend: 'up' as const,
      icon: Users,
      description: 'Active drivers'
    },
    { 
      title: 'Revenue YTD', 
      value: '$' + ytdRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 
      change: '+0%',
      trend: 'up' as const,
      icon: DollarSign,
      description: 'Year to date'
    },
  ];

  // Generate dynamic alerts
  const alerts = [];
  if (totalTrucks === 0) {
    alerts.push({ type: 'warning', message: 'No trucks registered yet', icon: AlertTriangle });
  }
  if (totalDrivers === 0) {
    alerts.push({ type: 'warning', message: 'No drivers registered yet', icon: AlertTriangle });
  }
  if (activeLoads === 0) {
    alerts.push({ type: 'info', message: 'No active loads at the moment', icon: CheckCircle });
  }
  if (alerts.length === 0) {
    alerts.push({ type: 'info', message: 'All systems operational', icon: CheckCircle });
  }

  const getRoleDisplay = () => {
    if (roles.length === 0) return 'No role assigned';
    return roles.map(r => r.replace(/_/g, ' ')).join(', ');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {getGreeting()}, <span className="text-gradient-gold">{user?.email?.split('@')[0]}</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Role: <span className="capitalize">{getRoleDisplay()}</span>
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="card-elevated">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center gap-1 mt-1">
                  {stat.trend === 'up' ? (
                    <TrendingUp className="h-3 w-3 text-success" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`text-xs ${stat.trend === 'up' ? 'text-success' : 'text-destructive'}`}>
                    {stat.change}
                  </span>
                  <span className="text-xs text-muted-foreground">from last year</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Role-based Content */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Alerts & Notifications */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
              <CardDescription>Recent notifications and alerts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.map((alert, i) => (
                  <div 
                    key={i} 
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      alert.type === 'warning' ? 'bg-warning/10' : 'bg-muted'
                    }`}
                  >
                    <alert.icon className={`h-5 w-5 mt-0.5 ${
                      alert.type === 'warning' ? 'text-warning' : 'text-primary'
                    }`} />
                    <p className="text-sm">{alert.message}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks based on your role</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {(isOwner || hasRole('dispatcher')) && (
                  <>
                    <button 
                      onClick={() => navigate('/fleet-loads')}
                      className="p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-left"
                    >
                      <Package className="h-5 w-5 text-primary mb-2" />
                      <p className="font-medium text-sm">New Load</p>
                    </button>
                    <button 
                      onClick={() => navigate('/trucks')}
                      className="p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-left"
                    >
                      <Truck className="h-5 w-5 text-primary mb-2" />
                      <p className="font-medium text-sm">Add Truck</p>
                    </button>
                  </>
                )}
                {(isOwner || hasRole('payroll_admin')) && (
                  <>
                    <button 
                      onClick={() => navigate('/drivers')}
                      className="p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-left"
                    >
                      <Users className="h-5 w-5 text-primary mb-2" />
                      <p className="font-medium text-sm">Add Driver</p>
                    </button>
                    <button 
                      onClick={() => navigate('/payroll')}
                      className="p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-left"
                    >
                      <DollarSign className="h-5 w-5 text-primary mb-2" />
                      <p className="font-medium text-sm">Payroll</p>
                    </button>
                  </>
                )}
                {hasRole('driver') && !isOwner && (
                  <>
                    <button 
                      onClick={() => navigate('/fleet-loads')}
                      className="p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-left"
                    >
                      <Package className="h-5 w-5 text-primary mb-2" />
                      <p className="font-medium text-sm">My Loads</p>
                    </button>
                    <button 
                      onClick={() => navigate('/payroll')}
                      className="p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-left"
                    >
                      <DollarSign className="h-5 w-5 text-primary mb-2" />
                      <p className="font-medium text-sm">Pay Statements</p>
                    </button>
                  </>
                )}
                {roles.length === 0 && (
                  <div className="col-span-2 text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                    <p>No role assigned yet.</p>
                    <p className="text-sm">Contact an administrator for access.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}