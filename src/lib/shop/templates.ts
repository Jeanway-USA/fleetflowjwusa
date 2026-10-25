/**
 * Starter checklists for common jobs. Picking a kind of work fills in its checklist, and the person making the
 * job can add, remove or reword any step. These are only starting points: nothing about pay or cost lives here.
 */
export interface WorkKind {
  key: string;
  label: string;
  tasks: string[];
}

export const WORK_KINDS: WorkKind[] = [
  { key: 'pm', label: 'Oil change', tasks: ['Drain engine oil', 'Replace oil filter', 'Replace fuel filters', 'Refill with correct oil and check level', 'Grease chassis', 'Check belts and hoses', 'Reset the service interval'] },
  { key: 'M1', label: 'M1 service', tasks: ['Safety inspection', 'Grease all fittings', 'Check lights and reflectors', 'Check air system for leaks', 'Check tire pressure and tread', 'Check fluid levels'] },
  { key: 'PM_A', label: 'PM A (oil and fuel)', tasks: ['Drain engine oil', 'Replace oil filter', 'Replace fuel filters', 'Check coolant and DEF', 'Road test'] },
  { key: 'M2', label: 'M2 service', tasks: ['Everything in M1', 'Replace air dryer cartridge', 'Check brake wear and adjustment', 'Inspect suspension and steering', 'Inspect driveline'] },
  { key: 'M3', label: 'M3 service', tasks: ['Everything in M2', 'Change transmission fluid', 'Change differential fluid', 'Coolant test and top-off'] },
  { key: 'ANNUAL_DOT', label: 'Annual DOT inspection', tasks: ['Complete the annual inspection checklist', 'Note any defects found', 'Fix each defect', 'File the inspection report'] },
  { key: 'AIR_DRYER', label: 'Air dryer cartridge', tasks: ['Replace the air dryer cartridge', 'Drain the air tanks and check for moisture', 'Check the governor and purge valve'] },
  { key: 'DPF_CLEAN', label: 'DPF ash cleaning', tasks: ['Remove and clean the particulate filter', 'Inspect the exhaust and sensors', 'Reinstall and run a regeneration check'] },
  { key: 'DEF_FILTER', label: 'DEF pump filter', tasks: ['Replace the DEF pump filter', 'Check the DEF lines and heater', 'Clear any DEF faults'] },
  { key: 'COOLANT', label: 'Coolant service', tasks: ['Test the coolant and additive level', 'Change the coolant and filter if due', 'Check hoses and clamps', 'Check for leaks'] },
  { key: 'TRANS_FLUID', label: 'Transmission fluid', tasks: ['Drain the transmission fluid', 'Replace the filter', 'Refill with the approved fluid and check level', 'Road test'] },
  { key: 'AXLE_FLUID', label: 'Drive axle fluid', tasks: ['Drain the axle fluid and check the magnet', 'Replace the filter if the axle has one', 'Refill with the approved fluid', 'Check for seal leaks'] },
  { key: 'tire', label: 'Tires', tasks: ['Remove wheel', 'Dismount and mount new tire', 'Balance', 'Torque lug nuts to spec', 'Set tire pressure', 'Re-torque after the first drive'] },
  { key: 'brake', label: 'Brakes', tasks: ['Pull wheels and inspect', 'Measure pad and drum wear', 'Replace worn parts', 'Adjust slack adjusters', 'Test the brake system', 'Road test'] },
  { key: 'inspection', label: '120-day inspection', tasks: ['Complete the inspection checklist', 'Note any defects found', 'Fix or schedule each defect', 'Update the inspection record'] },
  { key: 'repair', label: 'Repair', tasks: ['Diagnose the problem', 'Do the repair', 'Test the repair'] },
];

export const templateTasks = (key: string): string[] => WORK_KINDS.find((k) => k.key === key)?.tasks ?? [];

/** The checklist for a set of kinds of work, without repeating a step. */
export function tasksForKinds(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    for (const t of templateTasks(key)) {
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

/** Reasons a job gets stopped. The person can still type their own. */
export const BLOCK_REASONS = ['Waiting on a part', 'Waiting on part approval', 'Waiting on the driver', 'Needs an outside shop', 'Needs a decision from the owner'];
