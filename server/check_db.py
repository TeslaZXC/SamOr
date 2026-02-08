import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

DATABASE_URL = "sqlite+aiosqlite:///./samor.db"

async def check_schema():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.connect() as conn:
        result = await conn.execute(text("PRAGMA table_info(messages)"))
        columns = result.fetchall()
        print("Columns in messages table:")
        for col in columns:
            print(f"- {col.name} ({col.type})")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_schema())
