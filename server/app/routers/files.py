from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
import os
import mimetypes
from app.crypto.file_encryption import file_encryptor

router = APIRouter()

UPLOAD_DIR = "static/uploads"

@router.get("/{filename}")
async def get_file(filename: str):
    # Security check: prevent directory traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path_plain = os.path.join(UPLOAD_DIR, filename)
    file_path_enc = os.path.join(UPLOAD_DIR, filename + ".enc")

    # Determine media type
    media_type, _ = mimetypes.guess_type(filename)
    if not media_type:
        media_type = "application/octet-stream"

    # 1. Try serving encrypted file
    if os.path.exists(file_path_enc):
        # Use the generator directly
        return StreamingResponse(
            file_encryptor.decrypt_stream(file_path_enc), 
            media_type=media_type
        )

    # 2. Try serving plain file (fallback)
    elif os.path.exists(file_path_plain):
        return FileResponse(file_path_plain, media_type=media_type)

    else:
        raise HTTPException(status_code=404, detail="File not found")
