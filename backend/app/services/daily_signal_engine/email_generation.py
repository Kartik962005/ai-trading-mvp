from __future__ import annotations

from html import escape
from typing import Any


def _format_percent(value: float | None, digits: int = 0) -> str:
    if value is None:
        return "n/a"
    return f"{value:.{digits}%}"


def _detail_reason(signal: dict[str, Any]) -> tuple[str, str]:
    explanation = signal.get("explanation_json") or {}
    reasons = explanation.get("reasons") or signal.get("reasons") or []
    probabilities = explanation.get("probabilities") or {}
    validation = explanation.get("validation") or {}
    direction = signal.get("direction", "BUY")
    setup = str(signal.get("setup_type") or "model-ranked setup").replace("_", " ")
    relative_strength = explanation.get("relative_strength", signal.get("relative_strength"))
    sector_strength = explanation.get("sector_strength")
    confidence = signal.get("confidence")
    regime_alignment = signal.get("market_regime_alignment")

    lead = (
        f"Bullseye suggests {direction} because the setup scored well on "
        f"{', '.join(reasons[:3]) if reasons else 'trend, momentum, and risk filters'}."
    )
    technical = (
        "Indicators reviewed: EMA 20 / EMA 50 trend alignment, breakout or breakdown versus recent support and resistance, "
        "volume versus the 20-day average, RSI(14), ADX(14), relative strength versus the market index, sector strength, "
        "liquidity checks, volatility filters, and model confidence scoring."
    )
    metrics = f"Setup type: {setup}. Confidence: {_format_percent(confidence, 0)}. "
    metrics += (
        f"Relative strength vs index: {relative_strength:.2f}%. " if isinstance(relative_strength, (int, float)) else ""
    )
    metrics += (
        f"Sector strength: {sector_strength:.2f}. " if isinstance(sector_strength, (int, float)) else ""
    )
    metrics += (
        f"Market regime alignment: {regime_alignment:.2f}. " if isinstance(regime_alignment, (int, float)) else ""
    )
    quality = (
        "Data quality passed liquidity, stale-data, spread, and abnormal-volatility checks."
        if validation.get("is_valid", True)
        else f"Validation notes: {', '.join(validation.get('rejections') or [])}."
    )

    html_reason = (
        f"<div style='font-size:13px;line-height:1.65;color:#334155'>"
        f"<strong style='color:#0f172a'>{escape(lead)}</strong><br/>"
        f"{escape(technical)}<br/>"
        f"{escape(metrics + quality)}"
        f"</div>"
    )
    text_reason = f"{lead} {technical} {metrics}{quality}"
    return html_reason, text_reason


def _metric_block(label: str, value: str) -> str:
    return (
        "<td style='padding:0 12px 12px 0;vertical-align:top;width:50%'>"
        f"<div style='font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;font-weight:700;margin-bottom:4px'>{escape(label)}</div>"
        f"<div style='font-size:15px;line-height:1.5;color:#0f172a;font-weight:700'>{escape(value)}</div>"
        "</td>"
    )


_CONVICTION_STYLE = {
    "high": ("#065f46", "#ecfdf5", "#a7f3d0"),
    "moderate": ("#92400e", "#fffbeb", "#fde68a"),
    "low": ("#9a3412", "#fff7ed", "#fed7aa"),
    "none": ("#9a3412", "#fff7ed", "#fed7aa"),
}


def _conviction_banner(conviction: dict[str, Any] | None) -> tuple[str, str]:
    if not conviction:
        return "", ""
    level = str(conviction.get("level") or "moderate").lower()
    note = str(conviction.get("note") or "")
    fg, bg, border = _CONVICTION_STYLE.get(level, _CONVICTION_STYLE["moderate"])
    label = f"Today's conviction: {level.upper()}"
    html = (
        f"<div style='margin:0 0 16px;padding:14px 16px;background:{bg};border:1px solid {border};"
        f"border-radius:6px;color:{fg};font-size:13px;line-height:1.6'>"
        f"<strong style='display:block;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px'>{escape(label)}</strong>"
        f"{escape(note)}"
        "</div>"
    )
    text = f"{label}\n{note}\n\n"
    return html, text


