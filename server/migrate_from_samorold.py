import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os
import shutil
from datetime import datetime

# Database URLsы
OLD_DATABASE_URL = "sqlite+aiosqlite:///./bdOld.db"
NEW_DATABASE_URL = "sqlite+aiosqlite:///./bdNew.db"

async def migrate():
    print("=" * 60)
    print("Starting migration from bdOld.db to bdNew.db")
    print("=" * 60)
    
    # Check if old database exists
    if not os.path.exists("./bdOld.db"):
        print("ERROR: bdOld.db not found!")
        print("Please make sure bdOld.db is in the current directory.")
        return
    
    # Backup new database if it exists
    if os.path.exists("./bdNew.db"):
        backup_name = f"bdNew_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        print(f"\nBacking up existing bdNew.db to {backup_name}")
        shutil.copy("./bdNew.db", backup_name)
    
    # Create engines
    old_engine = create_async_engine(OLD_DATABASE_URL, echo=False)
    new_engine = create_async_engine(NEW_DATABASE_URL, echo=False)
    
    try:
        # Get data from old database
        async with old_engine.connect() as old_conn:
            print("\n" + "=" * 60)
            print("STEP 1: Reading data from bdOld.db")
            print("=" * 60)
            
            # Read Users
            print("\n[1/7] Reading users...")
            users_result = await old_conn.execute(text("SELECT * FROM users"))
            users = users_result.fetchall()
            print(f"  Found {len(users)} users")
            
            # Read Contacts
            print("[2/7] Reading contacts...")
            contacts_result = await old_conn.execute(text("SELECT * FROM contacts"))
            contacts = contacts_result.fetchall()
            print(f"  Found {len(contacts)} contacts")
            
            # Read Messages
            print("[3/7] Reading messages...")
            messages_result = await old_conn.execute(text("SELECT * FROM messages"))
            messages = messages_result.fetchall()
            print(f"  Found {len(messages)} messages")
            
            # Read Groups
            print("[4/7] Reading groups...")
            try:
                groups_result = await old_conn.execute(text("SELECT * FROM groups"))
                groups = groups_result.fetchall()
                print(f"  Found {len(groups)} groups")
            except Exception as e:
                print(f"  No groups table found (this is OK): {e}")
                groups = []
            
            # Read Group Members
            print("[5/7] Reading group members...")
            try:
                group_members_result = await old_conn.execute(text("SELECT * FROM group_members"))
                group_members = group_members_result.fetchall()
                print(f"  Found {len(group_members)} group members")
            except Exception as e:
                print(f"  No group_members table found (this is OK): {e}")
                group_members = []
            
            # Read Channels
            print("[6/7] Reading channels...")
            try:
                channels_result = await old_conn.execute(text("SELECT * FROM channels"))
                channels = channels_result.fetchall()
                print(f"  Found {len(channels)} channels")
            except Exception as e:
                print(f"  No channels table found (this is OK): {e}")
                channels = []
            
            # Read Dialogs
            print("[7/7] Reading dialogs...")
            try:
                dialogs_result = await old_conn.execute(text("SELECT * FROM dialogs"))
                dialogs = dialogs_result.fetchall()
                print(f"  Found {len(dialogs)} dialogs")
            except Exception as e:
                print(f"  No dialogs table found (this is OK): {e}")
                dialogs = []
        
        # Write data to new database
        async with new_engine.begin() as new_conn:
            print("\n" + "=" * 60)
            print("STEP 2: Writing data to bdNew.db")
            print("=" * 60)
            
            # Ensure tables exist
            print("\nCreating tables if they don't exist...")
            await new_conn.execute(text("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY,
                    email VARCHAR UNIQUE,
                    username VARCHAR UNIQUE,
                    display_name VARCHAR,
                    about VARCHAR,
                    avatar_url VARCHAR,
                    token VARCHAR,
                    hashed_password VARCHAR,
                    salt VARCHAR,
                    phone_number VARCHAR,
                    last_seen FLOAT,
                    is_active BOOLEAN
                )
            """))
            
            await new_conn.execute(text("""
                CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY,
                    owner_id INTEGER,
                    contact_user_id INTEGER
                )
            """))
            
            await new_conn.execute(text("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY,
                    sender_id INTEGER,
                    recipient_id INTEGER,
                    channel_id INTEGER,
                    content VARCHAR,
                    msg_type VARCHAR,
                    media_url VARCHAR,
                    is_read BOOLEAN,
                    reply_to_msg_id INTEGER,
                    fwd_from_id INTEGER,
                    deleted_by_sender BOOLEAN,
                    deleted_by_recipient BOOLEAN,
                    created_at FLOAT
                )
            """))
            
            await new_conn.execute(text("""
                CREATE TABLE IF NOT EXISTS groups (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR,
                    avatar_url VARCHAR,
                    owner_id INTEGER,
                    created_at FLOAT
                )
            """))
            
            await new_conn.execute(text("""
                CREATE TABLE IF NOT EXISTS group_members (
                    id INTEGER PRIMARY KEY,
                    group_id INTEGER,
                    user_id INTEGER,
                    role VARCHAR,
                    joined_at FLOAT
                )
            """))
            
            await new_conn.execute(text("""
                CREATE TABLE IF NOT EXISTS channels (
                    id INTEGER PRIMARY KEY,
                    group_id INTEGER,
                    name VARCHAR,
                    type VARCHAR,
                    position INTEGER
                )
            """))
            
            await new_conn.execute(text("""
                CREATE TABLE IF NOT EXISTS dialogs (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    peer_id INTEGER,
                    last_message_id INTEGER,
                    unread_count INTEGER,
                    updated_at FLOAT
                )
            """))
            
            # Insert Users
            print("\n[1/7] Migrating users...")
            for user in users:
                try:
                    await new_conn.execute(text("""
                        INSERT OR REPLACE INTO users 
                        (id, email, username, display_name, about, avatar_url, token, 
                         hashed_password, salt, phone_number, last_seen, is_active)
                        VALUES (:id, :email, :username, :display_name, :about, :avatar_url, 
                                :token, :hashed_password, :salt, :phone_number, :last_seen, :is_active)
                    """), {
                        "id": user[0],
                        "email": user[1] if len(user) > 1 else None,
                        "username": user[2] if len(user) > 2 else None,
                        "display_name": user[3] if len(user) > 3 else None,
                        "about": user[4] if len(user) > 4 else "",
                        "avatar_url": user[5] if len(user) > 5 else None,
                        "token": user[6] if len(user) > 6 else None,
                        "hashed_password": user[7] if len(user) > 7 else None,
                        "salt": user[8] if len(user) > 8 else None,
                        "phone_number": user[9] if len(user) > 9 else None,
                        "last_seen": user[10] if len(user) > 10 else None,
                        "is_active": user[11] if len(user) > 11 else True
                    })
                except Exception as e:
                    print(f"  Error migrating user {user[0]}: {e}")
            print(f"  Migrated {len(users)} users")
            
            # Insert Contacts
            print("[2/7] Migrating contacts...")
            for contact in contacts:
                try:
                    await new_conn.execute(text("""
                        INSERT OR REPLACE INTO contacts (id, owner_id, contact_user_id)
                        VALUES (:id, :owner_id, :contact_user_id)
                    """), {
                        "id": contact[0],
                        "owner_id": contact[1],
                        "contact_user_id": contact[2]
                    })
                except Exception as e:
                    print(f"  Error migrating contact {contact[0]}: {e}")
            print(f"  Migrated {len(contacts)} contacts")
            
            # Insert Messages
            print("[3/7] Migrating messages...")
            for msg in messages:
                try:
                    await new_conn.execute(text("""
                        INSERT OR REPLACE INTO messages 
                        (id, sender_id, recipient_id, channel_id, content, msg_type, media_url, 
                         is_read, reply_to_msg_id, fwd_from_id, deleted_by_sender, 
                         deleted_by_recipient, created_at)
                        VALUES (:id, :sender_id, :recipient_id, :channel_id, :content, :msg_type, 
                                :media_url, :is_read, :reply_to_msg_id, :fwd_from_id, 
                                :deleted_by_sender, :deleted_by_recipient, :created_at)
                    """), {
                        "id": msg[0],
                        "sender_id": msg[1],
                        "recipient_id": msg[2] if len(msg) > 2 else None,
                        "channel_id": msg[3] if len(msg) > 3 else None,
                        "content": msg[4] if len(msg) > 4 else "",
                        "msg_type": msg[5] if len(msg) > 5 else "text",
                        "media_url": msg[6] if len(msg) > 6 else None,
                        "is_read": msg[7] if len(msg) > 7 else False,
                        "reply_to_msg_id": msg[8] if len(msg) > 8 else None,
                        "fwd_from_id": msg[9] if len(msg) > 9 else None,
                        "deleted_by_sender": msg[10] if len(msg) > 10 else False,
                        "deleted_by_recipient": msg[11] if len(msg) > 11 else False,
                        "created_at": msg[12] if len(msg) > 12 else 0
                    })
                except Exception as e:
                    print(f"  Error migrating message {msg[0]}: {e}")
            print(f"  Migrated {len(messages)} messages")
            
            # Insert Groups
            print("[4/7] Migrating groups...")
            for group in groups:
                try:
                    await new_conn.execute(text("""
                        INSERT OR REPLACE INTO groups (id, name, avatar_url, owner_id, created_at)
                        VALUES (:id, :name, :avatar_url, :owner_id, :created_at)
                    """), {
                        "id": group[0],
                        "name": group[1],
                        "avatar_url": group[2] if len(group) > 2 else None,
                        "owner_id": group[3] if len(group) > 3 else None,
                        "created_at": group[4] if len(group) > 4 else 0
                    })
                except Exception as e:
                    print(f"  Error migrating group {group[0]}: {e}")
            print(f"  Migrated {len(groups)} groups")
            
            # Insert Group Members
            print("[5/7] Migrating group members...")
            for member in group_members:
                try:
                    await new_conn.execute(text("""
                        INSERT OR REPLACE INTO group_members (id, group_id, user_id, role, joined_at)
                        VALUES (:id, :group_id, :user_id, :role, :joined_at)
                    """), {
                        "id": member[0],
                        "group_id": member[1],
                        "user_id": member[2],
                        "role": member[3] if len(member) > 3 else "member",
                        "joined_at": member[4] if len(member) > 4 else 0
                    })
                except Exception as e:
                    print(f"  Error migrating group member {member[0]}: {e}")
            print(f"  Migrated {len(group_members)} group members")
            
            # Insert Channels
            print("[6/7] Migrating channels...")
            for channel in channels:
                try:
                    await new_conn.execute(text("""
                        INSERT OR REPLACE INTO channels (id, group_id, name, type, position)
                        VALUES (:id, :group_id, :name, :type, :position)
                    """), {
                        "id": channel[0],
                        "group_id": channel[1],
                        "name": channel[2],
                        "type": channel[3] if len(channel) > 3 else "text",
                        "position": channel[4] if len(channel) > 4 else 0
                    })
                except Exception as e:
                    print(f"  Error migrating channel {channel[0]}: {e}")
            print(f"  Migrated {len(channels)} channels")
            
            # Insert Dialogs
            print("[7/7] Migrating dialogs...")
            for dialog in dialogs:
                try:
                    await new_conn.execute(text("""
                        INSERT OR REPLACE INTO dialogs (id, user_id, peer_id, last_message_id, unread_count, updated_at)
                        VALUES (:id, :user_id, :peer_id, :last_message_id, :unread_count, :updated_at)
                    """), {
                        "id": dialog[0],
                        "user_id": dialog[1],
                        "peer_id": dialog[2],
                        "last_message_id": dialog[3] if len(dialog) > 3 else None,
                        "unread_count": dialog[4] if len(dialog) > 4 else 0,
                        "updated_at": dialog[5] if len(dialog) > 5 else 0
                    })
                except Exception as e:
                    print(f"  Error migrating dialog {dialog[0]}: {e}")
            print(f"  Migrated {len(dialogs)} dialogs")
        
        print("\n" + "=" * 60)
        print("MIGRATION COMPLETED SUCCESSFULLY!")
        print("=" * 60)
        print(f"\nSummary:")
        print(f"  Users:         {len(users)}")
        print(f"  Contacts:      {len(contacts)}")
        print(f"  Messages:      {len(messages)}")
        print(f"  Groups:        {len(groups)}")
        print(f"  Group Members: {len(group_members)}")
        print(f"  Channels:      {len(channels)}")
        print(f"  Dialogs:       {len(dialogs)}")
        print("\nYou can now use bdNew.db as your main database!")
        
    except Exception as e:
        print(f"\n\nERROR during migration: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await old_engine.dispose()
        await new_engine.dispose()

if __name__ == "__main__":
    if os.name == 'nt':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(migrate())
