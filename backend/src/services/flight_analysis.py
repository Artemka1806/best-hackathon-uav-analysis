from typing import Any

from core.utils import sanitize
from services.flight_parser import analyze_flight_log_native


def analyze_flight_log(
    data: bytes,
    parsed: dict[str, Any] | None = None,
    trajectory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    del parsed
    del trajectory
    return sanitize(analyze_flight_log_native(data))
