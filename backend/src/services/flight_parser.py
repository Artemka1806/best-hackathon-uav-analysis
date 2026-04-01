import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

_NATIVE_DIR = Path(__file__).resolve().parent.parent / "native"
if str(_NATIVE_DIR) not in sys.path:
    sys.path.insert(0, str(_NATIVE_DIR))

import flight_parser  # noqa: E402


def parse_flight_log(data: bytes) -> dict:
    """Parse an Ardupilot .BIN flight log and return structured data as a dict."""
    logger.info("Parsing flight log (%d bytes)", len(data))
    result = flight_parser.parse_ardupilot_bin(data)
    logger.info("Parsed %d message types", len(result))
    return result


def convert_gps_to_enu(data: bytes) -> dict:
    """Convert GPS coordinates from a .BIN log to local ENU (meters) + geodetic coords."""
    logger.info("Converting GPS to ENU (%d bytes)", len(data))
    result = flight_parser.convert_gps_to_enu(data)
    logger.info("Converted %d GPS points", len(result.get("points", [])))
    return result


def analyze_flight_log_native(data: bytes) -> dict:
    """Run full flight analysis in the native module."""
    logger.info("Running native flight analysis (%d bytes)", len(data))
    result = flight_parser.analyze_flight_log(data)
    logger.info("Native analysis produced %d trajectory points", len(result.get("trajectory", {}).get("points", [])))
    return result
