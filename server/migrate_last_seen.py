from app.db.models import AsyncSessionLocal, User, engine, Base
from sqlalchemy import text
import asyncio

async def migrate():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN last_seen Float DEFAULT 0"))
            print("Added last_seen column")
        except Exception as e:
            print(f"Error (column might exist): {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
