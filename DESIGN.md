---
name: Kookplan
description: A household meal-planning and grocery-list app with a warm, pantry-ledger aesthetic
colors:
  paper: "#EEEBE2"
  ink: "#232823"
  sage: "#5C7A5E"
  mustard: "#C99A3A"
  rust: "#B5583A"
  ah-blue: "#4C7A9E"
  ekoplaza-purple: "#8B5FA6"
  line: "#C9C2AE"
  panel: "#F7F5EE"
  muted-text: "#8A8570"
  faint-text: "#B5B096"
  body-text: "#4A4E42"
  label-text: "#5C5F52"
  divider-soft: "#E1DCC9"
  badge-border-soft: "#D8D3C2"
  disabled-text: "#B9B29C"
  slider-track: "#DDD6C4"
typography:
  display:
    fontFamily: "'Fraunces', serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'Fraunces', serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "'Fraunces', serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "'Inter', system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "'JetBrains Mono', monospace"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
rounded:
  sm: "5px"
  md: "8px"
  lg: "10px"
  pill: "20px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "13px 16px"
  button-nav:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "34px"
  chip-filter:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.label-text}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  input-text:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 10px"
---

# Design System: Kookplan

## Overview

**Creative North Star: "The Pantry Ledger"**

Kookplan reads like a handwritten household inventory book, not a food-delivery app: warm paper tones, a serif display face for headings, and JetBrains Mono standing in for a grocer's tally marks wherever a number appears — dates, quantities, prep minutes, store weights. Nothing here is trying to look premium or aspirational; it's trying to look like a tool that lives on a kitchen counter and gets used every week.

The mood is **warm and utilitarian**: function comes first — flat rows, no ornamentation, a single accent color (sage) doing most of the signaling work — but the warm paper background and Fraunces headings keep it from reading as a spreadsheet. Three categorical colors (sage/rust/blue for recipe tags; mustard/blue/purple for the three supermarkets) are the only places color carries meaning beyond text hierarchy.

The system is evolving toward slightly more depth than exists today (see Elevation & Depth) — modals and floating panels should feel like they're lifted off the page, not just outlined.

**Key Characteristics:**
- Ledger-inspired: mono type for anything numeric, serif for anything read as a heading
- One dominant accent (sage), used sparingly and consistently for the same meaning (positive, active, confirm)
- Flat list rows with thin dividers as the default; elevation reserved for things that visually float above content (modals, dropdowns) — this is the one place the system is intentionally moving beyond today's implementation
- Store identity colors (mustard/blue/purple) double as recipe-tag colors in one case (blue = both "vis" and Albert Heijn) — deliberate reuse, not a collision, since the two systems never appear together

## Colors

The palette reads as "pantry notebook": warm neutrals, one confident accent, and three categorical colors used only where they carry real meaning (recipe type, supermarket identity).

### Primary
- **Sage** (`#5C7A5E`): The one true accent. Used for the "Vegetarisch" tag dot, active/positive states (the bio-mode slider label, the filled lock icon when a week is locked), icon accents (calendar, book), and every primary confirm button background alternative to ink (e.g. "Recept opslaan"). If in doubt, sage is the answer for "this needs to look intentional and good."

### Neutral
- **Paper** (`#EEEBE2`): Page background. The base the whole app sits on.
- **Ink** (`#232823`): Primary text and the default dark button background (`generateBtnStyle`).
- **Panel** (`#F7F5EE`): Slightly lighter than paper — used for nav buttons, input backgrounds inside cards, and the review-flow card background. Distinguishes "a control or grouped surface" from the bare page.
- **Line** (`#C9C2AE`): The one border color used almost everywhere — day-grid dividers, card borders, input borders, section rules. Doing this job with a single color (rather than several shades) is why the app reads as coherent even with zero shadows today.
- **Muted text** (`#8A8570`): Secondary text — dates, hints, day-of-week labels, helper copy under buttons.
- **Faint text** (`#B5B096`) / **Disabled text** (`#B9B29C`): Placeholder-weight italic copy ("nog geen kookdag gepland") and disabled badge states. Nearly interchangeable; faint-text skews slightly warmer.
- **Body text** (`#4A4E42`): Slightly softer than ink — used for longer-form copy (recipe instructions) where full-ink weight would feel heavy.
- **Label text** (`#5C5F52`): Inactive filter-chip text.
- **Divider-soft** (`#E1DCC9`) / **Badge-border-soft** (`#D8D3C2`): Lighter-weight dividers used inside the Ingrediënten tab specifically, one step quieter than the main `line` color.

