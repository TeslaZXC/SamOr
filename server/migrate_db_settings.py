import sqlite3
import asyncio
from app.db.models import DATABASE_URL

# Extract path from sqlite+aiosqlite:///./samor.db
DB_PATH = "server/samor.db"

def migrate():
    print(f"Migrating {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if columns exist
    cursor.execute("PRAGMA table_info(users)")
    columns = [info[1] for info in cursor.fetchall()]
    
    if "hashed_password" not in columns:
        print("Adding hashed_password column...")
        cursor.execute("ALTER TABLE users ADD COLUMN hashed_password TEXT")
    else:
        print("hashed_password column already exists.")

    if "salt" not in columns:
        print("Adding salt column...")
        cursor.execute("ALTER TABLE users ADD COLUMN salt TEXT")
    else:
        print("salt column already exists.")
        
    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
