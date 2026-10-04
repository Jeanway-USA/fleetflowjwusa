# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **The owner of JeanWay USA (primary).** Runs the company as a Landstar BCO (business capacity owner) and is on the road most of the time. Uses Fleet Flow mainly on his phone, in short sessions between driving, fueling, and loading: checking what the business made, where loads stand, what Landstar paid and deducted, and whether anything needs attention.
- **The office/admin user (the owner's partner in running the system).** Does the desk work: importing weekly Landstar statements, entering and correcting loads and expenses, settings, and keeping the numbers right. Uses desktop and phone.
- **HR account.** A shared HR login used for onboarding, documents, and driver records.
- **Drivers (occasional).** A company driver has had an account and used the driver portal (loads, stops, proof of delivery, pay).

Fleet Flow is JeanWay's own internal system. It is not sold to other companies.

## Product Purpose

The single place where JeanWay tracks every detail of its Landstar BCO operation: loads and dispatch, revenue and Landstar's split, weekly settlement statements and their deductions, expenses and truck loan payments, driver pay and settlements, trucks, trailers, maintenance, IFTA, safety, and documents.

Success means the owner can trust the numbers without opening a spreadsheet, and can get the answer he needs from his phone in seconds.

## Positioning

Built around how Landstar actually pays a BCO: the 65% truck share of linehaul, fuel surcharge passed through at 100%, reimbursed lumpers, fuel-card pre-trip advances, weekly Wednesday-ending settlement periods, and Landstar-financed purchases repaid through weekly installment deductions. Generic trucking TMS products do not model these.

## Operating Context

- Landstar documents imported weekly: Contractor Statement PDF (itemized, authoritative), Card Activity Statement PDF (fuel, DEF, scales, cash advances), Settlement Details XLSX (undated, summed per description), Freight Bill Details XLSX (dated, coded B/V/C/1/3/X). Annual exports are used for year-end reconciliation.
- Rate confirmation PDFs are dropped in to create loads.
- One truck (unit 433780) under a 36-month loan paid on the 5th of each month; a small number of drivers.
- Phone use happens in a cab, at truck stops, often on weak cell signal and in bright daylight or at night.

## Capabilities and Constraints

- React + TypeScript + Tailwind + shadcn/ui, Supabase (Lovable Cloud) backend; edited in Lovable and synced through GitHub (`Jeanway-USA/fleetflowjwusa`). Lovable's agent may also edit the code, so changes should stay idiomatic to the stack.
- Revenue is recognized on delivery date. Money math lives in shared modules with tests (`src/lib/revenue-calculator.ts`, `src/utils/payCalculations.ts`, `src/lib/expense-matching.ts`, `src/lib/settlement-reconciliation.ts`).
- The codebase contains multi-company SaaS scaffolding (beta program, Discord community banner, billing tiers, demo mode, super-admin, product tours). It is not part of JeanWay's product and should be hidden or removed from JeanWay's experience; do not delete data structures other features depend on.
- Terminology to keep: Landstar, BCO, linehaul, FSC (fuel surcharge), accessorials, lumper, pre-trip advance, settlement, deductions, escrow, agency code, freight bill / trip number, IFTA, POD.

## Brand Commitments

- Company name **JeanWay USA**; tagline "Gets You There". The JeanWay "JW" logo (gold gradient mark, `src/assets/JW_*.png`) must be kept.
- Colors are open; the existing gold-heavy scheme is not binding.
- The product name "FleetFlow" may remain as the system's name but JeanWay is the identity users see.

## Evidence on Hand

- Real operating data in the production database (loads since 2025, expenses, truck loan ledger).
- Real Landstar statements for the weeks ending 7/15/2026 and 9/30/2026, and 2026 year-to-date exports (in the user's Downloads; not committed).
- No customer testimonials, marketing claims, or external users exist; none should be invented.

## Product Principles

1. **The numbers must be right and explainable.** Every figure traces to a formula the owner can see; no estimates presented as facts.
2. **Phone first for the owner.** The questions he asks on the road — what did we make, where is the load, what did Landstar pay — are answerable in one or two taps.
3. **Landstar-native.** Use Landstar's terms, periods, and document shapes rather than generic TMS abstractions.
4. **Quiet confidence over showmanship.** It is a working business tool for one company, not a product demo.
5. **Nothing silently lost.** Imports, deduplication, and automation show what they did and never drop or double-count money.

## Accessibility & Inclusion

Readable at a glance in a truck cab: high contrast in both daylight and night use, large touch targets, legible numbers on small screens.
