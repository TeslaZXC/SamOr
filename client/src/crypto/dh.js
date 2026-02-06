import bigInt from 'big-integer';

// RFC 3526 - 2048-bit MODP Group 14
const P_HEX = "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA237327FFFFFFFFFFFFFFFF";
const G = 2;

const P = bigInt(P_HEX, 16);

export class DiffieHellman {
    constructor() {
        // Generate random private key (256 bytes approx)
        // For simplicity in JS, we generate a random 2048-bit big integer
        // Actually, let's just make a random 2048 bit number.
        this.privateKey = bigInt.randBetween(bigInt(1), P.minus(1));
        this.publicKey = bigInt(G).modPow(this.privateKey, P);
    }

    getPublicKey() {
        return this.publicKey.toString(); // Return as string for transport to avoid JSON issues
    }

    computeSharedSecret(otherPublicKeyStr) {
        const otherPublicKey = bigInt(otherPublicKeyStr);
        const sharedSecret = otherPublicKey.modPow(this.privateKey, P);

        // Convert to bytes (array buffer or hex string)
        let hex = sharedSecret.toString(16);
        if (hex.length % 2 !== 0) hex = '0' + hex;

        // Pad to 256 bytes (512 hex chars)
        while (hex.length < 512) {
            hex = '00' + hex;
        }

        // Return as byte array
        const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        return bytes;
    }
}
