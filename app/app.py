import os
import re
import json
from datetime import datetime
from flask import Flask, render_template, request

import anthropic

app = Flask(__name__)

RATING_INDEX = {"Sell": 0, "Reduce": 1, "Hold": 2, "Overweight": 3, "Buy": 4}

# ── Jinja2 filter: **text** → <strong>text</strong> ────────────────────────────
@app.template_filter("mbold")
def mbold_filter(text):
    return re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", str(text or ""))


# ── Tool schema for Claude ─────────────────────────────────────────────────────
EQUITY_TOOL = {
    "name": "equity_report",
    "description": (
        "Generate a complete, publication-quality equity research initiation note. "
        "Use real financial knowledge about the company. All figures in English format "
        "(periods as decimal separators, B=billions, M=millions). "
        "Use **word** markdown for bold emphasis in prose fields."
    ),
    "input_schema": {
        "type": "object",
        "required": [
            "company", "rating", "target_price", "current_price", "currency_symbol",
            "metrics_label", "metrics", "doc_title", "doc_subtitle",
            "thesis_lead", "key_points", "section2", "section3", "section4", "section5",
            "financial_table", "scenarios", "charts"
        ],
        "properties": {
            "company": {
                "type": "object",
                "required": ["name", "ticker", "exchange", "sector", "country"],
                "properties": {
                    "name":     {"type": "string"},
                    "ticker":   {"type": "string"},
                    "exchange": {"type": "string"},
                    "sector":   {"type": "string"},
                    "country":  {"type": "string"}
                }
            },
            "rating": {"type": "string", "enum": ["Sell", "Reduce", "Hold", "Overweight", "Buy"]},
            "target_price":    {"type": "number"},
            "current_price":   {"type": "number"},
            "currency_symbol": {"type": "string", "description": "e.g. '$', 'CHF', '€', '£'"},
            "metrics_label":   {"type": "string", "description": "e.g. 'FY2025A', 'Q1 2026'"},
            "metrics": {
                "type": "array",
                "description": "Exactly 6 key financial metrics for the tear sheet",
                "minItems": 6, "maxItems": 6,
                "items": {
                    "type": "object",
                    "required": ["key", "value"],
                    "properties": {
                        "key":      {"type": "string"},
                        "value":    {"type": "string"},
                        "positive": {"type": ["boolean", "null"], "description": "true=green, false=red, null=neutral"}
                    }
                }
            },
            "doc_title":    {"type": "string", "description": "Headline, max 10 words"},
            "doc_subtitle": {"type": "string", "description": "1-2 sentence investment thesis summary"},
            "thesis_lead": {
                "type": "string",
                "description": "Opening lead paragraph for the thesis section (2-3 sentences). Use **bold** for emphasis."
            },
            "key_points": {
                "type": "array", "minItems": 4, "maxItems": 5,
                "items": {
                    "type": "object",
                    "required": ["title", "text"],
                    "properties": {
                        "title": {"type": "string", "description": "Bold headline, max 8 words"},
                        "text":  {"type": "string", "description": "2-3 sentences with specific data. Use **bold** for numbers."}
                    }
                }
            },
            "section2": {
                "type": "object",
                "description": "Business Model & Competitive Position",
                "required": ["subhead1", "prose1", "subhead2", "prose2"],
                "properties": {
                    "subhead1":           {"type": "string"},
                    "prose1":             {"type": "string", "description": "1-2 paragraphs on business model. Use **bold** for emphasis."},
                    "subhead2":           {"type": "string"},
                    "prose2":             {"type": "string", "description": "1-2 paragraphs on competitive position and peers."},
                    "peer_metric_label":  {"type": "string", "description": "Metric shown in peer_comparison chart, e.g. 'Forward P/E', 'Core ROE'"}
                }
            },
            "section3": {
                "type": "object",
                "description": "Financial Performance & Outlook",
                "required": ["subhead1", "prose1", "subhead2", "prose2"],
                "properties": {
                    "subhead1": {"type": "string"},
                    "prose1":   {"type": "string", "description": "1-2 paragraphs on historical track record."},
                    "subhead2": {"type": "string"},
                    "prose2":   {"type": "string", "description": "1-2 paragraphs on margin structure and EPS outlook."}
                }
            },
            "section4": {
                "type": "object",
                "description": "Valuation & Investment Analysis",
                "required": ["prose"],
                "properties": {
                    "prose": {"type": "string", "description": "2 paragraphs on DCF, comps, and valuation conclusion."}
                }
            },
            "section5": {
                "type": "object",
                "description": "Conclusion",
                "required": ["bigquote", "prose", "callout"],
                "properties": {
                    "bigquote": {"type": "string", "description": "Memorable 1-line pull quote summarising the note, max 12 words"},
                    "prose":    {"type": "string"},
                    "callout":  {"type": "string", "description": "Action-oriented conclusion: entry strategy and key catalysts to watch."}
                }
            },
            "financial_table": {
                "type": "array",
                "description": "5-6 years of annual financial projections",
                "items": {
                    "type": "object",
                    "required": ["year", "revenue", "growth", "gross_margin", "op_margin", "eps", "highlight"],
                    "properties": {
                        "year":         {"type": "string", "description": "e.g. 'FY2026A' or '2025A'"},
                        "revenue":      {"type": "string", "description": "Formatted, e.g. '$215.9B'"},
                        "growth":       {"type": "string", "description": "e.g. '+7.7%'"},
                        "gross_margin": {"type": "string"},
                        "op_margin":    {"type": "string"},
                        "eps":          {"type": "string", "description": "e.g. '$4.05' or '—'"},
                        "highlight":    {"type": "boolean", "description": "True for the most recent actual year"}
                    }
                }
            },
            "scenarios": {
                "type": "object",
                "required": ["bull", "base", "bear"],
                "properties": {
                    "bull": {
                        "type": "object",
                        "required": ["probability", "price", "name", "text", "return_str"],
                        "properties": {
                            "probability": {"type": "string", "description": "e.g. '30%'"},
                            "price":       {"type": "number"},
                            "name":        {"type": "string"},
                            "text":        {"type": "string"},
                            "return_str":  {"type": "string", "description": "e.g. '+25.5%'"}
                        }
                    },
                    "base": {
                        "type": "object",
                        "required": ["probability", "price", "name", "text", "return_str"],
                        "properties": {
                            "probability": {"type": "string"},
                            "price":       {"type": "number"},
                            "name":        {"type": "string"},
                            "text":        {"type": "string"},
                            "return_str":  {"type": "string"}
                        }
                    },
                    "bear": {
                        "type": "object",
                        "required": ["probability", "price", "name", "text", "return_str"],
                        "properties": {
                            "probability": {"type": "string"},
                            "price":       {"type": "number"},
                            "name":        {"type": "string"},
                            "text":        {"type": "string"},
                            "return_str":  {"type": "string"}
                        }
                    }
                }
            },
            "charts": {
                "type": "object",
                "required": ["segments", "peer_comparison", "revenue_trend", "revenue_growth",
                             "margin_trend", "eps_trend", "targetladder", "scenarios_chart"],
                "properties": {
                    "segments": {
                        "type": "object",
                        "required": ["unit_label", "fmt_type", "data"],
                        "properties": {
                            "unit_label": {"type": "string", "description": "e.g. '$B', 'CHF B', '%', '$M'"},
                            "fmt_type":   {"type": "string", "enum": ["currency_B", "currency_M", "currency_whole", "pct1np", "multiple"]},
                            "data": {
                                "type": "array", "minItems": 2, "maxItems": 7,
                                "items": {
                                    "type": "object",
                                    "required": ["label", "value", "cls"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number"},
                                        "cls":   {"type": "string", "enum": ["hi", "bar", "bar2", "pos", "neg"]}
                                    }
                                }
                            }
                        }
                    },
                    "peer_comparison": {
                        "type": "object",
                        "required": ["metric_name", "fmt_type", "data"],
                        "properties": {
                            "metric_name": {"type": "string"},
                            "fmt_type":    {"type": "string", "enum": ["pct1np", "multiple", "currency_B", "currency_whole", "eps"]},
                            "data": {
                                "type": "array", "minItems": 3, "maxItems": 6,
                                "items": {
                                    "type": "object",
                                    "required": ["label", "value", "cls"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number"},
                                        "cls":   {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "revenue_trend": {
                        "type": "object",
                        "required": ["fmt_type", "data"],
                        "properties": {
                            "fmt_type": {"type": "string", "enum": ["currency_B", "currency_M", "currency_whole"]},
                            "data": {
                                "type": "array", "minItems": 4, "maxItems": 8,
                                "items": {
                                    "type": "object",
                                    "required": ["label", "value", "cls"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number"},
                                        "cls":   {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "revenue_growth": {
                        "type": "object",
                        "required": ["data"],
                        "properties": {
                            "data": {
                                "type": "array", "minItems": 3, "maxItems": 8,
                                "items": {
                                    "type": "object",
                                    "required": ["label", "value", "cls"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number", "description": "Percentage as number, e.g. 7.7 for 7.7%"},
                                        "cls":   {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "margin_trend": {
                        "type": "object",
                        "required": ["metric_name", "data"],
                        "properties": {
                            "metric_name": {"type": "string", "description": "e.g. 'Gross Margin', 'Core ROE', 'EBITDA Margin'"},
                            "data": {
                                "type": "array", "minItems": 4, "maxItems": 8,
                                "items": {
                                    "type": "object",
                                    "required": ["label", "value"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number", "description": "Percentage as number, e.g. 71.0 for 71%"}
                                    }
                                }
                            }
                        }
                    },
                    "eps_trend": {
                        "type": "object",
                        "required": ["metric_name", "fmt_type", "data"],
                        "properties": {
                            "metric_name": {"type": "string", "description": "e.g. 'EPS', 'DPS', 'Book Value/Share'"},
                            "fmt_type":    {"type": "string", "enum": ["eps", "currency_whole", "pct1np", "currency_B"]},
                            "data": {
                                "type": "array", "minItems": 3, "maxItems": 7,
                                "items": {
                                    "type": "object",
                                    "required": ["label", "value", "cls"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number"},
                                        "cls":   {"type": "string"}
                                    }
                                }
                            }
                        }
                    },
                    "targetladder": {
                        "type": "object",
                        "required": ["min", "max", "axis_ticks"],
                        "properties": {
                            "min":        {"type": "number"},
                            "max":        {"type": "number"},
                            "axis_ticks": {"type": "array", "items": {"type": "number"}}
                        }
                    },
                    "scenarios_chart": {
                        "type": "object",
                        "required": ["data"],
                        "properties": {
                            "data": {
                                "type": "array", "minItems": 3, "maxItems": 4,
                                "items": {
                                    "type": "object",
                                    "required": ["label", "value", "cls"],
                                    "properties": {
                                        "label": {"type": "string"},
                                        "value": {"type": "number"},
                                        "cls":   {"type": "string"}
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}


# ── Chart config builder ───────────────────────────────────────────────────────

def auto_range(values, force_zero=True, pad=0.14):
    mn, mx = min(values), max(values)
    span = (mx - mn) or (abs(mx) * 0.4) or 1
    y_max = mx + span * pad
    if force_zero and mn >= 0:
        y_min = 0
    elif mn < 0:
        y_min = mn - span * pad
    else:
        y_min = max(0, mn - span * pad)
    return round(y_min, 4), round(y_max, 4)


def build_charts_config(data: dict) -> dict:
    charts = data["charts"]
    cur = data["currency_symbol"]
    scn = data["scenarios"]
    cfg = {}

    # 1. Segments — barRows
    segs = charts["segments"]
    seg_max = max(d["value"] for d in segs["data"])
    seg_pad_l = max(160, max(len(d["label"]) for d in segs["data"]) * 8 + 24)
    cfg["segments"] = {
        "type": "barRows", "padL": seg_pad_l,
        "max": round(seg_max * 1.14, 2),
        "fmt": segs["fmt_type"],
        "data": segs["data"]
    }

    # 2. Peer comparison — barRows
    peer = charts["peer_comparison"]
    peer_max = max(d["value"] for d in peer["data"])
    peer_pad_l = max(175, max(len(d["label"]) for d in peer["data"]) * 8 + 24)
    cfg["peer_comparison"] = {
        "type": "barRows", "padL": peer_pad_l,
        "max": round(peer_max * 1.16, 2),
        "fmt": peer["fmt_type"],
        "data": peer["data"]
    }

    # 3. Revenue trend — columnChart
    rev = charts["revenue_trend"]
    rev_vals = [d["value"] for d in rev["data"]]
    y_min, y_max = auto_range(rev_vals, force_zero=True)
    cfg["revenue_trend"] = {
        "type": "columnChart", "height": 340, "padL": 58,
        "yMin": y_min, "yMax": y_max,
        "fmt": rev["fmt_type"], "yfmt": "currency_short",
        "data": rev["data"]
    }

    # 4. Revenue growth — columnChart (can be negative)
    gr = charts["revenue_growth"]
    gr_vals = [d["value"] for d in gr["data"]]
    y_min, y_max = auto_range(gr_vals, force_zero=False)
    cfg["revenue_growth"] = {
        "type": "columnChart", "height": 320,
        "yMin": y_min, "yMax": y_max,
        "fmt": "pct1np", "yfmt": "pct",
        "data": gr["data"]
    }

    # 5. Margin trend — lineArea
    mt = charts["margin_trend"]
    mt_vals = [d["value"] for d in mt["data"]]
    mt_mn, mt_mx = min(mt_vals), max(mt_vals)
    mt_span = (mt_mx - mt_mn) or mt_mx * 0.2 or 1
    cfg["margin_trend"] = {
        "type": "lineArea", "height": 300,
        "yMin": round(mt_mn - mt_span * 0.35, 2),
        "yMax": round(mt_mx + mt_span * 0.22, 2),
        "fmt": "pct1np", "yfmt": "pct",
        "data": mt["data"]
    }

    # 6. EPS / key metric trend — columnChart
    eps = charts["eps_trend"]
    eps_vals = [d["value"] for d in eps["data"]]
    y_min, y_max = auto_range(eps_vals, force_zero=True)
    cfg["eps_trend"] = {
        "type": "columnChart", "height": 320, "padL": 58, "barWidth": 88,
        "yMin": y_min, "yMax": y_max,
        "fmt": eps["fmt_type"], "yfmt": "currency",
        "data": eps["data"]
    }

    # 7. Target ladder — use scenario prices + top-level price/target
    tl = charts["targetladder"]
    bear_px = scn["bear"]["price"]
    bull_px = scn["bull"]["price"]
    target  = data["target_price"]
    current = data["current_price"]
    up_color = "accent" if data["upside_pct"] >= 0 else "neg"
    rating_upper = data["rating"].upper()
    cfg["targetladder"] = {
        "type": "ladder",
        "min": tl["min"], "max": tl["max"],
        "axisTicks": tl["axis_ticks"],
        "zones": [
            {"from": tl["min"] * 1.04, "to": bear_px * 1.04,
             "cls": "neg", "label": "Bear Case"},
            {"from": bull_px * 0.96, "to": tl["max"] * 0.96,
             "cls": "pos", "label": "Bull Case"}
        ],
        "markers": [
            {"value": current,
             "label": f"{cur}{current:.0f}",
             "k": "CURRENT PRICE", "color": "ink", "up": False},
            {"value": target,
             "label": f"{cur}{target:.0f}",
             "k": f"TARGET · {rating_upper}", "color": up_color, "up": True}
        ]
    }

    # 8. Scenarios chart — columnChart (use scenario prices for consistency)
    sc_vals = [scn["bear"]["price"], scn["base"]["price"], scn["bull"]["price"]]
    y_min, y_max = auto_range(sc_vals, force_zero=False, pad=0.12)
    cfg["scenarios_chart"] = {
        "type": "columnChart", "height": 320, "padL": 55, "barWidth": 120,
        "yMin": y_min, "yMax": y_max,
        "fmt": "currency_whole", "yfmt": "currency",
        "data": [
            {"label": "Bear Case",  "value": scn["bear"]["price"], "cls": "neg"},
            {"label": "Base Case",  "value": scn["base"]["price"], "cls": "hi"},
            {"label": "Bull Case",  "value": scn["bull"]["price"], "cls": "pos"}
        ]
    }

    return cfg


# ── Research generation ────────────────────────────────────────────────────────

def generate_research(query: str) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError(
            "ANTHROPIC_API_KEY is not set.\n"
            "Run:  export ANTHROPIC_API_KEY=sk-ant-..."
        )

    client = anthropic.Anthropic(api_key=api_key)
    today = datetime.now().strftime("%B %-d, %Y")

    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=8000,
        system=(
            "You are a senior equity research analyst at Helvetia Research, Geneva. "
            "Produce institutional-grade equity initiation notes. "
            "Use your best knowledge of the company for realistic financials, valuation, and investment analysis. "
            "Be specific: name competitors, cite margins, reference growth rates. "
            "All numbers in English format (periods as decimals, B=billions, M=millions). "
            f"Today's date: {today}."
        ),
        tools=[EQUITY_TOOL],
        tool_choice={"type": "tool", "name": "equity_report"},
        messages=[{
            "role": "user",
            "content": f"Generate a comprehensive equity research initiation note for: {query}"
        }]
    )

    if not response.content or response.content[0].type != "tool_use":
        raise RuntimeError("Claude did not return structured report data.")

    data = response.content[0].input

    # Computed fields
    target  = data["target_price"]
    current = data["current_price"]
    upside_pct = (target - current) / current * 100
    data["upside_pct"]   = upside_pct
    data["upside_str"]   = f"{'+' if upside_pct >= 0 else ''}{upside_pct:.1f}%"
    data["upside_label"] = "Upside" if upside_pct >= 0 else "Downside"
    data["upside_class"] = "up" if upside_pct >= 0 else "dn"
    data["rating_index"] = RATING_INDEX.get(data["rating"], 2)
    data["report_date"]  = today

    data["charts_config"] = build_charts_config(data)
    return data


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    api_key_set = bool(os.environ.get("ANTHROPIC_API_KEY"))
    return render_template("index.html", api_key_set=api_key_set)


@app.route("/generate", methods=["POST"])
def generate():
    query = request.form.get("query", "").strip()
    if not query:
        return "Please enter a company name or ticker symbol.", 400
    try:
        data = generate_research(query)
        return render_template("report.html", **data)
    except ValueError as e:
        return str(e), 400
    except Exception as e:
        return f"Error generating report: {e}", 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)
