import json
import os
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError, validator

from app.services.data_service import get_latest_quote
from app.services.llm_client import chat as llm_chat
from app.services.screener_service import screen_stocks
from app.services.stock_snapshot_service import (
    enrich_metric_rows,
    frontend_metric_row,
    snapshot_available,
    snapshot_by_ticker,
)


INTENTS = {"CUSTOM_FILTER", "PRE_DEFINED_SCREENER", "STOCK_INFO", "SECTOR_FILTER", "GENERAL_CHAT"}
SNAPSHOT_FILTER_FIELDS = {
    "price": "cmp",
    "change_pct": "technical.todayReturnPct",
    "trailing_pe": "pe",
    "market_cap_cr": "marketCapCr",
    "roe": "roe",
    "roce": "roce",
    "debt_to_equity": "debtToEquity",
    "revenue_growth": "revenueGrowth3Yr",
    "profit_growth": "profitGrowth3Yr",
    "dividend_yield": "divYield",
    "rsi14": "technical.rsi14",
    "ret_1w": "technical.return1wPct",
    "ret_1m": "technical.return1mPct",
    "ret_3m": "technical.return3mPct",
    "ret_1y": "technical.return1yPct",
    "vol_ratio": "technical.volumeRatio20",
    "high_52w": "technical.high52Week",
    "low_52w": "technical.low52Week",
}
FILTER_OPERATORS = {"<", "<=", ">", ">=", "=", "!="}


class SnapshotFilterCondition(BaseModel):
    field: str
    operator: str
    value: float

    @validator("field")
    def _field_allowed(cls, value: str) -> str:
        if value not in SNAPSHOT_FILTER_FIELDS:
            raise ValueError(f"unsupported field: {value}")
        return value

    @validator("operator")
    def _operator_allowed(cls, value: str) -> str:
        if value not in FILTER_OPERATORS:
            raise ValueError(f"unsupported operator: {value}")
        return value


class SmartRouterSchema(BaseModel):
    intent: str
    screener_name: str | None = None
    stock_symbol: str | None = None
    sector: str | None = None
    custom_query_parameters: dict[str, Any] = Field(default_factory=dict)
    filters: list[SnapshotFilterCondition] = Field(default_factory=list)
    ai_response_message: str
    clarifying_question: str | None = None

    @validator("intent")
    def _intent_allowed(cls, value: str) -> str:
        upper = value.upper()
        if upper not in INTENTS:
            raise ValueError(f"unsupported intent: {value}")
        return upper

SECTOR_RULES: list[tuple[str, list[str]]] = [
    ("Banks", ["bank", "banks", "banking", "lender", "lenders", "sbi", "hdfc", "icici", "axis", "kotak", "indusind", "federal", "canara", "pnb"]),
    ("Finance", ["finance", "finserv", "credit", "capital", "housing", "muthoot", "bajaj", "rec", "pfc"]),
    ("Capital Markets", ["bse", "mcx", "cdsl", "cams", "angel", "amc", "securities"]),
    ("IT - Services", ["tcs", "infosys", "wipro", "hcl", "tech", "software", "systems", "coforge", "persistent", "mphasis"]),
    ("Automobiles", ["motors", "auto", "maruti", "mahindra", "eicher", "tvs", "ashok"]),
    ("Auto Components", ["bosch", "motherson", "mrf", "balkrishna", "cummins", "tube"]),
    ("Pharmaceuticals & Biotechnology", ["pharma", "cipla", "lupin", "biocon", "zydus", "glenmark", "laurus", "granules"]),
    ("Healthcare Services", ["hospital", "health", "apollo", "max healthcare"]),
    ("Oil & Gas", ["oil", "ongc", "bpcl", "hpcl", "ioc", "gail", "gas"]),
    ("Power", ["power", "ntpc", "grid", "energy"]),
    ("Metals & Mining", ["steel", "metal", "hindalco", "vedanta", "nmdc", "sail", "zinc", "nalco"]),
    ("Cement & Construction Materials", ["cement", "ultratech", "ambuja", "shree", "acc", "ramco"]),
    ("Chemicals", ["chemical", "srf", "pidilite", "upl", "linde", "deepak", "aarti"]),
    ("Aerospace & Defense", ["hal", "bel", "mazagon", "cochin", "dynamics", "beml", "mtar", "data patterns"]),
    ("Realty", ["realty", "properties", "dlf", "lodha", "oberoi", "prestige", "sobha", "brigade"]),
    ("Retailing", ["trent", "dmart"]),
    ("Telecom - Services", ["communications", "vodafone", "idea", "tata comm", "indus towers"]),
    ("Food & FMCG", ["britannia", "nestle", "tata consumer", "itc", "hindustan unilever", "dabur", "marico", "colgate", "emami"]),
    ("Beverages", ["united breweries", "spirits", "varun", "radico"]),
    ("Media & Entertainment", ["sun tv", "pvr", "zee", "network"]),
    ("Insurance", ["insurance", "lombard", "star health", "gic"]),
    ("Construction", ["larsen", "lt", "irb", "nbcc"]),
]


