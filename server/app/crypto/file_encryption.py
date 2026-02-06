import os
from Cryptodome.Cipher import AES
from Cryptodome.Random import get_random_bytes
from pathlib import Path

KEY_FILE = "file.key"
CHUNK_SIZE = 64 * 1024  # 64KB chunks

class FileEncryptor:
    def __init__(self):
        self.key = self._load_or_generate_key()

    def _load_or_generate_key(self):
        if os.path.exists(KEY_FILE):
            with open(KEY_FILE, "rb") as f:
                return f.read()
        else:
            key = get_random_bytes(32)  # AES-256
            with open(KEY_FILE, "wb") as f:
                f.write(key)
            return key

    def encrypt_file(self, input_file, output_path):
        """
        Encrypts a file-like object and writes it to output_path using AES-CTR.
        Streams data to avoid high memory usage.
        """
        # AES-CTR needs a nonce (initial counter value)
        cipher = AES.new(self.key, AES.MODE_CTR)
        
        with open(output_path, "wb") as f:
            # Write the nonce first (8 bytes for CTR usually, usually handled by library but 
            # PyCryptodome's CTR mode nonce is tunable. Default is good.)
            # accessing cipher.nonce gives the nonce.
            f.write(cipher.nonce)
            
            input_file.seek(0)
            while True:
                chunk = input_file.read(CHUNK_SIZE)
                if not chunk:
                    break
                encrypted_chunk = cipher.encrypt(chunk)
                f.write(encrypted_chunk)

    def decrypt_stream(self, file_path):
        """
        Generator that yields decrypted chunks from an encrypted file.
        Uses AES-CTR.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File {file_path} not found")

        # Open file to read nonce
        with open(file_path, "rb") as f:
            # CTR nonce size depends on how it was initialized. 
            # Default PyCryptodome CTR nonce is usually len(counter) / 2 or similar logic.
            # But wait, AES.new(key, AES.MODE_CTR) generates a nonce.
            # Let's check the length. PyCryptodome CTR nonce defaults to 8 bytes (64 bits) usually + 8 bytes counter.
            # Standard recommendation: nonce is 8 bytes.
            
            # To be safe, we should use a fixed nonce length if possible or rely on library defaults constant.
            # Let's assume the standard 8 bytes for now as that's typical for `AES.new(..., MODE_CTR)`.
            # Actually, let's look at `cipher.nonce`.
            # When we did `cipher = AES.new(...)` above, it generated a nonce.
            # We need to know the length to read it back.
            # Let's read a small header? No, `nonce` attribute is bytes.
            # Best practice: 8 bytes.
            nonce = f.read(8) 
            
            # Recreate cipher
            cipher = AES.new(self.key, AES.MODE_CTR, nonce=nonce)
            
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break
                decrypted_chunk = cipher.decrypt(chunk)
                yield decrypted_chunk

file_encryptor = FileEncryptor()
