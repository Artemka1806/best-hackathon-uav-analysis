import json
import logging
import tempfile
import time
from pathlib import Path

import google.genai as genai
from google.genai import errors as genai_errors
from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core import settings
from core.utils import sanitize
from services.flight_analysis import analyze_flight_log
from services.flight_parser import parse_flight_log, convert_gps_to_enu

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])
MAX_GEMINI_RETRIES = 3

# Mapping filename -> path to temp JSON file with parsed data
_parsed_logs: dict[str, Path] = {}


class AISummaryRequest(BaseModel):
    filename: str | None = None
    ai_context_toon: str = ""


def _save_parsed(filename: str, data: dict) -> Path:
    tmp = tempfile.NamedTemporaryFile(
        prefix=f"uav_{filename}_", suffix=".json", delete=False, mode="w"
    )
    json.dump(data, tmp)
    tmp.close()
    return Path(tmp.name)


def _load_parsed(filename: str) -> dict:
    path = _parsed_logs.get(filename)
    if path is None or not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    logger.info("Received file for analysis: %s", file.filename)

    if not file.filename or not file.filename.lower().endswith(".bin"):
        raise HTTPException(status_code=400, detail="Only .BIN flight log files are supported")

    data = await file.read()
    result = parse_flight_log(data)
    result = sanitize(result)

    path = _save_parsed(file.filename, result)
    _parsed_logs[file.filename] = path
    logger.info("Saved parsed log to %s", path)

    msg_types = list(result.keys())
    return {
        "filename": file.filename,
        "message_types": msg_types,
        "total_types": len(msg_types),
    }


@router.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    logger.info("Received file for full analysis: %s", file.filename)

    if not file.filename or not file.filename.lower().endswith(".bin"):
        raise HTTPException(status_code=400, detail="Only .BIN flight log files are supported")

    data = await file.read()
    try:
        parsed = sanitize(parse_flight_log(data))
        result = analyze_flight_log(data, parsed=parsed)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Unexpected analysis failure")
        raise HTTPException(status_code=500, detail="Failed to analyze flight log") from exc

    path = _save_parsed(file.filename, parsed)
    _parsed_logs[file.filename] = path

    return {
        "filename": file.filename,
        **result,
    }


@router.post("/ai-summary")
async def generate_ai_summary(payload: AISummaryRequest):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="AI assistant is not configured. Set GEMINI_API_KEY in backend/.env.")

    if not payload.ai_context_toon.strip():
        raise HTTPException(status_code=400, detail="AI context is empty")

    prompt = (
        "You are an interactive AI assistant for UAV flight telemetry analysis.\n"
        "Your job is to help the user understand this specific flight and answer follow-up questions about it.\n"
        "Treat this as an ongoing conversation, not as a one-off static report.\n"
        "When the user asks a direct question, answer that question directly first, then add supporting analysis if useful.\n"
        "If the user asks for interpretation, hypotheses, or likely causes, reason from the provided telemetry and state uncertainty clearly.\n"
        "Use HTML fragments instead of Markdown.\n"
        "Do not use markdown syntax.\n"
        "Return only safe HTML with tags like <div>, <p>, <ul>, <li>, <strong>, <em>, <h4>.\n"
        "Do not add <html>, <body>, <script>, or <style>.\n"
        "Be concise, numeric, and rely only on the provided analysis.\n\n"
        f"flight_filename: {payload.filename or 'unknown'}\n"
        "analysis_toon:\n"
        f"{payload.ai_context_toon}"
    )

    client = genai.Client(api_key=settings.gemini_api_key)

    def generate():
        for attempt in range(MAX_GEMINI_RETRIES):
            try:
                stream = client.models.generate_content_stream(
                    model=settings.gemini_model,
                    contents=[prompt],
                )
                for chunk in stream:
                    text = getattr(chunk, "text", None)
                    if text:
                        yield text
                return
            except genai_errors.ServerError as exc:
                is_retryable = "503" in str(exc) or "UNAVAILABLE" in str(exc)
                if not is_retryable or attempt == MAX_GEMINI_RETRIES - 1:
                    raise
                yield f"<p><em>Model temporarily unavailable, retrying ({attempt + 1}/{MAX_GEMINI_RETRIES - 1})...</em></p>"
                time.sleep(1.5 * (attempt + 1))

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


@router.post("/upload/enu-stream")
async def upload_enu_stream(file: UploadFile = File(...)):
    logger.info("Received file for ENU stream: %s", file.filename)

    if not file.filename or not file.filename.lower().endswith(".bin"):
        raise HTTPException(status_code=400, detail="Only .BIN flight log files are supported")

    data = await file.read()

    try:
        enu_data = convert_gps_to_enu(data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    def generate():
        origin = enu_data["origin"]
        yield json.dumps({"type": "origin", "lat": origin["lat"], "lon": origin["lon"], "alt": origin["alt"]}) + "\n"
        for pt in enu_data["points"]:
            yield json.dumps({"e": pt["e"], "n": pt["n"], "u": pt["u"],
                              "lat": pt["lat"], "lon": pt["lon"], "alt": pt["alt"], "t": pt["t"],
                              "roll": pt.get("roll", 0), "pitch": pt.get("pitch", 0), "yaw": pt.get("yaw", 0)}) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@router.get("/logs/{filename}/messages")
async def get_messages(
    filename: str,
    msg_type: str | None = Query(None, description="Message type (e.g. PARM, GPS, ATT)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    log_data = _load_parsed(filename)
    if log_data is None:
        raise HTTPException(status_code=404, detail="Log not found. Upload it first.")

    if msg_type is None:
        msg_types = list(log_data.keys())
        return {
            "filename": filename,
            "message_types": msg_types[offset:offset + limit],
            "total": len(msg_types),
            "offset": offset,
            "limit": limit,
        }

    if msg_type not in log_data:
        raise HTTPException(status_code=404, detail=f"Message type '{msg_type}' not found in log")

    type_data = log_data[msg_type]

    # type_data is a dict of field_name -> list[values]
    # Paginate by row index across all fields
    if isinstance(type_data, dict):
        first_field = next(iter(type_data.values()), [])
        total = len(first_field) if isinstance(first_field, list) else 0
        page = {k: v[offset:offset + limit] if isinstance(v, list) else v for k, v in type_data.items()}
    else:
        total = len(type_data) if isinstance(type_data, list) else 0
        page = type_data[offset:offset + limit] if isinstance(type_data, list) else type_data

    return {
        "filename": filename,
        "message_type": msg_type,
        "total": total,
        "offset": offset,
        "limit": limit,
        "data": page,
    }
