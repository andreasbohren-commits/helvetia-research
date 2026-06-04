# /new-note — Generate a Helvetia Research equity note

Create a new standalone HTML equity research note using the Helvetia Research template. The output is a single self-contained `.html` file with inlined CSS, SVG charts, and a React tweaks panel — no build step required.

## What to collect from the user

Ask for everything below before writing any code. If the user's message already supplies some fields, pre-fill them and only ask for what's missing.

### Identity
- **Company name** — full legal name (e.g. "Apple Inc.")
- **Ticker** — e.g. AAPL
- **Exchange** — e.g. NASDAQ, NYSE, SIX, LSE
- **Sector** — e.g. Technology, Healthcare, Financials
- **Country** — e.g. United States, Switzerland

### Recommendation & pricing
- **Rating** — one of: Sell / Reduce / Hold / Overweight / Buy
- **Price target** — with currency symbol
- **Current price** — with currency symbol
- **Currency** — e.g. $, CHF, €, £

### Earnings snapshot (most recent quarter)
- **Quarter label** — e.g. "Q2 2026" or "FY2025"
- **Revenue** — reported figure + currency + unit (B = billion, M = million)
- **Revenue growth YoY** — %
- **Revenue vs. consensus** — beat/miss in bps or %
- **EPS** — reported diluted EPS
- **EPS vs. consensus** — beat/miss in %
- **Gross margin** — %
- **Price reaction on day** — %

### Guidance
- **Next-quarter or full-year guidance** — a short string, e.g. "+14 to +17% YoY" or "CHF 61–63B"

### Segments (up to 6)
For each segment: name, revenue ($B or local currency), YoY growth %

### Geography (up to 5 regions)
For each region: name, revenue ($B or local currency)

### Narrative
- **3–5 key points** — the headline takeaways an investor needs
- **Bull / Base / Bear scenarios** — price range + one-sentence rationale for each

### Source material (optional)
If the user attaches a press release, earnings HTML, or PDF, extract all of the above from it automatically and confirm with the user before generating.

---

## How to generate the file

1. **Copy `aapl.html`** as the starting template — it has all chart builders, the design system, and the tweaks panel already inlined.
2. **Replace every piece of company-specific content**:
   - `<html lang>` → `"en"` (or match the note's language)
   - `<title>` and all meta strings
   - Masthead right: country + sector + note type
   - Title block: eyebrow, `<h1>`, subtitle, doc-meta
   - Tear sheet: company name, ticker, exchange, sector, rating badge, target/price/upside figs, stats grid
   - Rating scale: set `active` on the correct segment (1=Sell, 2=Reduce, 3=Hold, 4=Overweight, 5=Buy)
   - TOC + all 5 sections (prose, subheads, tables, callouts)
   - Colophon: company, date, rating, target
   - Disclaimer: keep as-is (it's illustrative)
3. **Rebuild the `CHARTS` registry** with new data. Reuse these chart types:
   - `columnChart` — quarterly YoY growth bars, segment growth, headwinds/catalysts, guidance range, revenue absolute
   - `groupedChart` — consensus beat (revenue + EPS side-by-side)
   - `barRows` — segment revenue ranked, geography ranked
   - `lineArea` — margin trend over quarters
   - `ladder` — price target axis with bear/base/bull zones
   Aim for 10–12 charts. Highlight the most recent data points with `cls:"hi"` (accent color) and `cls:"pos"` (green) / `cls:"neg"` (red) for positive/negative.
4. **Output filename**: `<ticker-lowercase>.html` in the repo root (e.g. `nvda.html`).
5. After writing the file, commit it with `git -c gpg.format=openpgp -c commit.gpgsign=false commit`.
6. Deliver via `SendUserFile`.

---

## Design rules to preserve

- **No hardcoded colors** — use only CSS classes (`.hi`, `.pos`, `.neg`, `.bar`, `.bar2`) on chart elements; they re-color live with palette changes.
- **Numbers in English format** — periods as decimal separators, "B" for billions, "M" for millions, "bps" for basis points.
- **Recommendation scale** always has exactly 5 segments: Sell / Reduce / Hold / Overweight / Buy.
- **Tweaks panel labels** in English: palette names (Navy + Gold, Forest Green, Ink + Bordeaux, Clean Swiss), typography (Serif Headings / All Sans / All Serif), density (Compact / Standard / Spacious).
- The `<html lang>` attribute should match the language of the note.
- Preserve the `data-screen-label` attributes on sections.

---

## Quick reference — chart builder signatures

```js
columnChart({ data, yMin, yMax, ticks, yfmt, fmt, height, padL, barWidth, refLine })
// data: [{label, value, cls?}] — label can be a string or [line1, line2]

groupedChart({ data, series, yMin, yMax, ticks, yfmt, fmt, height })
// data: [{label, values:[v1,v2,...]}], series:[{name,cls}]

barRows({ data, max, padL, fmt })
// data: [{label, value, cls?}] — horizontal ranked bars

lineArea({ data, yMin, yMax, ticks, yfmt, fmt, height })
// data: [{label, value}] — connected line with area fill

ladder({ min, max, axisTicks, zones, markers })
// zones: [{from,to,cls,label}], markers:[{value,label,k,color,up}]
```

## Example invocation

```
/new-note

Company: NVIDIA Corporation
Ticker: NVDA  Exchange: NASDAQ  Sector: Technology
Rating: Buy  Target: $175  Current: $131  Currency: $
Quarter: Q1 FY2026  Revenue: $44.1B  Growth: +69% YoY  vs consensus: +4%
EPS: $0.96  EPS beat: +7%  Gross margin: 78.4%  Price reaction: +8%
Guidance: Q2 FY2026 revenue ~$45B ±2%
Segments: Data Center $39.1B +73%, Gaming $3.8B +48%, Pro Viz $0.5B +19%
Bull: $210 — hyperscaler capex acceleration. Base: $175 — steady AI demand. Bear: $100 — export controls tighten.
```
