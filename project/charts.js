/* =========================================================================
   HELVETIA RESEARCH — native SVG chart library (vanilla, themeable)
   All colours come from CSS classes (.bar/.hi/.pos/.neg/.line ...) which map
   to CSS custom properties, so charts recolour live with the Tweaks panel.
   Charts render into <figure>'s [data-chart] slot from the CHARTS registry.
   ========================================================================= */
(function () {
  "use strict";

  const VW = 760; // virtual viewBox width

  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function svgWrap(h, inner){
    return `<svg class="svgchart" viewBox="0 0 ${VW} ${h}" preserveAspectRatio="xMidYMid meet" role="img">${inner}</svg>`;
  }
  function niceTicks(min, max, count){
    const span = max - min;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1; else if (norm < 3) step = 2; else if (norm < 7) step = 5; else step = 10;
    step *= mag;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let v = start; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return ticks;
  }
  function catLines(label){ return Array.isArray(label) ? label : [label]; }

  /* ---------------- Vertical column chart (supports negatives) --------- */
  function columnChart(cfg){
    const data = cfg.data;
    const n = data.length;
    const maxLines = Math.max(...data.map(d => catLines(d.label).length));
    const padT = 40, padR = 18, padL = cfg.padL != null ? cfg.padL : 46;
    const padB = 16 + maxLines * 15;
    const H = cfg.height || 330;
    const x0 = padL, x1 = VW - padR, y0 = H - padB, yTop = padT;
    const yMin = cfg.yMin != null ? cfg.yMin : 0;
    const yMax = cfg.yMax;
    const ySc = v => y0 - (v - yMin) / (yMax - yMin) * (y0 - yTop);
    const zeroY = ySc(Math.max(0, yMin));
    const fmt = cfg.fmt || (v => v);
    const slot = (x1 - x0) / n;
    const bw = Math.min(cfg.barWidth || 64, slot * 0.56);
    let s = "";

    // gridlines + y labels
    const ticks = cfg.ticks || niceTicks(yMin, yMax, 4);
    ticks.forEach(t => {
      const y = ySc(t);
      s += `<line class="gl" x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}"/>`;
      s += `<text class="glabel" x="${x0 - 9}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="11">${esc(cfg.yfmt ? cfg.yfmt(t) : t)}</text>`;
    });
    // baseline
    s += `<line class="baseline" x1="${x0}" y1="${zeroY.toFixed(1)}" x2="${x1}" y2="${zeroY.toFixed(1)}" stroke-width="1.4"/>`;

    data.forEach((d, i) => {
      const cx = x0 + slot * (i + 0.5);
      const x = cx - bw / 2;
      const vy = ySc(d.value);
      const top = Math.min(vy, zeroY), h = Math.abs(vy - zeroY);
      const cls = d.cls || (cfg.allHi ? "hi" : "bar");
      s += `<rect class="bar ${cls}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,h).toFixed(1)}"/>`;
      // value label
      const lblY = d.value >= 0 ? top - 11 : top + h + 19;
      s += `<text class="val" x="${cx.toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-size="15" font-weight="700">${esc(fmt(d.value))}</text>`;
      // category
      const lines = catLines(d.label);
      lines.forEach((ln, li) => {
        s += `<text class="cat" x="${cx.toFixed(1)}" y="${(y0 + 18 + li * 15).toFixed(1)}" text-anchor="middle" font-size="11.5">${esc(ln)}</text>`;
      });
    });

    // reference line
    if (cfg.refLine){
      const y = ySc(cfg.refLine.value);
      s += `<line class="refline" x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}"/>`;
      if (cfg.refLine.label)
        s += `<text x="${x0 + 4}" y="${(y - 8).toFixed(1)}" text-anchor="start" font-size="10.5" class="glabel" letter-spacing=".1em" style="fill:var(--c-accent-2)">${esc(cfg.refLine.label)}</text>`;
    }
    return svgWrap(H, s);
  }

  /* ---------------- Grouped columns (multi-series) --------------------- */
  function groupedChart(cfg){
    const data = cfg.data, series = cfg.series, ns = series.length;
    const n = data.length;
    const padT = 40, padR = 18, padL = 46, padB = 46;
    const H = cfg.height || 340;
    const x0 = padL, x1 = VW - padR, y0 = H - padB, yTop = padT;
    const yMin = cfg.yMin != null ? cfg.yMin : 0, yMax = cfg.yMax;
    const ySc = v => y0 - (v - yMin) / (yMax - yMin) * (y0 - yTop);
    const zeroY = ySc(Math.max(0, yMin));
    const fmt = cfg.fmt || (v => v);
    const slot = (x1 - x0) / n;
    const groupW = Math.min(slot * 0.62, 150);
    const bw = groupW / ns - 6;
    let s = "";
    const ticks = cfg.ticks || niceTicks(yMin, yMax, 4);
    ticks.forEach(t => {
      const y = ySc(t);
      s += `<line class="gl" x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}"/>`;
      s += `<text class="glabel" x="${x0 - 9}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="11">${esc(cfg.yfmt ? cfg.yfmt(t) : t)}</text>`;
    });
    s += `<line class="baseline" x1="${x0}" y1="${zeroY.toFixed(1)}" x2="${x1}" y2="${zeroY.toFixed(1)}" stroke-width="1.4"/>`;
    data.forEach((d, i) => {
      const gx = x0 + slot * (i + 0.5) - groupW / 2;
      series.forEach((se, j) => {
        const v = d.values[j];
        const x = gx + j * (bw + 6) + 3;
        const vy = ySc(v);
        const top = Math.min(vy, zeroY), h = Math.abs(vy - zeroY);
        s += `<rect class="bar ${se.cls}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,h).toFixed(1)}"/>`;
        const lblY = v >= 0 ? top - 8 : top + h + 16;
        s += `<text class="val" x="${(x + bw/2).toFixed(1)}" y="${lblY.toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="700">${esc(fmt(v))}</text>`;
      });
      const cx = x0 + slot * (i + 0.5);
      catLines(d.label).forEach((ln, li) => {
        s += `<text class="cat" x="${cx.toFixed(1)}" y="${(y0 + 18 + li * 15).toFixed(1)}" text-anchor="middle" font-size="11.5">${esc(ln)}</text>`;
      });
    });
    return svgWrap(H, s);
  }

  /* ---------------- Horizontal ranked bars ----------------------------- */
  function barRows(cfg){
    const data = cfg.data, n = data.length;
    const rowH = cfg.rowH || 34, gap = 12;
    const padT = 8, padB = 8, padL = cfg.padL || 130, padR = 70;
    const H = padT + padB + n * rowH + (n - 1) * gap;
    const x0 = padL, x1 = VW - padR;
    const max = cfg.max || Math.max(...data.map(d => d.value));
    const xSc = v => x0 + (v / max) * (x1 - x0);
    const fmt = cfg.fmt || (v => v);
    let s = "";
    data.forEach((d, i) => {
      const y = padT + i * (rowH + gap);
      const w = xSc(d.value) - x0;
      s += `<rect class="bar ${d.cls || 'bar'}" x="${x0}" y="${y}" width="${Math.max(2,w).toFixed(1)}" height="${rowH}"/>`;
      s += `<text class="cat" x="${x0 - 14}" y="${(y + rowH/2 + 4).toFixed(1)}" text-anchor="end" font-size="12.5">${esc(d.label)}</text>`;
      s += `<text class="val" x="${(x0 + w + 12).toFixed(1)}" y="${(y + rowH/2 + 4.5).toFixed(1)}" font-size="13.5" font-weight="700">${esc(fmt(d.value))}</text>`;
    });
    return svgWrap(H, s);
  }

  /* ---------------- Line / area chart ---------------------------------- */
  function lineArea(cfg){
    const pts = cfg.data, n = pts.length;
    const padT = 40, padR = 24, padL = 46, padB = 44;
    const H = cfg.height || 320;
    const x0 = padL, x1 = VW - padR, y0 = H - padB, yTop = padT;
    const yMin = cfg.yMin, yMax = cfg.yMax;
    const ySc = v => y0 - (v - yMin) / (yMax - yMin) * (y0 - yTop);
    const xSc = i => x0 + (i / (n - 1)) * (x1 - x0);
    const fmt = cfg.fmt || (v => v);
    let s = "";
    const ticks = cfg.ticks || niceTicks(yMin, yMax, 4);
    ticks.forEach(t => {
      const y = ySc(t);
      s += `<line class="gl" x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}"/>`;
      s += `<text class="glabel" x="${x0 - 9}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="11">${esc(cfg.yfmt ? cfg.yfmt(t) : t)}</text>`;
    });
    let line = "", area = `M ${x0} ${y0} `;
    pts.forEach((p, i) => {
      const x = xSc(i), y = ySc(p.value);
      line += (i === 0 ? "M" : "L") + ` ${x.toFixed(1)} ${y.toFixed(1)} `;
      area += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
    });
    area += `L ${x1} ${y0} Z`;
    s += `<path class="area" d="${area}"/>`;
    s += `<path class="line" d="${line}"/>`;
    pts.forEach((p, i) => {
      const x = xSc(i), y = ySc(p.value);
      s += `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/>`;
      s += `<text class="val" x="${x.toFixed(1)}" y="${(y - 14).toFixed(1)}" text-anchor="middle" font-size="14.5" font-weight="700">${esc(fmt(p.value))}</text>`;
      catLines(p.label).forEach((ln, li) => {
        s += `<text class="cat" x="${x.toFixed(1)}" y="${(y0 + 18 + li * 15).toFixed(1)}" text-anchor="middle" font-size="11.5">${esc(ln)}</text>`;
      });
    });
    return svgWrap(H, s);
  }

  /* ---------------- Price-target ladder (custom) ----------------------- */
  function ladder(cfg){
    const H = 150, padL = 22, padR = 22, top = 64;
    const x0 = padL, x1 = VW - padR;
    const lo = cfg.min, hi = cfg.max;
    const xSc = v => x0 + (v - lo) / (hi - lo) * (x1 - x0);
    let s = "";
    // zones
    (cfg.zones || []).forEach(z => {
      const a = xSc(z.from), b = xSc(z.to);
      s += `<rect class="bar ${z.cls}" x="${a.toFixed(1)}" y="${top - 7}" width="${(b-a).toFixed(1)}" height="14" opacity="0.18"/>`;
      s += `<text class="cat" x="${((a+b)/2).toFixed(1)}" y="${top - 16}" text-anchor="middle" font-size="11" letter-spacing=".06em">${esc(z.label)}</text>`;
    });
    // axis
    s += `<line class="baseline" x1="${x0}" y1="${top}" x2="${x1}" y2="${top}" stroke-width="2"/>`;
    // axis ticks
    (cfg.axisTicks || []).forEach(t => {
      const x = xSc(t);
      s += `<line class="gl" x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${top + 6}"/>`;
      s += `<text class="glabel" x="${x.toFixed(1)}" y="${top + 20}" text-anchor="middle" font-size="10.5">${esc(t)}</text>`;
    });
    // markers
    (cfg.markers || []).forEach(m => {
      const x = xSc(m.value);
      const up = m.up !== false;
      const ty = up ? top - 30 : top + 38;
      s += `<line x1="${x.toFixed(1)}" y1="${top}" x2="${x.toFixed(1)}" y2="${(up?top-22:top+22).toFixed(1)}" stroke="var(--c-${m.color||'ink'})" stroke-width="2"/>`;
      s += `<circle cx="${x.toFixed(1)}" cy="${top}" r="5.5" fill="var(--c-${m.color||'ink'})"/>`;
      s += `<text x="${x.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-size="13.5" font-weight="700" fill="var(--c-${m.color||'ink'})" font-family="var(--font-display)">${esc(m.label)}</text>`;
      s += `<text x="${x.toFixed(1)}" y="${(up?ty-15:ty+15).toFixed(1)}" text-anchor="middle" font-size="9" class="glabel" letter-spacing=".14em">${esc(m.k)}</text>`;
    });
    return svgWrap(H, s);
  }

  /* ============================ CHART REGISTRY ========================= */
  const pct1 = v => (v > 0 ? "+" : "") + v.toFixed(1) + "%";
  const pct1np = v => v.toFixed(1) + "%";

  const CHARTS = {
    sales_cer: () => columnChart({
      height: 340, yMin: 0, yMax: 8, ticks: [0,2,4,6,8], yfmt: v => v,
      fmt: pct1np,
      refLine: { value: 6.0, label: "Q1 2026 · 6,0 %" },
      data: [
        { label: ["Q1","2024"], value: 2.5 }, { label: ["Q2","2024"], value: 3.2 },
        { label: ["Q3","2024"], value: 4.1 }, { label: ["Q4","2024"], value: 5.2 },
        { label: ["Q1","2025"], value: 4.8 }, { label: ["Q2","2025"], value: 5.5 },
        { label: ["Q4","2025"], value: 6.8, cls: "hi" }, { label: ["Q1","2026"], value: 6.0, cls: "hi" }
      ]
    }),
    divisions: () => columnChart({
      height: 320, yMin: 0, yMax: 8, ticks: [0,2,4,6,8], fmt: v => "+"+v.toFixed(1)+"%",
      barWidth: 150,
      data: [ { label: "Pharma", value: 7.0, cls: "pos" }, { label: "Diagnostics", value: 3.0, cls: "bar" } ]
    }),
    currency: () => groupedChart({
      height: 350, yMin: -6, yMax: 8, ticks: [-6,-4,-2,0,2,4,6,8], fmt: pct1,
      series: [ { name: "Taux constant (CER)", cls: "pos" }, { name: "CHF publié", cls: "neg" } ],
      data: [
        { label: ["Q1","2025"], values: [4.8, -2.1] },
        { label: ["Q4","2025"], values: [6.8, 1.5] },
        { label: ["Q1","2026"], values: [6.0, -5.0] }
      ]
    }),
    products: () => columnChart({
      height: 360, yMin: 0, yMax: 30, ticks: [0,10,20,30], fmt: v => "+"+v.toFixed(1)+"%",
      data: [
        { label: "Xolair", value: 26.0, cls: "hi" },
        { label: ["Oncologie &","hématologie"], value: 8.0 },
        { label: "Immunologie", value: 5.0 },
        { label: ["Soins de","spécialité"], value: 3.5 }
      ]
    }),
    biosimilar: () => barRows({
      max: 340, fmt: v => "CHF " + v + " m",
      data: [
        { label: "Herceptin", value: 320, cls: "neg" },
        { label: "Avastin",   value: 250, cls: "neg" },
        { label: "MabThera",  value: 210, cls: "neg" },
        { label: "Lucentis",  value: 140, cls: "neg" },
        { label: "Autres",    value: 100, cls: "bar" },
        { label: "Actemra",   value: 80,  cls: "neg" }
      ]
    }),
    consensus: () => columnChart({
      height: 320, yMin: 56, yMax: 64, ticks: [56,58,60,62,64], padL: 50,
      yfmt: v => v, fmt: v => "CHF " + v.toFixed(v % 1 ? 2 : 1) + " mrd",
      barWidth: 120,
      data: [
        { label: ["Estimation","basse"], value: 59.5, cls: "bar2" },
        { label: ["Moyenne","consensus"], value: 61.47, cls: "hi" },
        { label: ["Estimation","haute"], value: 63.5, cls: "bar" }
      ]
    }),
    pipeline: () => columnChart({
      height: 330, yMin: 0, yMax: 7, ticks: [0,2,4,6], fmt: v => "CHF " + v.toFixed(1) + " mrd",
      data: [
        { label: ["Phase III","pipeline"], value: 5.9, cls: "pos" },
        { label: ["Phase II","pipeline"], value: 2.8, cls: "bar" },
        { label: ["Phase I","pipeline"], value: 1.2, cls: "bar" }
      ]
    }),
    headwinds: () => columnChart({
      height: 360, yMin: -1.5, yMax: 1.5, ticks: [-1.5,-1,-0.5,0,0.5,1,1.5],
      yfmt: v => v.toFixed(1), fmt: pct1,
      data: [
        { label: ["Biosimilaire","LOE"], value: -1.0, cls: "neg" },
        { label: ["Force","du CHF"], value: -0.7, cls: "neg" },
        { label: ["Croissance","pipeline"], value: 1.2, cls: "pos" },
        { label: ["Expansion","US"], value: 0.8, cls: "pos" },
        { label: ["Amélioration","marge"], value: 0.6, cls: "pos" }
      ]
    }),
    margin: () => lineArea({
      height: 320, yMin: 31, yMax: 35.5, ticks: [31,32,33,34,35], yfmt: v => v.toFixed(0)+"%",
      fmt: v => v.toFixed(1) + "%",
      data: [ { label: "Q1 2025", value: 32.5 }, { label: "Q4 2025", value: 34.2 }, { label: "Q1 2026", value: 33.8 } ]
    }),
    sales_chf: () => columnChart({
      height: 330, yMin: 14, yMax: 17, ticks: [14,15,16,17], padL: 50,
      yfmt: v => v.toFixed(0), fmt: v => "CHF " + v.toFixed(1) + " mrd",
      barWidth: 120,
      data: [
        { label: ["Q1","2025"], value: 15.5, cls: "bar" },
        { label: ["Q4","2025"], value: 16.2, cls: "hi" },
        { label: ["Q1","2026"], value: 14.7, cls: "neg" }
      ]
    }),
    reaction: () => columnChart({
      height: 320, yMin: 246, yMax: 258, ticks: [246,249,252,255,258], padL: 50,
      yfmt: v => v, fmt: v => "CHF " + v.toFixed(2), barWidth: 110,
      data: [
        { label: ["Avant","résultats"], value: 249.20, cls: "bar2" },
        { label: ["Annonce","résultats"], value: 249.20, cls: "bar" },
        { label: ["Après","résultats"], value: 254.80, cls: "pos" }
      ]
    }),
    targetladder: () => ladder({
      min: 210, max: 330,
      axisTicks: [220, 240, 260, 280, 300, 320],
      zones: [
        { from: 220, to: 240, cls: "neg", label: "Scénario baissier" },
        { from: 295, to: 320, cls: "pos", label: "Scénario haussier" }
      ],
      markers: [
        { value: 254.80, label: "CHF 254,80", k: "PRIX ACTUEL", color: "ink", up: false },
        { value: 280, label: "CHF 280", k: "OBJECTIF · CONSERVER", color: "accent", up: true }
      ]
    })
  };

  function renderAll(){
    document.querySelectorAll("[data-chart]").forEach(el => {
      const id = el.getAttribute("data-chart");
      if (CHARTS[id]) el.innerHTML = CHARTS[id]();
    });
  }
  window.RocheCharts = { renderAll, CHARTS };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", renderAll);
  else renderAll();
})();
