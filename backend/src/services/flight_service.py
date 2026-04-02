import json
import logging
import tempfile
from pathlib import Path

from core.utils import sanitize
from services.flight_analysis import analyze_flight_log
from services.flight_parser import parse_flight_log, convert_gps_to_enu

logger = logging.getLogger(__name__)

# In-process cache: filename -> path to temp JSON with parsed data
_parsed_logs: dict[str, Path] = {}


def _save_parsed(filename: str, data: dict) -> Path:
    tmp = tempfile.NamedTemporaryFile(
        prefix=f"uav_{filename}_", suffix=".json", delete=False, mode="w"
    )
    json.dump(data, tmp)
    tmp.close()
    return Path(tmp.name)


def _load_parsed(filename: str) -> dict | None:
    path = _parsed_logs.get(filename)
    if path is None or not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


def upload_and_parse(filename: str, data: bytes) -> dict:
    result = sanitize(parse_flight_log(data))
    _parsed_logs[filename] = _save_parsed(filename, result)
    logger.info("Saved parsed log for %s", filename)
    msg_types = list(result.keys())
    return {
        "filename": filename,
        "message_types": msg_types,
        "total_types": len(msg_types),
    }


def analyze(filename: str, data: bytes) -> dict:
    parsed = sanitize(parse_flight_log(data))
    result = analyze_flight_log(data, parsed=parsed)
    _parsed_logs[filename] = _save_parsed(filename, parsed)
    return {"filename": filename, **result}


def enu_stream(data: bytes) -> dict:
    return convert_gps_to_enu(data)


def get_log_messages(filename: str, msg_type: str | None, offset: int, limit: int) -> dict | None:
    log_data = _load_parsed(filename)
    if log_data is None:
        return None

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
        return {"not_found": msg_type}

    type_data = log_data[msg_type]
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
