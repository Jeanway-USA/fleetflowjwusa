/**
 * Position templates sit above pay packages: a position names a kind of job and carries the defaults for it.
 * Picking one only suggests these defaults; every one stays editable for the person.
 */

export type EmploymentChoice = 'w2' | '1099' | 'lease_purchase';

export const EMPLOYMENT_CHOICE_LABELS: Record<EmploymentChoice, string> = {
  w2: 'W-2 employee',
  '1099': '1099 contractor',
  lease_purchase: 'Lease purchase (1099)',
};

export type AppRoleKey = 'owner' | 'payroll_admin' | 'dispatcher' | 'safety' | 'driver' | 'maintenance';

export const APP_ROLE_LABELS: Record<AppRoleKey, string> = {
  owner: 'Owner',
  payroll_admin: 'Payroll admin',
  dispatcher: 'Dispatcher',
  safety: 'Safety',
  driver: 'Driver',
  maintenance: 'Maintenance staff',
};

/** The areas of the app a position opens. The app role decides what is actually enforced. */
export const PERMISSION_AREAS: Array<{ key: string; label: string }> = [
  { key: 'loads', label: 'Loads' },
  { key: 'dispatch', label: 'Dispatch board' },
  { key: 'fleet', label: 'Trucks and trailers' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'finance', label: 'Money and expenses' },
  { key: 'payroll', label: 'Payroll and settlements' },
  { key: 'safety', label: 'Safety and compliance' },
  { key: 'documents', label: 'Documents' },
  { key: 'settings', label: 'Settings' },
];

/** The signing forms the onboarding flow already knows. Documents the company adds are listed beside these. */
export const BUILTIN_DOCUMENTS: Array<{ key: string; label: string }> = [
  { key: 'w4', label: 'Federal W-4 Withholding' },
  { key: 'i9', label: 'Form I-9, Employment Eligibility' },
  { key: 'state_tax', label: 'State Tax Withholding' },
  { key: 'direct_deposit_form', label: 'Direct Deposit Authorization' },
  { key: 'w9', label: 'Form W-9, Taxpayer Identification' },
  { key: 'ioo_agreement', label: 'Independent Owner-Operator Agreement' },
];

export interface RequiredDocument {
  /** The document type, as stored when it is signed. */
  key: string;
  label: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
}

export interface Position {
  id: string;
  org_id?: string;
  key: string;
  name: string;
  description: string | null;
  is_builtin: boolean;
  default_pay_package_id: string | null;
  default_role: AppRoleKey | null;
  default_permissions: string[];
  required_documents: RequiredDocument[];
  onboarding_checklist: ChecklistItem[];
  requires_onboarding: boolean;
  /** What the position suggests for W-2 or 1099. The office still confirms it for each person. */
  default_employment_type?: EmploymentChoice | null;
  sort_order: number;
  archived_at?: string | null;
  created_at?: string;
}

export interface PositionAssignment {
  id: string;
  position_id: string;
  driver_id: string | null;
  user_id: string | null;
  effective_start: string;
  effective_end: string | null;
  checklist_progress: Record<string, { done_at: string; by?: string }>;
  note: string | null;
  created_at?: string;
}

export type PositionDraft = Omit<Position, 'id' | 'org_id' | 'archived_at' | 'created_at'>;
