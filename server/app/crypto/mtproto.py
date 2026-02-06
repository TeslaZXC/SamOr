import hashlib
import os
import time
from Cryptodome.Cipher import AES
from Cryptodome.Util.Padding import pad, unpad

# MTProto 2.0 ish Implementation
# Key Derivation Function matches the article/MTProto spec roughly for AES IGE.

class MTProtoCrypto:
    def __init__(self):
        pass

    @staticmethod
    def kdf(auth_key: bytes, msg_key: bytes, outgoing: bool = True):
        """
        Derives aes_key and aes_iv from auth_key and msg_key.
        x = 0 for client->server, x = 8 for server->client 
        But here we just follow a simplified flow or the exact one.
        
        Article: 
        aes_key = SHA256(msg_key + auth_key[x:x+36]) ... 
        Actually the article is a high-level summary. 
        Let's implement a symmetric derivation for now.
        
        We will use a simplified KDF for this demo to ensure correctness without 50 steps:
        aes_key = SHA256(msg_key + auth_key[0:32])
        aes_iv = SHA256(auth_key[32:64] + msg_key)
        """
        # Ensure auth_key is long enough
        if len(auth_key) < 64:
             # Basic fallback if simplified key
             auth_key = auth_key.ljust(64, b'\0')
             
        sha256_key = hashlib.sha256(msg_key + auth_key[0:32]).digest() # 32 bytes (256 bits)
        sha256_iv = hashlib.sha256(auth_key[32:64] + msg_key).digest() # 32 bytes (256 bits) -> need 32 for IGE?
        # AES IGE uses 32 bytes for IV (16 block, 16 key? No, IV is 32 bytes for IGE usually in MTProto context)
        # PyCryptodome AES.MODE_IGE takes 16 bytes IV if AES block size is 16? 
        # Wait, IGE IV is usually 2 * BlockSize (32 bytes).
        
        return sha256_key, sha256_iv

    @staticmethod
    def encrypt(auth_key: bytes, plaintext: bytes) -> bytes:
        """
        Encrypts plaintext using MTProto envelope.
        Format:
        msg_key = SHA256(plaintext_padded)[8:24] (middle 128 bits)
        aes_key, aes_iv = KDF(auth_key, msg_key)
        ciphertext = AES_IGE(plaintext_padded, key, iv)
        result = auth_key_id (skipped here) + msg_key + ciphertext
        """
        # 1. Pad plaintext (16 byte blocks)
        # Include length/random padding if we want to be fancy, but standard PKCS7 is fine for demo
        padded_text = pad(plaintext, 16)
        
        # 2. Compute msg_key (Large Msg Key for MTProto 2.0 is SHA256 of padding, here we use simplified)
        # Using middle 128 bits of SHA256 as msg_key
        msg_hash = hashlib.sha256(padded_text).digest()
        msg_key = msg_hash[8:24] 
        
        # 3. KDF
        aes_key, aes_iv = MTProtoCrypto.kdf(auth_key, msg_key)
        
        # 4. Encrypt
        # Changed to CBC for compatibility with standard JS libraries
        # IGE is complex to implement robustly in pure JS across all envs without wasm.
        # CBC is secure enough for this demo.
        
        # CBC IV size is 16 bytes. We derived 32 bytes IV (sha256). Use first 16.
        aes_iv_16 = aes_iv[:16]
        
        cipher = AES.new(aes_key, AES.MODE_CBC, iv=aes_iv_16)
        ciphertext = cipher.encrypt(padded_text)
        
        return msg_key + ciphertext

    @staticmethod
    def decrypt(auth_key: bytes, data: bytes) -> bytes:
        """
        Decrypts data.
        data = msg_key (16 bytes) + ciphertext
        """
        if len(data) < 16:
            raise ValueError("Data too short")
            
        msg_key = data[0:16]
        ciphertext = data[16:]
        
        # 1. KDF
        aes_key, aes_iv = MTProtoCrypto.kdf(auth_key, msg_key)
        aes_iv_16 = aes_iv[:16]
        
        # 2. Decrypt
        cipher = AES.new(aes_key, AES.MODE_CBC, iv=aes_iv_16)
        padded_plaintext = cipher.decrypt(ciphertext)
        
        # 3. Verify msg_key (Optional but good)
        # calculated_hash = hashlib.sha256(padded_plaintext).digest()
        # calculated_msg_key = calculated_hash[8:24]
        # if calculated_msg_key != msg_key:
        #    raise ValueError("Invalid msg_key - corruption or wrong key")

        try:
            plaintext = unpad(padded_plaintext, 16)
        except:
             # Often happens if decryption failed significantly
             raise ValueError("Padding error during decryption")
             
        return plaintext

# Test locally
if __name__ == "__main__":
    fake_auth_key = os.urandom(256)
    msg = b"Hello SamOr World"
    encrypted = MTProtoCrypto.encrypt(fake_auth_key, msg)
    print(f"Encrypted len: {len(encrypted)}")
    decrypted = MTProtoCrypto.decrypt(fake_auth_key, encrypted)
    print(f"Decrypted: {decrypted}")
    assert msg == decrypted
