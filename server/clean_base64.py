import sqlite3

DB_PATH = "server/samor.db"

def clean_base64():
    print(f"Cleaning Base64 strings in {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Clean Users avatar_url
    cursor.execute("SELECT id, avatar_url FROM users WHERE avatar_url LIKE 'data:image%'")
    users = cursor.fetchall()
    for uid, url in users:
        print(f"Cleaning avatar for User {uid} (Length: {len(url)})")
        cursor.execute("UPDATE users SET avatar_url = ? WHERE id = ?", ("", uid))

    # Clean Messages content or media_url if necessary
    # Assuming messages might have base64 in media_url if wrongly implemented
    cursor.execute("SELECT id, media_url FROM messages WHERE media_url LIKE 'data:image%'")
    msgs = cursor.fetchall()
    for mid, url in msgs:
         print(f"Cleaning media_url for Message {mid} (Length: {len(url)})")
         cursor.execute("UPDATE messages SET media_url = ? WHERE id = ?", ("", mid))

    conn.commit()
    conn.close()
    print("Cleanup complete.")

if __name__ == "__main__":
    clean_base64()
