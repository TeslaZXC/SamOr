import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { User, Camera, ArrowRight, Loader2 } from 'lucide-react';

const ProfileSetup = ({ tempToken, onSetupComplete }) => {
    const { sendMessage, messages } = useSocket();
    const [username, setUsername] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [loading, setLoading] = useState(false);

    // Watch for success
    React.useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.type === 'auth_success') {
            onSetupComplete(lastMsg.user);
        } else if (lastMsg && lastMsg.type === 'error') {
            setLoading(false);
            alert(lastMsg.message);
        }
    }, [messages, onSetupComplete]);

    const [avatarUrl, setAvatarUrl] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('http://localhost:8000/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.url) {
                setAvatarUrl(data.url);
            }
        } catch (error) {
            console.error(error);
            alert("Avatar upload failed");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = () => {
        if (!username || !displayName) return;
        setLoading(true);
        sendMessage({
            method: 'auth.register',
            args: {
                temp_token: tempToken,
                username,
                display_name: displayName,
                avatar: avatarUrl
            }
        });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
            <div className="glass-panel p-8 rounded-2xl w-full max-w-sm">
                <h2 className="text-2xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Create Profile
                </h2>
                <p className="text-white/40 text-sm mb-6">Choose how others will see you</p>

                <div className="flex justify-center mb-6">
                    <label className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors relative group overflow-hidden">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : isUploading ? (
                            <Loader2 className="animate-spin text-white" />
                        ) : (
                            <Camera size={24} className="text-white/40 group-hover:text-white" />
                        )}
                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                        <span className="absolute -bottom-2 text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30">
                            Upload
                        </span>
                    </label>
                </div>

                <div className="space-y-4">
                    <div className="relative">
                        <User className="absolute left-3 top-3 text-white/40" size={20} />
                        <input
                            type="text"
                            placeholder="Display Name (e.g. John Doe)"
                            className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <span className="absolute left-4 top-3 text-white/40 text-lg">@</span>
                        <input
                            type="text"
                            placeholder="Username (Unique)"
                            className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none font-mono"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="premium-button w-full py-3 rounded-xl flex items-center justify-center gap-2 mt-4"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <>Complete Setup <ArrowRight size={18} /></>}
                    </button>

                </div>
            </div>
        </div>
    );
};

export default ProfileSetup;
