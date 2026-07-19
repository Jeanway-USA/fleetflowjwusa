## No changes needed — already applied

Agency Loads renders through the shared `DataTable` static-layout branch, which is the same code path Fleet Loads uses. That branch already implements every item in this request (verified in `src/components/shared/DataTable.tsx` lines 566–697):

- **Subtle horizontal dividers, no heavy borders** — rows use `border-b border-border/60`; the outer heavy border is disabled when `wrapCells`/expandable is on (`!useStaticLayout && "border border-border"`).
- **Alternating row background** — `even:bg-muted/30` on each row.
- **Muted, uppercase, semi-bold headers** — `th` uses `text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`.
- **Hover + pointer** — `hover:bg-muted/50 transition-colors`, and `cursor-pointer` is added whenever the row is expandable/clickable (Agency Loads is expandable, so this applies).
- **Status pills** — Agency Loads uses `<StatusBadge status={l.status} />`, the same component Fleet Loads uses; it already renders soft-bg / darker-text rounded pills with bold small text, and its color mapping is shared across both pages.

The one intentional deviation from the literal request: this project's design system forbids raw Tailwind color literals like `border-gray-100`, `bg-gray-50/50`, `hover:bg-gray-50` in components — we use semantic tokens (`border-border/60`, `bg-muted/30`, `hover:bg-muted/50`) that render as the same soft grays in light mode and stay correct in dark mode. Swapping them for the literal gray classes would break dark mode and violate the project's design-system rule, so we keep the semantic tokens. Visually the result matches what you asked for.

No files to touch. If you'd still like me to force the literal `gray-*` classes anyway (light-mode only, dark mode will look wrong), say so and I'll do a one-line override on the Agency Loads page.
