# Template — Note de recherche action (Equity Research Note)

This project is a **reusable template** for institutional-style equity research notes
(French by default), built as a single screen-readable HTML page that also prints
cleanly to A4 PDF. The reference implementation is the **Roche Q1 2026** note.

## What to ask the user for (a new note)
- The source material: an earnings release / results doc / their own draft (any format).
- Company name + ticker + exchange + sector.
- The call: recommendation (Acheter / Renforcer / Conserver / Alléger / Vendre),
  target price, current price, and key stats for the tear sheet.
- The chart data (the template rebuilds every chart natively — see charts.js).
- House/analyst signature (defaults to the fictional "Helvetia Research").

## Files
- `Roche Q1 2026 - Note de recherche.html` — the note (masthead, tear sheet,
  contents rail, 5 sections, figures, scenario cards, target ladder, colophon).
  Plus a Tweaks island (palette / typography / density) that drives CSS variables.
- `Roche Q1 2026 - Note de recherche-print.html` — print build: identical content,
  React/Tweaks stripped, auto-`window.print()` on load. Delivered via `open_for_print`.
- `styles.css` — the design system. All visual decisions live here.
- `charts.js` — native SVG chart library + the per-note CHART registry/data.

## Design system (styles.css)
- Theming is driven by attributes on `<html>`: `data-palette`, `data-type`, `data-density`.
- **Palettes** (`:root` = navy default, plus `[data-palette="forest|ink|swiss"]`):
  every colour is a `--c-*` custom property (`--c-ink`, `--c-accent`, `--c-pos`,
  `--c-neg`, `--c-bar`, `--c-grid`, `--c-paper`, `--c-canvas` …). Never hard-code colours.
- **Type**: `--font-display` (Source Serif 4), `--font-body` (IBM Plex Sans),
  `--font-mono` (IBM Plex Mono). `[data-type="sans|serif"]` re-pairs them.
- **Density**: `[data-density="compact|regular|comfy"]` scales `--space` and `--base-fs`.
- Print: `@media print` collapses to a two-column (contents rail + body) A4 layout.
  Keep `break-inside: avoid` on SMALL blocks only (figures, cards, tables) — never on
  whole `.section`s (they're taller than a page and would clip/overflow).

## Charts (charts.js) — rebuild, never paste bitmaps
Charts read CSS classes (`.bar .hi .pos .neg .bar2 .line .area`) that map to the
palette vars, so they recolour live with the Tweaks. To make a new note:
1. Replace the data objects inside the `CHARTS` registry at the bottom of charts.js.
2. Chart builders available: `columnChart` (vertical, supports negatives + refLine),
   `groupedChart` (multi-series), `barRows` (horizontal ranked), `lineArea`,
   and `ladder` (custom price-target axis). Reuse these — add a builder only if needed.
3. Each `<figure>` in the HTML mounts a chart via `<div data-chart="ID"></div>`.

## Reuse checklist for a new company
1. Duplicate the HTML; swap masthead, title block, tear sheet figures, recommendation
   scale position, and the 5 sections' prose with the new content (keep the structure).
2. Update the `CHARTS` registry data in charts.js + the `data-chart` ids in the figures.
3. Keep `data-screen-label` attributes on sections for comment context.
4. Regenerate the `-print.html` copy (same content, drop the React/Tweaks scripts,
   keep the auto-print script) and deliver with `open_for_print`.
5. Default palette = navy; offer the others via the existing Tweaks panel.

## Guardrails
- This is a visual/design template only. Any company, figures, or names in the
  reference note are illustrative — always replace with the user's real data.
- Keep the regulatory disclaimer in the colophon; it states the note is illustrative
  and not investment advice.
