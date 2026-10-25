import { WORK_KINDS, type WorkKind } from '@/lib/shop/templates';
import { isOilService, kindFor } from '@/lib/shop/planner';

/** What a truck is built with. The work offered for a job follows these. */
export interface TruckSpec {
  make?: string | null;
  model?: string | null;
  engine_make?: string | null;
  engine_model?: string | null;
  transmission?: string | null;
}

export interface ProfileRow {
  manufacturer: string;
  service_code: string;
  service_name: string;
  description: string | null;
  display_order: number;
}

/** Engines the truck form offers, by who built them. */
export const ENGINES: Record<string, string[]> = {
  Detroit: ['DD13', 'DD15', 'DD16'],
  Cummins: ['X15', 'X12'],
  PACCAR: ['MX-13', 'MX-11'],
  Volvo: ['D13', 'D11', 'D16'],
  Mack: ['MP8', 'MP7', 'MP10'],
  International: ['A26'],
};

export const TRANSMISSIONS = ['Eaton Endurant (automated)', 'Eaton Fuller (manual)', 'Detroit DT12 (automated)', 'Volvo I-Shift (automated)', 'Mack mDRIVE (automated)', 'PACCAR (automated)', 'Allison (automatic)', 'Other'];

/** The jobs every truck can have, whatever it is built with. */
const GENERAL = new Set(['pm', 'tire', 'brake', 'inspection', 'repair']);

/** Steps that depend on the engine. Only what a maker or its parts supplier publishes goes here. */
const OIL_NOTE: Record<string, string> = {
  detroit: 'Use oil that meets Detroit 93K222 (CK-4) or 93K223 (FA-4)',
  volvo: 'Use Volvo VDS-4.5 approved oil',
  mack: 'Use Mack EOS-4.5 approved oil',
  cummins: 'Use Cummins-approved CK-4 oil (Valvoline Premium Blue allows longer drains)',
};

const VALVE_LASH: WorkKind = { key: 'VALVE_LASH', label: 'Valve lash adjustment', tasks: ['Remove the valve cover', 'Check and set valve lash to spec', 'Replace the valve cover gasket', 'Run the engine and check for leaks'] };

/** Splits a maker's description ("Chassis lube (kingpins, u-joints), 5th wheel") into checklist steps. */
export function stepsFromDescription(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === '.') && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s.length > 2).map((s) => s.charAt(0).toUpperCase() + s.slice(1));
}

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** The preset checklist fits only where the maker's own service matches it. Otherwise the maker's description is the checklist. */
function usesPreset(key: string, make: string): boolean {
  if (['M1', 'M2', 'M3'].includes(key)) return true;
  if (key === 'PM_A') return make === 'freightliner' || make === 'western star';
  return WORK_KINDS.some((k) => k.key === key);
}

/**
 * The kinds of work offered for one truck: the everyday jobs, plus the services its maker lists, with steps adjusted
 * for its engine and transmission. With no truck chosen, or a make with no list, every kind is offered.
 */
export function workKindsFor(spec: TruckSpec | null | undefined, profiles: ProfileRow[]): WorkKind[] {
  const make = lower(spec?.make);
  const mine = profiles.filter((p) => lower(p.manufacturer) === make).sort((a, b) => a.display_order - b.display_order);
  const engine = lower(spec?.engine_make);
  const extras = engine === 'cummins' ? [VALVE_LASH] : [];
  if (!spec || !make || mine.length === 0) return [...WORK_KINDS, ...extras];

  const general = WORK_KINDS.filter((k) => GENERAL.has(k.key));
  const oilChange = general.filter((k) => k.key === 'pm');
  const rest = general.filter((k) => k.key !== 'pm');

  const maker = mine.map((p): WorkKind => {
    const key = kindFor(p.service_code, p.service_name);
    const preset = usesPreset(key, make) ? WORK_KINDS.find((k) => k.key === key)?.tasks : undefined;
    const tasks = [...(preset ?? stepsFromDescription(p.description))];
    if (isOilService(spec.make ?? '', p.service_code) && OIL_NOTE[engine]) tasks.unshift(OIL_NOTE[engine]);
    if (key === 'TRANS_FLUID' && lower(spec.transmission).includes('endurant')) tasks.push('Use PS-386 approved fluid (required for Eaton Endurant)');
    return { key, label: p.service_name, tasks };
  });

  return [...oilChange, ...maker, ...extras, ...rest];
}

/** The checklist for a set of chosen kinds, from the options offered for that truck. */
export function tasksForKindsIn(options: WorkKind[], keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    for (const t of options.find((k) => k.key === key)?.tasks ?? []) {
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
  }
  return out;
}

/** One line describing the build, for the truck card: "Detroit DD15 · Eaton Endurant (automated)". */
export function buildLine(spec: TruckSpec): string {
  return [[spec.engine_make, spec.engine_model].filter(Boolean).join(' '), spec.transmission].filter(Boolean).join(' · ');
}
