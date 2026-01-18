-- Create role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'payroll_admin', 'dispatcher', 'safety', 'driver');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create drivers table
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    license_number TEXT,
    license_expiry DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    hire_date DATE,
    pay_rate DECIMAL(5,2) DEFAULT 0,
    pay_type TEXT DEFAULT 'percentage' CHECK (pay_type IN ('percentage', 'per_mile', 'flat')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- Create trucks table
CREATE TABLE public.trucks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_number TEXT NOT NULL UNIQUE,
    vin TEXT,
    make TEXT,
    model TEXT,
    year INTEGER,
    license_plate TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'down', 'out_of_service')),
    current_driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    next_inspection_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.trucks ENABLE ROW LEVEL SECURITY;

-- Create fleet_loads table
CREATE TABLE public.fleet_loads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    landstar_load_id TEXT,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    pickup_date DATE,
    delivery_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_transit', 'delivered', 'cancelled')),
    rate DECIMAL(10,2) DEFAULT 0,
    fuel_advance DECIMAL(10,2) DEFAULT 0,
    detention_pay DECIMAL(10,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.fleet_loads ENABLE ROW LEVEL SECURITY;

-- Create agency_loads table
CREATE TABLE public.agency_loads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    load_reference TEXT,
    broker_name TEXT,
    carrier_name TEXT,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    pickup_date DATE,
    delivery_date DATE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'booked', 'in_transit', 'delivered', 'cancelled')),
    broker_rate DECIMAL(10,2) DEFAULT 0,
    carrier_rate DECIMAL(10,2) DEFAULT 0,
    margin DECIMAL(10,2) GENERATED ALWAYS AS (broker_rate - carrier_rate) STORED,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_loads ENABLE ROW LEVEL SECURITY;

-- Create driver_payroll table
CREATE TABLE public.driver_payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_pay DECIMAL(10,2) NOT NULL DEFAULT 0,
    fuel_deductions DECIMAL(10,2) DEFAULT 0,
    repair_deductions DECIMAL(10,2) DEFAULT 0,
    other_deductions DECIMAL(10,2) DEFAULT 0,
    net_pay DECIMAL(10,2) GENERATED ALWAYS AS (gross_pay - COALESCE(fuel_deductions, 0) - COALESCE(repair_deductions, 0) - COALESCE(other_deductions, 0)) STORED,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_payroll ENABLE ROW LEVEL SECURITY;

-- Create agent_commissions table
CREATE TABLE public.agent_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_name TEXT NOT NULL,
    load_id UUID REFERENCES public.agency_loads(id) ON DELETE SET NULL,
    commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
    payout_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;

-- Create general_ledger table
CREATE TABLE public.general_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
    reference_type TEXT,
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.general_ledger ENABLE ROW LEVEL SECURITY;

-- Create maintenance_logs table
CREATE TABLE public.maintenance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    truck_id UUID REFERENCES public.trucks(id) ON DELETE CASCADE NOT NULL,
    service_type TEXT NOT NULL,
    description TEXT,
    service_date DATE NOT NULL DEFAULT CURRENT_DATE,
    cost DECIMAL(10,2) DEFAULT 0,
    vendor TEXT,
    next_service_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- Create documents table
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('bol', 'pod', 'receipt', 'invoice', 'contract', 'license', 'inspection', 'other')),
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    related_type TEXT CHECK (related_type IN ('load', 'truck', 'driver', 'payroll')),
    related_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Helper to check if user has any of the admin roles
CREATE OR REPLACE FUNCTION public.has_admin_access(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'payroll_admin', 'dispatcher', 'safety')
  )
$$;

-- Helper to check if user is owner
CREATE OR REPLACE FUNCTION public.is_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'owner'
  )
$$;

-- Get driver ID for a user
CREATE OR REPLACE FUNCTION public.get_driver_id_for_user(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.drivers WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id OR public.is_owner(auth.uid()));

CREATE POLICY "Only owners can manage roles"
ON public.user_roles FOR ALL
USING (public.is_owner(auth.uid()));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id OR public.has_admin_access(auth.uid()));

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id OR public.is_owner(auth.uid()));

CREATE POLICY "Profiles can be created on signup"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for drivers
CREATE POLICY "Admin roles can view all drivers"
ON public.drivers FOR SELECT
USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Drivers can view their own record"
ON public.drivers FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Owner and payroll can manage drivers"
ON public.drivers FOR ALL
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'));

-- RLS Policies for trucks
CREATE POLICY "Admin roles can view all trucks"
ON public.trucks FOR SELECT
USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Owner dispatcher safety can manage trucks"
ON public.trucks FOR ALL
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'dispatcher') OR public.has_role(auth.uid(), 'safety'));

-- RLS Policies for fleet_loads
CREATE POLICY "Admin roles can view all fleet loads"
ON public.fleet_loads FOR SELECT
USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Drivers can view their assigned loads"
ON public.fleet_loads FOR SELECT
USING (driver_id = public.get_driver_id_for_user(auth.uid()));

CREATE POLICY "Owner dispatcher can manage fleet loads"
ON public.fleet_loads FOR ALL
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'dispatcher'));

-- RLS Policies for agency_loads
CREATE POLICY "Admin roles can view all agency loads"
ON public.agency_loads FOR SELECT
USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Owner dispatcher can manage agency loads"
ON public.agency_loads FOR ALL
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'dispatcher'));

-- RLS Policies for driver_payroll
CREATE POLICY "Owner payroll can view all payroll"
ON public.driver_payroll FOR SELECT
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'));

CREATE POLICY "Drivers can view their own payroll"
ON public.driver_payroll FOR SELECT
USING (driver_id = public.get_driver_id_for_user(auth.uid()));

CREATE POLICY "Owner payroll can manage payroll"
ON public.driver_payroll FOR ALL
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'));

-- RLS Policies for agent_commissions
CREATE POLICY "Owner payroll can view commissions"
ON public.agent_commissions FOR SELECT
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'));

CREATE POLICY "Owner payroll can manage commissions"
ON public.agent_commissions FOR ALL
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'));

-- RLS Policies for general_ledger
CREATE POLICY "Owner payroll can access ledger"
ON public.general_ledger FOR ALL
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'payroll_admin'));

-- RLS Policies for maintenance_logs
CREATE POLICY "Admin roles can view maintenance"
ON public.maintenance_logs FOR SELECT
USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Owner safety can manage maintenance"
ON public.maintenance_logs FOR ALL
USING (public.is_owner(auth.uid()) OR public.has_role(auth.uid(), 'safety'));

-- RLS Policies for documents
CREATE POLICY "Admin roles can view all documents"
ON public.documents FOR SELECT
USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Users can view their own documents"
ON public.documents FOR SELECT
USING (uploaded_by = auth.uid());

CREATE POLICY "Admin roles can manage documents"
ON public.documents FOR ALL
USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Users can upload their own documents"
ON public.documents FOR INSERT
WITH CHECK (uploaded_by = auth.uid());

-- Create trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_trucks_updated_at BEFORE UPDATE ON public.trucks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fleet_loads_updated_at BEFORE UPDATE ON public.fleet_loads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agency_loads_updated_at BEFORE UPDATE ON public.agency_loads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_driver_payroll_updated_at BEFORE UPDATE ON public.driver_payroll FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_commissions_updated_at BEFORE UPDATE ON public.agent_commissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_general_ledger_updated_at BEFORE UPDATE ON public.general_ledger FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_maintenance_logs_updated_at BEFORE UPDATE ON public.maintenance_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();