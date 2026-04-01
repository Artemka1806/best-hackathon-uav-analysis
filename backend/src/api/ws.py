import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import google.genai as genai

from core import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


@router.websocket("/ws/chat")
async def chat(ws: WebSocket):
    await ws.accept()
    if not settings.gemini_api_key:
        await ws.send_text("AI assistant is not configured. Set GEMINI_API_KEY in backend/.env.")
        await ws.close()
        return

    client = genai.Client(api_key=settings.gemini_api_key)

    logger.info("WebSocket connection established")

    try:
        while True:
            user_message = await ws.receive_text()
            logger.info("User message: %s", user_message[:100])

            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=user_message,
            )

            await ws.send_text(response.text)
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
