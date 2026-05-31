"""Unified LLM client.

Tries Groq first (fast, generous free tier) and falls back to Google Gemini
when Groq is unavailable, rate-limited, or errors out. Gemini is called over
plain REST so no extra pip dependency is required; it is only used when
GEMINI_API_KEY is set (Gemini's free tier allows ~15 requests/minute).
"""

import os

import requests

_groq_client = None


def _get_groq():
    global _groq_client
    if _groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return None
        from groq import Groq

        _groq_client = Groq(api_key=api_key)
    return _groq_client


def groq_available() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


def gemini_available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def _groq_chat(messages, temperature: float, max_tokens: int, model: str | None) -> str:
    client = _get_groq()
    if client is None:
        raise RuntimeError("GROQ_API_KEY is not set.")
    model = model or os.getenv("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile")
    completion = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return (completion.choices[0].message.content or "").strip()


def _gemini_chat(messages, temperature: float, max_tokens: int) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set.")
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    system_chunks: list[str] = []
    contents: list[dict] = []
    for message in messages:
        role = message.get("role")
        text = message.get("content") or ""
        if role == "system":
            system_chunks.append(text)
            continue
        contents.append(
            {
                "role": "model" if role == "assistant" else "user",
                "parts": [{"text": text}],
            }
        )

    body: dict = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if system_chunks:
        body["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_chunks)}]}

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    )
    response = requests.post(
        url,
        params={"key": api_key},
        json=body,
        timeout=40,
    )
    response.raise_for_status()
    payload = response.json()
    candidates = payload.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini returned no candidates.")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts).strip()
    if not text:
        raise RuntimeError("Gemini returned an empty response.")
    return text


def chat(
    messages: list[dict],
    *,
    temperature: float = 0.3,
    max_tokens: int = 1200,
    model: str | None = None,
    prefer: str = "groq",
) -> dict:
    """Return {"text": str, "model": "groq"|"gemini"}.

    Falls back to the other provider if the preferred one fails. Raises
    RuntimeError only when every available provider fails.
    """
    order = ["groq", "gemini"] if prefer == "groq" else ["gemini", "groq"]
    errors: list[str] = []
    for provider in order:
        try:
            if provider == "groq":
                if not groq_available():
                    continue
                return {"text": _groq_chat(messages, temperature, max_tokens, model), "model": "groq"}
            if provider == "gemini":
                if not gemini_available():
                    continue
                return {"text": _gemini_chat(messages, temperature, max_tokens), "model": "gemini"}
        except Exception as exc:  # noqa: BLE001 - we want to try the next provider
            errors.append(f"{provider}: {exc}")
            print(f"[LLM] {provider} failed: {exc}")
            continue
    raise RuntimeError(
        "No LLM provider succeeded. " + (" | ".join(errors) if errors else "No API keys configured.")
    )


def any_provider_available() -> bool:
    return groq_available() or gemini_available()
