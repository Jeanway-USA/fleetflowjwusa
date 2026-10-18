import type { ChecklistItem, PositionDraft, RequiredDocument } from '@/lib/positions/types';
import { BUILTIN_DOCUMENTS } from '@/lib/positions/types';

const doc = (key: string): RequiredDocument => BUILTIN_DOCUMENTS.find((d) => d.key === key)!;
const list = (...labels: string[]): ChecklistItem[] => labels.map((label, i) => ({ id: `item-${i + 1}`, label }));

const W2_DOCS = [doc('w4'), doc('i9'), doc('state_tax'), doc('direct_deposit_form')];
const CONTRACTOR_DOCS = [doc('w9'), doc('ioo_agreement'), doc('direct_deposit_form')];

/**
 * The starting positions, created once for an organization. They are ordinary positions after that: rename them,
 * change anything, or archive them. No pay package is linked here, because the packages are the company's own.
 */
export const DEFAULT_POSITIONS: PositionDraft[] = [
  {
    key: 'owner_operator', name: 'Owner-Operator', is_builtin: true, sort_order: 1,
    description: 'Runs their own truck under the company authority, paid as a contractor.',
    default_pay_package_id: null, default_role: 'driver', requires_onboarding: true,
    default_permissions: ['loads', 'documents'],
    required_documents: CONTRACTOR_DOCS,
    onboarding_checklist: list('Copy of CDL and medical card', 'Truck registration and insurance on file', 'Direct deposit confirmed', 'Added to the pay package'),
  },
  {
    key: 'company_driver', name: 'Company Driver', is_builtin: true, sort_order: 2,
    description: 'W-2 employee driving a company truck.',
    default_pay_package_id: null, default_role: 'driver', requires_onboarding: true,
    default_permissions: ['loads', 'documents'],
    required_documents: W2_DOCS,
    onboarding_checklist: list('Copy of CDL and medical card', 'Drug test cleared', 'Truck assigned', 'Added to the pay package'),
  },
  {
    key: 'lease_purchase', name: 'Lease Purchase', is_builtin: true, sort_order: 3,
    description: 'Driver buying the truck through a lease-purchase agreement.',
    default_pay_package_id: null, default_role: 'driver', requires_onboarding: true,
    default_permissions: ['loads', 'documents'],
    required_documents: CONTRACTOR_DOCS,
    onboarding_checklist: list('Lease agreement signed', 'Truck assigned', 'Escrow terms explained', 'Added to the pay package'),
  },
  {
    key: 'dispatcher', name: 'Dispatcher', is_builtin: true, sort_order: 4,
    description: 'Books and manages loads and drivers.',
    default_pay_package_id: null, default_role: 'dispatcher', requires_onboarding: true,
    default_permissions: ['loads', 'dispatch', 'fleet', 'drivers', 'documents'],
    required_documents: W2_DOCS,
    onboarding_checklist: list('Account created and invited', 'Walked through the dispatch board', 'Added to the pay package'),
  },
  {
    key: 'safety_manager', name: 'Safety Manager', is_builtin: true, sort_order: 5,
    description: 'Keeps drivers and trucks compliant.',
    default_pay_package_id: null, default_role: 'safety', requires_onboarding: true,
    default_permissions: ['drivers', 'safety', 'maintenance', 'documents'],
    required_documents: W2_DOCS,
    onboarding_checklist: list('Account created and invited', 'Access to compliance records confirmed', 'Added to the pay package'),
  },
  {
    key: 'mechanic', name: 'Mechanic', is_builtin: true, sort_order: 6,
    description: 'Maintains and repairs the fleet.',
    default_pay_package_id: null, default_role: 'maintenance', requires_onboarding: false,
    default_permissions: ['maintenance', 'fleet'],
    required_documents: W2_DOCS,
    onboarding_checklist: list('Tools and shop access arranged', 'Added to the pay package'),
  },
  {
    key: 'broker', name: 'Broker', is_builtin: true, sort_order: 7,
    description: 'Finds and books freight for the company.',
    default_pay_package_id: null, default_role: 'dispatcher', requires_onboarding: true,
    default_permissions: ['loads', 'dispatch', 'documents'],
    required_documents: W2_DOCS,
    onboarding_checklist: list('Account created and invited', 'Broker authority and bond confirmed', 'Added to the pay package'),
  },
  {
    key: 'admin', name: 'Admin', is_builtin: true, sort_order: 8,
    description: 'Runs the office: payroll, billing and records.',
    default_pay_package_id: null, default_role: 'payroll_admin', requires_onboarding: true,
    default_permissions: ['loads', 'finance', 'payroll', 'documents', 'settings'],
    required_documents: W2_DOCS,
    onboarding_checklist: list('Account created and invited', 'Access to payroll reviewed with the owner', 'Added to the pay package'),
  },
  {
    key: 'custom', name: 'Custom', is_builtin: true, sort_order: 9,
    description: 'A blank starting point for any other role. Set it up the way you need.',
    default_pay_package_id: null, default_role: null, requires_onboarding: false,
    default_permissions: [], required_documents: [], onboarding_checklist: [],
  },
];

/** What a position suggests for a new hire. The caller may change any of it. */
export interface PositionSuggestion {
  role: string | null;
  requiresOnboarding: boolean;
  payPackageId: string | null;
  permissions: string[];
  documents: RequiredDocument[];
  checklist: ChecklistItem[];
}

export function suggestFromPosition(
  p: Pick<PositionDraft, 'default_role' | 'requires_onboarding' | 'default_pay_package_id' | 'default_permissions' | 'required_documents' | 'onboarding_checklist'>,
  /** Package ids that can still be used. A linked package that was archived is not suggested. */
  usablePackageIds?: Set<string>,
): PositionSuggestion {
  const linked = p.default_pay_package_id;
  return {
    role: p.default_role,
    requiresOnboarding: p.requires_onboarding,
    payPackageId: linked && (!usablePackageIds || usablePackageIds.has(linked)) ? linked : null,
    permissions: p.default_permissions,
    documents: p.required_documents,
    checklist: p.onboarding_checklist,
  };
}
