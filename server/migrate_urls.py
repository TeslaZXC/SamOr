import sqlite3
import re

DB_PATH = "server/samor.db"

def migrate_urls():
    print(f"Migrating URLs in {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Update Users avatar_url
    cursor.execute("SELECT id, avatar_url FROM users WHERE avatar_url LIKE '%/static/uploads/%'")
    users = cursor.fetchall()
    for uid, url in users:
        new_url = url.replace("/static/uploads/", "/api/files/")
        cursor.execute("UPDATE users SET avatar_url = ? WHERE id = ?", (new_url, uid))
        print(f"User {uid}: {url} -> {new_url}")

    # Update Messages media_url
    cursor.execute("SELECT id, media_url FROM messages WHERE media_url LIKE '%/static/uploads/%'")
    msgs = cursor.fetchall()
    for mid, url in msgs:
        new_url = url.replace("/static/uploads/", "/api/files/")
        cursor.execute("UPDATE messages SET media_url = ? WHERE id = ?", (new_url, mid))
        print(f"Message {mid}: {url} -> {new_url}")
        
    # Also update base64 avatars to empty string or keep them? 
    # If they work, they work. But if we want to clean them up... better leave them for now to avoid breaking data.
    # The user complained about "ne rabotayet", which likely refers to the 404s.

    conn.commit()
    conn.close()
    print("URL Migration complete.")

if __name__ == "__main__":
    migrate_urls()
