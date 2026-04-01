import logging

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_model: str
    gemini_api_key: str

    model_config = {"env_file": ".env"}


settings = Settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
