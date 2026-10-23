---
name: Fleet Flow (JeanWay USA)
description: One main-app look for every page: black shell, white hairline cards, dark-gold actions, gold only as the marker.
colors:
  shell-black: "#0A0A0A"
  carbon-gold: "#FFD34D"
  action-dark-gold: "#906221"
  page-stock: "#F8F7F5"
  card-white: "#FFFFFF"
  ink: "#121212"
  brand-gray: "#6D6E70"
  hairline: "#DDDCD9"
  tab-well: "#EBEAE8"
  hover-tint: "#FEF9D7"
  signal-red: "#C03429"
  signal-green: "#2C7245"
  signal-amber: "#A97423"
  dark-page: "#121212"
  dark-card: "#1A1A1A"
typography:
  page-title:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  page-title-phone:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.25
  panel-title:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  figure:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "2px"
  md: "4px"
  lg: "6px"
spacing:
  page-x-phone: "12px"
  page-x-desk: "24px"
  card-pad: "16px"
  header-gap: "20px"
components:
  button-primary:
    backgroundColor: "{colors.action-dark-gold}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "8px 16px"
  button-primary-phone:
    height: "48px"
  button-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  tab-strip:
    backgroundColor: "{colors.tab-well}"
    rounded: "{rounded.md}"
    padding: "4px"
  tab-active:
    backgroundColor: "{colors.page-stock}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  driver-action:
    backgroundColor: "{colors.carbon-gold}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "52px"
  input:
    backgroundColor: "{colors.page-stock}"
    rounded: "{rounded.md}"
    height: "40px"
---

# Design System: Fleet Flow (JeanWay USA)

## Overview

**Creative North Star: "The Black Shell, White Pages"**

Fleet Flow is JeanWay's private working tool, so it looks like one. A brand-black shell (sidebar, top bar, phone tab bar) frames plain white pages. Content sits in hairline cards with no shadows and no decoration; emphasis comes from weight, condensed figures and one gold marker. The owner chose this "main app look" as the single standard for every page, the driver app included. The driver app differs only in sizing (44px tap targets, phone-first spacing) and in the extra rules under Components.

Density is moderate and phone-first: the owner reads it in a cab, in daylight and at night, often on weak signal. Figures are condensed and tabular so they scan. Brand colors are binding (PRODUCT.md); status colors are functional signals, not brand.

**Key Characteristics:**
- Black shell in both themes; pages white (light) or near-black (dark).
- Dark gold is the action color; carbon gold is the marker. They are not interchangeable.
- Hairline borders, 6px radius, no shadows on resting surfaces, no gradients, no glows.
- Barlow Condensed for titles and figures, Barlow for everything else.

## Colors

A restrained brand palette: black, white, two golds, one gray, plus functional red, green and amber. Tokens are CSS variables in `src/index.css`, mapped in `tailwind.config.ts`; always use the semantic Tailwind names, never hex. Hex values in the frontmatter are rounded from the HSL variables, which are the source of truth.

