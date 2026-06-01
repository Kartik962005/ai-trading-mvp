from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.core.supabase_client import supabase


CONVERSATIONS_TABLE = "ask_ai_conversations"
MESSAGES_TABLE = "ask_ai_messages"
TTL_DAYS = 5


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _expires_iso() -> str:
    return (_utc_now() + timedelta(days=TTL_DAYS)).isoformat()


def _supabase_required():
    if not supabase:
        raise ValueError("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
    return supabase


def _missing_history_table(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "ask_ai_conversations" in message
        or "ask_ai_messages" in message
        or "schema cache" in message
        or "pgrst205" in message
    )


def _title_from_prompt(prompt: str) -> str:
    clean = re.sub(r"\s+", " ", (prompt or "").strip())
    if not clean:
        return "Ask AI chat"
    return clean[:72]


def _compact_rows(rows: list[dict[str, Any]], *, limit: int = 5) -> str:
    parts: list[str] = []
    for row in rows[:limit]:
        symbol = row.get("symbol") or row.get("ticker") or row.get("name") or "stock"
        bits = [str(symbol)]
        for key in ("change_pct", "total_return_pct", "win_rate", "alpha_pct", "close"):
            if row.get(key) is not None:
                bits.append(f"{key}={row.get(key)}")
        parts.append(" ".join(bits))
    return "; ".join(parts)


def compact_structured_summary(data: dict[str, Any] | None) -> str | None:
    if not isinstance(data, dict):
        return None
    mode = data.get("mode")
    if mode == "movers" and isinstance(data.get("scan"), dict):
        scan = data["scan"]
        rows = scan.get("rows") or []
        if rows:
            return f"Previous movers result ({scan.get('session_date') or 'latest'}): {_compact_rows(rows)}"
    if mode == "cross_scan" and isinstance(data.get("scan"), dict):
        scan = data["scan"]
        rows = scan.get("rows") or []
        if rows:
            return f"Previous cross-stock scan: {_compact_rows(rows)}"
    if mode == "single_backtest" and isinstance(data.get("backtest"), dict):
        summary = data["backtest"].get("summary") or {}
        ticker = data.get("target_stock") or "selected stock"
        if summary:
            return (
                f"Previous backtest for {ticker}: trades={summary.get('total_trades')}, "
                f"win_rate={summary.get('win_rate')}%, return={summary.get('total_return_pct')}%, "
                f"profit_factor={summary.get('profit_factor')}"
            )
    return None


def cleanup_expired(user_id: str) -> None:
    try:
        sb = _supabase_required()
        sb.table(CONVERSATIONS_TABLE).delete().eq("user_id", user_id).lt("expires_at", _utc_now_iso()).execute()
    except Exception as exc:
        if not _missing_history_table(exc):
            print(f"[AskAIHistory] cleanup failed: {exc}")


def list_conversations(user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    try:
        cleanup_expired(user_id)
        sb = _supabase_required()
        response = (
            sb.table(CONVERSATIONS_TABLE)
            .select("id,title,created_at,updated_at,expires_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return getattr(response, "data", None) or []
    except Exception as exc:
        if _missing_history_table(exc):
            print(f"[AskAIHistory] history tables missing during list: {exc}")
            return []
        raise


def get_conversation(user_id: str, conversation_id: str) -> dict[str, Any]:
    try:
        cleanup_expired(user_id)
        sb = _supabase_required()
        conv_response = (
            sb.table(CONVERSATIONS_TABLE)
            .select("id,title,created_at,updated_at,expires_at")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        conversations = getattr(conv_response, "data", None) or []
        if not conversations:
            raise ValueError("Conversation not found.")
        msg_response = (
            sb.table(MESSAGES_TABLE)
            .select("id,role,content,data,created_at")
            .eq("conversation_id", conversation_id)
            .eq("user_id", user_id)
            .order("created_at")
            .execute()
        )
        return {"conversation": conversations[0], "messages": getattr(msg_response, "data", None) or []}
    except Exception as exc:
        if _missing_history_table(exc):
            print(f"[AskAIHistory] history tables missing during load: {exc}")
            raise ValueError("Ask-AI history tables are not installed yet.")
        raise


def ensure_conversation(user_id: str, conversation_id: str | None, first_prompt: str) -> dict[str, Any] | None:
    try:
        sb = _supabase_required()
        expiry = _expires_iso()
        now = _utc_now_iso()
        if conversation_id:
            response = (
                sb.table(CONVERSATIONS_TABLE)
                .select("id,title,created_at,updated_at,expires_at")
                .eq("id", conversation_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            rows = getattr(response, "data", None) or []
            if rows:
                updated = sb.table(CONVERSATIONS_TABLE).update({"updated_at": now, "expires_at": expiry}).eq("id", conversation_id).eq("user_id", user_id).execute()
                return (getattr(updated, "data", None) or rows)[0]
        payload = {
            "id": str(uuid4()),
            "user_id": user_id,
            "title": _title_from_prompt(first_prompt),
            "created_at": now,
            "updated_at": now,
            "expires_at": expiry,
        }
        response = sb.table(CONVERSATIONS_TABLE).insert(payload).execute()
        rows = getattr(response, "data", None) or []
        return rows[0] if rows else payload
    except Exception as exc:
        if _missing_history_table(exc):
            print(f"[AskAIHistory] history tables missing during conversation save: {exc}")
            return None
        raise


def _assistant_data(response: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": response.get("mode"),
        "model_used": response.get("model_used"),
        "target_stock": response.get("target_stock"),
        "backtest": response.get("backtest"),
        "scan": response.get("scan"),
        "suggestions": response.get("suggestions"),
    }


def save_turn(user_id: str, conversation_id: str | None, prompt: str, response: dict[str, Any]) -> str | None:
    conversation = ensure_conversation(user_id, conversation_id, prompt)
    if not conversation:
        return None
    conv_id = conversation["id"]
    now = _utc_now_iso()
    assistant_created_at = (_utc_now() + timedelta(milliseconds=1)).isoformat()
    expiry = _expires_iso()
    try:
        sb = _supabase_required()
        sb.table(MESSAGES_TABLE).insert([
            {
                "id": str(uuid4()),
                "conversation_id": conv_id,
                "user_id": user_id,
                "role": "user",
                "content": prompt,
                "data": None,
                "created_at": now,
            },
            {
                "id": str(uuid4()),
                "conversation_id": conv_id,
                "user_id": user_id,
                "role": "assistant",
                "content": str(response.get("answer") or ""),
                "data": _assistant_data(response),
                "created_at": assistant_created_at,
            },
        ]).execute()
        sb.table(CONVERSATIONS_TABLE).update({"updated_at": now, "expires_at": expiry}).eq("id", conv_id).eq("user_id", user_id).execute()
        return conv_id
    except Exception as exc:
        if _missing_history_table(exc):
            print(f"[AskAIHistory] history tables missing during message save: {exc}")
            return None
        raise


def history_for_llm(user_id: str, conversation_id: str | None, fallback_history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    history = list(fallback_history or [])
    if not conversation_id:
        return history
    try:
        loaded = get_conversation(user_id, conversation_id)
    except Exception:
        return history
    messages = loaded.get("messages") or []
    compact_history = [
        {"role": message.get("role"), "content": message.get("content")}
        for message in messages[-20:]
        if message.get("role") in {"user", "assistant"} and message.get("content")
    ]
    for message in reversed(messages):
        summary = compact_structured_summary(message.get("data"))
        if summary:
            compact_history.append({"role": "assistant", "content": summary})
            break
    return compact_history or history
