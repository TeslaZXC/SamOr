import asyncio
import aiosqlite

async def upgrade():
    print("Migrating database...")
    async with aiosqlite.connect("samor.db") as db:
        try:
            await db.execute("ALTER TABLE messages ADD COLUMN is_read BOOLEAN DEFAULT 0")
            print("Successfully added is_read column")
        except Exception as e:
            if "duplicate column name" in str(e):
                print("Column is_read already exists")
            else:
                print(f"Error: {e}")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(upgrade())
