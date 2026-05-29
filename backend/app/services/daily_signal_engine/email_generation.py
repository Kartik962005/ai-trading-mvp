from __future__ import annotations

from html import escape
from typing import Any


def _format_percent(value: float | None, digits: int = 0) -> str:
    if value is None:
        return "n/a"
    return f"{value:.{digits}%}"


def _count_phrase(count: int) -> str:
    """Headline phrase that never over-promises a fixed number of signals."""
    if count == 0:
        return "No stock signals passed today's filters"
    if count == 1:
        return "1 stock signal (up to 10 daily)"
    return f"{count} stock signals (up to 10 daily)"


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
        f"<div style='font-size:13px;line-height:1.65;color:#cbd5e1'>"
        f"<strong style='color:#f8fafc'>{escape(lead)}</strong><br/>"
        f"{escape(technical)}<br/>"
        f"{escape(metrics + quality)}"
        f"</div>"
    )
    text_reason = f"{lead} {technical} {metrics}{quality}"
    return html_reason, text_reason


def _metric_block(label: str, value: str) -> str:
    return (
        "<td style='padding:0 6px 10px 0;vertical-align:top'>"
        f"<div style='font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#67e8f9;font-weight:700;margin-bottom:4px'>{escape(label)}</div>"
        f"<div style='font-size:15px;line-height:1.5;color:#f8fafc'>{escape(value)}</div>"
        "</td>"
    )


def build_signal_email(
    *,
    signal_date: str,
    market: str,
    signals: list[dict[str, Any]],
    unsubscribe_url: str,
    risk_level: str,
    signal_type: str,
) -> tuple[str, str, str]:
    subject = f"Bullseye {market} next-trading-day stock signals | generated {signal_date}"
    card_rows: list[str] = []
    text_rows: list[str] = []

    for index, signal in enumerate(signals, 1):
        html_reason, text_reason = _detail_reason(signal)
        card_rows.append(
            "<div style='margin-bottom:16px;border:1px solid #243041;border-radius:18px;background:#0f172a;padding:18px'>"
            "<table role='presentation' style='width:100%;border-collapse:collapse'>"
            "<tr>"
            "<td style='padding-bottom:12px'>"
            f"<div style='font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#67e8f9;font-weight:700'>Signal {index}</div>"
            f"<div style='font-size:28px;line-height:1.2;color:#f8fafc;font-weight:800;margin-top:6px'>{escape(signal['symbol'])}</div>"
            f"<div style='font-size:13px;line-height:1.5;color:#cbd5e1;margin-top:4px'>{escape(signal.get('company_name') or signal['symbol'])} | {escape(signal['direction'])}</div>"
            "</td>"
            "</tr>"
            "<tr>"
            f"{_metric_block('Entry', f'{signal['entry_low']:.2f} - {signal['entry_high']:.2f}')}"
            f"{_metric_block('Target', f'{signal['target_price']:.2f}')}"
            "</tr>"
            "<tr>"
            f"{_metric_block('Stop Loss', f'{signal['stop_loss']:.2f}')}"
            f"{_metric_block('Confidence', _format_percent(signal.get('confidence'), 0))}"
            "</tr>"
            "<tr>"
            f"{_metric_block('Risk / Reward', f'{signal['risk_reward']:.2f}')}"
            f"{_metric_block('Setup Type', str(signal.get('setup_type') or 'Model-ranked setup').replace('_', ' ').title())}"
            "</tr>"
            "<tr><td colspan='2' style='padding-top:4px'>"
            "<div style='font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#67e8f9;font-weight:700;margin-bottom:6px'>Why Bullseye Suggested This</div>"
            f"{html_reason}"
            "</td></tr>"
            "</table>"
            "</div>"
        )

        text_rows.append(
            f"{index}. {signal['symbol']} {signal['direction']}\n"
            f"Entry: {signal['entry_low']:.2f}-{signal['entry_high']:.2f}\n"
            f"Target: {signal['target_price']:.2f}\n"
            f"Stop Loss: {signal['stop_loss']:.2f}\n"
            f"Confidence: {_format_percent(signal.get('confidence'), 0)}\n"
            f"Risk / Reward: {signal['risk_reward']:.2f}\n"
            f"Setup Type: {str(signal.get('setup_type') or 'Model-ranked setup').replace('_', ' ').title()}\n"
            f"Why: {text_reason}\n"
        )

    html = (
        "<div style='font-family:Inter,Arial,sans-serif;background:#111827;padding:16px;color:#0f172a'>"
        "<div style='max-width:720px;margin:0 auto;background:#111827;border:1px solid #243041;border-radius:22px;overflow:hidden'>"
        "<div style='padding:24px;background:#0f172a;color:#f8fafc'>"
        "<div style='font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#67e8f9;font-weight:700'>Bullseye Signals</div>"
        f"<h1 style='margin:10px 0 0;font-size:26px;line-height:1.25;color:#f8fafc'>{_count_phrase(len(signals))} for the next trading day</h1>"
        f"<p style='margin:10px 0 0;color:#cbd5e1;font-size:14px;line-height:1.6'>Up to 10 stocks are sent each day &mdash; only the names that clear every quality, liquidity and risk filter are included, so some days have fewer.</p>"
        f"<p style='margin:8px 0 0;color:#cbd5e1;font-size:14px;line-height:1.6'>Market: {escape(market)} | Generated on: {escape(signal_date)} | Risk: {escape(risk_level)} | Signal type: {escape(signal_type)}</p>"
        "</div>"
        "<div style='padding:16px'>"
        + ("".join(card_rows) if card_rows else "<div style='padding:18px;color:#e2e8f0'>No signals passed the quality filters for the next trading day.</div>")
        + "<div style='margin-top:8px;padding:16px;border-radius:14px;background:#eff6ff;color:#1e293b;font-size:13px;line-height:1.7'>"
        "Signals are model-generated analysis for research use only. Returns are not guaranteed. "
        "Past performance does not guarantee future results. You can turn alerts off anytime in your account settings."
        "</div>"
        f"<div style='margin-top:16px;font-size:12px;line-height:1.6'><a href='{escape(unsubscribe_url)}' style='color:#67e8f9'>Unsubscribe from daily stock emails</a></div>"
        "</div></div></div>"
    )

    text = (
        f"Bullseye {market} next-trading-day stock signals\n"
        f"{_count_phrase(len(signals))}. Up to 10 stocks are sent each day; only names that clear every "
        f"quality, liquidity and risk filter are included, so some days have fewer.\n"
        f"Generated on: {signal_date} | Risk level: {risk_level} | Signal type: {signal_type}\n\n"
        + ("\n".join(text_rows) if text_rows else "No signals passed the quality filters for the next trading day.")
        + "\nSignals are model-generated analysis. Returns are not guaranteed. Past performance does not guarantee future results.\n"
        + f"Unsubscribe: {unsubscribe_url}"
    )
    return subject, text, html
