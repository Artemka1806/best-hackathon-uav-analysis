import json
import logging

from fastapi import APIRouter, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse

import services.flight_service as svc

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])


def _validate_bin(filename: str | None) -> None:
    if not filename or not filename.lower().endswith(".bin"):
        raise HTTPException(status_code=400, detail="Only .BIN flight log files are supported")


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    logger.info("Received file for upload: %s", file.filename)
    _validate_bin(file.filename)
    return svc.upload_and_parse(file.filename, await file.read())


@router.post("/analyze")
async def analyze_file(file: UploadFile = File(...)):
    logger.info("Received file for analysis: %s", file.filename)
    _validate_bin(file.filename)
    try:
        return svc.analyze(file.filename, await file.read())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.exception("Unexpected analysis failure")
        raise HTTPException(status_code=500, detail="Failed to analyze flight log") from exc


@router.post("/upload/enu-stream")
async def upload_enu_stream(file: UploadFile = File(...)):
    logger.info("Received file for ENU stream: %s", file.filename)
    _validate_bin(file.filename)
    try:
        enu_data = svc.enu_stream(await file.read())
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    def generate():
        origin = enu_data["origin"]
        yield json.dumps({"type": "origin", "lat": origin["lat"], "lon": origin["lon"], "alt": origin["alt"]}) + "\n"
        for pt in enu_data["points"]:
            yield json.dumps({
                "e": pt["e"], "n": pt["n"], "u": pt["u"],
                "lat": pt["lat"], "lon": pt["lon"], "alt": pt["alt"], "t": pt["t"],
                "roll": pt.get("roll", 0), "pitch": pt.get("pitch", 0), "yaw": pt.get("yaw", 0),
            }) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@router.get("/logs/{filename}/messages")
async def get_messages(
    filename: str,
    msg_type: str | None = Query(None, description="Message type (e.g. PARM, GPS, ATT)"),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
):
    result = svc.get_log_messages(filename, msg_type, offset, limit)
    if result is None:
        raise HTTPException(status_code=404, detail="Log not found. Upload it first.")
    if "not_found" in result:
        raise HTTPException(status_code=404, detail=f"Message type '{result['not_found']}' not found in log")
    return result
