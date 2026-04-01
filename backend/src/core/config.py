import logging
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_model: str = "gemini-2.0-flash"
    gemini_api_key: Optional[str] = None

    model_config = {"env_file": ".env"}


settings = Settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
