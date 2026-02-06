import React, { useEffect, useState } from 'react';
import { User, Phone, X, Loader2, MessageSquare, AtSign, Info } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const ContactProfile = ({ userId, onClose, onOpenMedia }) => {
    const { sendMessage, messages } = useSocket();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Request profile info
        sendMessage({ method: 'user.get_info', args: { user_id: userId } });
    }, [userId]);

    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.type === 'user.info' && lastMsg.user.id === userId) {
            setProfile(lastMsg.user);
            setLoading(false);
        }
    }, [messages, userId]);

    if (!userId) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-[#1c1c1e] border border-white/10 w-full max-w-md rounded-2xl shadow-xl overflow-hidden relative" onClick={e => e.stopPropagation()}>

                {/* Header / Avatar */}
                <div className="h-32 bg-gradient-to-r from-blue-600 to-purple-600 relative">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white transition-colors backdrop-blur-md">
                        <X size={20} />
                    </button>
                </div>

                <div className="px-6 pb-6 -mt-16 flex flex-col items-center">
                    {/* Avatar Circle */}
                    <div
                        className="w-32 h-32 rounded-full border-4 border-[#1c1c1e] bg-[#2c2c2e] flex items-center justify-center overflow-hidden cursor-pointer shadow-lg group relative"
                        onClick={() => profile?.avatar_url && onOpenMedia(profile.avatar_url)}
                    >
                        {loading ? (
                            <Loader2 className="animate-spin text-white/20" size={32} />
                        ) : profile?.avatar_url ? (
                            <>
                                <img src={profile.avatar_url} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-white text-xs font-medium">View</span>
                                </div>
                            </>
                        ) : (
                            <span className="text-4xl font-bold text-white/20">{profile?.display_name?.[0]}</span>
                        )}
                    </div>

                    {loading ? (
                        <div className="mt-4 flex flex-col items-center gap-2">
                            <div className="h-6 w-32 bg-white/10 rounded animate-pulse" />
                            <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
                        </div>
                    ) : (
                        <>
                            <h2 className="text-2xl font-bold text-white mt-4">{profile.display_name}</h2>
                            {profile.is_online ? (
                                <p className="text-blue-400 text-sm mb-6 flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-blue-500" /> Online
                                </p>
                            ) : (
                                <p className="text-white/40 text-sm mb-6">
                                    {profile.last_seen ? `Last seen ${new Date(profile.last_seen * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline'}
                                </p>
                            )}

                            <div className="w-full space-y-4">
                                {/* Username */}
                                <div className="bg-white/5 p-4 rounded-xl flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                                        <AtSign size={20} />
                                    </div>
                                    <div>
                                        <p className="text-white/40 text-xs uppercase tracking-wider font-bold">Username</p>
                                        <p className="text-white font-mono">@{profile.username}</p>
                                    </div>
                                </div>

                                {/* Phone */}
                                {profile.phone_number && (
                                    <div className="bg-white/5 p-4 rounded-xl flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400">
                                            <Phone size={20} />
                                        </div>
                                        <div>
                                            <p className="text-white/40 text-xs uppercase tracking-wider font-bold">Phone</p>
                                            <p className="text-white font-mono">{profile.phone_number}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Bio */}
                                {profile.about && (
                                    <div className="bg-white/5 p-4 rounded-xl flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                                            <Info size={20} />
                                        </div>
                                        <div>
                                            <p className="text-white/40 text-xs uppercase tracking-wider font-bold">About</p>
                                            <p className="text-white text-sm">{profile.about}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="w-full mt-8 flex gap-3">
                                <button onClick={onClose} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl transition-colors font-medium">
                                    Close
                                </button>
                                <button onClick={onClose} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl transition-colors font-medium flex items-center justify-center gap-2">
                                    <MessageSquare size={18} /> Send Message
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ContactProfile;