def _normalize(value: str) -> str:
    clean = value.lower()
    replacements = {
        "stockks": "stocks",
        "stocoks": "stocks",
        "volumne": "volume",
        "avrage": "average",
        "consequtive": "consecutive",
        "circut": "circuit",
        "delivry": "delivery",
        "listbanking": "list banking",
        "showbanking": "show banking",
        "bankingsector": "banking sector",
        "screenbanking": "screen banking",
        "geenral": "general",
        "questipons": "questions",
        "pycode": "python code",
    }
    for wrong, right in replacements.items():
        clean = clean.replace(wrong, right)
    return re.sub(r"[^a-z0-9]+", " ", clean).strip()


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _hash_number(value: str, mod: int, offset: int = 0) -> int:
    hash_value = 2166136261
    for char in value:
        hash_value = ((hash_value * 31) + ord(char)) & 0xFFFFFFFF
    return offset + (hash_value % mod)


def _stock_sector(stock: dict[str, Any]) -> str:
    haystack = _normalize(f"{stock.get('name', '')} {stock.get('symbol', '')}")
    for sector, words in SECTOR_RULES:
        if any(word in haystack for word in words):
            return sector
    return "Diversified"


def _make_row(
    stock: dict[str, Any],
    index: int,
    reason: str,
    quote: dict[str, Any] | None = None,
    snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if snapshot:
        return frontend_metric_row(snapshot, stock, reason=reason, score=max(55, 92 - index))
    symbol = str(stock.get("symbol") or stock.get("ticker") or "STOCK")
    price = quote.get("price") if quote else None
    cmp = float(price) if isinstance(price, (int, float)) else None
    return {
        "stock": stock,
        "cmp": round(cmp, 2) if cmp is not None else None,
        "pe": None,
        "marketCapCr": None,
        "marketCapitalization": None,
        "divYield": None,
        "avgDividendPayout3Yr": None,
        "qtrSalesCr": None,
        "qtrProfitVar": None,
        "qtrSalesVar": None,
        "revenueGrowth3Yr": None,
        "profitGrowth3Yr": None,
        "profitGrowth5Yr": None,
        "roe": None,
        "roce": None,
        "avgRoce7Yr": None,
        "debtToEquity": None,
        "operatingMargin": None,
        "piotroskiScore": None,
        "avgPat10Yrs": None,
        "score": max(55, 92 - index),
        "reason": reason,
    }


def _find_stock(prompt: str, stocks: list[dict[str, Any]]) -> dict[str, Any] | None:
    clean = _normalize(prompt)
    candidates = sorted(stocks, key=lambda s: len(str(s.get("symbol", ""))), reverse=True)
    for stock in candidates:
        symbol = _normalize(str(stock.get("symbol", "")))
        ticker = _normalize(str(stock.get("ticker", "")).replace(".NS", "").replace(".BO", ""))
        name = _normalize(str(stock.get("name", "")))
        if symbol and re.search(rf"\b{re.escape(symbol)}\b", clean):
            return stock
        if ticker and re.search(rf"\b{re.escape(ticker)}\b", clean):
            return stock
        if name and name in clean:
            return stock
    return None


def _find_screener(prompt: str, screeners: list[dict[str, Any]]) -> dict[str, Any] | None:
    clean = _normalize(prompt)
    best: tuple[int, dict[str, Any] | None] = (0, None)
    for screener in screeners:
        title = _normalize(str(screener.get("title", "")))
        slug = _normalize(str(screener.get("slug", "")))
        tags = " ".join(_normalize(str(tag)) for tag in screener.get("tags", []))
        haystack = f"{title} {slug} {tags}"
        score = 0
        if title and title in clean:
            score += 8
        if slug and slug in clean:
            score += 8
        score += sum(2 for token in clean.split() if len(token) > 2 and token in haystack)
        if score > best[0]:
            best = (score, screener)
    return best[1] if best[0] >= 4 else None


def _find_sector(prompt: str, supplied_sectors: list[dict[str, Any]] | list[str]) -> str | None:
    clean = _normalize(prompt)
    sector_names = [
        str(item.get("name")) if isinstance(item, dict) else str(item)
        for item in supplied_sectors
    ]
    sector_names += [name for name, _ in SECTOR_RULES]
    for sector in sorted(set(sector_names), key=len, reverse=True):
        normalized = _normalize(sector)
        if normalized and (normalized in clean or normalized.split()[0] in clean and "sector" in clean):
            return sector
    if re.search(r"\b(sector|industry|stocks?|companies|list|show|screen)\b", clean):
        for sector, words in SECTOR_RULES:
            if any(re.search(rf"\b{re.escape(word)}\b", clean) or word in clean for word in words):
                return sector
    return None


def _extract_custom_params(prompt: str) -> dict[str, Any]:
    clean = prompt.lower()
    normalized = _normalize(prompt)
    params: dict[str, Any] = {}
    days = re.search(r"(\d{1,2})\s+(?:consecutive\s+)?(?:trading\s+)?(?:days|sessions)", clean)
    if days:
        params["consecutive_days"] = int(days.group(1))
    if re.search(r"\b(gain|gained|up|green|higher|rising)\b", clean):
        params["direction"] = "up"
    if re.search(r"\b(loss|lost|down|red|lower|falling)\b", clean):
        params["direction"] = "down"
    if "volume" in clean:
        params["volume"] = "compare_previous_week" if "week" in clean else "above_average"
    if re.search(r"\b(today|yesterday|last|past|week|month|months|year|ytd|days|sessions)\b", normalized):
        params["time_filter"] = True
    if re.search(r"\b(gain|gained|gainer|return|performance|performing|performer|momentum|up|down|fallen|loser|doubled|positive returns|relative strength|outperform|outperforming|stronger than|falling market)\b", normalized):
        params["price_action"] = True
    if re.search(r"\b(penny|micro cap|small cap|mid cap|large cap|market cap)\b", normalized):
        params["market_cap"] = True
    if re.search(r"\b(breakout|breakdown|gap up|gap down|upper circuit|lower circuit|52 week|all time high|all time low|support|resistance)\b", normalized):
        params["price_level"] = True
    if re.search(r"\b(macd|moving average|sma|ema|dma|bollinger|vwap|atr|adx|supertrend|candlestick|hammer|doji|engulfing|morning star|evening star)\b", normalized):
        params["technical_pattern"] = True
    if re.search(r"\b(delivery|fii|dii|promoter|pledge|f&o|futures|open interest|pcr|put call|results|dividend|bonus|split|buyback|board meeting|merger|acquisition|corporate action|news)\b", normalized):
        params["proxy_or_event_filter"] = True
    rsi_match = re.search(r"\brsi\b.{0,24}?(<|<=|>|>=|=|below|under|above|over|greater than|less than)\s*(\d+(?:\.\d+)?)", clean)
    if rsi_match:
        params["rsi"] = {"operator": rsi_match.group(1), "value": float(rsi_match.group(2))}
    elif "rsi" in clean or "oversold" in clean:
        params["rsi"] = "below_30" if "oversold" in clean or "below" in clean or "under" in clean or "<" in clean else "requested"
    mfi_match = re.search(r"\bmfi\b.{0,24}?(<|<=|>|>=|=|below|under|above|over|greater than|less than)\s*(\d+(?:\.\d+)?)", clean)
    if mfi_match:
        params["mfi"] = {"operator": mfi_match.group(1), "value": float(mfi_match.group(2))}
    elif "mfi" in clean or "money flow index" in clean:
        params["mfi"] = "requested"
    if re.search(r"\b(sql|select\b|where\b|order by\b|python|pandas|code|pycode)\b", clean):
        params["query_language"] = "sql_or_python"
    if re.search(r"\b(backtest|strategy|buy when|sell when|crossover|entry|exit)\b", clean):
        params["strategy_or_backtest"] = True
    if "52" in clean or "new high" in clean:
        params["near_high"] = True
    if re.search(r"\b(undervalued|cheap|value|valuation|low\s+pe|low\s+p/e)\b", clean):
        params["valuation"] = "undervalued"
    if re.search(r"\b(strong|high|good)\s+roce\b|\broce\b", clean):
        params["roce"] = "strong"
    if re.search(r"\b(strong|high|good)\s+roe\b|\broe\b", clean):
        params["roe"] = "strong"
    if re.search(r"\b(low|less|reduced?)\s+debt\b|\bdebt\s*(?:<|below|under|less)\b", clean):
        params["debt"] = "low"
    if "dividend" in clean:
        params["dividend"] = "positive"
    if "growth" in clean:
        params["growth"] = "strong"
    return params


def _has_fundamental_filter(prompt: str, params: dict[str, Any]) -> bool:
    clean = prompt.lower()
    return bool(
        {"valuation", "roce", "roe", "debt", "dividend", "growth"} & set(params.keys())
        or re.search(r"\b(pe|p/e|price.?to.?earnings|market cap|roce|roe|debt|dividend|growth|piotroski|undervalued|cheap|value|valuation)\b", clean)
    )


def _extract_number_condition(prompt: str, names: list[str]) -> dict[str, Any] | None:
    name_pattern = "|".join(re.escape(name) for name in names)
    operator_words = {
        "below": "<",
        "under": "<",
        "less than": "<",
        "lower than": "<",
        "above": ">",
        "over": ">",
        "more than": ">",
        "greater than": ">",
        "at least": ">=",
        "minimum": ">=",
        "max": "<=",
        "maximum": "<=",
    }
    operator_pattern = r"<=|>=|<|>|=|below|under|less than|lower than|above|over|greater than|more than|at least|minimum|max|maximum"
    for pattern in [
        rf"\b(?:{name_pattern})\b(?:\s+ratio|\s+yield|\s+growth)?\s*(?:is|are|of|at)?\s*({operator_pattern})\s*(-?\d+(?:\.\d+)?)",
        rf"\b(?:{name_pattern})\b.{0,24}?({operator_pattern})\s*(-?\d+(?:\.\d+)?)",
    ]:
        match = re.search(pattern, prompt.lower())
        if match:
            operator = operator_words.get(match.group(1), match.group(1))
            return {"operator": operator, "value": float(match.group(2))}
    return None


def _fundamental_conditions(prompt: str, params: dict[str, Any]) -> list[tuple[str, str, float, str]]:
    condition_specs = [
        ("pe", ["pe", "p/e", "price to earnings", "price earnings"], "P/E"),
        ("roe", ["roe", "return on equity"], "ROE"),
        ("roce", ["roce", "return on capital employed", "return on capital"], "ROCE"),
        ("debtToEquity", ["debt to equity", "debt equity", "debt"], "Debt / equity"),
        ("divYield", ["dividend yield", "dividend"], "Dividend yield"),
        ("revenueGrowth3Yr", ["revenue growth", "sales growth", "growth"], "Revenue growth"),
        ("profitGrowth3Yr", ["profit growth", "earnings growth"], "Profit growth"),
        ("marketCapCr", ["market cap", "market capitalization", "market capitalisation"], "Market cap"),
    ]
    conditions: list[tuple[str, str, float, str]] = []
    for field, names, label in condition_specs:
        parsed = _extract_number_condition(prompt, names)
        if parsed:
            conditions.append((field, parsed["operator"], parsed["value"], f"{label} {parsed['operator']} {parsed['value']:g}"))
    if params.get("valuation") == "undervalued" and not any(item[0] == "pe" for item in conditions):
        conditions.append(("pe", "<=", 24, "P/E <= 24"))
    if params.get("roce") == "strong" and not any(item[0] == "roce" for item in conditions):
        conditions.append(("roce", ">=", 20, "ROCE >= 20"))
    if params.get("roe") == "strong" and not any(item[0] == "roe" for item in conditions):
        conditions.append(("roe", ">=", 18, "ROE >= 18"))
    if params.get("debt") == "low" and not any(item[0] == "debtToEquity" for item in conditions):
        conditions.append(("debtToEquity", "<", 1, "Debt / equity < 1"))
    if params.get("dividend") == "positive" and not any(item[0] == "divYield" for item in conditions):
        conditions.append(("divYield", ">", 0, "Dividend yield > 0"))
    if params.get("growth") == "strong" and not any(item[0] == "revenueGrowth3Yr" for item in conditions):
        conditions.append(("revenueGrowth3Yr", ">", 10, "Revenue growth > 10"))
    return conditions


def _compare_number(value: Any, operator: str, target: float) -> bool:
    if value is None:
        return False
    try:
        numeric = float(value)
    except Exception:
        return False
    if operator == "<":
        return numeric < target
    if operator == "<=":
        return numeric <= target
    if operator == ">":
        return numeric > target
    if operator == ">=":
        return numeric >= target
    if operator == "!=":
        return numeric != target
    return numeric == target


def _row_value(row: dict[str, Any], field: str) -> Any:
    mapped = SNAPSHOT_FILTER_FIELDS.get(field, field)
    value: Any = row
    for part in mapped.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _schema_conditions(router: dict[str, Any]) -> list[tuple[str, str, float, str]]:
    filters = router.get("filters")
    if not isinstance(filters, list):
        return []
    conditions: list[tuple[str, str, float, str]] = []
    for item in filters:
        if not isinstance(item, dict):
            continue
        field = item.get("field")
        operator = item.get("operator")
        value = item.get("value")
        if field not in SNAPSHOT_FILTER_FIELDS or operator not in FILTER_OPERATORS:
            continue
        label = f"{field} {operator} {float(value):g}"
        conditions.append((field, operator, float(value), label))
    return conditions


def _fundamental_filter_rows(
    prompt: str,
    stocks: list[dict[str, Any]],
    sectors: list[dict[str, Any]] | list[str],
    router: dict[str, Any],
) -> dict[str, Any]:
    params = router.get("custom_query_parameters") if isinstance(router.get("custom_query_parameters"), dict) else {}
    sector = _find_sector(str(router.get("sector") or prompt), sectors) or _find_sector(prompt, sectors)
    candidate_stocks = [stock for stock in stocks if not sector or _stock_sector(stock) == sector]
    snapshots = snapshot_by_ticker(
        [stock["ticker"] for stock in candidate_stocks if stock.get("ticker")],
        max_age_hours=None,
    )
    rows = [
        _make_row(stock, index, "Matched real Bullseye stock_snapshot fundamentals.", snapshot=snapshots.get(stock.get("ticker")))
        for index, stock in enumerate(candidate_stocks)
        if snapshots.get(stock.get("ticker"))
    ]

    # The LLM router sometimes picks a sector that none of the loaded stocks
    # belong to, which would zero out an otherwise answerable query. If a sector
    # filter wiped out every row, retry once across the full loaded universe.
    if not rows and sector:
        all_snapshots = snapshot_by_ticker(
            [stock["ticker"] for stock in stocks if stock.get("ticker")],
            max_age_hours=None,
        )
        rows = [
            _make_row(stock, index, "Matched real Bullseye stock_snapshot fundamentals.", snapshot=all_snapshots.get(stock.get("ticker")))
            for index, stock in enumerate(stocks)
            if all_snapshots.get(stock.get("ticker"))
        ]
        if rows:
            sector = None

    schema_conditions = _schema_conditions(router)
    conditions = schema_conditions or _fundamental_conditions(prompt, params)
    labels = [condition[3] for condition in conditions]
    strict_rows = [
        row for row in rows
        if all(_compare_number(_row_value(row, field), operator, target) for field, operator, target, _label in conditions)
    ] if conditions else rows
    if sector:
        labels.append(f"sector: {sector}")

    if not rows:
        if not snapshot_available():
            message = "The stock fundamentals dataset is temporarily unavailable, so I can't answer this filter reliably right now."
            unavailable = ["stock_snapshot"]
        else:
            message = "None of the loaded stocks had snapshot data for this filter. Try a broader query or a different set of stocks."
            unavailable = []
        router["ai_response_message"] = message
        return {
            "router": router,
            "rows": [],
            "matchedRules": labels or ["real fundamentals filter"],
            "explanation": message,
            "source": "Supabase stock_snapshot",
            "unavailable_data": unavailable,
        }

    closest_only = bool(conditions and not strict_rows)
    selected_rows = strict_rows if strict_rows else rows
    selected_rows = sorted(
        selected_rows,
        key=lambda row: (
            row.get("roce") or 0,
            row.get("roe") or 0,
            -(row.get("pe") or 9999),
            row.get("score") or 0,
        ),
        reverse=True,
    )[:80]

    for row in selected_rows:
        row["reason"] = (
            f"Snapshot match for {sector or 'loaded universe'}: P/E {row.get('pe') if row.get('pe') is not None else '-'}, "
            f"ROCE {row.get('roce') if row.get('roce') is not None else '-'}, "
            f"ROE {row.get('roe') if row.get('roe') is not None else '-'}, "
            f"debt/equity {row.get('debtToEquity') if row.get('debtToEquity') is not None else '-'}."
        )

    router["sector"] = sector
    router["ai_response_message"] = (
        (
            "No exact snapshot rows matched every requested condition; returning clearly labeled closest matches"
            if closest_only
            else f"Found {len(selected_rows)} real snapshot fundamental matches"
        )
        + (f" in {sector}" if sector else "")
        + " for your valuation and quality query."
    )
    return {
        "router": router,
        "rows": selected_rows,
        "matchedRules": labels or ["real fundamentals filter"],
        "explanation": router["ai_response_message"],
        "source": "LLM JSON router + Supabase stock_snapshot",
        "closest_matches": closest_only,
    }


def _heuristic_router(prompt: str, stocks: list[dict[str, Any]], screeners: list[dict[str, Any]], sectors: list[dict[str, Any]] | list[str]) -> dict[str, Any]:
    screener = _find_screener(prompt, screeners)
    stock = _find_stock(prompt, stocks)
    sector = _find_sector(prompt, sectors)
    params = _extract_custom_params(prompt)
    lower = prompt.lower()

    if screener:
        intent = "PRE_DEFINED_SCREENER"
        message = f"Opening the {screener.get('title')} screen and loading its matched stocks."
    elif stock and re.search(r"\b(price|metric|details?|about|show|lookup|analysis|data)\b", lower):
        intent = "STOCK_INFO"
        message = f"Fetching the latest available Bullseye data for {stock.get('symbol')}."
    elif params and not (params.get("query_language") and not any(key in params for key in ["rsi", "mfi", "near_high", "valuation", "roce", "roe", "debt", "dividend", "growth"])):
        intent = "CUSTOM_FILTER"
        message = (
            "Filtering local fundamentals and quality metrics."
            if _has_fundamental_filter(prompt, params)
            else "Running a live technical filter using cached OHLCV metrics."
        )
    elif sector:
        intent = "SECTOR_FILTER"
        message = f"Loading stocks from the {sector} sector."
    else:
        intent = "GENERAL_CHAT"
        message = _general_market_answer(prompt)

    return {
        "intent": intent,
        "screener_name": screener.get("slug") if screener else None,
        "stock_symbol": stock.get("symbol") if stock else None,
        "sector": sector,
        "custom_query_parameters": params,
        "ai_response_message": message,
    }


def _extract_json(text: str) -> dict[str, Any] | None:
    try:
        return json.loads(text)
    except Exception:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def _llm_router(prompt: str, stocks: list[dict[str, Any]], screeners: list[dict[str, Any]], sectors: list[dict[str, Any]] | list[str]) -> dict[str, Any] | None:
    try:
        screen_names = [
            {"slug": item.get("slug"), "title": item.get("title"), "tags": item.get("tags", [])}
            for item in screeners[:80]
        ]
        stock_names = [
            {"symbol": item.get("symbol"), "ticker": item.get("ticker"), "name": item.get("name"), "exchange": item.get("exchange")}
            for item in stocks[:500]
        ]
        sector_names = [item.get("name") if isinstance(item, dict) else item for item in sectors]
        field_whitelist = sorted(SNAPSHOT_FILTER_FIELDS)
        system = (
            "You are a JSON router for a stock prediction analysis website. "
            "Return ONLY valid JSON with exactly this shape: "
            '{"intent":"CUSTOM_FILTER|PRE_DEFINED_SCREENER|STOCK_INFO|SECTOR_FILTER|GENERAL_CHAT",'
            '"screener_name":"string or null","stock_symbol":"string or null","sector":"string or null",'
            '"custom_query_parameters":{},"filters":[{"field":"string","operator":"<|<=|>|>=|=|!=","value":number}],'
            '"ai_response_message":"string","clarifying_question":"string or null"}. '
            "Do not add markdown, comments, prose, or extra keys. "
            "Use PRE_DEFINED_SCREENER only when the query clearly matches one supplied screener. "
            "Use STOCK_INFO for one specific ticker/company lookup. "
            "Use SECTOR_FILTER for sector or industry lists. "
            "Use CUSTOM_FILTER for technical, price, volume, indicator, valuation, growth, debt, and quality conditions. "
            "For CUSTOM_FILTER, emit filters only from the supplied stock_snapshot_field_whitelist. "
            "If a requested metric is not in the whitelist, set clarifying_question and do not invent a proxy. "
            "Use GENERAL_CHAT for educational/help questions. "
            "Examples: 'PE under 20 and ROE above 15' -> filters trailing_pe < 20 and roe > 15. "
            "'profitable midcaps with low debt and rising 3-month momentum' -> filters market_cap_cr >= 5000, "
            "market_cap_cr <= 50000, debt_to_equity < 1, ret_3m > 0."
        )
        user_payload = {
            "query": prompt,
            "available_screeners": screen_names,
            "available_sectors": sector_names,
            "known_stocks": stock_names,
            "stock_snapshot_field_whitelist": field_whitelist,
        }
        response = llm_chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            temperature=0,
            max_tokens=500,
        )
        content = response["text"]
        parsed = _extract_json(content)
        if parsed is None:
            return {
                "intent": "GENERAL_CHAT",
                "screener_name": None,
                "stock_symbol": None,
                "sector": None,
                "custom_query_parameters": {},
                "filters": [],
                "ai_response_message": "I need a valid structured screen before I can run that filter.",
                "clarifying_question": "Please restate the screen using supported fields such as P/E, ROE, debt, market cap, RSI, volume, or 3-month return.",
                "router_error": "schema_validation_failed: non_json_output",
                "llm_provider": response.get("model"),
            }
        try:
            validated = SmartRouterSchema(**parsed)
        except ValidationError as exc:
            return {
                "intent": "GENERAL_CHAT",
                "screener_name": None,
                "stock_symbol": None,
                "sector": None,
                "custom_query_parameters": {},
                "filters": [],
                "ai_response_message": "I need a supported stock_snapshot field before I can run that screen.",
                "clarifying_question": (
                    "Which available metric should I use: "
                    + ", ".join(field_whitelist[:12])
                    + "?"
                ),
                "router_error": f"schema_validation_failed: {exc.errors()[0].get('msg') if exc.errors() else exc}",
            }
        router = validated.dict()
        router["filters"] = [item.dict() for item in validated.filters]
        router["llm_provider"] = response.get("model")
        return router
    except Exception as exc:
        print(f"[SmartSearch] LLM router failed: {exc}")
        return None


