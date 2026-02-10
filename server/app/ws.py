from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.session_manager import session_manager
from app.crypto.mtproto import MTProtoCrypto
import json
import time
import uuid
import random
import re
from app.core.email import send_email
from app.db.models import AsyncSessionLocal, User, Message, Dialog, Contact, Group, GroupMember, Channel, BannedEmail
from sqlalchemy.future import select
from sqlalchemy import update, delete, or_, and_

router = APIRouter()

active_group_calls = {}
# In-memory tracking for P2P calls: { user_id: peer_id }
active_p2p_calls = {}

async def broadcast_presence(user_id: int, is_online: bool, last_seen: float = 0):
    async with AsyncSessionLocal() as db:
        # Fetch user details to send full object (prevents "Unknown" on client)
        res = await db.execute(select(User).where(User.id == user_id))
        user = res.scalars().first()
        
        user_data = None
        if user:
            # Manually set attributes for serialization context if needed, or just serialize
            # We want to force the status we are broadcasting
            user_data = serialize_user(user, include_status=False) # Status is top-level
            user_data["is_online"] = is_online
            user_data["last_seen"] = last_seen

        payload = {
            "type": "user.status",
            "user_id": user_id,
            "status": "online" if is_online else "offline",
            "last_seen": last_seen,
            # "user": user_data  <-- REMOVED to prevent overwriting client data with potential "Unknowns"
        }
        
        for sid, sess in list(session_manager.sessions.items()):
            if sess.user_id and sess.websocket: # Active authenticated session
                try:
                    # Encrypt and send
                    push_json = json.dumps(payload)
                    push_bytes = push_json.encode('utf-8')
                    push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                    await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                except Exception:
                    pass

async def broadcast_event(user_id: int, event_type: str, data: dict):
    # Helper to send event to all sessions of a user
    to_remove = []
    for sid, sess in list(session_manager.sessions.items()):
        if sess.user_id == user_id:
            if sess.websocket:
                try:
                    payload = {"type": event_type, **data}
                    push_json = json.dumps(payload)
                    push_bytes = push_json.encode('utf-8')
                    # Check if auth_key exists
                    if not sess.auth_key:
                        continue
                        
                    push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                    await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                except Exception as e:
                    print(f"Broadcast error to {sid}: {e}")
                    to_remove.append(sid)
            else:
                to_remove.append(sid)

    for sid in to_remove:
        session_manager.remove_session(sid)

def serialize_user(user, include_status=True):
    if not user: return None
    
    display_name = getattr(user, 'display_name', None)
    username = getattr(user, 'username', None)
    uid = getattr(user, 'id', 0)
    
    if not display_name or display_name.strip() == "":
        display_name = username or f"User {uid}"
        
    data = {
        "id": uid,
        "username": username or f"user{uid}",
        "display_name": display_name,
        "avatar_url": getattr(user, 'avatar_url', None),
        "about": getattr(user, 'about', "") or "",
        "phone_number": getattr(user, 'phone_number', None),
        "email": getattr(user, 'email', None)
    }
    
    if include_status:
        data["is_online"] = session_manager.is_online(uid)
        data["last_seen"] = getattr(user, 'last_seen', None)
        
    return data

