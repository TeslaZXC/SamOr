import shutil
import os
import uuid
from app.crypto.file_encryption import file_encryptor

UPLOAD_DIR = "static/uploads"

def upload_file_locally(file_obj, filename, content_type=None):
    """Save a file-like object to local disk via streaming"""
    
    # Ensure directory exists (redundancy check)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    # Generate unique name
    ext = filename.split(".")[-1] if "." in filename else "bin"
    unique_name = f"{uuid.uuid4()}.{ext}"
    
    # We save as .enc
    file_path = os.path.join(UPLOAD_DIR, unique_name + ".enc")
    
    try:
        # Encrypt and save
        file_encryptor.encrypt_file(file_obj, file_path)
            
    except Exception as e:
        print(f"Local Upload Error: {e}")
        return None

    # Construct the URL
    # Point to the new dynamic endpoint that decrypts on the fly
    url = f"/api/files/{unique_name}"
        
    return url
