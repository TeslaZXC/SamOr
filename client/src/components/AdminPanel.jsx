import React, { useState, useEffect } from 'react';
import { X, Users, MessageSquare, Shield, Ban, Trash2, Search, Loader2, RotateCcw } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const AdminPanel = ({ onClose }) => {
    const { sendMessage, messages } = useSocket();
    const [activeTab, setActiveTab] = useState('users'); // users, groups, messages

    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [msgLogs, setMsgLogs] = useState([]);
    const [bannedUsers, setBannedUsers] = useState([]);

    const [peer1, setPeer1] = useState('');
    const [peer2, setPeer2] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = () => {
        setLoading(true);
        if (activeTab === 'users') {
            sendMessage({ method: 'admin.users_get', args: {} });
        } else if (activeTab === 'groups') {
            sendMessage({ method: 'admin.groups_get', args: {} });
        } else if (activeTab === 'banned') {
            sendMessage({ method: 'admin.banned_users_get', args: {} });
        }
        setLoading(false);
    };

    const processedMsgsRef = React.useRef(new Set());

    useEffect(() => {
        messages.forEach(msg => {
            if (processedMsgsRef.current.has(msg)) return;
            processedMsgsRef.current.add(msg);

            try {
                if (msg.type === 'admin.users_list') {
                    console.log("[AdminPanel] Received users:", msg.users);
                    setUsers(msg.users || []);
                    setLoading(false);
                } else if (msg.type === 'admin.groups_list') {
                    console.log("[AdminPanel] Received groups:", msg.groups);
                    setGroups(msg.groups || []);
                    setLoading(false);
                } else if (msg.type === 'admin.banned_list') {
                    setBannedUsers(msg.emails || []);
                    setLoading(false);
                } else if (msg.type === 'admin.messages_list') {
                    setMsgLogs(msg.messages || []);
                    setLoading(false);
                } else if (msg.type === 'success' && (msg.message?.includes('banned') || msg.message?.includes('deleted') || msg.message?.includes('Unbanned'))) {
                    alert(msg.message || 'Action completed');
                    fetchData();
                } else if (msg.type === 'error') {
                    // Show all errors strictly related to admin operations or general failures while panel is open
                    // Or if message explicitly mentions 'access' or 'denied'
                    if (msg.message?.toLowerCase().includes('admin') ||
                        msg.message?.toLowerCase().includes('access') ||
                        msg.message?.toLowerCase().includes('denied')) {
                        console.error("[AdminPanel] Error:", msg.message);
                        alert(`Error: ${msg.message}`);
                        setLoading(false);
                    }
                }
            } catch (err) {
                console.error("Admin Panel Process Error:", err);
            }
        });
    }, [messages]);

    const handleBan = (userId) => {
        if (window.confirm('Are you sure you want to ban this user?')) {
            sendMessage({ method: 'admin.user_ban', args: { user_id: userId } });
        }
    };

    const handleUnban = (email) => {
        if (window.confirm(`Unban ${email}? They will be able to register again.`)) {
            sendMessage({ method: 'admin.user_unban', args: { email: email } });
        }
    };

    const handleDeleteGroup = (groupId) => {
        if (window.confirm('Are you sure you want to delete this group?')) {
            sendMessage({ method: 'admin.group_delete', args: { group_id: groupId } });
        }
    };

    const handleGetMessages = () => {
        if (!peer1 || !peer2) return;
        sendMessage({ method: 'admin.messages_get', args: { peer1_id: parseInt(peer1), peer2_id: parseInt(peer2) } });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-[#1c1c1e] border border-white/10 w-full max-w-4xl h-full md:h-[80vh] rounded-none md:rounded-3xl overflow-hidden flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-red-500/20 rounded-xl text-red-500">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Админ Панель</h2>
                            <p className="text-xs text-white/40">Управление пользователями и контентом</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors"
                            title="Refresh Data"
                        >
                            <RotateCcw size={20} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/40 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex px-6 py-4 gap-4 bg-white/5 border-b border-white/10">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-blue-500 text-white' : 'text-white/40 hover:bg-white/5'}`}
                    >
                        <Users size={18} /> Пользователи ({users.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('groups')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'groups' ? 'bg-indigo-500 text-white' : 'text-white/40 hover:bg-white/5'}`}
                    >
                        <MessageSquare size={18} /> Сообщества ({groups.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('messages')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'messages' ? 'bg-purple-500 text-white' : 'text-white/40 hover:bg-white/5'}`}
                    >
                        <Search size={18} /> Логи сообщений
                    </button>
                    <button
                        onClick={() => setActiveTab('banned')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'banned' ? 'bg-red-500 text-white' : 'text-white/40 hover:bg-white/5'}`}
                    >
                        <Ban size={18} /> Бан-лист
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {activeTab === 'users' && (
                        <div className="space-y-3">
                            {users.map(u => (
                                <div key={u.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-white font-bold overflow-hidden border border-white/10">
                                            {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : (u.display_name?.[0] || '?')}
                                        </div>
                                        <div className="text-left">
                                            <h4 className="text-white font-semibold">{u.display_name || 'Unknown'}</h4>
                                            <div className="flex items-center gap-2 text-xs text-white/40">
                                                <span>@{u.username || 'unknown'}</span>
                                                <span className="w-1 h-1 bg-white/20 rounded-full" />
                                                <span>ID: {u.id}</span>
                                                <span className="w-1 h-1 bg-white/20 rounded-full" />
                                                <span>{u.email || 'No Email'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleBan(u.id)}
                                        className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all flex items-center gap-2 opacity-0 group-hover:opacity-100"
                                    >
                                        <Ban size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Ban</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'groups' && (
                        <div className="space-y-3">
                            {groups.map(g => (
                                <div key={g.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-colors text-left">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-white font-bold overflow-hidden border border-white/10">
                                            {g.avatar_url ? <img src={g.avatar_url} className="w-full h-full object-cover" /> : (g.name?.[0] || '?')}
                                        </div>
                                        <div>
                                            <h4 className="text-white font-semibold">{g.name || 'Unnamed Group'}</h4>
                                            <p className="text-xs text-white/40">Owner ID: {g.owner_id} • ID: {g.id}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteGroup(g.id)}
                                        className="p-3 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all flex items-center gap-2 opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Clear</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeTab === 'messages' && (
                        <div className="flex flex-col h-full">
                            <div className="flex gap-4 mb-6">
                                <input
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:bg-white/10 transition-all font-mono"
                                    placeholder="User ID 1"
                                    value={peer1}
                                    onChange={(e) => setPeer1(e.target.value)}
                                />
                                <input
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:bg-white/10 transition-all font-mono"
                                    placeholder="User ID 2"
                                    value={peer2}
                                    onChange={(e) => setPeer2(e.target.value)}
                                />
                                <button
                                    onClick={handleGetMessages}
                                    className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-xl transition-all flex items-center gap-2 font-bold"
                                >
                                    <Search size={18} /> Get Logs
                                </button>
                            </div>

                            <div className="flex-1 bg-black/20 rounded-2xl p-4 overflow-y-auto space-y-4 font-mono text-sm custom-scrollbar">
                                {msgLogs.map(m => (
                                    <div key={m.id} className="text-left border-b border-white/5 pb-2">
                                        <span className="text-purple-400">[{new Date(m.created_at * 1000).toLocaleString()}]</span>{' '}
                                        <span className="text-blue-400">#{m.sender_id}:</span>{' '}
                                        <span className="text-white/80">{m.content}</span>
                                    </div>
                                ))}
                                {msgLogs.length === 0 && <div className="text-center text-white/20 py-12">No messages found or not searched yet</div>}
                            </div>
                        </div>
                    )}

                    {activeTab === 'banned' && (
                        <div className="space-y-3">
                            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl mb-4 text-red-200 text-sm">
                                Ban deletes the account. Unbanning only removes the email from the blacklist, allowing re-registration.
                            </div>
                            {bannedUsers.map(b => (
                                <div key={b.email} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-500/20 rounded-lg text-red-500">
                                            <Ban size={20} />
                                        </div>
                                        <div className="text-left">
                                            <h4 className="text-white font-semibold">{b.email}</h4>
                                            <p className="text-xs text-white/40">Banned at: {new Date(b.created_at * 1000).toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleUnban(b.email)}
                                        className="p-3 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded-xl transition-all flex items-center gap-2 opacity-0 group-hover:opacity-100"
                                    >
                                        <Shield size={18} />
                                        <span className="text-xs font-bold uppercase tracking-wider">Unban</span>
                                    </button>
                                </div>
                            ))}
                            {bannedUsers.length === 0 && <div className="text-center text-white/20 py-12">No banned users found</div>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
