import logging

logger = logging.getLogger(__name__)
import flight_parser  # noqa: E402


def parse_flight_log(data: bytes) -> dict:
    """Parse an Ardupilot .BIN flight log and return structured data as a dict."""
    logger.info("Parsing flight log (%d bytes)", len(data))
    result = flight_parser.parse_ardupilot_bin(data)
    logger.info("Parsed %d message types", len(result))
    return result
