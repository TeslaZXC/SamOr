import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Float

# Robust path resolution:
# Start fresh. We moved DB to C:\Users\Artyrka\samor_safe_db\samor.db to escape project watchers.
# This path is OUTSIDE the project root, so uvicorn will never see changes.
BASE_DIR = os.path.expanduser("~")
DB_PATH = os.path.join(BASE_DIR, "samor_safe_db", "samor.db")
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

print(f"🔹 Using SAFE Database Path: {DB_PATH}") # Debug print
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
    recipient_id = Column(Integer, index=True, nullable=True) # Start nullable for channel msgs
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True, index=True) # New for groups
    
    content = Column(String) 
    msg_type = Column(String, default="text") 
    media_url = Column(String, nullable=True)
    is_read = Column(Boolean, default=False)
    
    reply_to_msg_id = Column(Integer, nullable=True)
    fwd_from_id = Column(Integer, nullable=True)
    deleted_by_sender = Column(Boolean, default=False)
    deleted_by_recipient = Column(Boolean, default=False)
    
    created_at = Column(Float)

class Group(Base):
    __tablename__ = "groups"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    avatar_url = Column(String, nullable=True)
    owner_id = Column(Integer, index=True)
    created_at = Column(Float)

class GroupMember(Base):
    __tablename__ = "group_members"
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    role = Column(String, default="member") # owner, admin, member
    joined_at = Column(Float)

class Channel(Base):
    __tablename__ = "channels"
    
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), index=True)
    name = Column(String)
    type = Column(String, default="text") # text, voice
    position = Column(Integer, default=0)

class VerificationCode(Base):
    __tablename__ = "verification_codes"
    
    email = Column(String, primary_key=True, index=True)
    code = Column(String)
    expires_at = Column(Float)

class Dialog(Base):
    __tablename__ = "dialogs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True) 
    peer_id = Column(Integer, index=True) 
    last_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    unread_count = Column(Integer, default=0)
    updated_at = Column(Float)

class BannedEmail(Base):
    __tablename__ = "banned_emails"
    email = Column(String, primary_key=True, index=True)
    created_at = Column(Float)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Helper dependency
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
