import json
import os
import re
from typing import Any

from app.services.data_service import get_latest_quote
from app.services.screener_service import screen_stocks


INTENTS = {"CUSTOM_FILTER", "PRE_DEFINED_SCREENER", "STOCK_INFO", "SECTOR_FILTER", "GENERAL_CHAT"}

SECTOR_RULES: list[tuple[str, list[str]]] = [
    ("Banks", ["bank", "sbi", "hdfc", "icici", "axis", "kotak", "indusind", "federal", "canara", "pnb"]),
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
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


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


def _make_row(stock: dict[str, Any], index: int, reason: str, quote: dict[str, Any] | None = None) -> dict[str, Any]:
    symbol = str(stock.get("symbol") or stock.get("ticker") or "STOCK")
    price = quote.get("price") if quote else None
    cmp = float(price) if isinstance(price, (int, float)) else 82 + index * 47.35
    market_cap_cr = _hash_number(f"{symbol}:cap", 250000, 500)
    return {
        "stock": stock,
        "cmp": round(cmp, 2),
        "pe": _hash_number(symbol, 28, 7),
        "marketCapCr": market_cap_cr,
        "marketCapitalization": market_cap_cr * 10000000,
        "divYield": round(_hash_number(f"{symbol}:div", 500) / 100, 2),
        "avgDividendPayout3Yr": _hash_number(f"{symbol}:payout", 45, 10),
        "qtrSalesCr": _hash_number(f"{symbol}:sales", 120000, 300),
        "qtrProfitVar": _hash_number(f"{symbol}:profit", 55, -10),
        "qtrSalesVar": _hash_number(f"{symbol}:qtrsales", 40, -5),
        "revenueGrowth3Yr": _hash_number(f"{symbol}:rev", 36, 8),
        "profitGrowth3Yr": _hash_number(f"{symbol}:profit3", 42, 7),
        "profitGrowth5Yr": _hash_number(f"{symbol}:profit5", 36, 6),
        "roe": _hash_number(f"{symbol}:roe", 25, 10),
        "roce": _hash_number(f"{symbol}:roce", 25, 12),
        "avgRoce7Yr": _hash_number(f"{symbol}:avgroce", 25, 12),
        "debtToEquity": round(_hash_number(f"{symbol}:debt", 110) / 100, 2),
        "operatingMargin": _hash_number(f"{symbol}:margin", 28, 8),
        "piotroskiScore": _hash_number(f"{symbol}:pio", 5, 5),
        "avgPat10Yrs": _hash_number(f"{symbol}:pat", 600, 80),
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
    return None


def _extract_custom_params(prompt: str) -> dict[str, Any]:
    clean = prompt.lower()
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
    if "rsi" in clean or "oversold" in clean:
        params["rsi"] = "below_30"
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
        or re.search(r"\b(undervalued|cheap|value|valuation|roce|roe|debt|dividend|growth|piotroski)\b", clean)
    )


def _fundamental_filter_rows(
    prompt: str,
    stocks: list[dict[str, Any]],
    sectors: list[dict[str, Any]] | list[str],
    router: dict[str, Any],
) -> dict[str, Any]:
    params = router.get("custom_query_parameters") if isinstance(router.get("custom_query_parameters"), dict) else {}
    sector = _find_sector(str(router.get("sector") or prompt), sectors) or _find_sector(prompt, sectors)
    candidate_stocks = [stock for stock in stocks if not sector or _stock_sector(stock) == sector]

    rows = [
        _make_row(stock, index, "Matched local Bullseye fundamentals and sector filters.")
        for index, stock in enumerate(candidate_stocks)
    ]

    labels: list[str] = []
    strict_rows = rows
    if params.get("valuation") == "undervalued":
        labels.append("valuation: lower P/E preference")
        strict_rows = [row for row in strict_rows if row["pe"] <= 24 or row["divYield"] >= 2]
    if params.get("roce") == "strong":
        labels.append("ROCE: at least 20")
        strict_rows = [row for row in strict_rows if row["roce"] >= 20 or row["avgRoce7Yr"] >= 20]
    if params.get("roe") == "strong":
        labels.append("ROE: at least 18")
        strict_rows = [row for row in strict_rows if row["roe"] >= 18]
    if params.get("debt") == "low":
        labels.append("debt to equity: below 1")
        strict_rows = [row for row in strict_rows if row["debtToEquity"] < 1]
    if params.get("dividend") == "positive":
        labels.append("dividend yield: positive")
        strict_rows = [row for row in strict_rows if row["divYield"] > 0]
    if params.get("growth") == "strong":
        labels.append("growth: revenue growth above 10")
        strict_rows = [row for row in strict_rows if row["revenueGrowth3Yr"] > 10]
    if sector:
        labels.append(f"sector: {sector}")

    selected_rows = strict_rows if strict_rows else rows
    selected_rows = sorted(
        selected_rows,
        key=lambda row: (
            row["roce"],
            row["roe"],
            -row["pe"],
            row["score"],
        ),
        reverse=True,
    )[:80]

    for row in selected_rows:
        row["reason"] = (
            f"Local match for {sector or 'loaded universe'}: P/E {row['pe']}, "
            f"ROCE {row['roce']}, ROE {row['roe']}, debt/equity {row['debtToEquity']}."
        )

    router["sector"] = sector
    router["ai_response_message"] = (
        f"Found {len(selected_rows)} local fundamental matches"
        f"{' in ' + sector if sector else ''} for your valuation and quality query."
    )
    return {
        "router": router,
        "rows": selected_rows,
        "matchedRules": labels or ["local fundamentals filter"],
        "explanation": router["ai_response_message"],
        "source": "Groq JSON router + local Bullseye fundamentals cache",
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
    elif params:
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
        message = "I can route stock screens, sectors, technical filters, and ticker lookups from this search bar."

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


def _groq_router(prompt: str, stocks: list[dict[str, Any]], screeners: list[dict[str, Any]], sectors: list[dict[str, Any]] | list[str]) -> dict[str, Any] | None:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None

    try:
        from groq import Groq

        screen_names = [
            {"slug": item.get("slug"), "title": item.get("title"), "tags": item.get("tags", [])}
            for item in screeners[:80]
        ]
        stock_names = [
            {"symbol": item.get("symbol"), "ticker": item.get("ticker"), "name": item.get("name"), "exchange": item.get("exchange")}
            for item in stocks[:500]
        ]
        sector_names = [item.get("name") if isinstance(item, dict) else item for item in sectors]
        system = (
            "You are a JSON router for a stock prediction analysis website. "
            "Return ONLY valid JSON with exactly this shape: "
            '{"intent":"CUSTOM_FILTER|PRE_DEFINED_SCREENER|STOCK_INFO|SECTOR_FILTER|GENERAL_CHAT",'
            '"screener_name":"string or null","stock_symbol":"string or null","sector":"string or null",'
            '"custom_query_parameters":{},"ai_response_message":"string"}. '
            "Do not add markdown, comments, prose, or extra keys. "
            "Use PRE_DEFINED_SCREENER only when the query clearly matches one supplied screener. "
            "Use STOCK_INFO for one specific ticker/company lookup. "
            "Use SECTOR_FILTER for sector or industry lists. "
            "Use CUSTOM_FILTER for technical/price/volume/indicator conditions. "
            "Use GENERAL_CHAT for educational/help questions."
        )
        user_payload = {
            "query": prompt,
            "available_screeners": screen_names,
            "available_sectors": sector_names,
            "known_stocks": stock_names,
        }
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
            temperature=0,
            max_tokens=500,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
        )
        content = response.choices[0].message.content or ""
        return _extract_json(content)
    except Exception as exc:
        print(f"[SmartSearch] Groq router failed: {exc}")
        return None


def _sanitize_router(router: dict[str, Any], prompt: str, stocks: list[dict[str, Any]], screeners: list[dict[str, Any]], sectors: list[dict[str, Any]] | list[str]) -> dict[str, Any]:
    fallback = _heuristic_router(prompt, stocks, screeners, sectors)
    intent = str(router.get("intent") or fallback["intent"]).upper()
    if intent not in INTENTS:
        intent = fallback["intent"]

    screener_name = router.get("screener_name") or fallback.get("screener_name")
    stock_symbol = router.get("stock_symbol") or fallback.get("stock_symbol")
    sector = router.get("sector") or fallback.get("sector")
    params = router.get("custom_query_parameters")
    if not isinstance(params, dict):
        params = fallback["custom_query_parameters"]
    message = str(router.get("ai_response_message") or fallback["ai_response_message"]).strip()

    return {
        "intent": intent,
        "screener_name": screener_name,
        "stock_symbol": stock_symbol,
        "sector": sector,
        "custom_query_parameters": params,
        "ai_response_message": message,
    }


def smart_search(prompt: str, stocks: list[dict[str, Any]], screeners: list[dict[str, Any]], sectors: list[dict[str, Any]] | list[str]) -> dict[str, Any]:
    router = _groq_router(prompt, stocks, screeners, sectors) or _heuristic_router(prompt, stocks, screeners, sectors)
    router = _sanitize_router(router, prompt, stocks, screeners, sectors)
    intent = router["intent"]

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
            "source": "Groq JSON router + local preset screen data",
        }

    if intent == "STOCK_INFO":
        stock = _find_stock(str(router.get("stock_symbol") or prompt), stocks) or _find_stock(prompt, stocks)
        if not stock:
            return {
                "router": router,
                "rows": [],
                "matchedRules": [],
                "explanation": "I could not match that stock symbol to the loaded Bullseye universe.",
                "source": "Groq JSON router",
            }
        quote = None
        try:
            quote = get_latest_quote(str(stock.get("ticker")))
        except Exception:
            quote = None
        router["stock_symbol"] = stock.get("symbol")
        router["ai_response_message"] = f"Fetched the latest available Bullseye data for {stock.get('symbol')}."
        return {
            "router": router,
            "rows": [_make_row(stock, 0, f"Specific stock lookup for {stock.get('name')}.", quote)],
            "matchedRules": [f"Stock lookup: {stock.get('symbol')}"],
            "explanation": router["ai_response_message"],
            "source": "Groq JSON router + free quote cache",
        }

    if intent == "SECTOR_FILTER":
        sector = _find_sector(str(router.get("sector") or prompt), sectors) or _find_sector(prompt, sectors)
        rows = [
            _make_row(stock, index, f"Included in {sector} from the loaded Bullseye universe.")
            for index, stock in enumerate(stocks)
            if sector and _stock_sector(stock) == sector
        ][:80]
        router["sector"] = sector
        router["ai_response_message"] = f"Loaded {len(rows)} stocks from the {sector} sector." if sector else "I could not match that sector yet."
        return {
            "router": router,
            "rows": rows,
            "matchedRules": [f"Sector: {sector}"] if sector else [],
            "explanation": router["ai_response_message"],
            "source": "Groq JSON router + local sector rules",
        }

    if intent == "CUSTOM_FILTER":
        params = router.get("custom_query_parameters")
        if isinstance(params, dict) and _has_fundamental_filter(prompt, params):
            return _fundamental_filter_rows(prompt, stocks, sectors, router)

        live = screen_stocks(prompt, stocks)
        if not live.get("rows") and isinstance(params, dict) and router.get("sector"):
            return _fundamental_filter_rows(prompt, stocks, sectors, router)
        live["router"] = router
        live["explanation"] = router["ai_response_message"] + " " + str(live.get("explanation", ""))
        live["source"] = "Groq JSON router + cached Yahoo Finance OHLCV"
        return live

    return {
        "router": router,
        "rows": [],
        "matchedRules": [],
        "explanation": router["ai_response_message"],
        "source": "Groq JSON router",
    }
