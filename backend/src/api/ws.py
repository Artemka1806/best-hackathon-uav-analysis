import json
import logging
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import google.genai as genai
from google.genai import errors as genai_errors

from core import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])
MAX_GEMINI_RETRIES = 3


def _build_ai_prompt(
    filename: str | None,
    ai_context_toon: str,
    question: str,
) -> str:
    return (
        "You are an interactive AI assistant for UAV flight telemetry analysis.\n"
        "Your job is to help the user understand this specific flight and answer follow-up questions about it.\n"
        "Treat this as an ongoing conversation, not as a one-off static report.\n"
        "When the user asks a direct question, answer that question directly first, then add supporting analysis if useful.\n"
        "If the user asks for interpretation, hypotheses, or likely causes, reason from the provided telemetry and state uncertainty clearly.\n"
        "If the user changes the requested language, follow the user's latest language preference.\n"
        "You receive a full aggregated flight analysis payload serialized to TOON on the C++ side.\n"
        "Use an HTML fragment instead of Markdown.\n"
        "Do not use ``` blocks, headings with #, *, -, or markdown tables.\n"
        "Return only safe HTML using regular tags like <div>, <p>, <ul>, <li>, <strong>, <em>, <h4>.\n"
        "Do not add <html>, <body>, <script>, or <style>.\n"
        "Base your answer only on the provided analysis. Do not invent facts.\n"
        "If warnings or anomalies exist, explain them in a separate section.\n\n"
        f"flight_filename: {filename or 'unknown'}\n"
        "analysis_toon:\n"
        f"{ai_context_toon}\n\n"
        "user_request_in_english:\n"
        f"{question}"
    )

@router.websocket("/ws/chat")
async def chat(ws: WebSocket):
    await ws.accept()
    if not settings.gemini_api_key:
        await ws.send_text(json.dumps({"type": "error", "message": "AI assistant is not configured. Set GEMINI_API_KEY in backend/.env."}))
        await ws.close()
        return

    client = genai.Client(api_key=settings.gemini_api_key)

    logger.info("WebSocket connection established")
    ai_context_toon = ""
    filename = None
    history: list[dict[str, object]] = []

    try:
        while True:
            raw_message = await ws.receive_text()

            try:
                payload = json.loads(raw_message)
            except json.JSONDecodeError:
                payload = {"type": "question", "question": raw_message}

            message_type = payload.get("type", "question")
            logger.info(
                "WebSocket message received: type=%s bytes=%s",
                message_type,
                len(raw_message),
            )

            if message_type == "init":
                ai_context_toon = (payload.get("ai_context_toon") or "").strip()
                filename = payload.get("filename")
                question = payload.get("question") or (
                    "Provide an initial debrief for this flight: summarize what happened, "
                    "highlight the key metrics, explain any anomalies, and describe what they may indicate."
                )
                history = []
            else:
                question = payload.get("question") or ""

            if not ai_context_toon:
                await ws.send_text(json.dumps({"type": "error", "message": "Analysis context is empty. Analyze a flight first."}))
                continue

            if not question.strip():
                await ws.send_text(json.dumps({"type": "error", "message": "Question is empty."}))
                continue

            prompt = (
                _build_ai_prompt(filename, ai_context_toon, question)
                if message_type == "init"
                else question
            )
            logger.info(
                "Sending AI request: type=%s prompt_chars=%s context_chars=%s history_messages=%s",
                message_type,
                len(prompt),
                len(ai_context_toon),
                len(history),
            )
            await ws.send_text(json.dumps({"type": "start"}))

            full_response = []
            for attempt in range(MAX_GEMINI_RETRIES):
                try:
                    contents = history + [{"role": "user", "parts": [{"text": prompt}]}]
                    stream = client.models.generate_content_stream(
                        model=settings.gemini_model,
                        contents=contents,
                    )
                    for chunk in stream:
                        text = getattr(chunk, "text", None)
                        if text:
                            full_response.append(text)
                            await ws.send_text(json.dumps({"type": "chunk", "text": text}))
                    break
                except genai_errors.ServerError as exc:
                    is_retryable = "503" in str(exc) or "UNAVAILABLE" in str(exc)
                    if not is_retryable or attempt == MAX_GEMINI_RETRIES - 1:
                        raise
                    await ws.send_text(json.dumps({
                        "type": "chunk",
                        "text": f"<p><em>Model temporarily unavailable, retrying ({attempt + 1}/{MAX_GEMINI_RETRIES - 1})...</em></p>",
                    }))
                    await asyncio.sleep(1.5 * (attempt + 1))

            answer = "".join(full_response).strip()
            history.append({"role": "user", "parts": [{"text": prompt}]})
            history.append({"role": "model", "parts": [{"text": answer}]})
            await ws.send_text(json.dumps({"type": "done"}))
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
