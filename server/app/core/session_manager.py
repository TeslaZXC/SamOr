from typing import Dict, Optional
from app.crypto.dh import DiffieHellman
import uuid
import time

class Session:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.dh = DiffieHellman()
        self.auth_key: Optional[bytes] = None
        self.step = 0 # 0: Init, 1: Server Hello Sent, 2: Handshake Complete
        self.user_id: Optional[str] = None
        self.created_at = time.time()
        self.temp_auth_data: Dict = {}
        self.websocket = None # Reference to active request (not serializable)

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Session] = {}
        self.active_users: Dict[int, set] = {} # user_id -> set(session_ids)

    def create_session(self) -> Session:
        session_id = str(uuid.uuid4())
        session = Session(session_id)
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        return self.sessions.get(session_id)

    def remove_session(self, session_id: str):
        if session_id in self.sessions:
            session = self.sessions[session_id]
            self.unbind_user(session)
            del self.sessions[session_id]

    def bind_user(self, session: Session, user_id: int):
        session.user_id = user_id
        if user_id not in self.active_users:
            self.active_users[user_id] = set()
        self.active_users[user_id].add(session.session_id)

    def unbind_user(self, session: Session):
        if session.user_id:
            user_id = int(session.user_id) # Ensure int
            if user_id in self.active_users:
                self.active_users[user_id].discard(session.session_id)
                if not self.active_users[user_id]:
                    del self.active_users[user_id]
            session.user_id = None

    def get_user_sessions(self, user_id: int):
        return [self.sessions[sid] for sid in self.active_users.get(user_id, []) if sid in self.sessions]

    def is_online(self, user_id: int) -> bool:
        return user_id in self.active_users

session_manager = SessionManager()