### Primary
- **Action Dark Gold** (`--primary`, #906221 light, #FFD34D in dark): buttons, links, active states, focus ring, caret. Deepened from brand #AC7524 so white text passes AA.
- **Carbon Gold** (`--carbon`, #FFD34D): the marker. The current-tab tick on the phone bar, text selection, row-highlight flash, the sidebar active item, and in the driver app the next-stop marker and the one main action button. Never a page background, gradient or decoration.

### Neutral
- **Shell Black** (`--shell`, #0A0A0A): sidebar, top bar, phone tab bar. The top bar is scoped to the dark token set so controls read on black in both themes.
- **Page Stock** (`--background`, #F8F7F5): light page. **Card White** (`--card`): cards, popovers. Dark theme: page #121212, card #1A1A1A.
- **Ink** (`--foreground`, #121212) for text; **Brand Gray** (`--muted-foreground`, #6D6E70) for secondary text, labels and notes.
- **Hairline** (`--border`, #DDDCD9; dark theme a near-black grey): the one border weight. `--input` is a step darker for field edges.
- **Tab Well** (`--secondary` / `--muted`, #EBEAE8): tab strip and segmented-control background, hover fill.
- **Hover Tint** (`--accent`, #FEF9D7): menu highlights.

### Signal
- **Signal Red** (`--destructive`, #C03429), **Signal Green** (`--success`, #2C7245), **Signal Amber** (`--warning`, #A97423): status only. Each flips lighter in dark mode.

### Named Rules
**The Marker Rule.** Carbon gold marks "the current thing" or "the one action"; dark gold is for ordinary actions. If gold appears twice on a screen for different reasons, one is wrong.

**The Token Rule.** Colors come from semantic Tailwind names (`bg-card`, `text-muted-foreground`, `border`, `text-primary`). No raw hex, no new hues, no palette outside this one.

## Typography

**Display/Title Font:** Barlow Condensed (fallback Barlow, system-ui). `h1` to `h3` default to it.
**Body Font:** Barlow (self-hosted woff2, weights 400 to 700).
**Mono:** the system monospace (`font-mono`, used for small counts). No mono font file is bundled.

**Character:** A condensed, working-vehicle voice for titles and money, a plain humanist sans for reading. Tabular numerals wherever figures line up (tables, inputs, `.figure`).

### Hierarchy
- **Page title** (condensed bold, 28px phone / 32px from `sm`, tight): once per page, via `PageHeader`. Optional description below in 15px brand gray.
- **Panel title** (condensed bold, `text-xl` 20px): card and panel headings (`Panel`, `CardTitle`).
- **Figure** (`.figure`: condensed bold tabular; 20px phone / 24px from `md` in `StatStrip`): headline numbers.
- **Body** (Barlow 14px `text-sm`; 16px in phone inputs): rows and table cells (14px standard, 12px compact density).
- **Label** (13px, sentence case, brand gray): stat labels, field captions, chips. Not uppercase, not tracked.
- **Minimum** 12px (`text-xs`) for notes, counts and the compact table. Nothing smaller, except print documents.

### Named Rules
**The Sentence-Case Rule.** Labels, headings and buttons are sentence case. Uppercase belongs only to print documents (the brand guide asks for it there) and the existing `StatusBadge`.

**The 12px Floor.** No text under 12px on screen.

## Layout

Shell: sidebar on desktop; JW banner plus a bottom tab bar on phones (owner: Today / Loads / Money plus More; driver: Today / Loads / Pay; the shop has its own set). Page padding is 12px phone, 16px `sm`, 24px `lg`, with bottom padding reserved for the tab bar (`pb-tabbar`).

Page order, always: **PageHeader, then optional tab strip, then optional StatStrip, then content.** The header and tab strip each leave 20px below (`mb-5`). Content is a stack of Panels/Cards or a DataTable.

The top bar carries the single notification bell (drivers get their messages bell in the same slot), search, theme toggle and the offline indicator. Do not put a bell or notification control in a page header.

Phone: `PageHeader` stacks and its action button goes full width at 44px; tab strips scroll sideways instead of wrapping.

## Elevation & Depth

Flat. Depth comes from the hairline border and the page/card tone step, not shadows. Cards, panels, stat strips, tab strips and buttons carry no shadow. Allowed: the active tab or segment (`shadow-sm`, to read as raised in its well), dialogs (`shadow-lg` over an 80% black overlay) and Leaflet popups. Gradients and glows are gone: the old `.gradient-gold`, `.glow-gold`, `.text-gradient-gold` and `.card-elevated` classes have been removed. A primary action is `bg-primary text-primary-foreground`, and a card is `Card` or `bg-card border border-border rounded-lg`.

## Shapes

One radius token, `--radius` = 6px: cards, panels, stat strips and dialogs are `rounded-lg` (6px); buttons, inputs, tab strips and segmented wells are `rounded-md` (4px); tab triggers are `rounded-sm` (2px). One hairline border weight. No colored side rails on cards or rows. Buttons are never pills.

State marks (`StateMark`): open ring = planned, filled dot = moving, 2px-radius square = delivered, struck = cancelled.

## Components

### Buttons (`ui/button`)
Semibold 14px, `rounded-md`. Default is solid dark gold with white text; also `outline` (card fill, input border), `secondary`, `ghost`, `destructive`, `link`. Default size is 48px tall on phones and 40px from `sm`; `sm` 36px; `lg` 44px. Press nudges 1px down. Focus is a 2px ring with offset. One solid button per view region.

### Cards and Panels
`Card` (`ui/card`): `rounded-lg border bg-card`, 16px padding, condensed 20px title. `Panel` (`shared/Panel`): the same box with a condensed title, an optional aside figure (red when `asideProblem`), an optional "view all" link (44px tall), a loading skeleton and a one-line empty state. Use Panel for titled lists on dashboards; use Card for forms and free-form content.

### PageHeader
Title, optional description, optional right-side children and an optional primary `action` button with a plus icon. Every page starts with it.

### Tab strip
Grey well (`bg-muted`, `rounded-md`, 4px padding) with `rounded-sm` triggers; the active trigger takes the page color with `shadow-sm`. `ui/tabs` is 40px tall; `ShopNav` uses 44px triggers and scrolls sideways. Route navigation within a section uses the same look.

### StatStrip
Headline figures for a page or tab in one ruled box, cells divided by hairlines: 13px label, condensed figure, optional 12px note, red for a problem. Use it instead of a grid of separate stat cards. Two to six cells.

### DataTable
Sortable, filterable, virtualized table: 48px standard or 32px compact rows, CSV export, column chooser, mobile column hiding, and `EmptyState` for no data. Use for any list beyond a handful of records.

### EmptyState
Centered condensed title, optional description and action over a square-cornered icon tile; `variant="filtered"` for no results. For a one-line empty message inside a card, use Panel's `empty` prop instead.

### StatusBadge and StateMark
`StatusBadge` maps a status word to a tinted signal (success, warning, error, info, neutral): 13px semibold sentence-case tag. `StateMark` is the logbook symbol plus label for load states. The word is always shown; color only backs it up.

### Inputs and Dialogs
Input: 48px phone / 40px desk, `rounded-md`, input-colored edge, 16px text on phones. Dialog: centered `rounded-lg` card on desk, 95vw wide on phones, max 85vh, scrolling body, title condensed 20px bold, like every panel title.

### Driver app (`components/driver/ui/driver-ui.tsx`)
The same look at phone sizing. Parts: `Panel` (the same hairline card), `PanelHead` (condensed 20px title plus aside), `HeadLink`, `Stat` / `StatRow`, `Chip`, `DBtn`, `Tile`, `Bar`, `Row`, `Segmented`, `Note`, `SheetContent`.
- `DBtn`: 44px minimum (`md`, `sm`), 52px `lg` for the main action. The `primary` tone is carbon gold and is the only gold button; other tones are outline, ghost and danger.
- One strong load card runs the trip: the next stop in 36px condensed, a stops timeline (green behind, one gold dot ahead, hollow after), a full-width gold action. Everything else is a quiet card.
- Gold only for the next-stop marker and the main action.
- `Tile`: 72px-tall quick action, icon over a 13px word.
- `Segmented` replaces tabs on phones (44px segments, optional mono count).
- `Chip`: `rounded-md`, 13px; the `active` tone is a gold tint.
- `Bar`: slim 8px progress track, gold or ink fill, exact numbers printed beside it.
- `SheetContent`: dialogs become bottom sheets under `sm` (full width, up to 92dvh, 16px top corners) and centered cards above.
- Light or dark is the driver's choice; every piece reads from tokens.
- Offline state is never hidden: the offline indicator stays in the top bar, and queued actions and documents stay visible.

## Do's and Don'ts

### Do:
- **Do** start every page with `PageHeader`, then the optional tab strip, then the optional `StatStrip`, then content.
- **Do** use `StatStrip` for headline figures, `Panel` / `Card` for grouped content, `DataTable` for lists, `EmptyState` for nothing-here.
- **Do** use `rounded-lg` for containers and `rounded-md` for controls, and the semantic color tokens in both themes.
- **Do** keep touch targets at 44px or more on phone surfaces, and driver main actions at 52px.
- **Do** show the status word with any color, and show exact numbers beside any bar.
- **Do** keep labels at 13px sentence case and text at 12px or larger.
- **Do** make offline and queued state visible to the user.

### Don't:
- **Don't** use shadows, gradients or glows.
- **Don't** add colored side rails (left border stripes) to cards, rows or alerts.
- **Don't** use pills for buttons, tabs or segments.
- **Don't** put a bell or notification control in a page header; the top bar owns it.
- **Don't** use carbon gold for ordinary buttons, backgrounds or decoration, or dark gold as the marker.
- **Don't** build a grid of equal stat tiles; use `StatStrip`.
- **Don't** introduce new radii, fonts or hues, or text under 12px.

## Known exceptions
- **Print documents** (EOW report, `.print-report`): black on white; uppercase headers and sizes under 12px are allowed.
- **Bottom sheet:** `SheetContent` rounds its top corners at 16px (`rounded-t-2xl`) on phones, the only container radius beyond 6px.
- **Maps:** Leaflet markers and popups keep their own markup; popups use the card tokens with a soft shadow.
- **Charts** use the `--chart-1` to `--chart-5` series (dark gold, black, gold, gray, red).
