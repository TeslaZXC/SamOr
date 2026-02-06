import os
import sys
from pathlib import Path

# Add project root to path so we can import app modules
current_dir = Path(__file__).resolve().parent
# If script is in server/, then project root for imports (app) is current_dir
sys.path.append(str(current_dir))

from app.crypto.file_encryption import file_encryptor

UPLOAD_DIR = current_dir / "static" / "uploads"

def migrate_files():
    print(f"Scanning {UPLOAD_DIR}...")
    
    count = 0
    errors = 0
    
    for file_path in UPLOAD_DIR.iterdir():
        if not file_path.is_file():
            continue
            
        # Skip if already encrypted
        if file_path.suffix == ".enc":
            continue
            
        # Skip if there's already an encrypted version of this file
        enc_path = file_path.with_name(file_path.name + ".enc")
        if enc_path.exists():
            print(f"Skipping {file_path.name}: encrypted version already exists.")
            continue
            
        print(f"Encrypting {file_path.name}...")
        try:
            # Open the file and encrypt it to a temp path first
            temp_path = enc_path.with_suffix(".enc.tmp")
            
            with open(file_path, "rb") as f_in:
                file_encryptor.encrypt_file(f_in, temp_path)
                
            # Move temp to final .enc
            temp_path.replace(enc_path)
            
            # Remove original
            file_path.unlink()
            
            print(f" -> Encrypted and removed original.")
            count += 1
            
        except Exception as e:
            print(f"ERROR encrypting {file_path.name}: {e}")
            if temp_path.exists():
                temp_path.unlink()
            errors += 1
            
    print(f"\nMigration complete. Encrypted {count} files. Errors: {errors}")

if __name__ == "__main__":
    if not UPLOAD_DIR.exists():
        print(f"Directory {UPLOAD_DIR} not found.")
    else:
        migrate_files()