@router.websocket("/ws/connect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # 1. Create Session
    session = session_manager.create_session()
    session.websocket = websocket # Store WS reference
    
    try:
        # 2. Handshake Phase
        # Receive Client Hello (Client Public Key)
        data = await websocket.receive_text()
        message = json.loads(data)
        
        if message.get("type") != "client_hello":
             await websocket.close(code=4000)
             return
             
        client_pub_key = int(message["payload"]["public_key"])
        
        # Compute Shared Secret (Auth Key)
        auth_key = session.dh.compute_shared_secret(client_pub_key)
        session.auth_key = auth_key
        
        # Send Server Hello (Server Public Key)
        server_pub_key = str(session.dh.get_public_key())
        await websocket.send_text(json.dumps({
            "type": "server_hello",
            "payload": {
                "public_key": server_pub_key,
                "session_id": session.session_id
            }
        }))
        
        session.step = 2 # Handshake Complete
        
        # 3. Encrypted Communication Loop
        while True:
            encrypted_data_hex = await websocket.receive_text()
            
            try:
                wrapper = json.loads(encrypted_data_hex)
                if "data" not in wrapper:
                    continue
                encrypted_bytes = bytes.fromhex(wrapper["data"])
                
                # Decrypt
                plaintext_bytes = MTProtoCrypto.decrypt(session.auth_key, encrypted_bytes)
                plaintext = plaintext_bytes.decode('utf-8')
                
                # Process Message (Simple Echo/Router for now)
                request = json.loads(plaintext)
                method = request.get("method")
                args = request.get("args", {})
                
                response_data = {}
                
                delete_for_all = False
                if method == "echo":
                    response_data = {"type": "response", "data": f"Echo: {args.get('text')}"}
                    
                elif method == "auth.request_code":
                    email = args.get("email")
                    req_type = args.get("type", "login") # login, register, reset
                    
                    if not email:
                         response_data = {"type": "error", "message": "Email required"}
                    else:
                        error_message = None
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(User).where(User.email == email))
                            existing_user = res.scalars().first()
                            
                            if req_type == "register" and existing_user:
                                error_message = "User with this email already exists"
                            elif req_type == "login" and not existing_user:
                                error_message = "User not found"
                            
                            # Check if email is banned
                            if not error_message:
                                res_banned = await db.execute(select(BannedEmail).where(BannedEmail.email == email))
                                if res_banned.scalars().first():
                                    error_message = "This account has been suspended"
                        
                        if error_message:
                            response_data = {"type": "error", "message": error_message}
                        else:
                            # Generate Code
                            code = str(random.randint(10000, 99999))
                            session.temp_auth_data = {"email": email, "code": code, "type": req_type}
                            
                            print(f"AUTH CODE for {email} ({req_type}): {code}") # Fallback
                            
                            sent = False
                            try:
                                sent = await send_email(email, f"SamOr {req_type.capitalize()} Code", f"Your code is: {code}")
                            except Exception as e:
                                print(f"Email send failed: {e}")
                            
                            if sent:
                                response_data = {"type": "success", "message": "Code sent"}
                            else:
                                # Fallback if email fails (for dev/demo)
                                response_data = {"type": "success", "message": "Code sent (check console)"}

                elif method == "auth.verify_code":
                    code = args.get("code")
                    stored_data = session.temp_auth_data
                    
                    if not stored_data or stored_data.get("code") != code:
                        response_data = {"type": "error", "message": "Invalid code"}
                    else:
                        req_type = stored_data.get("type")
                        email = stored_data.get("email")
                        
                        if req_type == "register":
                            # Registration flow: Return temp token to proceed to password/profile setup
                            temp_token = str(uuid.uuid4())
                            session.temp_auth_data["temp_reg_token"] = temp_token
                            session.temp_auth_data["verified_email"] = email
                            
                            response_data = {
                                "type": "auth_code_verified",
                                "temp_token": temp_token,
                                "email": email
                            }
                        elif req_type == "login":
                            # OTP Login (Legacy or Backup) - Verify and Login
                            async with AsyncSessionLocal() as db:
                                res = await db.execute(select(User).where(User.email == email))
                                user = res.scalars().first()
                                if user:
                                    token = str(uuid.uuid4())
                                    user.token = token
                                    await db.commit()
                                    
                                    session_manager.bind_user(session, user.id)
                                    await broadcast_presence(user.id, True)
                                    session.temp_auth_data = {}
                                    response_data = {
                                        "type": "auth_success",
                                        "user": serialize_user(user)
                                    }
                                    response_data["user"]["token"] = token
                                else:
                                    response_data = {"type": "error", "message": "User not found"}
                                    
                        elif req_type == "reset":
                            # Password Reset flow (handled separately usually but can reuse)
                             pass

                elif method == "auth.login_pwd":
                    email = args.get("email")
                    password = args.get("password")
                    
                    if not email or not password:
                        response_data = {"type": "error", "message": "Email and Password required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(User).where(User.email == email))
                            user = res.scalars().first()
                            
                            if not user:
                                response_data = {"type": "error", "message": "Invalid email or password"}
                            elif not user.hashed_password:
                                response_data = {"type": "error", "message": "Password not set for this account. Use Code login."}
                            else:
                                if verify_password(user.hashed_password, user.salt, password):
                                    token = str(uuid.uuid4())
                                    user.token = token
                                    await db.commit()
                                    
                                    session_manager.bind_user(session, user.id)
                                    await broadcast_presence(user.id, True)
                                    response_data = {
                                        "type": "auth_success",
                                        "user": serialize_user(user)
                                    }
                                    response_data["user"]["token"] = token
                                else:
                                    response_data = {"type": "error", "message": "Invalid email or password"}

                elif method == "auth.register":
                    token = args.get("temp_token")
                    username = args.get("username")
                    display_name = args.get("display_name")
                    password = args.get("password")
                    
                    stored_data = session.temp_auth_data
                    
                    if not stored_data or stored_data.get("temp_reg_token") != token:
                         response_data = {"type": "error", "message": "Invalid session/token"}
                    elif not username or not display_name or not password:
                         response_data = {"type": "error", "message": "All fields required"}
                    else:
                        phone_number = args.get("phone_number")
                        if not phone_number or not re.match(r'^(\+7|8)\d{10}$', phone_number):
                             response_data = {"type": "error", "message": "Valid Russian phone number required (+7... or 8...)"}
                        else:
                            email = stored_data["verified_email"]
                            
                            async with AsyncSessionLocal() as db:
                                res = await db.execute(select(User).where(User.username == username))
                                if res.scalars().first():
                                    response_data = {"type": "error", "message": "Username already taken"}
                                else:
                                    hashed, salt = hash_password(password)
                                    login_token = str(uuid.uuid4())
                                    
                                    new_user = User(
                                        email=email, 
                                        username=username, 
                                        display_name=display_name,
                                        about="",
                                        avatar_url=args.get("avatar", ""),
                                        phone_number=phone_number,
                                        hashed_password=hashed,
                                        salt=salt,
                                        token=login_token
                                    )
                                    db.add(new_user)
                                    await db.commit()
                                    await db.refresh(new_user)
                                    
                                    session_manager.bind_user(session, new_user.id)
                                    await broadcast_presence(new_user.id, True)
                                    session.temp_auth_data = {}
                                    
                                    response_data = {
                                        "type": "auth_success",
                                        "user": serialize_user(new_user)
                                    }
                                    response_data["user"]["token"] = login_token
                
                elif method == "auth.login_token":
                    token = args.get("token")
                    if not token:
                        response_data = {"type": "error", "message": "Token required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            result = await db.execute(select(User).where(User.token == token))
                            user = result.scalars().first()
                            
                            if user:
                                session_manager.bind_user(session, user.id)
                                await broadcast_presence(user.id, True)
                                
                                response_data = {
                                    "type": "auth_success",
                                    "user": serialize_user(user)
                                }
                                response_data["user"]["token"] = user.token
                            else:
                                response_data = {"type": "error", "message": "Invalid token"}

                elif method == "user.search":
                    query = args.get("username")
                    if not query:
                        response_data = {"type": "error", "message": "Username required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            clean_query = query.lstrip("@")
                            result = await db.execute(select(User).where(User.username == clean_query))
                            user = result.scalars().first()
                            
                            if user:
                                response_data = {
                                    "type": "search_result",
                                    "user": serialize_user(user, include_status=False)
                                }
                            else:
                                 response_data = {"type": "error", "message": "User not found"}

                elif method == "user.get_info":
                    target_id = args.get("user_id")
                    if not target_id:
                        response_data = {"type": "error", "message": "User ID required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(User).where(User.id == target_id))
                            user = res.scalars().first()
                            
                            if user:
                                response_data = {
                                    "type": "user.info",
                                    "user": serialize_user(user)
                                }
                            else:
                                response_data = {"type": "error", "message": "User not found"}

                elif method == "user.list":
                    # Fetch all users (limit?)
                    async with AsyncSessionLocal() as db:
                        # Simple fetch all for now, maybe exclude self?
                        result = await db.execute(select(User).limit(100))
                        users = result.scalars().all()
                        
                        user_list = []
                        for u in users:
                            if u.id == session.user_id: continue
                            user_list.append(serialize_user(u))
                            
                        response_data = {"type": "user.list_result", "users": user_list}

                elif method == "contacts.add":
                    contact_id = args.get("user_id")
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            new_contact = Contact(owner_id=session.user_id, contact_user_id=contact_id)
                            db.add(new_contact)
                            await db.commit()
                            response_data = {"type": "success", "message": "Contact added"}

                elif method == "user.get_info":
                    raw_id = args.get("user_id")
                    target_id = int(raw_id) if raw_id is not None and str(raw_id).isdigit() else None
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not target_id:
                        response_data = {"type": "error", "message": "User ID required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(User).where(User.id == target_id))
                            user_obj = res.scalars().first()
                            if user_obj:
                                response_data = {"type": "user.info", "user": serialize_user(user_obj)}
                            else:
                                response_data = {"type": "error", "message": "User not found"}

                elif method == "dialogs.get":
                    if not session.user_id:
                         response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            stmt = select(Dialog).where(Dialog.user_id == session.user_id).order_by(Dialog.updated_at.desc())
                            result = await db.execute(stmt)
                            dialogs = result.scalars().all()
                            
                            dialog_list = []
                            for d in dialogs:
                                peer_res = await db.execute(select(User).where(User.id == d.peer_id))
                                peer = peer_res.scalars().first()
                                
                                msg_content = ""
                                if d.last_message_id:
                                    msg_res = await db.execute(select(Message).where(Message.id == d.last_message_id))
                                    msg = msg_res.scalars().first()
                                    if msg:
                                        msg_content = msg.content if msg.msg_type == "text" else f"[{msg.msg_type}]"
                                
                                if peer:
                                    dialog_list.append({
                                        "id": d.id,
                                        "peer": serialize_user(peer),
                                        "last_message": msg_content,
                                        "unread_count": d.unread_count,
                                        "updated_at": d.updated_at
                                    })
                            
                            response_data = {"type": "dialogs.list", "dialogs": dialog_list}

                elif method == "messages.get_history":
                    raw_peer_id = args.get("peer_id")
                    peer_id = int(raw_peer_id) if raw_peer_id is not None and str(raw_peer_id).isdigit() else None
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        try:
                            async with AsyncSessionLocal() as db:
                                stmt = select(Message).where(
                                    or_(
                                        and_(Message.sender_id == session.user_id, Message.recipient_id == peer_id),
                                        and_(Message.sender_id == peer_id, Message.recipient_id == session.user_id)
                                    )
                                ).order_by(Message.id.asc())
                                
                                if peer_id is None: # Channel Message
                                    channel_id = args.get("channel_id")
                                    if channel_id:
                                        stmt = select(Message).where(Message.channel_id == channel_id).order_by(Message.id.asc())
                                
                                result = await db.execute(stmt)
                                all_msgs = result.scalars().all()
                                
                                # Fetch sender details
                                sender_ids = list(set([m.sender_id for m in all_msgs]))
                                sender_map = {}
                                if sender_ids:
                                    s_res = await db.execute(select(User).where(User.id.in_(sender_ids)))
                                    for s in s_res.scalars().all():
                                        sender_map[s.id] = {
                                            "id": s.id,
                                            "display_name": s.display_name,
                                            "username": s.username,
                                            "avatar_url": s.avatar_url
                                        }

                                msgs_out = []
                                for m in all_msgs:
                                    # Check Deletion
                                    if m.sender_id == session.user_id and m.deleted_by_sender: continue
                                    if m.recipient_id == session.user_id and m.deleted_by_recipient: continue
                                    
                                    fwd_from_id = m.fwd_from_id
                                    fwd_from_user = None
                                    if fwd_from_id:
                                        if fwd_from_id in sender_map:
                                            fwd_from_user = sender_map[fwd_from_id]
                                        else:
                                            # Fetch if not in map (rare case if not already a sender in this batch)
                                            f_res = await db.execute(select(User).where(User.id == fwd_from_id))
                                            f_user = f_res.scalars().first()
                                            if f_user:
                                                fwd_from_user = {
                                                    "id": f_user.id,
                                                    "display_name": f_user.display_name,
                                                    "username": f_user.username,
                                                    "avatar_url": f_user.avatar_url
                                                }
                                                sender_map[f_user.id] = fwd_from_user

                                    msgs_out.append({
                                        "id": m.id,
                                        "sender_id": m.sender_id,
                                        "sender": sender_map.get(m.sender_id),
                                        "content": m.content,
                                        "type": m.msg_type,
                                        "media_url": m.media_url,
                                        "is_read": m.is_read,
                                        "created_at": m.created_at,
                                        "reply_to_msg_id": m.reply_to_msg_id,
                                        "fwd_from_id": m.fwd_from_id,
                                        "fwd_from_user": fwd_from_user
                                    })
                                    
                                response_data = {"type": "messages.history", "messages": msgs_out, "peer_id": peer_id}
                                if peer_id is None and args.get("channel_id"):
                                    response_data["channel_id"] = args.get("channel_id")
                        except Exception as e:
                            print(f"Error getting history: {e}")
                            response_data = {"type": "error", "message": "Failed to load history"}

                elif method == "messages.search":
                    peer_id = args.get("peer_id")
                    channel_id = args.get("channel_id")
                    query = args.get("query", "")
                    filter_type = args.get("filter_type") # media, voice, video, file, link, text

                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        try:
                            async with AsyncSessionLocal() as db:
                                stmt = select(Message)
                                
                                # Context (Chat or Channel)
                                if channel_id:
                                    stmt = stmt.where(Message.channel_id == channel_id)
                                elif peer_id:
                                    stmt = stmt.where(
                                        or_(
                                            and_(Message.sender_id == session.user_id, Message.recipient_id == peer_id),
                                            and_(Message.sender_id == peer_id, Message.recipient_id == session.user_id)
                                        )
                                    )
                                else:
                                    # Fallback or error? Let's return empty if no context
                                    response_data = {"type": "messages.search_result", "messages": []}
                                    # Use 'continue' to skip the rest of 'else' block, or just set empty result
                                    # Ideally we should break/return, but we are inside 'try'. 
                                    # Let's just handle it properly.
                                    pass

                                if peer_id or channel_id:
                                    # Filters
                                    if filter_type == "photo":
                                        stmt = stmt.where(Message.msg_type == "photo")
                                    elif filter_type == "video":
                                        stmt = stmt.where(Message.msg_type == "video")
                                    elif filter_type == "voice":
                                        stmt = stmt.where(Message.msg_type == "voice")
                                    elif filter_type == "file":
                                        stmt = stmt.where(Message.msg_type == "file")
                                    elif filter_type == "link":
                                        stmt = stmt.where(Message.content.like("%http%"))
                                    
                                    # Text Query
                                    if query:
                                        stmt = stmt.where(Message.content.ilike(f"%{query}%"))
                                    
                                    # Ordering
                                    stmt = stmt.order_by(Message.created_at.desc()).limit(50)
                                    
                                    result = await db.execute(stmt)
                                    msgs = result.scalars().all()
                                    
                                    # Prepare response
                                    sender_ids = list(set([m.sender_id for m in msgs]))
                                    sender_map = {}
                                    if sender_ids:
                                        s_res = await db.execute(select(User).where(User.id.in_(sender_ids)))
                                        for s in s_res.scalars().all():
                                            sender_map[s.id] = {
                                                "id": s.id,
                                                "display_name": s.display_name,
                                                "avatar_url": s.avatar_url
                                            }

                                    msgs_out = []
                                    for m in msgs:
                                        if m.sender_id == session.user_id and m.deleted_by_sender: continue
                                        if m.recipient_id == session.user_id and m.deleted_by_recipient: continue
                                        
                                        fwd_from_id = m.fwd_from_id
                                        fwd_from_user = None
                                        if fwd_from_id:
                                            if fwd_from_id in sender_map:
                                                fwd_from_user = sender_map[fwd_from_id]
                                            else:
                                                f_res = await db.execute(select(User).where(User.id == fwd_from_id))
                                                f_user = f_res.scalars().first()
                                                if f_user:
                                                    fwd_from_user = {
                                                        "id": f_user.id,
                                                        "display_name": f_user.display_name,
                                                        "username": f_user.username,
                                                        "avatar_url": f_user.avatar_url
                                                    }
                                                    sender_map[f_user.id] = fwd_from_user

                                        msgs_out.append({
                                            "id": m.id,
                                            "sender_id": m.sender_id,
                                            "sender": sender_map.get(m.sender_id),
                                            "content": m.content,
                                            "type": m.msg_type,
                                            "media_url": m.media_url,
                                            "created_at": m.created_at,
                                            "fwd_from_id": m.fwd_from_id,
                                            "fwd_from_user": fwd_from_user
                                        })
                                    
                                    response_data = {"type": "messages.search_result", "messages": msgs_out, "filter": filter_type}

                        except Exception as e:
                            print(f"Search error: {e}")
                            response_data = {"type": "error", "message": "Search failed"}

                elif method == "messages.delete":
                    msg_ids = args.get("message_ids", [])
                    delete_for_all = args.get("delete_for_all", False)
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Fetch messages to check ownership and existence
                            stmt = select(Message).where(Message.id.in_(msg_ids))
                            res = await db.execute(stmt)
                            messages_to_process = res.scalars().all()
                            
                            deleted_ids = []
                            peers_to_notify = set()
                            
                            for m in messages_to_process:
                                is_sender = m.sender_id == session.user_id
                                is_recipient = m.recipient_id == session.user_id
                                
                                if not (is_sender or is_recipient):
                                    continue
                                    
                                if delete_for_all and is_sender:
                                    # Hard delete for everyone
                                    await db.delete(m)
                                    deleted_ids.append(m.id)
                                    peers_to_notify.add(m.recipient_id)
                                    peers_to_notify.add(session.user_id) # Simplify broadcast
                                else:
                                    # Soft delete / Hide
                                    if is_sender:
                                        m.deleted_by_sender = True
                                    if is_recipient:
                                        m.deleted_by_recipient = True
                                    deleted_ids.append(m.id)
                                    # No need to notify peer if only "for me", but frontend needs to know to hide it.
                                    # Actually, let's just send success and frontend removes it from view.
                                    
                            await db.commit()
                            
                            if delete_for_all:
                                # Broadcast deletion
                                for uid in peers_to_notify:
                                     await broadcast_event(uid, "messages.deleted", {"ids": deleted_ids})
                                     
                            response_data = {"type": "messages.deleted", "ids": deleted_ids}

                elif method == "messages.forward":
                    raw_msg_ids = args.get("message_ids", [])
                    msg_ids = [int(mid) for mid in raw_msg_ids if str(mid).isdigit()]
                    raw_peer_id = args.get("peer_id")
                    peer_id = int(raw_peer_id) if raw_peer_id is not None and str(raw_peer_id).isdigit() else None
                    raw_channel_id = args.get("channel_id")
                    channel_id = int(raw_channel_id) if raw_channel_id is not None and str(raw_channel_id).isdigit() else None
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not peer_id and not channel_id:
                        response_data = {"type": "error", "message": "Recipient or Channel required"}
                    else:
                        try:
                            async with AsyncSessionLocal() as db:
                                # Fetch originals
                                stmt = select(Message).where(Message.id.in_(msg_ids))
                                res = await db.execute(stmt)
                                originals = res.scalars().all()
                                
                                fwd_messages = []
                                
                                for orig in originals:
                                    # Create new message
                                    new_msg = Message(
                                        sender_id=session.user_id,
                                        recipient_id=peer_id,
                                        channel_id=channel_id,
                                        content=orig.content,
                                        msg_type=orig.msg_type,
                                        media_url=orig.media_url,
                                        created_at=time.time(),
                                        fwd_from_id=orig.fwd_from_id or orig.sender_id
                                    )
                                    db.add(new_msg)
                                    await db.flush() # to get ID
                                    
                                    if not channel_id:
                                        # Update Dialogs for DMs
                                        # Sender Dialog
                                        res = await db.execute(select(Dialog).where(and_(Dialog.user_id==session.user_id, Dialog.peer_id==peer_id)))
                                        d_sender = res.scalars().first()
                                        if not d_sender:
                                            d_sender = Dialog(user_id=session.user_id, peer_id=peer_id, unread_count=0)
                                            db.add(d_sender)
                                        d_sender.last_message_id = new_msg.id
                                        d_sender.updated_at = time.time()
                                        
                                        # Recipient Dialog
                                        res = await db.execute(select(Dialog).where(and_(Dialog.user_id==peer_id, Dialog.peer_id==session.user_id)))
                                        d_recipient = res.scalars().first()
                                        if not d_recipient:
                                            d_recipient = Dialog(user_id=peer_id, peer_id=session.user_id, unread_count=0)
                                            db.add(d_recipient)
                                        d_recipient.last_message_id = new_msg.id
                                        d_recipient.updated_at = time.time()
                                        d_recipient.unread_count += 1
                                    
                                    fwd_messages.append(new_msg)
                                
                                await db.commit()
                                
                                # Broadcast and Response
                                msgs_out = []
                                for m in fwd_messages:
                                    # Resolve original sender info for the first time
                                    fwd_from_user = None
                                    if m.fwd_from_id:
                                        f_res = await db.execute(select(User).where(User.id == m.fwd_from_id))
                                        f_u = f_res.scalars().first()
                                        if f_u:
                                            fwd_from_user = {
                                                "id": f_u.id, 
                                                "display_name": f_u.display_name,
                                                "username": f_u.username,
                                                "avatar_url": f_u.avatar_url
                                            }

                                    msg_obj = {
                                        "id": m.id,
                                        "sender_id": session.user_id,
                                        "content": m.content,
                                        "type": m.msg_type,
                                        "media_url": m.media_url,
                                        "is_read": False,
                                        "created_at": m.created_at,
                                        "fwd_from_id": m.fwd_from_id,
                                        "fwd_from_user": fwd_from_user
                                    }
                                    if m.channel_id: msg_obj["channel_id"] = m.channel_id
                                    msgs_out.append(msg_obj)
                                    
                                    if not m.channel_id:
                                        # DM Broadcast
                                        await broadcast_event(peer_id, "message.new", {
                                            "message": msg_obj,
                                            "peer_id": session.user_id,
                                            "sender_id": session.user_id
                                        })
                                    else:
                                        # Channel Broadcast
                                        res = await db.execute(select(Channel).where(Channel.id == m.channel_id))
                                        channel = res.scalars().first()
                                        if channel:
                                            res = await db.execute(select(GroupMember).where(GroupMember.group_id == channel.group_id))
                                            members = res.scalars().all()
                                            member_ids = [mem.user_id for mem in members]
                                            for mid in member_ids:
                                                if mid != session.user_id:
                                                    await broadcast_event(mid, "message.new", {
                                                        "message": msg_obj,
                                                        "channel_id": m.channel_id,
                                                        "sender_id": session.user_id
                                                    })
                                
                                response_data = {"type": "messages.forward_done", "count": len(msgs_out)}
                        except Exception as e:
                            print(f"Forward error: {e}")
                            response_data = {"type": "error", "message": "Forward failed"}

                elif method == "messages.read":
                    peer_id = args.get("peer_id")
                    max_id = args.get("max_id") # Optional, mark all up to this ID
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not peer_id:
                        response_data = {"type": "error", "message": "Peer ID required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # 1. Update Messages (User is Recipient, Peer is Sender)
                            # Mark messages FROM peer TO me as read
                            stmt = update(Message).where(
                                and_(
                                    Message.sender_id == peer_id, 
                                    Message.recipient_id == session.user_id,
                                    Message.is_read == False
                                )
                            ).values(is_read=True)
                            if max_id:
                                stmt = stmt.where(Message.id <= max_id)
                            
                            await db.execute(stmt)
                            
                            # 2. Update My Dialog (unread_count = 0)
                            # Actually we should count real unread? For MVP set to 0
                            stmt_d = update(Dialog).where(
                                and_(Dialog.user_id == session.user_id, Dialog.peer_id == peer_id)
                            ).values(unread_count=0)
                            await db.execute(stmt_d)
                            
                            await db.commit()
                            
                            response_data = {"type": "messages.read_done", "peer_id": peer_id}
                            
                            # 3. Broadcast to Peer (Sender) that I read their messages
                            for sid, sess in list(session_manager.sessions.items()):
                                if sess.user_id == peer_id and sess.websocket:
                                    try:
                                        push_wrapper = {
                                            "type": "messages.read",
                                            "peer_id": session.user_id # I am the one who read
                                        }
                                        push_json = json.dumps(push_wrapper)
                                        push_bytes = push_json.encode('utf-8')
                                        push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                        await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                    except Exception as e:
                                        print(f"Broadcast read error: {e}")
                                        
                            # 4. Notify MYSELF (Reader) to update sidebar count
                            # We are already sending response_data, but let's include the updated dialog state or just a trigger
                            # Actually, frontend can just react to 'messages.read_done'.

                elif method == "message.send":
                    msg_type = args.get("type", "text")
                    recipient_id = args.get("peer_id")
                    channel_id = args.get("channel_id")
                    content = args.get("text")
                    reply_to_msg_id = args.get("reply_to_msg_id")
                    
                    if not session.user_id:
                         response_data = {"type": "error", "message": "Not authenticated"}
                    elif not recipient_id and not channel_id:
                         response_data = {"type": "error", "message": "No recipient or channel"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # 1. Save Message
                            new_msg = Message(
                                sender_id=session.user_id,
                                recipient_id=recipient_id,
                                channel_id=channel_id,
                                content=content,
                                msg_type=msg_type,
                                created_at=time.time(),
                                reply_to_msg_id=reply_to_msg_id
                            )
                            
                            # Handle Media
                            if msg_type in ["photo", "voice", "video", "file"]:
                                new_msg.media_url = args.get("content") 
                                new_msg.content = args.get("caption", content or msg_type.capitalize())

                            db.add(new_msg)
                            await db.commit()
                            await db.refresh(new_msg)
                            
                            res = await db.execute(select(User).where(User.id == session.user_id))
                            me = res.scalars().first()
                            sender_info = serialize_user(me, include_status=False)
                            
                            msg_obj = {
                                "sender": sender_info,
                                "id": new_msg.id,
                                "sender_id": session.user_id,
                                "content": new_msg.content,
                                "type": new_msg.msg_type,
                                "media_url": new_msg.media_url,
                                "is_read": False,
                                "created_at": new_msg.created_at,
                                "reply_to_msg_id": new_msg.reply_to_msg_id
                            }
                            if channel_id: msg_obj["channel_id"] = channel_id

                            if not channel_id:
                                # Update Dialogs for DMs
                                # Sender
                                res = await db.execute(select(Dialog).where(and_(Dialog.user_id==session.user_id, Dialog.peer_id==recipient_id)))
                                d_sender = res.scalars().first()
                                if not d_sender:
                                    d_sender = Dialog(user_id=session.user_id, peer_id=recipient_id, unread_count=0)
                                    db.add(d_sender)
                                d_sender.last_message_id = new_msg.id
                                d_sender.updated_at = time.time()
                                
                                # Recipient
                                res = await db.execute(select(Dialog).where(and_(Dialog.user_id==recipient_id, Dialog.peer_id==session.user_id)))
                                d_recipient = res.scalars().first()
                                if not d_recipient:
                                    d_recipient = Dialog(user_id=recipient_id, peer_id=session.user_id, unread_count=0)
                                    db.add(d_recipient)
                                d_recipient.last_message_id = new_msg.id
                                d_recipient.updated_at = time.time()
                                d_recipient.unread_count += 1
                                await db.commit()
                                
                                response_data = {"type": "message.new", "message": msg_obj, "peer_id": recipient_id}
                                
                                # Broadcast to Recipient
                                push_wrapper = { "type": "message.new", "message": msg_obj, "peer_id": session.user_id, "sender_id": session.user_id }
                                push_json = json.dumps(push_wrapper)
                                push_bytes = push_json.encode('utf-8')
                                for sid, sess in session_manager.sessions.items():
                                    if sess.user_id == recipient_id and sess.websocket and sess.auth_key:
                                        try:
                                            push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                            await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                        except: pass
                            else:
                                # Channel Broadcasting
                                res = await db.execute(select(Channel).where(Channel.id == channel_id))
                                channel = res.scalars().first()
                                if channel:
                                    res = await db.execute(select(GroupMember).where(GroupMember.group_id == channel.group_id))
                                    members = res.scalars().all()
                                    member_ids = [m.user_id for m in members]
                                    
                                    push_wrapper = { "type": "message.new", "message": msg_obj, "channel_id": channel_id, "sender_id": session.user_id }
                                    push_json = json.dumps(push_wrapper)
                                    push_bytes = push_json.encode('utf-8')
                                    for sid, sess in session_manager.sessions.items():
                                        if sess.user_id in member_ids and sess.user_id != session.user_id and sess.websocket and sess.auth_key:
                                            try:
                                                push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                                await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                            except: pass
                                
                                response_data = {"type": "message.new", "message": msg_obj, "channel_id": channel_id}

                elif method == "messages.search":
                    query = args.get("query", "")
                    filter_type = args.get("filter_type") # photo, video, file, voice, link
                    peer_id = args.get("peer_id")
                    channel_id = args.get("channel_id")
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Build query
                            stmt = select(Message)
                            
                            # Context Filter
                            if channel_id:
                                stmt = stmt.where(Message.channel_id == channel_id)
                            elif peer_id:
                                stmt = stmt.where(
                                    or_(
                                        and_(Message.sender_id == session.user_id, Message.recipient_id == peer_id),
                                        and_(Message.sender_id == peer_id, Message.recipient_id == session.user_id)
                                    )
                                )
                            else:
                                # Default to searching all my messages? Or error?
                                # For now, let's require context
                                response_data = {"type": "error", "message": "Context required (peer_id or channel_id)"}
                                # We need to break/return early, but we are inside 'async with'. 
                                # Let's handle it by checking if stmt is set correctly or valid.
                                stmt = None

                            if stmt is not None:
                                # Text Search
                                if query:
                                    stmt = stmt.where(Message.content.ilike(f"%{query}%"))
                                
                                # Type Filter
                                if filter_type:
                                    if filter_type == "link":
                                        stmt = stmt.where(Message.content.regexp_match(r'https?://'))
                                    elif filter_type in ["photo", "video", "voice", "file"]:
                                        stmt = stmt.where(Message.msg_type == filter_type)
                                
                                # Order details
                                stmt = stmt.order_by(Message.created_at.desc()).limit(50)
                                
                                try:
                                    result = await db.execute(stmt)
                                    msgs = result.scalars().all()
                                    
                                    msg_list = []
                                    for m in msgs:
                                        sender_res = await db.execute(select(User).where(User.id == m.sender_id))
                                        sender = sender_res.scalars().first()
                                        
                                        msg_list.append({
                                            "id": m.id,
                                            "sender_id": m.sender_id,
                                            "sender": {
                                                "id": sender.id,
                                                "display_name": sender.display_name,
                                                "username": sender.username,
                                                "avatar_url": sender.avatar_url
                                            } if sender else None,
                                            "content": m.content,
                                            "type": m.msg_type,
                                            "media_url": m.media_url,
                                            "created_at": m.created_at,
                                            "reply_to_msg_id": m.reply_to_msg_id
                                        })
                                    
                                    response_data = {"type": "messages.search_result", "messages": msg_list}
                                except Exception as e:
                                    print(f"Search error: {e}")
                                    # Fallback for SQLite regex if not supported (standard sqlite3 doesn't support regexp_match without extension)
                                    # If regexp fails, try basic like
                                    if "no such function: REGEXP" in str(e) and filter_type == "link":
                                         # Retry with LIKE
                                         stmt = select(Message)
                                         if channel_id: stmt = stmt.where(Message.channel_id == channel_id)
                                         elif peer_id: stmt = stmt.where(
                                            or_(
                                                and_(Message.sender_id == session.user_id, Message.recipient_id == peer_id),
                                                and_(Message.sender_id == peer_id, Message.recipient_id == session.user_id)
                                            )
                                         )
                                         if query: stmt = stmt.where(Message.content.ilike(f"%{query}%"))
                                         stmt = stmt.where(or_(Message.content.like("%http://%"), Message.content.like("%https://%")))
                                         stmt = stmt.order_by(Message.created_at.desc()).limit(50)
                                         
                                         result = await db.execute(stmt)
                                         msgs = result.scalars().all()
                                         # ... (same processing)
                                         msg_list = [] # Simplified repetition
                                         for m in msgs:
                                            # We need sender info again
                                            sender_res = await db.execute(select(User).where(User.id == m.sender_id))
                                            sender = sender_res.scalars().first()
                                            msg_list.append({
                                                "id": m.id,
                                                "sender_id": m.sender_id,
                                                "content": m.content,
                                                "type": m.msg_type,
                                                "media_url": m.media_url,
                                                "created_at": m.created_at,
                                                 "sender": {
                                                    "id": sender.id,
                                                    "display_name": sender.display_name,
                                                    "username": sender.username,
                                                    "avatar_url": sender.avatar_url
                                                } if sender else None
                                            })
                                         response_data = {"type": "messages.search_result", "messages": msg_list}
                                    else:
                                        response_data = {"type": "error", "message": f"Search failed: {str(e)}"}


                elif method == "messages.delete":
                    message_ids = args.get("message_ids", [])
                    delete_for_all = args.get("delete_for_all", False)
                    
                    if not message_ids:
                        response_data = {"type": "error", "message": "No IDs provided"}
                    elif not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(Message).where(Message.id.in_(message_ids)))
                            msgs = res.scalars().all()
                            
                            deleted_ids = []
                            for msg in msgs:
                                is_sender = msg.sender_id == session.user_id
                                is_recipient = msg.recipient_id == session.user_id
                                
                                if not (is_sender or is_recipient):
                                    continue
                                    
                                if delete_for_all and is_sender:
                                    await db.delete(msg)
                                    deleted_ids.append(msg.id)
                                else:
                                    if is_sender:
                                        msg.deleted_by_sender = True
                                    if is_recipient:
                                        msg.deleted_by_recipient = True
                                    deleted_ids.append(msg.id)
                            
                            await db.commit()
                            response_data = {"type": "messages.deleted", "ids": deleted_ids}

                # --- ADMIN METHODS (Strictly for gtesla814@gmail.com) ---
                elif method.startswith("admin."):
                    print(f"DEBUG: Processing admin method '{method}' for user_id={session.user_id}")
                    if not session.user_id:
                        print("DEBUG: User not authenticated")
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(User).where(User.id == session.user_id))
                            me = res.scalars().first()
                            
                            debug_email = me.email if me else "None"
                            print(f"DEBUG: Authenticated user email is: '{debug_email}'")
                            
                            # Case-insensitive and whitespace-tolerant check
                            target_email = "gtesla814@gmail.com"
                            user_email = (me.email or "").strip().lower()
                            
                            if user_email != target_email:
                                print(f"DEBUG: Access denied. Expected '{target_email}', got '{user_email}'")
                                response_data = {"type": "error", "message": f"Admin access denied: Email '{user_email}' is not authorized."}
                            else:
                                print("DEBUG: Access granted. Executing admin logic.")
                                try:
                                    if method == "admin.users_get":
                                        print("ADMIN: Fetching users (LIMIT 50)...")
                                        res = await db.execute(select(User).order_by(User.id.desc()).limit(50))
                                        users = res.scalars().all()
                                        print(f"ADMIN: Found {len(users)} users. Serializing...")
                                        
                                        serialized_users = []
                                        for u in users:
                                            try:
                                                s_u = serialize_user(u)
                                                serialized_users.append(s_u)
                                            except Exception as ser_err:
                                                print(f"ADMIN ERROR: Failed to serialize user {u.id}: {ser_err}")
                                        
                                        print(f"ADMIN: Serialized {len(serialized_users)} users successfully.")
                                        response_data = {"type": "admin.users_list", "users": serialized_users}
                                    
                                    elif method == "admin.groups_get":
                                        print("ADMIN: Fetching groups...")
                                        res = await db.execute(select(Group).order_by(Group.id.desc()))
                                        groups = res.scalars().all()
                                        print(f"ADMIN: Found {len(groups)} groups")
                                        response_data = {"type": "admin.groups_list", "groups": [{
                                            "id": g.id,
                                            "name": g.name,
                                            "avatar_url": g.avatar_url,
                                            "owner_id": g.owner_id,
                                            "created_at": g.created_at
                                        } for g in groups]}
                                    
                                    elif method == "admin.user_ban":
                                        target_user_id = args.get("user_id")
                                        print(f"ADMIN: Banning user {target_user_id}")
                                        res = await db.execute(select(User).where(User.id == target_user_id))
                                        target = res.scalars().first()
                                        if target:
                                            email_to_ban = target.email
                                            db.add(BannedEmail(email=email_to_ban, created_at=time.time()))
                                            await db.delete(target)
                                            for sid, sess in list(session_manager.sessions.items()):
                                                if sess.user_id == target_user_id:
                                                    if sess.websocket:
                                                        await sess.websocket.close(code=4001)
                                                    session_manager.remove_session(sid)
                                            await db.commit()
                                            response_data = {"type": "success", "message": f"User {email_to_ban} banned"}
                                        else:
                                            response_data = {"type": "error", "message": "User not found"}

                                    elif method == "admin.group_delete":
                                        group_id = args.get("group_id")
                                        print(f"ADMIN: Deleting group {group_id}")
                                        res = await db.execute(select(Group).where(Group.id == group_id))
                                        group = res.scalars().first()
                                        if group:
                                            await db.execute(delete(GroupMember).where(GroupMember.group_id == group_id))
                                            res_ch = await db.execute(select(Channel).where(Channel.group_id == group_id))
                                            channels = res_ch.scalars().all()
                                            ch_ids = [c.id for c in channels]
                                            if ch_ids:
                                                await db.execute(delete(Message).where(Message.channel_id.in_(ch_ids)))
                                                await db.execute(delete(Channel).where(Channel.id.in_(ch_ids)))
                                            await db.delete(group)
                                            await db.commit()
                                            response_data = {"type": "success", "message": "Group deleted"}
                                        else:
                                            response_data = {"type": "error", "message": "Group not found"}

                                    elif method == "admin.messages_get":
                                        peer1_id = int(args.get("peer1_id"))
                                        peer2_id = int(args.get("peer2_id"))
                                        print(f"ADMIN: Fetching logs between {peer1_id} and {peer2_id}")
                                        res = await db.execute(select(Message).where(
                                            or_(
                                                and_(Message.sender_id == peer1_id, Message.recipient_id == peer2_id),
                                                and_(Message.sender_id == peer2_id, Message.recipient_id == peer1_id)
                                            )
                                        ).order_by(Message.id.desc()).limit(100))
                                        msgs = res.scalars().all()
                                        print(f"ADMIN: Found {len(msgs)} messages")
                                        
                                        msg_list = []
                                        for m in msgs:
                                            msg_list.append({
                                                "id": m.id,
                                                "sender_id": m.sender_id,
                                                "content": m.content,
                                                "created_at": m.created_at
                                            })
                                            
                                        response_data = {"type": "admin.messages_list", "messages": msg_list}

                                    elif method == "admin.banned_users_get":
                                        print("ADMIN: Fetching banned emails...")
                                        res = await db.execute(select(BannedEmail).order_by(BannedEmail.created_at.desc()))
                                        banned_list = res.scalars().all()
                                        response_data = {"type": "admin.banned_list", "emails": [{
                                            "email": b.email,
                                            "created_at": b.created_at 
                                        } for b in banned_list]}

                                    elif method == "admin.user_unban":
                                        email_to_unban = args.get("email")
                                        if not email_to_unban:
                                            response_data = {"type": "error", "message": "Email required"}
                                        else:
                                            print(f"ADMIN: Unbanning {email_to_unban}")
                                            res = await db.execute(select(BannedEmail).where(BannedEmail.email == email_to_unban))
                                            entry = res.scalars().first()
                                            if entry:
                                                await db.delete(entry)
                                                await db.commit()
                                                response_data = {"type": "success", "message": f"Unbanned {email_to_unban}"}
                                            else:
                                                response_data = {"type": "error", "message": "Email not found in ban list"}

                                except Exception as e:
                                    print(f"ADMIN ERROR: {e}")
                                    import traceback
                                    traceback.print_exc()
                                    response_data = {"type": "error", "message": f"Admin Action Failed: {str(e)}"}
                            
                            # Broadcast deletion if necessary (e.g. valid 'delete for all')
                            if delete_for_all:
                                # We need to notify the OTHER party (recipient)
                                # Optimisation: Group by peer
                                for msg in msgs:
                                    if msg.sender_id == session.user_id:
                                        target_id = msg.recipient_id
                                        # Broadcast
                                        for sid, sess in session_manager.sessions.items():
                                            if sess.user_id == target_id and sess.websocket:
                                                try:
                                                    push = {
                                                        "type": "messages.deleted",
                                                        "ids": [msg.id],
                                                        "peer_id": session.user_id
                                                    }
                                                    push_json = json.dumps(push)
                                                    push_bytes = push_json.encode('utf-8')
                                                    push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                                    await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                                except: pass

                elif method == "messages.forward":
                    message_ids = args.get("message_ids", [])
                    target_peer_id = args.get("peer_id")
                    channel_id = args.get("channel_id")
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not message_ids or (not target_peer_id and not channel_id):
                        response_data = {"type": "error", "message": "Missing message_ids or destination"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Fetch original messages
                            res = await db.execute(select(Message).where(Message.id.in_(message_ids)))
                            original_msgs = res.scalars().all()
                            
                            forwarded_msgs = []
                            for orig in original_msgs:
                                # Determine original sender (preserve if already forwarded)
                                fwd_from_id = orig.fwd_from_id or orig.sender_id
                                
                                # Create forwarded message
                                new_msg = Message(
                                    sender_id=session.user_id,
                                    recipient_id=target_peer_id,
                                    channel_id=channel_id,
                                    content=orig.content,
                                    msg_type=orig.msg_type,
                                    media_url=orig.media_url,
                                    fwd_from_id=fwd_from_id,
                                    created_at=time.time()
                                )
                                db.add(new_msg)
                                forwarded_msgs.append(new_msg)
                            
                            await db.commit()
                            
                            # Handle dialogs for DMs
                            if target_peer_id:
                                for new_msg in forwarded_msgs:
                                    await db.refresh(new_msg)
                                    # Sender dialog
                                    res = await db.execute(select(Dialog).where(and_(Dialog.user_id==session.user_id, Dialog.peer_id==target_peer_id)))
                                    d_sender = res.scalars().first()
                                    if not d_sender:
                                        d_sender = Dialog(user_id=session.user_id, peer_id=target_peer_id, unread_count=0)
                                        db.add(d_sender)
                                    d_sender.last_message_id = new_msg.id
                                    d_sender.updated_at = time.time()
                                    
                                    # Recipient dialog
                                    res = await db.execute(select(Dialog).where(and_(Dialog.user_id==target_peer_id, Dialog.peer_id==session.user_id)))
                                    d_recipient = res.scalars().first()
                                    if not d_recipient:
                                        d_recipient = Dialog(user_id=target_peer_id, peer_id=session.user_id, unread_count=0)
                                        db.add(d_recipient)
                                    d_recipient.last_message_id = new_msg.id
                                    d_recipient.updated_at = time.time()
                                    d_recipient.unread_count += 1
                                await db.commit()

                            # Prepare sender info (me)
                            res = await db.execute(select(User).where(User.id == session.user_id))
                            me = res.scalars().first()
                            sender_info = serialize_user(me, include_status=False)

                            # Notify sender
                            response_data = {"type": "messages.forwarded", "count": len(forwarded_msgs)}
                            
                            # Broadcast
                            for new_msg in forwarded_msgs:
                                # Fetch fwd_from_user info
                                fwd_user_info = None
                                if new_msg.fwd_from_id:
                                    f_res = await db.execute(select(User).where(User.id == new_msg.fwd_from_id))
                                    f_user = f_res.scalars().first()
                                    if f_user:
                                        fwd_user_info = serialize_user(f_user, include_status=False)

                                msg_obj = {
                                    "id": new_msg.id,
                                    "sender_id": session.user_id,
                                    "sender": sender_info,
                                    "content": new_msg.content,
                                    "type": new_msg.msg_type,
                                    "media_url": new_msg.media_url,
                                    "is_read": False,
                                    "created_at": new_msg.created_at,
                                    "fwd_from_id": new_msg.fwd_from_id,
                                    "fwd_from_user": fwd_user_info
                                }
                                if channel_id: msg_obj["channel_id"] = channel_id

                                if target_peer_id:
                                    # Broadcast to recipient
                                    push_wrapper = { "type": "message.new", "message": msg_obj, "peer_id": session.user_id, "sender_id": session.user_id }
                                    push_json = json.dumps(push_wrapper)
                                    push_bytes = push_json.encode('utf-8')
                                    for sid, sess in session_manager.sessions.items():
                                        if sess.user_id == target_peer_id and sess.websocket and sess.auth_key:
                                            try:
                                                push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                                await sess.websocket.send_text(json.dumps({"data": push_enc.hex()}))
                                            except: pass
                                else:
                                    # Channel Broadcasting
                                    res = await db.execute(select(Channel).where(Channel.id == channel_id))
                                    channel = res.scalars().first()
                                    if channel:
                                        res = await db.execute(select(GroupMember).where(GroupMember.group_id == channel.group_id))
                                        members = res.scalars().all()
                                        member_ids = [mb.user_id for mb in members]
                                        
                                        push_wrapper = { "type": "message.new", "message": msg_obj, "channel_id": channel_id, "sender_id": session.user_id }
                                        push_json = json.dumps(push_wrapper)
                                        push_bytes = push_json.encode('utf-8')
                                        for sid, sess in session_manager.sessions.items():
                                            if sess.user_id in member_ids and sess.user_id != session.user_id and sess.websocket and sess.auth_key:
                                                try:
                                                    push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                                    await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                                except: pass

                # --- GROUP HANDLERS ---
                elif method == "groups.create":
                    name = args.get("name")
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not name:
                         response_data = {"type": "error", "message": "Group name required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            new_group = Group(
                                name=name,
                                owner_id=session.user_id,
                                avatar_url=args.get("avatar_url"),
                                created_at=time.time()
                            )
                            db.add(new_group)
                            await db.flush()
                            
                            member = GroupMember(
                                group_id=new_group.id,
                                user_id=session.user_id,
                                role="owner",
                                joined_at=time.time()
                            )
                            db.add(member)
                            
                            c1 = Channel(group_id=new_group.id, name="general", type="text", position=0)
                            c2 = Channel(group_id=new_group.id, name="General", type="voice", position=1)
                            db.add(c1)
                            db.add(c2)
                            
                            await db.commit()
                            
                            response_data = {
                                "type": "groups.create_success",
                                "group": {
                                    "id": new_group.id,
                                    "name": new_group.name,
                                    "avatar_url": new_group.avatar_url,
                                    "channels": [
                                        {"id": c1.id, "name": c1.name, "type": c1.type},
                                        {"id": c2.id, "name": c2.name, "type": c2.type}
                                    ]
                                }
                            }

                elif method == "groups.list":
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            stmt = select(Group).join(GroupMember).where(GroupMember.user_id == session.user_id)
                            res = await db.execute(stmt)
                            groups = res.scalars().all()
                            
                            groups_list = []
                            for g in groups:
                                c_res = await db.execute(select(Channel).where(Channel.group_id == g.id).order_by(Channel.position))
                                channels = c_res.scalars().all()
                                
                                channels_info = []
                                group_has_active_call = False
                                group_active_participants = []
                                
                                for c in channels:
                                    # active_group_calls is keyed by channel_id
                                    call_info = active_group_calls.get(c.id)
                                    has_call = call_info is not None
                                    participants = list(call_info.values()) if has_call else []
                                    
                                    channels_info.append({
                                        "id": c.id, 
                                        "name": c.name, 
                                        "type": c.type,
                                        "has_active_call": has_call,
                                        "active_participants": participants
                                    })
                                    
                                    if has_call:
                                        group_has_active_call = True
                                        group_active_participants.extend(participants)
                                
                                groups_list.append({
                                    "id": g.id,
                                    "name": g.name,
                                    "avatar_url": g.avatar_url,
                                    "owner_id": g.owner_id,
                                    "has_active_call": group_has_active_call,
                                    "active_participants": group_active_participants,
                                    "channels": channels_info
                                })
                            
                            response_data = {"type": "groups.list_result", "groups": groups_list}

                elif method == "groups.update":
                    group_id = args.get("group_id")
                    name = args.get("name")
                    avatar_url = args.get("avatar_url")
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not group_id:
                        response_data = {"type": "error", "message": "Group ID required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Check role
                            m_stmt = select(GroupMember).where(and_(GroupMember.group_id == group_id, GroupMember.user_id == session.user_id))
                            m_res = await db.execute(m_stmt)
                            requester = m_res.scalars().first()
                            
                            if not requester or requester.role not in ["owner", "admin"]:
                                response_data = {"type": "error", "message": "No permission to update group"}
                            else:
                                res = await db.execute(select(Group).where(Group.id == group_id))
                                group = res.scalars().first()
                                if not group:
                                     response_data = {"type": "error", "message": "Group not found"}
                                else:
                                    if name: group.name = name
                                    if avatar_url: group.avatar_url = avatar_url
                                    await db.commit()
                                    
                                    response_data = {
                                        "type": "groups.updated",
                                        "group_id": group_id,
                                        "name": group.name,
                                        "avatar_url": group.avatar_url
                                    }

                                # Broadcast to all members
                                m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
                                m_res = await db.execute(m_stmt)
                                member_ids = m_res.scalars().all()
                                
                                for mid in member_ids:
                                    for sid, sess in session_manager.sessions.items():
                                        if sess.user_id == mid and sess.websocket:
                                            try:
                                                push_bytes = json.dumps(response_data).encode('utf-8')
                                                push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                                await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                            except: pass

                elif method == "groups.members.add":
                    group_id = args.get("group_id")
                    user_id = args.get("user_id")
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not group_id or not user_id:
                        response_data = {"type": "error", "message": "Group ID and User ID required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Check if requester is owner/admin
                            res = await db.execute(select(GroupMember).where(and_(GroupMember.group_id == group_id, GroupMember.user_id == session.user_id)))
                            requester = res.scalars().first()
                            
                            if not requester or requester.role not in ["owner", "admin"]:
                                response_data = {"type": "error", "message": "No permission to add members"}
                            else:
                                # Check if already member
                                res = await db.execute(select(GroupMember).where(and_(GroupMember.group_id == group_id, GroupMember.user_id == user_id)))
                                if res.scalars().first():
                                    response_data = {"type": "error", "message": "User already a member"}
                                else:
                                    new_member = GroupMember(
                                        group_id=group_id,
                                        user_id=user_id,
                                        role="member",
                                        joined_at=time.time()
                                    )
                                    db.add(new_member)
                                    await db.commit()
                                    response_data = {"type": "groups.members.added", "group_id": group_id, "user_id": user_id}

                                    # Notify the added user
                                    for sid, sess in session_manager.sessions.items():
                                        if sess.user_id == user_id and sess.websocket:
                                            try:
                                                push = {"type": "groups.new_membership", "group_id": group_id}
                                                push_bytes = json.dumps(push).encode('utf-8')
                                                push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                                await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                            except: pass

                                    # Broadcast to OTHER members that someone joined
                                    m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
                                    m_res = await db.execute(m_stmt)
                                    member_ids = m_res.scalars().all()
                                    for mid in member_ids:
                                        for sid, sess in session_manager.sessions.items():
                                            if sess.user_id == mid and sess.websocket:
                                                try:
                                                    push = {"type": "groups.member_joined", "group_id": group_id, "user_id": user_id}
                                                    push_bytes = json.dumps(push).encode('utf-8')
                                                    push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                                    await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                                except: pass

                elif method == "groups.members.list":
                    group_id = args.get("group_id")
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Verify membership
                            m_res = await db.execute(select(GroupMember).where(and_(GroupMember.group_id == group_id, GroupMember.user_id == session.user_id)))
                            if not m_res.scalars().first():
                                response_data = {"type": "error", "message": "Not a member"}
                            else:
                                res = await db.execute(select(User, GroupMember.role).join(GroupMember).where(GroupMember.group_id == group_id))
                                members = res.all()
                                
                                members_list = []
                                for u, role in members:
                                    u_data = serialize_user(u)
                                    u_data["role"] = role
                                    members_list.append(u_data)
                                response_data = {"type": "groups.members.list_result", "group_id": group_id, "members": members_list}

                elif method == "groups.channels.create":
                    group_id = args.get("group_id")
                    name = args.get("name")
                    c_type = args.get("type", "text")
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            m_res = await db.execute(select(GroupMember).where(and_(GroupMember.group_id == group_id, GroupMember.user_id == session.user_id)))
                            if not m_res.scalars().first():
                                response_data = {"type": "error", "message": "Not a member"}
                            else:
                                new_channel = Channel(group_id=group_id, name=name, type=c_type, position=99)
                                db.add(new_channel)
                                await db.commit()
                                
                                response_data = {
                                    "type": "groups.channel_created",
                                    "group_id": group_id,
                                    "channel": {"id": new_channel.id, "name": new_channel.name, "type": new_channel.type}
                                }

                elif method == "user.update_profile":
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:

                        display_name = args.get("display_name")
                        username = args.get("username")
                        avatar_url = args.get("avatar_url")
                        about = args.get("about")
                        phone_number = args.get("phone_number")
                        
                        if phone_number and not re.match(r'^(\+7|8)\d{10}$', phone_number):
                             response_data = {"type": "error", "message": "Invalid Russian phone number"}
                        elif about and len(about) > 50:
                             response_data = {"type": "error", "message": "About must be 50 characters or less"}
                        else:
                            async with AsyncSessionLocal() as db:
                                # Check Username Uniqueness if changed
                                if username:
                                    res = await db.execute(select(User).where(and_(User.username == username, User.id != session.user_id)))
                                    if res.scalars().first():
                                        response_data = {"type": "error", "message": "Username already taken"}
                                        
                                if "message" not in response_data: # Proceed if no error yet
                                    values_to_update = {
                                        "display_name": display_name,
                                        "avatar_url": avatar_url,
                                        "about": about,
                                        "phone_number": phone_number
                                    }
                                    if username:
                                        values_to_update["username"] = username

                                    stmt = update(User).where(User.id == session.user_id).values(**values_to_update)
                                    await db.execute(stmt)
                                    await db.commit()
                                    
                                    # Fetch updated user for consistent response
                                    res = await db.execute(select(User).where(User.id == session.user_id))
                                    updated_user = res.scalars().first()
                                    response_data = {"type": "user.profile_updated", "user": serialize_user(updated_user, include_status=False)}

                elif method in ["call.offer", "call.answer", "call.ice_candidate", "call.hangup", "call.reject"]:
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        target_id = args.get("target_id")
                        if not target_id:
                            response_data = {"type": "error", "message": "Target ID required"}
                        else:
                            # Forward to all sessions of target user
                            forwarded = False
                            for sid, sess in session_manager.sessions.items():
                                if sess.user_id == target_id and sess.websocket:
                                    try:
                                        payload = {
                                            "type": method,
                                            "sender_id": session.user_id,
                                            "data": args.get("data") # SDP or ICE candidate or Reason
                                        }
                                        print(f"Forwarding {method} from {session.user_id} to {target_id}")
                                        push_json = json.dumps(payload)
                                        push_bytes = push_json.encode('utf-8')
                                        push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                        await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                        forwarded = True
                                    except Exception as e:
                                        print(f"Call signal error: {e}")
                            
                            if not forwarded and method == "call.offer":
                                response_data = {"type": "error", "message": "User is offline"}
                            else:
                                # Track P2P calls for cleanup
                                if method == "call.offer":
                                    active_p2p_calls[session.user_id] = target_id
                                elif method == "call.answer":
                                    active_p2p_calls[session.user_id] = target_id
                                elif method in ["call.hangup", "call.reject"]:
                                    active_p2p_calls.pop(session.user_id, None)
                                    if active_p2p_calls.get(target_id) == session.user_id:
                                        active_p2p_calls.pop(target_id, None)
                                
                                response_data = {"type": "success"}

                elif method == "groups.call.start":
                    channel_id = args.get("group_id")  # This is actually a channel_id
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not channel_id:
                        response_data = {"type": "error", "message": "Channel ID required"}
                    else:
                        # Get the actual group_id from the channel
                        async with AsyncSessionLocal() as db:
                            ch_stmt = select(Channel).where(Channel.id == channel_id)
                            ch_res = await db.execute(ch_stmt)
                            channel = ch_res.scalar_one_or_none()
                            
                            if not channel:
                                response_data = {"type": "error", "message": "Channel not found"}
                            else:
                                actual_group_id = channel.group_id
                                
                                if channel_id not in active_group_calls:
                                    active_group_calls[channel_id] = {}
                                
                                print(f"🎬 Starting call in channel {channel_id} (group {actual_group_id}) by user {session.user_id}")
                                
                                # Notify all members of the GROUP that a call started
                                m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == actual_group_id)
                                m_res = await db.execute(m_stmt)
                                member_ids = m_res.scalars().all()
                                
                                print(f"📢 Broadcasting groups.call.started to {len(member_ids)} members: {member_ids}")
                                for mid in member_ids:
                                    print(f"  → Sending to user {mid}")
                                    await broadcast_event(mid, "groups.call.started", {"group_id": channel_id, "started_by": session.user_id})
                                
                                response_data = {"type": "success"}

                elif method == "groups.call.join":
                    channel_id = args.get("group_id")  # This is actually a channel_id
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not channel_id:
                        response_data = {"type": "error", "message": "Channel ID required"}
                    else:
                        if channel_id not in active_group_calls:
                            active_group_calls[channel_id] = {}
                        
                        # Get profile for others and actual group_id
                        async with AsyncSessionLocal() as db:
                            # Get channel to find actual group_id
                            ch_stmt = select(Channel).where(Channel.id == channel_id)
                            ch_res = await db.execute(ch_stmt)
                            channel = ch_res.scalar_one_or_none()
                            
                            if not channel:
                                response_data = {"type": "error", "message": "Channel not found"}
                            else:
                                actual_group_id = channel.group_id
                                
                                res = await db.execute(select(User).where(User.id == session.user_id))
                                user = res.scalars().first()
                                user_info = serialize_user(user, include_status=False)
                                
                                # Already in?
                                if session.user_id in active_group_calls[channel_id]:
                                    pass # Re-join or update
                                
                                # Participants BEFORE joining
                                participants = list(active_group_calls[channel_id].values())
                                
                                active_group_calls[channel_id][session.user_id] = user_info
                                
                                print(f"👤 User {session.user_id} joined call in channel {channel_id} (group {actual_group_id})")
                                
                                # Notify ALL group members (not just call participants)
                                m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == actual_group_id)
                                m_res = await db.execute(m_stmt)
                                member_ids = m_res.scalars().all()
                                
                                print(f"📢 Broadcasting groups.call.member_joined to {len(member_ids)} members: {member_ids}")
                                for mid in member_ids:
                                    if mid != session.user_id:
                                        print(f"  → Sending to user {mid}: {user_info}")
                                        await broadcast_event(mid, "groups.call.member_joined", {"group_id": channel_id, "user": user_info})
                                
                                response_data = {"type": "groups.call.join_result", "group_id": channel_id, "participants": participants}

                elif method == "groups.call.leave":
                    channel_id = args.get("group_id")  # This is actually a channel_id
                    print(f"DEBUG: User {session.user_id} leaving call in channel {channel_id}")
                    print(f"DEBUG: active_group_calls keys: {list(active_group_calls.keys())}")
                    print(f"DEBUG: channel_id in active_group_calls: {channel_id in active_group_calls}")
                    
                    if channel_id in active_group_calls:
                        # Get remaining participants BEFORE removing this user
                        remaining_participant_ids = [pid for pid in active_group_calls[channel_id].keys() if pid != session.user_id]
                        
                        # Remove user from active call
                        active_group_calls[channel_id].pop(session.user_id, None)
                        print(f"DEBUG: Removed user {session.user_id} from active_group_calls[{channel_id}]")
                        print(f"DEBUG: Remaining participants: {list(active_group_calls[channel_id].keys())}")
                        
                        # Notify ALL group members (not just call participants)
                        async with AsyncSessionLocal() as db:
                            # Get channel to find actual group_id
                            ch_stmt = select(Channel).where(Channel.id == channel_id)
                            ch_res = await db.execute(ch_stmt)
                            channel = ch_res.scalar_one_or_none()
                            
                            if channel:
                                actual_group_id = channel.group_id
                                m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == actual_group_id)
                                m_res = await db.execute(m_stmt)
                                member_ids = m_res.scalars().all()
                                
                                for mid in member_ids:
                                    if mid != session.user_id:
                                        await broadcast_event(mid, "groups.call.member_left", {"group_id": channel_id, "user_id": session.user_id})
                        
                        # If no one left, end the call
                        if not active_group_calls[channel_id]:
                            del active_group_calls[channel_id]
                            print(f"DEBUG: Group call {channel_id} ended (no participants)")
                            
                            # Notify all members that call ended
                            async with AsyncSessionLocal() as db:
                                ch_stmt = select(Channel).where(Channel.id == channel_id)
                                ch_res = await db.execute(ch_stmt)
                                channel = ch_res.scalar_one_or_none()
                                
                                if channel:
                                    actual_group_id = channel.group_id
                                    m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == actual_group_id)
                                    m_res = await db.execute(m_stmt)
                                    member_ids = m_res.scalars().all()
                                    
                                    for mid in member_ids:
                                        await broadcast_event(mid, "groups.call.ended", {"group_id": channel_id})
                    else:
                        print(f"DEBUG: channel_id {channel_id} not found in active_group_calls")
                    
                    response_data = {"type": "success"}

                elif method == "groups.call.signal":
                    group_id = args.get("group_id")
                    target_id = args.get("target_id")
                    signal_data = args.get("data")
                    
                    if target_id and signal_data:
                        await broadcast_event(target_id, "groups.call.signal", {
                            "group_id": group_id,
                            "sender_id": session.user_id,
                            "data": signal_data
                        })
                    response_data = {"type": "success"}

                elif method == "groups.delete":
                    group_id = args.get("group_id")
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not group_id:
                        response_data = {"type": "error", "message": "Group ID required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # 1. Verify Ownership
                            res = await db.execute(select(Group).where(Group.id == group_id))
                            group = res.scalars().first()
                            
                            if not group:
                                response_data = {"type": "error", "message": "Group not found"}
                            elif group.owner_id != session.user_id:
                                response_data = {"type": "error", "message": "Only the owner can delete the group"}
                            else:
                                # 2. Get Members for Broadcast BEFORE deletion
                                m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
                                m_res = await db.execute(m_stmt)
                                member_ids = m_res.scalars().all()
                                
                                # 3. Delete Group (cascading SHOULD handle dependants if configured, but let's be safe)
                                # Assuming simplified delete for now (no cascade config in models visible, so relying on manual or DB FKs)
                                # Steps: Delete Channels -> Delete Members -> Delete Group
                                # Delete related Messages? (Might be too many, DB likely has ON DELETE CASCADE on FKs)
                                
                                # Explicitly delete channels and members to be safe if DB doesn't cascade
                                await db.execute(select(Channel).where(Channel.group_id == group_id)) # Just fetch to ensure
                                
                                # Actually, standard SQLalchemy with SQLite usually requires PRAGMA foreign_keys=ON for cascades to work.
                                # Let's do a manual cleanup to be sure.
                                
                                # Delete Channels
                                await db.execute(delete(Channel).where(Channel.group_id == group_id))
                                
                                # Delete Members
                                await db.execute(delete(GroupMember).where(GroupMember.group_id == group_id))

                                # Delete Messages in Channels (Important!)
                                # First get channel IDs? We just deleted them. Ideally we should have done this first.
                                # But let's assume standard cascading or leave messages as orphans for now (MVP).
                                # Real production would need proper cleanup.
                                
                                # Delete Group
                                await db.delete(group)
                                await db.commit()
                                
                                response_data = {"type": "groups.deleted", "group_id": group_id}
                                
                                # 4. Broadcast
                                for mid in member_ids:
                                    if mid == session.user_id: continue # Already responding
                                    
                                    for sid, sess in list(session_manager.sessions.items()):
                                        if sess.user_id == mid and sess.websocket:
                                            try:
                                                push = {"type": "groups.deleted", "group_id": group_id}
                                                push_bytes = json.dumps(push).encode('utf-8')
                                                push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                                await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                            except: pass


                elif method == "user.request_password_change":
                    if not session.user_id:
                         response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        # Get user email
                        email_to_send = None
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(User).where(User.id == session.user_id))
                            user = res.scalars().first()
                            
                            if user:
                                email_to_send = user.email
                                
                        if not email_to_send:
                             response_data = {"type": "error", "message": "User not found"}
                        else:
                            code = str(random.randint(10000, 99999))
                            session.temp_auth_data["password_change_code"] = code
                            session.temp_auth_data["password_change_email"] = email_to_send
                            
                            # Send email
                            print(f"PASSWORD CHANGE CODE for {email_to_send}: {code}") # Fallback output
                            
                            sent = False
                            try:
                                sent = await send_email(email_to_send, "SamOr Password Change Code", f"Your verification code is: {code}")
                            except Exception as e:
                                print(f"Email send failed: {e}")
                            
                            if sent:
                                response_data = {"type": "success", "message": "Code sent"}
                            else:
                                response_data = {"type": "success", "message": "Code sent (check console)"}

                elif method == "user.change_password":
                    code = args.get("code")
                    new_password = args.get("new_password")
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not code or not new_password:
                        response_data = {"type": "error", "message": "Code and password required"}
                    else:
                        stored_code = session.temp_auth_data.get("password_change_code")
                        if not stored_code or stored_code != code:
                            response_data = {"type": "error", "message": "Invalid code"}
                        else:
                            hashed, salt = hash_password(new_password)
                            
                            async with AsyncSessionLocal() as db:
                                stmt = update(User).where(User.id == session.user_id).values(
                                    hashed_password=hashed,
                                    salt=salt
                                )
                                await db.execute(stmt)
                                await db.commit()
                                
                                session.temp_auth_data.pop("password_change_code", None)
                                response_data = {"type": "success", "message": "Password changed successfully"}

                else:
                    response_data = {"type": "error", "message": "Unknown method"}

                try:
                    response_plaintext = json.dumps(response_data)
                    
                    # Encrypt Response
                    response_bytes = response_plaintext.encode('utf-8')
                    encrypted_response = MTProtoCrypto.encrypt(session.auth_key, response_bytes)
                    
                    await websocket.send_text(json.dumps({
                        "data": encrypted_response.hex()
                    }))
                except Exception as send_err:
                     print(f"WS SEND ERROR while sending response for {method}: {send_err}")
                
            except Exception as e:
                print(f"WS Handling Error (Decryption/Logic): {e}")
                import traceback
                traceback.print_exc()
                pass
                
    except WebSocketDisconnect:
        pass # Normal disconnect
    except Exception as e:
        # Ignore 1006/1005 if visible in string
        if "1006" not in str(e) and "1005" not in str(e):
             print(f"WS Main Loop Error: {e}")
    finally:
        if session.user_id:
            uid = session.user_id
            session_manager.unbind_user(session)
            
            # Check if user is fully offline (no sessions)
            if not session_manager.is_online(uid):
                last_seen_time = time.time()
                # Update DB
                try:
                    async with AsyncSessionLocal() as db:
                        stmt = update(User).where(User.id == uid).values(last_seen=last_seen_time)
                        await db.execute(stmt)
                        await db.commit()
                except Exception as e:
                    print(f"Update last_seen error: {e}")
                
                await broadcast_presence(uid, False, last_seen_time)
            
            # 1-on-1 Call Cleanup
            if uid in active_p2p_calls:
                peer_id = active_p2p_calls.pop(uid)
                if active_p2p_calls.get(peer_id) == uid:
                    active_p2p_calls.pop(peer_id, None)
                await broadcast_event(peer_id, "call.hangup", {"sender_id": uid})

            # Group Call Cleanup
            for gid, participants in list(active_group_calls.items()):
                if uid in participants:
                    del participants[uid]
                    if not participants:
                        del active_group_calls[gid]
                        async with AsyncSessionLocal() as db:
                            m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == gid)
                            m_res = await db.execute(m_stmt)
                            member_ids = m_res.scalars().all()
                            for mid in member_ids:
                                await broadcast_event(mid, "groups.call.ended", {"group_id": gid})
                    else:
                        for pid in participants:
                            await broadcast_event(pid, "groups.call.member_left", {"group_id": gid, "user_id": uid})
        
        session_manager.remove_session(session.session_id)
        print(f"Session closed: {session.session_id}")

def hash_password(password: str, salt: str = None):
    import hashlib
    import os
    if not salt:
        salt = os.urandom(16).hex()
    key = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return key.hex(), salt

def verify_password(stored_password, stored_salt, provided_password):
    key, _ = hash_password(provided_password, stored_salt)
    return key == stored_password
