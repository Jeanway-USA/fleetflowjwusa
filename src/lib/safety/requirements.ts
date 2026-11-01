/**
 * What Landstar and DOT require, in plain words, for the Requirements tab. From docs/SAFETY_REQUIREMENTS_RESEARCH.md.
 * "verified" means it was read from Landstar's own document or the text of the regulation. Anything else must be checked
 * with Landstar or the regulation before it is relied on.
 */

export const LANDSTAR_VALID_AS_OF = '2026-07-01';
export const LANDSTAR_RECRUITING_PHONE = '800-435-4010';

export type HandledBy = 'Landstar' | 'JeanWay' | 'Both';

export interface Requirement {
  title: string;
  standard: string;
  /** What JeanWay does about it. */
  ourPart: string;
  handledBy: HandledBy;
  source: string;
  verified: boolean;
}

export interface RequirementSection {
  id: string;
  title: string;
  note?: string;
  items: Requirement[];
}

const LANDSTAR_MIN = `Landstar operator minimums, valid as of ${LANDSTAR_VALID_AS_OF}`;

export const REQUIREMENT_SECTIONS: RequirementSection[] = [
  {
    id: 'landstar-drivers',
    title: 'Landstar: drivers',
    note: 'These are minimums. Landstar may be stricter and decides case by case, so a driver who meets them is not guaranteed to be approved.',
    items: [
      { title: 'Age', standard: '23 or older.', ourPart: 'Only put forward drivers who are 23 or older.', handledBy: 'Landstar', source: LANDSTAR_MIN, verified: true },
      { title: 'License', standard: 'Class A CDL (Class A or B for Expedited). Non-domiciled CDLs are not accepted.', ourPart: 'Keep the CDL current. Do not hire on a non-domiciled CDL.', handledBy: 'Both', source: LANDSTAR_MIN, verified: true },
      { title: 'Hazmat endorsement', standard: 'Required. Canadian operators also need a FAST card.', ourPart: 'Keep the endorsement and its expiry on the driver.', handledBy: 'Both', source: LANDSTAR_MIN, verified: true },
      { title: 'Experience', standard: 'One year (six months for Expedited) of verifiable over-the-road driving in the past 3 years, or 2 years verifiable with the equipment in the last 5.', ourPart: 'Collect proof of driving history before hiring.', handledBy: 'Landstar', source: LANDSTAR_MIN, verified: true },
      { title: 'Accidents', standard: 'No DOT-recordable or preventable accident in the past 12 months.', ourPart: 'Record every accident, and decide if each is DOT-recordable. The driver checklist flags them.', handledBy: 'Both', source: LANDSTAR_MIN, verified: true },
      { title: 'Serious violations', standard: 'No more than one serious violation in the past 36 months (for example reckless driving).', ourPart: 'Landstar checks the driving record. Ask for a copy.', handledBy: 'Landstar', source: LANDSTAR_MIN, verified: true },
      { title: 'DUI', standard: 'None in the past 60 months.', ourPart: 'Landstar checks the driving record. Ask for a copy.', handledBy: 'Landstar', source: LANDSTAR_MIN, verified: true },
      { title: 'Felonies', standard: 'No felony convictions in the past 7 years. Other felony and misdemeanor charges are reviewed case by case.', ourPart: 'Disclose anything on the application.', handledBy: 'Landstar', source: LANDSTAR_MIN, verified: true },
      { title: 'Drug and alcohol', standard: 'No positive tests. Completing a Substance Abuse Professional (SAP) program does not waive this.', ourPart: 'Landstar keeps the testing program for our drivers.', handledBy: 'Landstar', source: LANDSTAR_MIN, verified: true },
      { title: 'English', standard: 'Able to read traffic signs, respond to inquiries, make report entries and talk with the public.', ourPart: 'Confirm before hiring.', handledBy: 'Both', source: LANDSTAR_MIN, verified: true },
    ],
  },
  {
    id: 'landstar-equipment',
    title: 'Landstar: equipment',
    items: [
      { title: 'Level One DOT inspection', standard: 'Trucks and trailers must pass a Level One DOT inspection at an approved Landstar inspection facility to be leased on.', ourPart: 'Done at onboarding.', handledBy: 'Landstar', source: LANDSTAR_MIN, verified: true },
      { title: 'Inspection every 120 days', standard: 'All trucks and trailing equipment leased from a BCO are inspected every 120 days at a Landstar-approved facility. This is stricter than the federal 12 months.', ourPart: 'Book the inspection and record the date. The Equipment tab counts the 120 days.', handledBy: 'Both', source: 'Landstar safety page (landstar.com)', verified: true },
      { title: 'Sleeper berth', standard: 'The tractor must have a certified sleeper berth.', ourPart: 'Check when buying a truck.', handledBy: 'Both', source: LANDSTAR_MIN, verified: true },
      { title: 'Electronic logging device', standard: 'The tractor must work with a Landstar-approved ELD.', ourPart: 'Keep the ELD installed and working.', handledBy: 'Both', source: LANDSTAR_MIN, verified: true },
      { title: 'CARB', standard: 'California-resident BCO candidates must be CARB compliant.', ourPart: 'Only if the truck is registered in California.', handledBy: 'Both', source: LANDSTAR_MIN, verified: true },
      { title: 'Insurance', standard: 'Approved insurance for the whole lease, including Unladen Liability and Occupational Accident (or statutory Workers\' Compensation in some cases), unless you join Landstar\'s programs.', ourPart: 'Keep coverage in force. Check the exact list in the operating agreement.', handledBy: 'Both', source: 'Landstar FAQ (leasetolandstar.com)', verified: true },
    ],
  },
  {
    id: 'dot-drivers',
    title: 'DOT and FMCSA: drivers',
    note: 'Landstar is the motor carrier of record under the lease and keeps the official driver qualification files. These are the federal rules behind that, and what JeanWay has to keep current.',
    items: [
      { title: 'Medical card', standard: 'A medical exam at least every 24 months (12 months for insulin-treated diabetes and some vision exemptions), by an examiner on the National Registry.', ourPart: 'Keep the expiry current. The checklist flags it 30 days ahead.', handledBy: 'Both', source: '49 CFR 391.45', verified: true },
      { title: 'Annual driving record review', standard: 'Get the driver\'s MVR and review it at least once every 12 months. Keep a note of who reviewed it and when. Weigh speeding, reckless driving and DUI heavily.', ourPart: 'Keep a copy of each MVR in the driver\'s checklist.', handledBy: 'Both', source: '49 CFR 391.25', verified: true },
      { title: 'MVR at hire', standard: 'Within 30 days of the start date, get the record from every state the driver held a license in over the last 3 years.', ourPart: 'Landstar vets new drivers. Keep the copy it gives you.', handledBy: 'Landstar', source: '49 CFR 391.23', verified: true },
      { title: 'Driver qualification file', standard: 'Application, MVRs, road test or equivalent, annual review note, medical certificate, National Registry note. Kept while employed and 3 years after.', ourPart: 'Landstar keeps the official file.', handledBy: 'Landstar', source: '49 CFR 391.51', verified: true },
      { title: 'Clearinghouse', standard: 'A full query before a driver does any safety-sensitive work, and a query every year after.', ourPart: 'Landstar runs these for our drivers.', handledBy: 'Landstar', source: '49 CFR 382.701', verified: true },
      { title: 'Random drug and alcohol testing', standard: 'At least 50% of drivers a year for drugs and 10% for alcohol (the FMCSA can change the rates each January). Also before duty, after certain accidents, on reasonable suspicion, and before returning to work.', ourPart: 'Landstar runs the program. Tell Landstar right away after an accident.', handledBy: 'Landstar', source: '49 CFR 382.305 (rates)', verified: true },
      { title: 'Hours of service and ELD', standard: '11 hours driving, a 14-hour window, a 30-minute break after 8 hours driving, and 60 or 70 hours in 7 or 8 days.', ourPart: 'Coach drivers. Review ELD violations.', handledBy: 'Both', source: '49 CFR Part 395', verified: false },
      { title: 'Entry-level driver training', standard: 'Training from a registered provider for CDLs first issued after Feb 7, 2022.', ourPart: 'Ask for the certificate at hire.', handledBy: 'Both', source: '49 CFR Part 380', verified: false },
      { title: 'Hazmat training', standard: 'Within 90 days of hire and every 3 years after, with a record kept.', ourPart: 'Keep the training certificate in the driver\'s checklist.', handledBy: 'Both', source: '49 CFR 172.704', verified: false },
      { title: 'Accident register', standard: 'Record every DOT-recordable crash (a fatality, an injury treated away from the scene, or a tow-away) and keep it 3 years.', ourPart: 'Incidents tab keeps the register.', handledBy: 'Both', source: '49 CFR 390.15', verified: false },
      { title: 'Roadside inspection reports', standard: 'The driver gives the carrier each report. Keep it 12 months.', ourPart: 'Give Landstar a copy.', handledBy: 'Both', source: '49 CFR 396.9', verified: false },
    ],
  },
  {
    id: 'dot-equipment',
    title: 'DOT and FMCSA: equipment',
    items: [
      { title: 'Annual inspection', standard: 'Every tractor and trailer must pass an inspection at least once in 12 months. The report or a sticker, with the date and a passed certification, stays on the vehicle.', ourPart: 'Landstar\'s 120-day inspections cover this when done by a qualified inspector. Keep the report on the truck.', handledBy: 'Both', source: '49 CFR 396.17', verified: true },
      { title: 'Daily vehicle inspection report', standard: 'The driver writes a report at the end of each day for each vehicle and signs it. Defects are repaired and certified before the vehicle goes out again. Keep it 3 months. No report is needed when there are no defects.', ourPart: 'Drivers fill it in the driver app and the ELD.', handledBy: 'Both', source: '49 CFR 396.11', verified: true },
      { title: 'Maintenance records', standard: 'Keep records of inspection, repair and maintenance for each vehicle.', ourPart: 'The Shop keeps a log of finished work.', handledBy: 'Both', source: '49 CFR 396.3', verified: false },
    ],
  },
];