### Categorical (recipe tags)
- **Sage** — vegetarisch
- **Rust** (`#B5583A`) — vlees. Also the app's only "danger/destructive" color (delete buttons, thumbs-down).
- **AH-blue** (`#4C7A9E`) — vis

### Categorical (supermarkets)
- **Mustard** (`#C99A3A`) — Lidl
- **AH-blue** (`#4C7A9E`) — Albert Heijn (shared value with the "vis" tag; see the Dual-Category Rule below)
- **Ekoplaza-purple** (`#8B5FA6`) — Ekoplaza

### Named Rules
**The One Accent Rule.** Sage is the only color used to mean "good / active / go." Everything else is either a neutral or a fixed categorical identity (a tag or a store). Don't introduce a second general-purpose accent color.

**The Dual-Category Rule.** AH-blue means two different things depending on context — the "vis" recipe tag, or the Albert Heijn store badge — and that's fine, because a single ingredient badge or recipe dot is never asked to represent both systems at once. Don't let a third meaning creep onto this color; it's already double-booked.

## Typography

**Display Font:** Fraunces (serif), with a system-serif fallback
**Body Font:** Inter, with system-ui/sans-serif fallback
**Label/Mono Font:** JetBrains Mono, with a generic monospace fallback

**Character:** Fraunces gives headings a slightly literary, notebook feel without being decorative; Inter stays completely out of the way for body copy; JetBrains Mono is the "this is a number you'd write in a ledger" signal, and it's used consistently — never for headings, always for quantities, dates, or counts.

### Hierarchy
- **Display** (700, 28px, 1.1 line-height, -0.01em tracking): Fraunces. The app title only.
- **Headline** (700, 19px, 1.2): Fraunces. Section titles ("Boodschappenlijst", "Recepten beheren", "Ingrediënten beheren").
- **Title** (600, 16px, 1.3): Fraunces. Card/modal headings, the week label ("Deze week"), day numbers.
- **Body** (500, 14.5px, 1.5): Inter. Recipe names, form labels, general UI copy.
- **Label** (600, 12px, 1.0, mono): JetBrains Mono. Dates, day-of-week abbreviations, ingredient quantities, prep-time minutes, grocery weights.

### Named Rules
**The Ledger Number Rule.** Any number a user would actually write down while shopping or cooking — a quantity, a date, a prep time — renders in JetBrains Mono, at a smaller size and muted color than the text around it. This is what makes the app feel like a tally sheet instead of a form.

## Layout

Single-column, mobile-first, max-width 760px centered container with 20px horizontal padding — there is no desktop-specific layout; the app is designed to be used one-handed on a phone. Content stacks vertically: week navigation → action buttons → tabs → tab content. Rows within a list (day grid, recipe list, ingredient list) use a consistent horizontal flex layout with an icon/indicator on the left, primary text in the middle (flex: 1), and actions on the right — the same skeleton repeats across every list in the app, which is a big part of why it feels coherent despite having six or seven distinct screens.

## Elevation & Depth

**Today's implementation is flat by default**: rows and cards use a 1px `line`-colored border and/or a tinted background, never a shadow. The single exception is the ingredient-autocomplete dropdown in the recipe form, which uses a soft shadow (`0 4px 10px rgba(35,40,35,0.12)`) purely because it visually floats over other form fields and needs separation.

**Committed direction going forward:** this is intentionally changing. Modals and other floating/overlaid surfaces should get a genuine lift — not just an outline — so they read as "above" the page rather than "a bordered box on top of it." Rows and inline cards (day-grid entries, list rows) stay flat; they're part of the page, not floating above it.

### Shadow Vocabulary
- **Float** (`0 4px 10px rgba(35,40,35,0.12)`): Already in use for the autocomplete dropdown. Adopt this as the standard shadow for anything that floats over other content without taking over the screen.
- **Lift** (proposed, not yet implemented — e.g. `0 8px 32px rgba(35,40,35,0.18)`): For modal panels specifically. Stronger than Float since a modal fully commands attention; should replace the current shadow-less modal panel.

### Named Rules
**The Page vs. Float Rule.** If content is part of the normal page flow (a day-grid row, a list item, a grocery section), it stays flat — border and tint only, no shadow. If content overlays other content (a modal, a dropdown), it gets a shadow. Never add a shadow to something that isn't actually floating above something else.

## Shapes

Rounded corners throughout, no sharp edges anywhere. Radius scales roughly with the size and prominence of the element: small controls (badges, checkboxes) use 4–6px, standard inputs and buttons use 7–8px, cards/panels/modals use 10px, and pill-shaped filter chips use 20px (fully rounded for their height). Borders are always 1–1.5px, never heavier.

## Components

