import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

DATABASE_URL = "sqlite+aiosqlite:///./samor.db"

async def migrate():
    print("Starting migration for Groups...")
    
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    async with engine.begin() as conn:
        # 1. Create new tables
        print("Creating table: groups")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR,
                avatar_url VARCHAR,
                owner_id INTEGER,
                created_at FLOAT
            )
        """))
        
        print("Creating table: group_members")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS group_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER,
                user_id INTEGER,
                role VARCHAR,
                joined_at FLOAT,
                FOREIGN KEY(group_id) REFERENCES groups(id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        """))
        
        print("Creating table: channels")
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER,
                name VARCHAR,
                type VARCHAR,
                position INTEGER,
                FOREIGN KEY(group_id) REFERENCES groups(id)
            )
        """))
        
        # 2. Add columns to messages
        # SQLite doesn't support IF NOT EXISTS for ADD COLUMN, so we catch the error or check pragma
        print("Adding column: channel_id to messages")
        try:
            await conn.execute(text("ALTER TABLE messages ADD COLUMN channel_id INTEGER"))
        except Exception as e:
            if "duplicate column" in str(e) or "no such table" in str(e):
                print(f"Column might already exist or table missing: {e}")
            else:
                print(f"Ignorable error adding column (likely exists): {e}")

        # Update recipient_id to be nullable? It's just a schema constraint, SQLite is loose.
        # But for SQL logic we don't need to change schema DDL for existing column usually in SQLite unless strict.
        
    print("Migration complete!")
    await engine.dispose()

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(migrate())
