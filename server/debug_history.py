import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, select, or_, and_, Column, Integer, String, Float, Boolean
from sqlalchemy.orm import declarative_base

# Define minimal models to match app
Base = declarative_base()

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, index=True)
    recipient_id = Column(Integer, index=True)
    content = Column(String)
    msg_type = Column(String, default="text")
    media_url = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    
    # New columns
    reply_to_msg_id = Column(Integer, nullable=True)
    fwd_from_id = Column(Integer, nullable=True)
    deleted_by_sender = Column(Boolean, default=False)
    deleted_by_recipient = Column(Boolean, default=False)

    created_at = Column(Float)

DATABASE_URL = "sqlite+aiosqlite:///./samor.db"

async def debug_history():
    engine = create_async_engine(DATABASE_URL, echo=False)
    AsyncSessionLocal = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with AsyncSessionLocal() as db:
        print("--- Checking Total Messages ---")
        res = await db.execute(select(Message))
        all_messages = res.scalars().all()
        print(f"Total messages in DB: {len(all_messages)}")
        for m in all_messages:
            print(f"ID: {m.id} | Sender: {m.sender_id} -> Recipient: {m.recipient_id} | Content: {m.content} | DelS: {m.deleted_by_sender} ({type(m.deleted_by_sender)})")

        # Simulate Get History for User 1 and User 2 (assuming these exist)
        user_id = 1
        peer_id = 2
        
        print(f"\n--- Simulating history fetch between {user_id} and {peer_id} ---")
        stmt = select(Message).where(
            or_(
                and_(Message.sender_id == user_id, Message.recipient_id == peer_id),
                and_(Message.sender_id == peer_id, Message.recipient_id == user_id)
            )
        ).order_by(Message.id.asc())
        
        try:
            result = await db.execute(stmt)
            history = result.scalars().all()
            print(f"Query returned {len(history)} messages.")
            
            msgs_out = []
            for m in history:
                # Mirroring ws.py logic exactly (with the suspect 'is True')
                if m.sender_id == user_id and (m.deleted_by_sender is True): 
                    print(f"Skipping msg {m.id} (Deleted for Sender)")
                    continue
                if m.recipient_id == user_id and (m.deleted_by_recipient is True): 
                    print(f"Skipping msg {m.id} (Deleted for Recipient)")
                    continue
                
                msgs_out.append(m)
            
            print(f"Video filtered count: {len(msgs_out)}")
        
        except Exception as e:
            print(f"Query FAILED: {e}")
            
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(debug_history())
