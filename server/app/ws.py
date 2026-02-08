from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.session_manager import session_manager
from app.crypto.mtproto import MTProtoCrypto
import json
import time
import uuid
import random
import re
from app.core.email import send_email
from app.db.models import AsyncSessionLocal, User, Message, Dialog, Contact, Group, GroupMember, Channel
from sqlalchemy.future import select
from sqlalchemy import update, or_, and_

router = APIRouter()

active_group_calls = {}
# In-memory tracking for P2P calls: { user_id: peer_id }
active_p2p_calls = {}

async def broadcast_presence(user_id: int, is_online: bool, last_seen: float = 0):
    async with AsyncSessionLocal() as db:
        # Get all users who have this user as a contact (or just active dialog peers for MVP)
        # For full "online status", you usually only show it to people you have chatted with or are contacts.
        # Let's broadcast to everyone with an active session for simplicity (Small scale) 
        # OR better: broadcast to all open sessions.
        
        # Proper way: Broadcast to sessions where `user_id` is a known peer. 
        # Optimization: Client filters. Server broadcasts to all? 
        # Privacy: Let's broadcast to all active sessions for now.
        
        payload = {
            "type": "user.status",
            "user_id": user_id,
            "status": "online" if is_online else "offline",
            "last_seen": last_seen
        }
        
        for sid, sess in session_manager.sessions.items():
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
    for sid, sess in session_manager.sessions.items():
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
                                        "user": {
                                            "id": user.id,
                                            "username": user.username,
                                            "display_name": user.display_name,
                                            "avatar_url": user.avatar_url,
                                            "about": user.about,
                                            "phone_number": user.phone_number,
                                            "token": token
                                        }
                                    }
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
                                        "user": {
                                            "id": user.id,
                                            "username": user.username,
                                            "display_name": user.display_name,
                                            "avatar_url": user.avatar_url,
                                            "about": user.about,
                                            "phone_number": user.phone_number,
                                            "token": token
                                        }
                                    }
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
                                        "user": {
                                            "id": new_user.id,
                                            "username": new_user.username,
                                            "display_name": new_user.display_name,
                                            "avatar_url": new_user.avatar_url,
                                            "about": new_user.about,
                                            "phone_number": new_user.phone_number,
                                            "token": login_token
                                        }
                                    }
                
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
                                    "user": {
                                        "id": user.id,
                                        "username": user.username,
                                        "display_name": user.display_name,
                                        "avatar_url": user.avatar_url,
                                        "about": user.about,
                                        "phone_number": user.phone_number,
                                        "token": user.token
                                    }
                                }
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
                                    "user": {
                                        "id": user.id,
                                        "username": user.username,
                                        "display_name": user.display_name,
                                        "avatar_url": user.avatar_url
                                    }
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
                                    "user": {
                                        "id": user.id,
                                        "username": user.username,
                                        "display_name": user.display_name,
                                        "avatar_url": user.avatar_url,
                                        "about": user.about,
                                        "phone_number": user.phone_number,
                                        "is_online": session_manager.is_online(user.id),
                                        "last_seen": user.last_seen
                                    }
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
                            user_list.append({
                                "id": u.id,
                                "username": u.username,
                                "display_name": u.display_name,
                                "avatar_url": u.avatar_url,
                                "is_online": session_manager.is_online(u.id),
                                "last_seen": u.last_seen
                            })
                            
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
                                    is_online = session_manager.is_online(peer.id)
                                    dialog_list.append({
                                        "id": d.id,
                                        "peer": {
                                            "id": peer.id,
                                            "username": peer.username,
                                            "display_name": peer.display_name,
                                            "avatar_url": peer.avatar_url,
                                            "is_online": is_online,
                                            "last_seen": peer.last_seen
                                        },
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
                                        "fwd_from_id": m.fwd_from_id
                                    })
                                    
                                response_data = {"type": "messages.history", "messages": msgs_out, "peer_id": peer_id}
                                if peer_id is None and args.get("channel_id"):
                                    response_data["channel_id"] = args.get("channel_id")
                        except Exception as e:
                            print(f"Error getting history: {e}")
                            response_data = {"type": "error", "message": "Failed to load history"}

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
                    msg_ids = args.get("message_ids", [])
                    peer_id = args.get("peer_id")
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not peer_id:
                        response_data = {"type": "error", "message": "Peer required"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Fetch originals
                            stmt = select(Message).where(Message.id.in_(msg_ids))
                            res = await db.execute(stmt)
                            originals = res.scalars().all()
                            
                            # Sort by original creation? Or just order in list. 
                            # Let's preserve order from request or ID.
                            
                            fwd_messages = []
                            
                            for orig in originals:
                                # Create new message
                                new_msg = Message(
                                    sender_id=session.user_id,
                                    recipient_id=peer_id,
                                    content=orig.content,
                                    msg_type=orig.msg_type,
                                    media_url=orig.media_url,
                                    created_at=time.time(),
                                    fwd_from_id=orig.fwd_from_id or orig.sender_id # Chain forwarding or Original
                                )
                                db.add(new_msg)
                                await db.flush() # to get ID
                                
                                # Update Dialogs (Optimized: do it once per batch maybe? but loop is fine for MVP)
                                # ... existing dialog update logic ...
                                # (Skipping duplicated dialog logic for brevity, assume standardized helper in real app)
                                # Let's just do minimal dialog update here or copy-paste
                                
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
                            
                            # Construct response objects
                            msgs_out = []
                            for m in fwd_messages:
                                msg_obj = {
                                    "id": m.id,
                                    "sender_id": session.user_id,
                                    "content": m.content,
                                    "type": m.msg_type,
                                    "media_url": m.media_url,
                                    "is_read": False,
                                    "created_at": m.created_at,
                                    "fwd_from_id": m.fwd_from_id
                                }
                                msgs_out.append(msg_obj)
                                
                                # Notify Recipient
                                await broadcast_event(peer_id, "message.new", {
                                    "message": msg_obj,
                                    "peer_id": session.user_id,
                                    "sender_id": session.user_id
                                })
                            
                            response_data = {"type": "messages.forward_done", "count": len(msgs_out)}

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
                            for sid, sess in session_manager.sessions.items():
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
                            sender_info = {
                                "id": me.id,
                                "display_name": me.display_name,
                                "username": me.username,
                                "avatar_url": me.avatar_url
                            }
                            
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

                elif method == "messages.delete":
                    message_ids = args.get("message_ids", [])
                    delete_for_all = args.get("delete_for_all", False)
                    
                    if not message_ids:
                        response_data = {"type": "error", "message": "No message IDs provided"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Fetch messages to verify ownership
                            res = await db.execute(select(Message).where(Message.id.in_(message_ids)))
                            msgs = res.scalars().all()
                            
                            deleted_ids = []
                            for msg in msgs:
                                is_sender = msg.sender_id == session.user_id
                                is_recipient = msg.recipient_id == session.user_id
                                
                                if not (is_sender or is_recipient):
                                    continue # Should not happen unless malicious
                                
                                if delete_for_all and is_sender:
                                    # Hard delete or global flag
                                    await db.delete(msg)
                                    deleted_ids.append(msg.id)
                                else:
                                    # Soft delete for me
                                    if is_sender:
                                        msg.deleted_by_sender = True
                                    elif is_recipient:
                                        msg.deleted_by_recipient = True
                                    deleted_ids.append(msg.id)
                            
                            await db.commit()
                            
                            response_data = {"type": "messages.deleted", "ids": deleted_ids}
                            
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
                    
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not message_ids or not target_peer_id:
                        response_data = {"type": "error", "message": "Missing message_ids or peer_id"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # Fetch original messages
                            res = await db.execute(select(Message).where(Message.id.in_(message_ids)))
                            original_msgs = res.scalars().all()
                            
                            forwarded_msgs = []
                            for orig in original_msgs:
                                # Create forwarded message
                                new_msg = Message(
                                    sender_id=session.user_id,
                                    recipient_id=target_peer_id,
                                    content=orig.content,
                                    msg_type=orig.msg_type,
                                    media_url=orig.media_url,
                                    fwd_from_id=orig.sender_id,  # Original sender
                                    created_at=time.time()
                                )
                                db.add(new_msg)
                                forwarded_msgs.append(new_msg)
                            
                            await db.commit()
                            
                            # Update dialogs
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
                            
                            # Notify sender
                            response_data = {"type": "messages.forwarded", "count": len(forwarded_msgs)}
                            
                            # Broadcast to recipient
                            for new_msg in forwarded_msgs:
                                msg_obj = {
                                    "id": new_msg.id,
                                    "sender_id": session.user_id,
                                    "content": new_msg.content,
                                    "type": new_msg.msg_type,
                                    "media_url": new_msg.media_url,
                                    "is_read": False,
                                    "created_at": new_msg.created_at,
                                    "fwd_from_id": new_msg.fwd_from_id
                                }
                                for sid, sess in session_manager.sessions.items():
                                    if sess.user_id == target_peer_id and sess.websocket:
                                        try:
                                            push_wrapper = {
                                                "type": "message.new",
                                                "message": msg_obj,
                                                "peer_id": session.user_id,
                                                "sender_id": session.user_id
                                            }
                                            push_json = json.dumps(push_wrapper)
                                            push_bytes = push_json.encode('utf-8')
                                            push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                            await sess.websocket.send_text(json.dumps({"data": push_enc.hex()}))
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
                                
                                groups_list.append({
                                    "id": g.id,
                                    "name": g.name,
                                    "avatar_url": g.avatar_url,
                                    "owner_id": g.owner_id,
                                    "has_active_call": g.id in active_group_calls,
                                    "channels": [{"id": c.id, "name": c.name, "type": c.type} for c in channels]
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
                                    members_list.append({
                                        "id": u.id,
                                        "display_name": u.display_name,
                                        "username": u.username,
                                        "avatar_url": u.avatar_url,
                                        "role": role,
                                        "is_online": session_manager.is_online(u.id)
                                    })
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
                                    
                                    response_data = {"type": "user.profile_updated", "user": {
                                        "id": session.user_id,
                                        "username": username or "unknown", # Should fetch actual if not passed, but we assume successful update
                                        "display_name": display_name,
                                        "avatar_url": avatar_url,
                                        "about": about,
                                        "phone_number": phone_number
                                    }}

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
                    group_id = args.get("group_id")
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not group_id:
                        response_data = {"type": "error", "message": "Group ID required"}
                    else:
                        if group_id not in active_group_calls:
                            active_group_calls[group_id] = {}
                        
                        # Notify all members of the group that a call started
                        async with AsyncSessionLocal() as db:
                            m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
                            m_res = await db.execute(m_stmt)
                            member_ids = m_res.scalars().all()
                            
                            for mid in member_ids:
                                await broadcast_event(mid, "groups.call.started", {"group_id": group_id, "started_by": session.user_id})
                        
                        response_data = {"type": "success"}

                elif method == "groups.call.join":
                    group_id = args.get("group_id")
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    elif not group_id:
                        response_data = {"type": "error", "message": "Group ID required"}
                    else:
                        if group_id not in active_group_calls:
                            active_group_calls[group_id] = {}
                        
                        # Get profile for others
                        async with AsyncSessionLocal() as db:
                            res = await db.execute(select(User).where(User.id == session.user_id))
                            user = res.scalars().first()
                            user_info = {
                                "id": user.id,
                                "display_name": user.display_name,
                                "avatar_url": user.avatar_url
                            }
                            
                            # Already in?
                            if session.user_id in active_group_calls[group_id]:
                                pass # Re-join or update
                            
                            # Participants BEFORE joining
                            participants = list(active_group_calls[group_id].values())
                            
                            active_group_calls[group_id][session.user_id] = user_info
                            
                            # Notify existing participants
                            for pid in active_group_calls[group_id]:
                                if pid != session.user_id:
                                    await broadcast_event(pid, "groups.call.member_joined", {"group_id": group_id, "user": user_info})
                            
                            response_data = {"type": "groups.call.join_result", "group_id": group_id, "participants": participants}

                elif method == "groups.call.leave":
                    group_id = args.get("group_id")
                    print(f"DEBUG: User {session.user_id} leaving group call {group_id}")
                    print(f"DEBUG: active_group_calls keys: {list(active_group_calls.keys())}")
                    print(f"DEBUG: group_id in active_group_calls: {group_id in active_group_calls}")
                    
                    if group_id in active_group_calls:
                        active_group_calls[group_id].pop(session.user_id, None)
                        print(f"DEBUG: Removed user {session.user_id} from active_group_calls[{group_id}]")
                        print(f"DEBUG: Remaining participants: {list(active_group_calls[group_id].keys())}")
                        if not active_group_calls[group_id]:
                            del active_group_calls[group_id]
                            print(f"DEBUG: Group call {group_id} ended (no participants)")
                        
                        # Notify others - check if it's a channel or group
                        async with AsyncSessionLocal() as db:
                            # Check if group_id is a channel (starts with 'channel_')
                            if isinstance(group_id, str) and group_id.startswith('channel_'):
                                # Extract channel ID
                                channel_id_str = group_id.replace('channel_', '')
                                try:
                                    channel_id = int(channel_id_str)
                                    # Get all channel members (everyone in the server)
                                    # For now, broadcast to all active sessions
                                    print(f"DEBUG: Broadcasting to channel {channel_id} members")
                                    # Get all users who are in this channel's server
                                    # For simplicity, broadcast to all users in active_group_calls for this channel
                                    # Or we can get all users from the server that this channel belongs to
                                    
                                    # Get channel to find its server
                                    ch_res = await db.execute(select(Channel).where(Channel.id == channel_id))
                                    channel = ch_res.scalars().first()
                                    if channel:
                                        # Get all members of the server
                                        from app.db.models import ServerMember
                                        sm_stmt = select(ServerMember.user_id).where(ServerMember.server_id == channel.server_id)
                                        sm_res = await db.execute(sm_stmt)
                                        member_ids = sm_res.scalars().all()
                                        print(f"DEBUG: Broadcasting member_left to {len(member_ids)} server members")
                                        for mid in member_ids:
                                            print(f"DEBUG: Sending member_left event to user {mid}")
                                            await broadcast_event(mid, "groups.call.member_left", {"group_id": group_id, "user_id": session.user_id})
                                            if group_id not in active_group_calls:
                                                await broadcast_event(mid, "groups.call.ended", {"group_id": group_id})
                                except ValueError:
                                    print(f"DEBUG: Invalid channel ID: {channel_id_str}")
                            else:
                                # It's a regular group
                                m_stmt = select(GroupMember.user_id).where(GroupMember.group_id == group_id)
                                m_res = await db.execute(m_stmt)
                                member_ids = m_res.scalars().all()
                                print(f"DEBUG: Broadcasting member_left to {len(member_ids)} group members")
                                for mid in member_ids:
                                    print(f"DEBUG: Sending member_left event to user {mid}")
                                    await broadcast_event(mid, "groups.call.member_left", {"group_id": group_id, "user_id": session.user_id})
                                    if group_id not in active_group_calls:
                                        await broadcast_event(mid, "groups.call.ended", {"group_id": group_id})
                    else:
                        print(f"DEBUG: group_id {group_id} not found in active_group_calls")
                    
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

                response_plaintext = json.dumps(response_data)
                
                # Encrypt Response
                response_bytes = response_plaintext.encode('utf-8')
                encrypted_response = MTProtoCrypto.encrypt(session.auth_key, response_bytes)
                
                await websocket.send_text(json.dumps({
                    "data": encrypted_response.hex()
                }))
                
            except Exception as e:
                print(f"Decryption Error: {e}")
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