def build_signal_email(
    *,
    signal_date: str,
    market: str,
    signals: list[dict[str, Any]],
    unsubscribe_url: str,
    risk_level: str,
    signal_type: str,
    conviction: dict[str, Any] | None = None,
) -> tuple[str, str, str]:
    signal_label = str(signal_type or "next-trading-day").replace("_", " ").strip()
    subject = f"Bullseye {market} {signal_label} stock signals | generated {signal_date}"
    conviction_html, conviction_text = _conviction_banner(conviction)
    card_rows: list[str] = []
    text_rows: list[str] = []

    for index, signal in enumerate(signals, 1):
        html_reason, text_reason = _detail_reason(signal)
        symbol = str(signal["symbol"])
        direction = str(signal["direction"])
        company_name = str(signal.get("company_name") or symbol)
        entry_range = f"{signal['entry_low']:.2f} - {signal['entry_high']:.2f}"
        target_price = f"{signal['target_price']:.2f}"
        stop_loss = f"{signal['stop_loss']:.2f}"
        risk_reward = f"{signal['risk_reward']:.2f}"
        setup_type = str(signal.get("setup_type") or "Model-ranked setup").replace("_", " ").title()
        card_rows.append(
            "<table role='presentation' style='width:100%;border-collapse:collapse;margin-bottom:16px;border:1px solid #dbeafe;background:#ffffff'>"
            "<tr>"
            "<td colspan='2' style='padding:18px 18px 12px 18px;background:#eff6ff;border-bottom:1px solid #dbeafe'>"
            f"<div style='font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#2563eb;font-weight:700'>Signal {index}</div>"
            f"<div style='font-size:28px;line-height:1.2;color:#0f172a;font-weight:800;margin-top:6px'>{escape(symbol)}</div>"
            f"<div style='font-size:13px;line-height:1.5;color:#334155;margin-top:4px'>{escape(company_name)} | {escape(direction)}</div>"
            "</td>"
            "</tr>"
            "<tr><td colspan='2' style='padding:18px 18px 0 18px'><table role='presentation' style='width:100%;border-collapse:collapse'><tr>"
            f"{_metric_block('Entry', entry_range)}"
            f"{_metric_block('Target', target_price)}"
            "</tr>"
            "<tr>"
            f"{_metric_block('Stop Loss', stop_loss)}"
            f"{_metric_block('Confidence', _format_percent(signal.get('confidence'), 0))}"
            "</tr>"
            "<tr>"
            f"{_metric_block('Risk / Reward', risk_reward)}"
            f"{_metric_block('Setup Type', setup_type)}"
            "</tr></table></td></tr>"
            "<tr><td colspan='2' style='padding:4px 18px 18px 18px'>"
            "<div style='font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#2563eb;font-weight:700;margin-bottom:6px'>Why Bullseye Suggested This</div>"
            f"{html_reason}"
            "</td></tr>"
            "</table>"
        )

        text_rows.append(
            f"{index}. {symbol} {direction}\n"
            f"Entry: {entry_range}\n"
            f"Target: {target_price}\n"
            f"Stop Loss: {stop_loss}\n"
            f"Confidence: {_format_percent(signal.get('confidence'), 0)}\n"
            f"Risk / Reward: {risk_reward}\n"
            f"Setup Type: {setup_type}\n"
            f"Why: {text_reason}\n"
        )

    html = (
        "<table role='presentation' style='width:100%;border-collapse:collapse;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a'>"
        "<tr><td style='padding:18px'>"
        "<table role='presentation' style='width:100%;max-width:720px;margin:0 auto;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0'>"
        "<tr><td style='padding:24px;background:#0f172a;color:#ffffff'>"
        "<div style='font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#93c5fd;font-weight:700'>Bullseye Signals</div>"
        f"<h1 style='margin:10px 0 0;font-size:26px;line-height:1.25;color:#ffffff'>Top {len(signals)} {escape(market)} {escape(signal_label)} stock signals</h1>"
        f"<p style='margin:10px 0 0;color:#dbeafe;font-size:14px;line-height:1.6'>Generated on: {escape(signal_date)} | Risk: {escape(risk_level)} | Signal type: {escape(signal_type)}</p>"
        "</td></tr>"
        "<tr><td style='padding:16px'>"
        + conviction_html
        + ("".join(card_rows) if card_rows else "<div style='padding:18px;color:#334155'>No signals passed the quality filters for the next trading day.</div>")
        + "<div style='margin-top:8px;padding:16px;background:#eff6ff;color:#1e293b;font-size:13px;line-height:1.7'>"
        "Signals are model-generated analysis for research use only. Returns are not guaranteed. "
        "Past performance does not guarantee future results. You can turn alerts off anytime in your account settings."
        "</div>"
        f"<div style='margin-top:16px;font-size:12px;line-height:1.6'><a href='{escape(unsubscribe_url)}' style='color:#2563eb'>Unsubscribe from daily stock emails</a></div>"
        "</td></tr></table></td></tr></table>"
    )

    text = (
        f"Bullseye {market} {signal_label} stock signals\n"
        f"Generated on: {signal_date} | Risk level: {risk_level} | Signal type: {signal_type}\n\n"
        + conviction_text
        + ("\n".join(text_rows) if text_rows else "No signals passed the quality filters for the next trading day.")
        + "\nSignals are model-generated analysis. Returns are not guaranteed. Past performance does not guarantee future results.\n"
        + f"Unsubscribe: {unsubscribe_url}"
    )
    return subject, text, html
