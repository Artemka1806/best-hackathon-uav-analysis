import json
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Query

from core.utils import sanitize
from services.flight_parser import parse_flight_log

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])

# Mapping filename -> path to temp JSON file with parsed data
_parsed_logs: dict[str, Path] = {}


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
