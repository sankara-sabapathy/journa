---
name: Journa
description: Kolam world. Kaavi red-oxide shell, rice-flour line work, turmeric for today; coss ui components re-themed onto it.
colors:
  kaavi: "#8a3324"
  kaavi-deep: "#6e2719"
  rice: "#fbf8f2"
  turmeric: "#e0a526"
  leaf: "#2f6b4f"
  sindoor: "#b3261e"
  limewash-ground: "#f2f2ee"
  surface: "#ffffff"
  surface-2: "#e9e8e2"
  ink: "#1e1a18"
  ink-2: "#5f5751"
  rule: "#d9d6ce"
  focus: "#1f5fbf"
  dark-ground: "#181311"
  dark-surface: "#221b18"
  dark-kaavi: "#7a2c1f"
  dark-kaavi-ink: "#f08a6e"
  dark-ink: "#efe8de"
typography:
  page-title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Noto Sans Tamil, Noto Sans Devanagari, Nirmala UI, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
  section-head:
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.06em"
    textTransform: "uppercase"
  body:
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  writing:
    fontSize: "1.125rem"
    lineHeight: 1.55
  meta:
    fontSize: "0.75rem"
    fontWeight: 600
rounded:
  sm: "6px"
  md: "12px"
  pill: "999px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
components:
  button-primary:
    backgroundColor: "{colors.kaavi}"
    textColor: "{colors.rice}"
    rounded: "8px"
    height: "40px"
  toggle-pressed:
    backgroundColor: "{colors.kaavi}"
    textColor: "{colors.rice}"
  panel:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.rule}"
    rounded: "{rounded.md}"
  backup-chip-attention:
    backgroundColor: "{colors.turmeric}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
---

# Design System: Journa

## Overview

**Creative North Star: "Drawn fresh every morning."** Journa borrows from the kolam, the rice-flour drawing made at the threshold each day. The app is an Operate surface: standard controls, a quiet limewash ground, and the world lending only palette, type weight, density and one signature move.

**Key Characteristics:**
- A kaavi (red-oxide) shell: top bar, kolam band, primary actions, pressed toggles.
- The **kolam streak**: the month as a pulli dot grid; written days are looped, consecutive written days joined by a wave. Today's dot is turmeric. The same grammar draws checklist progress.
- coss ui (Base UI) components for buttons, inputs, checkboxes, toggles, dialogs and tooltips, re-themed through `src/styles/coss.css`.
- System fonts only, so Tamil and Devanagari render in the device's own faces; no network fonts.

## Colors

Tokens live in `src/styles/tokens.css` (light, dark via `prefers-color-scheme`, and a `data-theme` override). `src/styles/coss.css` maps shadcn/coss variables (`--primary`, `--background`, …) onto them.

### Primary
- **Kaavi** `#8a3324` (dark `#7a2c1f`): shell and primary action. Text on kaavi is always rice.
- **Kaavi deep** `#6e2719`: the kolam band only.

### Secondary
- **Turmeric** `#e0a526`: today, the selected day, and the backup chip when it needs attention. Never body text on light grounds.
- **Leaf** `#2f6b4f`: done (checked tasks and items).
- **Sindoor** `#b3261e`: overdue and destructive.

### Neutral
Limewash ground `#f2f2ee`, white panels, `#e9e8e2` second layer, ink `#1e1a18`, secondary ink `#5f5751` (also placeholders), rule `#d9d6ce`. Dark: wet-earth ground `#181311`, surface `#221b18`.

### Named Rules
- **One kolam owns the screen.** No other decorative graphics; the streak and progress dots are the only ornaments.
- **Rice on kaavi, ink on ground.** Text on the shell is rice; on panels it's ink or ink-2.

## Typography

One system sans stack for everything. Rank comes from weight and case on a tight scale (12/14/16/18/22/28px), so longer Tamil and Hindi strings never need a bigger size. Writing areas use 18px at 1.55 line height, capped at 70ch.

### Hierarchy
- Page title 28px/700 on the kaavi bar.
- Section heads 14px/700 uppercase, tracked 0.06em, in kaavi.
- Row titles 16px/600; meta 12–14px in ink-2.

## Layout

Phone first: sticky kaavi top bar → kolam band (Today only) → content column → fixed five-tab bottom bar with a 56px compose button above it. At ≥900px the tabs become a 220px left rail beside the content (`grid-template-areas: head head / rail main`). Spacing on a 4px base; more space above a heading than below it.

Buttons and toggles wrap their labels rather than widening the page; segmented toggles keep `min-width: max-content` and wrap to a new row.

## Elevation & Depth

Flat. Panels use a 1px rule, never a shadow. Only floating things (compose button, compose menu, toasts, dialogs) get `0 6px 18px` soft shadow.

## Components

- **IconButton** (`src/components/IconButton.tsx`): coss ghost button + coss tooltip kept mounted, linked with `data-ui-tooltip`. Every icon-only control uses it.
- **Segmented** (`src/components/Segmented.tsx`): coss ToggleGroup, single choice, pressed = kaavi.
- **TaskCheck**: coss Checkbox at 24px, leaf when checked.
- **Kolam** and **ProgressKolam**: SVG line work, `stroke-width: 2`, round caps, draw-in once on mount, disabled under `prefers-reduced-motion`.
- Native `<select>` and `<input type="date">` are kept on purpose for the phone's own pickers.

## Do's and Don'ts

- **Do** route every string through `t()`; check new screens with `npm run lint:ui` (English light/dark, phone/desktop, plus Tamil and Hindi).
- **Do** put element defaults in `@layer base`; unlayered rules override coss utilities.
- **Don't** add web fonts, analytics or any third-party request.
- **Don't** use emoji or unicode glyphs as icons; use lucide.
- **Don't** add eyebrow labels, gradient text or coloured side borders.