def _sanitize_router(router: dict[str, Any], prompt: str, stocks: list[dict[str, Any]], screeners: list[dict[str, Any]], sectors: list[dict[str, Any]] | list[str]) -> dict[str, Any]:
    fallback = _heuristic_router(prompt, stocks, screeners, sectors)
    intent = str(router.get("intent") or fallback["intent"]).upper()
    if intent not in INTENTS:
        intent = fallback["intent"]
    if fallback["intent"] in {"SECTOR_FILTER", "CUSTOM_FILTER", "STOCK_INFO", "PRE_DEFINED_SCREENER"} and intent == "GENERAL_CHAT":
        intent = fallback["intent"]
    if fallback["intent"] == "CUSTOM_FILTER" and intent == "SECTOR_FILTER":
        intent = "CUSTOM_FILTER"

    screener_name = router.get("screener_name") or fallback.get("screener_name")
    stock_symbol = router.get("stock_symbol") or fallback.get("stock_symbol")
    sector = router.get("sector") or fallback.get("sector")
    params = router.get("custom_query_parameters")
    if not isinstance(params, dict):
        params = fallback["custom_query_parameters"]
    elif isinstance(fallback.get("custom_query_parameters"), dict):
        params = {**fallback["custom_query_parameters"], **params}
    message = str(router.get("ai_response_message") or fallback["ai_response_message"]).strip()
    if intent == "GENERAL_CHAT":
        message = _general_market_answer(prompt)

    return {
        "intent": intent,
        "screener_name": screener_name,
        "stock_symbol": stock_symbol,
        "sector": sector,
        "custom_query_parameters": params,
        "filters": router.get("filters") if isinstance(router.get("filters"), list) else [],
        "ai_response_message": message,
        "clarifying_question": router.get("clarifying_question"),
        "router_error": router.get("router_error"),
        "llm_provider": router.get("llm_provider"),
    }


