import logging

from fastapi import APIRouter, UploadFile, File

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analysis"])


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    logger.info("Received file for analysis: %s", file.filename)
    return {"filename": file.filename, "status": "received"}