### Buttons
- **Shape:** 10px radius (`{rounded.lg}`) for primary actions, 8px (`{rounded.md}`) for nav/icon buttons.
- **Primary:** Ink background, paper text, no border (`button-primary`). Used for the main call-to-action per screen ("Maak weekplan", "Recept opslaan").
- **Nav/Icon:** Panel background, ink text/icon, 1px line border, fixed height 34–44px (`button-nav`). Used for week navigation arrows, the Ingrediënten/Recepten header buttons, and the lock toggle.
- **Destructive:** Rust background or rust icon color, used only for delete/remove actions and the thumbs-down review path.
- **Ghost/ink-text:** No background or border, ink or sage colored text only — used for lightweight actions like "Terug naar planning" and the pencil-edit affordance.

### Chips (filter pills)
- **Style:** Paper background at rest, 20px pill radius, 1.5px border in the category's color when active (e.g. sage border for the active "Vegetarisch" filter), line-colored border when inactive.
- **State:** Active state also tints the background with the category color at low opacity (`{color}22` in code) and colors the text to match.

### List Rows (signature pattern)
- **Corner Style:** None — rows are full-width with a bottom border (`line` or `divider-soft`), not individually rounded cards.
- **Background:** Transparent by default; a very light sage tint (`rgba(92,122,94,0.07)`) marks "today" in the day grid.
- **Layout:** Icon/indicator (left) → primary content, flex-1 (middle) → action(s) (right). This exact skeleton repeats in the day grid, Recepten list, and Ingrediënten list.
- **Shadow Strategy:** None — see Elevation & Depth. Rows are page content, not floating surfaces.

### Store Badges (signature component)
- **Style:** Small pill/rounded-square badges (5px radius) showing a store initial (L / AH / E). Bio state: filled with the store's categorical color, white text, small leaf icon. Non-bio: outlined in the store color, colored text, no fill. Unavailable/unset: faint gray outline and text.
- **Interaction:** Tap-to-cycle through bio → non-bio → unavailable. Locked (grayed, non-interactive) until the row's pencil unlocks editing — this lock/unlock pairing is a deliberate, reusable pattern (see Ingredient Row below).
- **Grocery-list variant:** The same three colors reappear as full-section background tints (`rgba(color, 0.14–0.16)`) grouping grocery items by which store to buy them at.

### Ingredient Row (signature interaction pattern)
- **Style:** Name renders as plain text by default (not an input) with a pencil icon to its left. Tapping the pencil reveals an editable text field and simultaneously unlocks the store badges on the same row.
- **Rule:** Nothing on a list row is editable until its own pencil is tapped — this is the app's general answer to "how do we show data is editable without every row looking like a form."

### Modal
- **Backdrop:** Full-screen, `rgba(35,40,35,0.55)`, dismiss on click-outside or Escape.
- **Panel:** Centered, max-width 520px, panel or paper background, 10px radius. **No shadow today — this is the primary place the committed elevation direction should land** (see Elevation & Depth's "Lift" shadow).

### Custom Slider (signature component)
- **Style:** Thick track (11px, `slider-track` colored) with a large 25px sage thumb — deliberately oversized compared to a default range input, so the "Meeste bio / Minste ritjes" choice reads as an important decision, not a minor setting. Labels on either end bold and colored (ink when active, muted-text when not) to show current position without relying on the thumb alone.

### Lock Toggle (signature component)
- **Style:** Small square button (44×44), same radius as a standard button. Unlocked: panel background, open-lock icon. Locked: solid sage fill, white closed-lock icon. The fill change (not just the icon) is what makes the state legible at a glance.

## Do's and Don'ts

### Do:
- **Do** use JetBrains Mono for any number the user would treat as data (quantity, date, prep time, count) — never for headings or general prose.
- **Do** keep sage as the only "positive/active" accent color; reach for a neutral or the relevant categorical color instead of introducing a new accent.
- **Do** give floating/overlaid surfaces (modals, dropdowns) a real shadow now that the direction has shifted — don't leave new modals borderless-and-flat like the current one.
- **Do** keep list rows (day grid, Recepten, Ingrediënten) flat with a bottom border — they're page content, not cards.
- **Do** lock editable row fields behind a pencil tap by default, matching the Ingredient Row pattern, for any future editable list.

### Don't:
- **Don't** add a shadow to something that isn't actually floating above other content (see the Page vs. Float Rule).
- **Don't** introduce a second general-purpose accent color alongside sage.
- **Don't** repurpose rust for anything other than "vlees" or a destructive/negative action — it's the app's only warning color and needs to stay legible as one.
- **Don't** use AH-blue for a third meaning beyond "vis" and "Albert Heijn" — it's already carrying two.