def _filter_stocks_for_sector(stocks: list[dict[str, Any]], sector: str | None) -> list[dict[str, Any]]:
    if not sector:
        return stocks
    filtered = [stock for stock in stocks if _stock_sector(stock) == sector]
    return filtered or stocks


def smart_search(prompt: str, stocks: list[dict[str, Any]], screeners: list[dict[str, Any]], sectors: list[dict[str, Any]] | list[str]) -> dict[str, Any]:
    router = _llm_router(prompt, stocks, screeners, sectors) or _heuristic_router(prompt, stocks, screeners, sectors)
    router = _sanitize_router(router, prompt, stocks, screeners, sectors)
    intent = router["intent"]

    if router.get("clarifying_question"):
        return {
            "router": router,
            "rows": [],
            "matchedRules": [],
            "explanation": router["clarifying_question"],
            "source": "LLM schema router",
            "needs_clarification": True,
        }

    if intent == "PRE_DEFINED_SCREENER":
        screener = _find_screener(str(router.get("screener_name") or prompt), screeners) or _find_screener(prompt, screeners)
        if screener:
            router["screener_name"] = screener.get("slug") or _slugify(str(screener.get("title", "")))
            router["ai_response_message"] = f"Opening the {screener.get('title')} screen and loading its matched stocks."
        return {
            "router": router,
            "rows": [],
            "matchedRules": [f"Preset screen: {router.get('screener_name')}"],
            "explanation": router["ai_response_message"],
            "source": "LLM JSON router + local preset screen data",
        }

    if intent == "STOCK_INFO":
        stock = _find_stock(str(router.get("stock_symbol") or prompt), stocks) or _find_stock(prompt, stocks)
        if not stock:
            return {
                "router": router,
                "rows": [],
                "matchedRules": [],
                "explanation": "I could not match that stock symbol to the loaded Bullseye universe.",
                "source": "LLM JSON router",
            }
        quote = None
        try:
            quote = get_latest_quote(str(stock.get("ticker")))
        except Exception:
            quote = None
        snapshot = snapshot_by_ticker([str(stock.get("ticker"))], max_age_hours=None).get(str(stock.get("ticker")))
        router["stock_symbol"] = stock.get("symbol")
        router["ai_response_message"] = f"Fetched the latest available Bullseye data for {stock.get('symbol')}."
        return {
            "router": router,
            "rows": [_make_row(stock, 0, f"Specific stock lookup for {stock.get('name')}.", quote, snapshot)],
            "matchedRules": [f"Stock lookup: {stock.get('symbol')}"],
            "explanation": router["ai_response_message"],
            "source": "LLM JSON router + Supabase stock_snapshot" if snapshot else "LLM JSON router + free quote cache",
        }

    if intent == "SECTOR_FILTER":
        sector = _find_sector(str(router.get("sector") or prompt), sectors) or _find_sector(prompt, sectors)
        sector_stocks = [stock for stock in stocks if sector and _stock_sector(stock) == sector]
        snapshots = snapshot_by_ticker(
            [stock["ticker"] for stock in sector_stocks if stock.get("ticker")],
            max_age_hours=None,
        )
        rows = [
            _make_row(stock, index, f"Included in {sector} from the loaded Bullseye universe.", snapshot=snapshots.get(stock.get("ticker")))
            for index, stock in enumerate(sector_stocks)
            if snapshots.get(stock.get("ticker"))
        ][:80]
        router["sector"] = sector
        router["ai_response_message"] = f"Loaded {len(rows)} stocks from the {sector} sector." if sector else "I could not match that sector yet."
        return {
            "router": router,
            "rows": rows,
            "matchedRules": [f"Sector: {sector}"] if sector else [],
            "explanation": router["ai_response_message"],
            "source": "LLM JSON router + Supabase stock_snapshot",
        }

    if intent == "CUSTOM_FILTER":
        params = router.get("custom_query_parameters")
        if (isinstance(params, dict) and _has_fundamental_filter(prompt, params)) or router.get("filters"):
            return _fundamental_filter_rows(prompt, stocks, sectors, router)

        sector = _find_sector(str(router.get("sector") or prompt), sectors) or _find_sector(prompt, sectors)
        router["sector"] = sector
        scoped_stocks = _filter_stocks_for_sector(stocks, sector)
        live = screen_stocks(prompt, scoped_stocks)
        if not live.get("rows") and isinstance(params, dict) and router.get("sector"):
            fallback_rows = _fundamental_filter_rows(prompt, stocks, sectors, router)
            if fallback_rows.get("rows"):
                return fallback_rows
        if live.get("rows"):
            live["rows"] = enrich_metric_rows(live["rows"], max_age_hours=None)
        live["router"] = router
        live["explanation"] = (
            router["ai_response_message"]
            + (" " + str(live.get("explanation", "")))
            + (f" Sector scope: {sector}." if sector else "")
        )
        live["source"] = "LLM JSON router + cached Yahoo Finance OHLCV"
        return live

    return {
        "router": router,
        "rows": [],
        "matchedRules": [],
        "explanation": router["ai_response_message"],
        "source": "LLM JSON router",
    }


