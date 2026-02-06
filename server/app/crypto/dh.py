import secrets
import hashlib

# RFC 3526 - 2048-bit MODP Group 14
# This is a safe prime for DH.
P_HEX = "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA237327FFFFFFFFFFFFFFFF"
G = 2
P = int(P_HEX, 16)

class DiffieHellman:
    def __init__(self, p=P, g=G):
        self.p = p
        self.g = g
        # Generate random private key (a)
        # 2048 bits = 256 bytes. We take 256 bytes of randomness.
        # In practice, 'a' should be < p-1.
        self.private_key = secrets.randbelow(self.p - 1)
        self.public_key = pow(self.g, self.private_key, self.p)

    def get_public_key(self):
        return self.public_key

    def compute_shared_secret(self, other_public_key: int) -> bytes:
        """
        Computes (g^b)^a mod p = g^(ab) mod p.
        Returns the SHA-256 hash of the shared secret to be used as auth_key.
        """
        shared_secret_int = pow(other_public_key, self.private_key, self.p)
        # Convert int to bytes
        # 2048 bits / 8 = 256 bytes
        secret_bytes = shared_secret_int.to_bytes((shared_secret_int.bit_length() + 7) // 8, byteorder='big')
        
        # In MTProto, auth_key is usually just the bytes, but let's hash it for uniformity
        # or stick to 256 bytes if we want exact MTProto. 
        # The article mentions simple DH, let's keep it raw or hashed.
        # Let's use SHA-256 to get a clean 32-byte key for AES-256 usually, 
        # BUT MTProto uses 2048-bit (256 bytes) auth_key.
        # Let's return the raw bytes padded to 256 bytes.
        
        return secret_bytes.rjust(256, b'\x00')

def get_dh_params():
    return {"p": str(P), "g": G}
