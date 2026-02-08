import React, { useState, useEffect } from 'react';
import { X, Camera, Plus, User as UserIcon, LogOut, Shield, Check, Loader2, Search } from 'lucide-react';
import { API_URL } from '../config';
import { useSocket } from '../context/SocketContext';

const GroupSettingsModal = ({ groupId, user, onClose, onOpenProfile, contacts = [], dialogs = [] }) => {
    const { sendMessage, messages } = useSocket();
    const [group, setGroup] = useState(null);
    const [members, setMembers] = useState([]);
    const [newName, setNewName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddMember, setShowAddMember] = useState(false);

    useEffect(() => {
        // Request group details and members
        sendMessage({ method: 'groups.list' }); // To get group info
        sendMessage({ method: 'groups.members.list', args: { group_id: groupId } });
    }, [groupId]);

    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg) {
            if (lastMsg.type === 'groups.list_result') {
                const g = lastMsg.groups.find(x => x.id === groupId);
                if (g) {
                    setGroup(g);
                    setNewName(g.name);
                }
            } else if (lastMsg.type === 'groups.members.list_result' && lastMsg.group_id === groupId) {
                setMembers(lastMsg.members);
            } else if (lastMsg.type === 'groups.updated' && lastMsg.group_id === groupId) {
                setGroup(prev => ({ ...prev, name: lastMsg.name, avatar_url: lastMsg.avatar_url }));
            } else if (lastMsg.type === 'groups.members.added' && lastMsg.group_id === groupId) {
                sendMessage({ method: 'groups.members.list', args: { group_id: groupId } });
                setShowAddMember(false);
            }
        }
    }, [messages, groupId]);

    const handleUpdateName = () => {
        if (!newName.trim() || newName === group?.name) return;
        sendMessage({ method: 'groups.update', args: { group_id: groupId, name: newName } });
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const resp = await fetch(`${API_URL}/upload/`, {
                method: 'POST',
                body: formData
            });
            const data = await resp.json();
            if (data.url) {
                sendMessage({ method: 'groups.update', args: { group_id: groupId, avatar_url: data.url } });
            }
        } catch (err) {
            console.error("Upload failed", err);
        } finally {
            setUploading(false);
        }
    };

    const handleAddMember = (contactId) => {
        sendMessage({ method: 'groups.members.add', args: { group_id: groupId, user_id: contactId } });
    };

    const myMemberInfo = members.find(m => m.id === user.id);
    const canManage = myMemberInfo?.role === 'owner' || myMemberInfo?.role === 'admin';

    if (!group) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
            <div className="bg-[#1c1c1e] w-full max-w-md rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Group Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="overflow-y-auto max-h-[80vh]">
                    {/* Group Profile */}
                    <div className="p-8 flex flex-col items-center border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
                        <div className="relative group mb-6">
                            <div className="w-32 h-32 rounded-[2.5rem] bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-4xl font-black shadow-2xl overflow-hidden border-4 border-white/10">
                                {group.avatar_url ? <img src={group.avatar_url} className="w-full h-full object-cover" /> : group.name[0]}
                            </div>
                            {canManage && (
                                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-[2.5rem]">
                                    {uploading ? <Loader2 className="animate-spin text-white" /> : <Camera className="text-white" size={32} />}
                                    <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={uploading} />
                                </label>
                            )}
                        </div>

                        {canManage ? (
                            <div className="w-full space-y-4">
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        onBlur={handleUpdateName}
                                        placeholder="Group Name"
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-white font-bold text-center focus:border-blue-500/50 outline-none transition-all text-lg"
                                    />
                                </div>
                            </div>
                        ) : (
                            <h3 className="text-2xl font-black text-white tracking-tight">{group.name}</h3>
                        )}
                    </div>

                    {/* Members List */}
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.2em]">Members ({members.length})</h3>
                            {canManage && (
                                <button
                                    onClick={() => setShowAddMember(!showAddMember)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl transition-all text-xs font-black uppercase tracking-widest border border-blue-500/20"
                                >
                                    <Plus size={14} /> Add Member
                                </button>
                            )}
                        </div>

                        {showAddMember && (
                            <div className="mb-6 space-y-3 animate-in fade-in slide-in-from-top-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search people..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-blue-500/50 outline-none transition-all"
                                    />
                                </div>
                                <div className="bg-black/20 rounded-2xl border border-white/5 max-h-48 overflow-y-auto p-2">
                                    {(() => {
                                        // Combine contacts and dialog peers, unique by ID
                                        const allPotentialPeers = [];
                                        const seenIds = new Set();

                                        [...contacts, ...dialogs.map(d => d.peer)].forEach(p => {
                                            if (p && p.id && !seenIds.has(p.id) && p.id !== user.id) {
                                                seenIds.add(p.id);
                                                allPotentialPeers.push(p);
                                            }
                                        });

                                        const filtered = allPotentialPeers
                                            .filter(p => !members.some(m => m.id === p.id))
                                            .filter(p => p.display_name?.toLowerCase().includes(searchQuery.toLowerCase()));

                                        if (filtered.length === 0) {
                                            return <p className="text-center py-4 text-xs text-white/20 italic">No users available to add</p>;
                                        }

                                        return filtered.map(peer => (
                                            <div
                                                key={peer.id}
                                                onClick={() => handleAddMember(peer.id)}
                                                className="flex items-center justify-between p-2 hover:bg-white/5 rounded-xl cursor-pointer group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs font-bold">
                                                        {peer.avatar_url ? <img src={peer.avatar_url} className="w-full h-full rounded-full object-cover" /> : (peer.display_name?.[0] || '?')}
                                                    </div>
                                                    <span className="text-sm font-medium text-white/80">{peer.display_name}</span>
                                                </div>
                                                <Plus size={16} className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {members.map(member => (
                                <div
                                    key={member.id}
                                    onClick={() => onOpenProfile(member.id)}
                                    className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/[0.03] rounded-2xl cursor-pointer hover:bg-white/5 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold overflow-hidden border border-white/10">
                                                {member.avatar_url ? <img src={member.avatar_url} className="w-full h-full object-cover" /> : member.display_name[0]}
                                            </div>
                                            {member.is_online && (
                                                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-[#1c1c1e] rounded-full shadow-lg" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-white tracking-tight">{member.display_name}</p>
                                                {member.role === 'owner' && <Shield size={12} className="text-amber-400" />}
                                            </div>
                                            <p className="text-[10px] text-white/30 uppercase font-black tracking-widest">{member.role}</p>
                                        </div>
                                    </div>
                                    {member.id === user.id ? (
                                        <span className="text-[10px] bg-white/5 text-white/40 px-2 py-1 rounded-lg font-black uppercase tracking-widest">You</span>
                                    ) : (
                                        <div className="w-2 h-2 rounded-full" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/5 bg-black/20 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-white font-black rounded-2xl transition-all uppercase text-xs tracking-widest border border-white/10 shadow-lg active:scale-95"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GroupSettingsModal;