def _general_market_answer(prompt: str) -> str:
    clean = _normalize(prompt)
    if re.search(r"\b(sql|select|where|order by)\b", clean):
        return (
            "You can type SQL-style filters here, for example: "
            "SELECT * FROM stocks WHERE roe > 18 AND debt_to_equity < 1 ORDER BY market_cap DESC. "
            "The screener supports common fundamentals such as P/E, market cap, ROE, ROCE, growth, debt, dividend yield, Piotroski, RSI, MFI, and volume rules."
        )
    if re.search(r"\b(python|pandas|code)\b", clean):
        return (
            "For Python-style strategy ideas, describe the rule in plain English: "
            "Backtest RSI crosses above 30 and sell above 70, or Show stocks where MFI is below 20. "
            "The site routes screening prompts to this page and deeper strategy backtests to the stock AI/backtest tools."
        )
    if re.search(r"\b(backtest|strategy|entry|exit|buy when|sell when|crossover)\b", clean):
        return (
            "For strategy work, include a ticker or universe plus entry and exit rules. "
            "Examples: Backtest RELIANCE buy when RSI crosses above 30 sell above 70, or Find NSE stocks with RSI below 30 and volume above average."
        )
    return (
        "Ask for a sector list, a stock lookup, a SQL-style fundamentals filter, or a technical screen. "
        "Examples: list banking sector stocks, RSI below 30, MFI below 20, low debt high ROE stocks, or SELECT * FROM stocks WHERE roce > 20."
    )
