from fastapi import APIRouter, UploadFile, File, HTTPException
from app.file_utils import upload_file_locally
import uuid

router = APIRouter()

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # Validate file type (basic)
    # Allow all files as per request for sending large files up to 1GB
    # if not file.content_type.startswith("image/") and not file.content_type.startswith("audio/"):
    #      pass

    url = upload_file_locally(file.file, file.filename, content_type=file.content_type)
    
    if not url:
        raise HTTPException(status_code=500, detail="Failed to upload to storage")
        
    return {"url": url, "filename": file.filename, "content_type": file.content_type}
