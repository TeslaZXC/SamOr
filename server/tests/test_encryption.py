import os
import io
import shutil
from fastapi.testclient import TestClient
from app.crypto.file_encryption import file_encryptor
from main import app

client = TestClient(app)

def test_encryption_flow():
    # 1. Prepare dummy data
    original_content = b"This is a secret image content."
    filename = "test_image.png"
    file_obj = io.BytesIO(original_content)
    
    # 2. Upload file via the upload endpoint
    # The actual endpoint is in app/upload.py: @router.post("/upload")
    # It calls upload_file_locally which we mocked/modified.
    
    response = client.post(
        "/api/upload",
        files={"file": (filename, file_obj, "image/png")}
    )
    
    assert response.status_code == 200, f"Upload failed: {response.text}"
    data = response.json()
    print(f"Upload Response: {data}")
    
    url = data["url"]
    # URL format: http://localhost:8000/api/files/{uuid}.png
    # Extract the path for the GET request: /api/files/{uuid}.png
    
    # The URL returned is likely absolute "http://localhost:8000...", we need relative for TestClient
    relative_url = url.replace("http://localhost:8000", "")
    unique_name = relative_url.split("/")[-1]
    
    # 3. Verify file on disk is encrypted
    enc_path = os.path.join("static/uploads", unique_name + ".enc")
    assert os.path.exists(enc_path), "Encrypted file not found on disk"
    
    with open(enc_path, "rb") as f:
        disk_content = f.read()
        assert disk_content != original_content, "File on disk is NOT encrypted!"
        
    print("Disk check passed: File is encrypted.")
    
    # 4. Fetch via new API endpoint
    response = client.get(relative_url)
    assert response.status_code == 200, f"Retrieval failed: {response.text}"
    retrieved_content = response.content
    
    assert retrieved_content == original_content, "Decrypted content does not match original!"
    print("Retrieval check passed: Content matches.")

if __name__ == "__main__":
    try:
        test_encryption_flow()
        print("ALL TESTS PASSED")
    except Exception as e:
        print(f"TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
