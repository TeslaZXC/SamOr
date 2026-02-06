from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.session_manager import session_manager
from app.crypto.mtproto import MTProtoCrypto
import json
import time
import uuid
import random
import re
from app.core.email import send_email
from app.db.models import AsyncSessionLocal, User, Message, Dialog, Contact
from sqlalchemy.future import select
from sqlalchemy import update, or_, and_

router = APIRouter()

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
                    peer_id = args.get("peer_id")
                    if not session.user_id:
                        response_data = {"type": "error", "message": "Not authenticated"}
                    else:
                        async with AsyncSessionLocal() as db:
                            stmt = select(Message).where(
                                or_(
                                    and_(Message.sender_id == session.user_id, Message.recipient_id == peer_id),
                                    and_(Message.sender_id == peer_id, Message.recipient_id == session.user_id)
                                )
                            ).order_by(Message.id.asc())
                            
                            result = await db.execute(stmt)
                            all_msgs = result.scalars().all()
                            
                            msgs_out = []
                            for m in all_msgs:
                                msgs_out.append({
                                    "id": m.id,
                                    "sender_id": m.sender_id,
                                    "content": m.content,
                                    "type": m.msg_type,
                                    "media_url": m.media_url,
                                    "is_read": m.is_read,
                                    "created_at": m.created_at
                                })
                                
                            response_data = {"type": "messages.history", "messages": msgs_out, "peer_id": peer_id}

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
                    content = args.get("text")
                    
                    if not session.user_id:
                         response_data = {"type": "error", "message": "Not authenticated"}
                    elif not recipient_id:
                         response_data = {"type": "error", "message": "No recipient"}
                    else:
                        async with AsyncSessionLocal() as db:
                            # 1. Save Message
                            new_msg = Message(
                                sender_id=session.user_id,
                                recipient_id=recipient_id,
                                content=content,
                                msg_type=msg_type,
                                created_at=time.time()
                            )
                            
                            # Handle Media (Photo, Voice, Video)
                            if msg_type in ["photo", "voice", "video", "file"]:
                                new_msg.media_url = args.get("content") 
                                new_msg.content = args.get("caption", content or msg_type.capitalize())

                            db.add(new_msg)
                            await db.commit()
                            await db.refresh(new_msg)
                            
                            # 2. Update Dialogs
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
                            
                            # 3. Echo back
                            msg_obj = {
                                "id": new_msg.id,
                                "sender_id": session.user_id,
                                "content": new_msg.content,
                                "type": new_msg.msg_type,
                                "media_url": new_msg.media_url,
                                "is_read": False,
                                "created_at": new_msg.created_at
                            }
                            response_data = {"type": "message.new", "message": msg_obj, "peer_id": recipient_id}
                            
                            # 4. BROADCAST to Recipient
                            for sid, sess in session_manager.sessions.items():
                                if sess.user_id == recipient_id and sess.websocket:
                                    try:
                                        # Prepare push message (from Sender perspective of Recipient)
                                        # Recipient sees: Sender is peer.
                                        push_wrapper = { 
                                            "type": "message.new", 
                                            "message": msg_obj, 
                                            "peer_id": session.user_id, # Sender is the peer
                                            "sender_id": session.user_id
                                        }
                                        push_json = json.dumps(push_wrapper)
                                        push_bytes = push_json.encode('utf-8')
                                        push_enc = MTProtoCrypto.encrypt(sess.auth_key, push_bytes)
                                        
                                        # Check if WS is open? accept() was called.
                                        await sess.websocket.send_text(json.dumps({ "data": push_enc.hex() }))
                                    except Exception as e:
                                        print(f"Broadcast error: {e}")

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
                
    except Exception as e:
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
