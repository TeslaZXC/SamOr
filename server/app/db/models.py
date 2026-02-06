from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Float

DATABASE_URL = "sqlite+aiosqlite:///./samor.db"

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True) # "zer name"
    display_name = Column(String)
    about = Column(String, default="")
    avatar_url = Column(String, nullable=True)
    token = Column(String, nullable=True, index=True) # For persistent session
    hashed_password = Column(String, nullable=True)
    salt = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    last_seen = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)

class Contact(Base):
    __tablename__ = "contacts"
    
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, index=True) 
    contact_user_id = Column(Integer, index=True)

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, index=True)
    recipient_id = Column(Integer, index=True)
    content = Column(String) # Encrypted content (or plain text depending on arch, we store plain text for MVP but in real app encrypted blob)
    # For this MVP, we store the *content* as provided by client. 
    # The client sends "text" or "base64 photo". We store that JSON string or just the text.
    # Actually, let's store type and content.
    msg_type = Column(String, default="text") # text, photo, voice, video_circle
    media_url = Column(String, nullable=True) # if photo/voice
    is_read = Column(Boolean, default=False)
    
    # We will just store the main textual content in 'content' for simplicity or JSON
    created_at = Column(Float) # Timestamp

class VerificationCode(Base):
    __tablename__ = "verification_codes"
    
    email = Column(String, primary_key=True, index=True)
    code = Column(String)
    expires_at = Column(Float)

class Dialog(Base):
    __tablename__ = "dialogs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True) # Owner of this dialog entry
    peer_id = Column(Integer, index=True) # The other person
    last_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    unread_count = Column(Integer, default=0)
    updated_at = Column(Float) # Sort by this

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Helper dependency
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
