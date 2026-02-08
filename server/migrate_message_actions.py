import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "sqlite+aiosqlite:///./samor.db"

async def migrate():
    engine = create_async_engine(DATABASE_URL, echo=True)
    
    async with engine.begin() as conn:
        print("Migrating Message Actions...")
        try:
            await conn.execute(text("ALTER TABLE messages ADD COLUMN reply_to_msg_id INTEGER"))
            print("Added reply_to_msg_id")
        except Exception as e:
            print(f"Skipped reply_to_msg_id: {e}")

        try:
            await conn.execute(text("ALTER TABLE messages ADD COLUMN fwd_from_id INTEGER"))
            print("Added fwd_from_id")
        except Exception as e:
            print(f"Skipped fwd_from_id: {e}")
            
        try:
            await conn.execute(text("ALTER TABLE messages ADD COLUMN deleted_by_sender BOOLEAN DEFAULT 0"))
            print("Added deleted_by_sender")
        except Exception as e:
            print(f"Skipped deleted_by_sender: {e}")

        try:
            await conn.execute(text("ALTER TABLE messages ADD COLUMN deleted_by_recipient BOOLEAN DEFAULT 0"))
            print("Added deleted_by_recipient")
        except Exception as e:
            print(f"Skipped deleted_by_recipient: {e}")
            
    await engine.dispose()
    print("Migration complete.")

if __name__ == "__main__":
    asyncio.run(migrate())
