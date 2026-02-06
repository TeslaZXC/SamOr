import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { User, Lock, Camera, Save, X, Check, Loader2, Shield, Key, Mail } from 'lucide-react';

const Settings = ({ user, onClose }) => {
    const { sendMessage, messages } = useSocket();
    const [activeTab, setActiveTab] = useState('profile'); // profile, security

    // Profile State
    const [displayName, setDisplayName] = useState(user.display_name || '');
    const [username, setUsername] = useState(user.username || '');
    const [about, setAbout] = useState(user.about || '');
    const [phoneNumber, setPhoneNumber] = useState(user.phone_number || '');
    const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || '');
    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Security State
    const [passwordStep, setPasswordStep] = useState('initial'); // initial, verify
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [secLoading, setSecLoading] = useState(false);

    useEffect(() => {
        // Listen for responses
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) return;

        if (lastMsg.type === 'user.profile_updated') {
            setIsSaving(false);
            setSuccess("Profile updated successfully");
            setError(null);
            setTimeout(() => setSuccess(null), 3000);

        } else if (lastMsg.type === 'success' && activeTab === 'security') {
            if (passwordStep === 'initial' && lastMsg.message.startsWith('Code sent')) {
                setPasswordStep('verify');
                setSecLoading(false);
                setError(null);
            } else if (lastMsg.message === 'Password changed successfully') {
                setSecLoading(false);
                setPasswordStep('initial');
                setCode('');
                setNewPassword('');
                setSuccess("Password changed successfully");
                setTimeout(() => setSuccess(null), 3000);
            }
        } else if (lastMsg.type === 'error' && (isSaving || secLoading)) {
            setIsSaving(false);
            setSecLoading(false);
            setError(lastMsg.message);
            setSuccess(null);
        }

    }, [messages, activeTab, passwordStep]);

    // ... handleAvatarUpload logic (unchanged) ...
    const handleAvatarUpload = async (e) => {
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
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveProfile = () => {
        setError(null);
        setSuccess(null);

        if (phoneNumber && !/^(\+7|8)\d{10}$/.test(phoneNumber)) {
            setError("Invalid Russian phone number");
            return;
        }
        if (about.length > 50) {
            setError("Description is too long (max 50 chars)");
            return;
        }
        if (!username.trim()) {
            setError("Username cannot be empty");
            return;
        }

        setIsSaving(true);
        sendMessage({
            method: 'user.update_profile',
            args: {
                display_name: displayName,
                username: username,
                avatar_url: avatarUrl,
                about: about,
                phone_number: phoneNumber
            }
        });
    };

    // ... (rest of functions) ...
    const handleRequestCode = () => {
        setSecLoading(true);
        setError(null);
        sendMessage({ method: 'user.request_password_change' });
    };

    const handleChangePassword = () => {
        if (!code || !newPassword) return;
        setSecLoading(true);
        setError(null);
        sendMessage({
            method: 'user.change_password',
            args: {
                code,
                new_password: newPassword
            }
        });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#1c1c1e] w-full max-w-2xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-48 border-r border-white/10 p-4 space-y-2 bg-black/20">
                        <button
                            onClick={() => { setActiveTab('profile'); setError(null); setSuccess(null); }}
                            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${activeTab === 'profile' ? 'bg-blue-500/20 text-blue-400' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                        >
                            <User size={18} /> Profile
                        </button>
                        <button
                            onClick={() => { setActiveTab('security'); setError(null); setSuccess(null); }}
                            className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-colors ${activeTab === 'security' ? 'bg-blue-500/20 text-blue-400' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                        >
                            <Shield size={18} /> Security
                        </button>
                    </div>

                    {/* Main Area */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {activeTab === 'profile' && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                                <div className="flex items-center gap-6">
                                    <div className="relative group">
                                        <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 flex items-center justify-center text-3xl font-bold text-white overflow-hidden shadow-lg border-2 border-white/10">
                                            {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : displayName[0]}
                                        </div>
                                        <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer backdrop-blur-sm">
                                            {isUploading ? <Loader2 className="animate-spin text-white" /> : <Camera className="text-white" />}
                                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                                        </label>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-medium text-white">Profile Photo</h3>
                                        <p className="text-sm text-white/40">Click to upload new avatar</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Display Name</label>
                                        <input
                                            value={displayName}
                                            onChange={e => setDisplayName(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50 transition-colors"
                                            placeholder="Your Name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Username</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-3.5 text-white/40">@</span>
                                            <input
                                                value={username}
                                                onChange={e => setUsername(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white outline-none focus:border-blue-500/50 transition-colors"
                                                placeholder="username"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between">
                                            <label className="text-xs font-medium text-white/40 uppercase tracking-wider">About</label>
                                            <span className={`text-xs ${about.length > 50 ? 'text-red-400' : 'text-white/20'}`}>{about.length}/50</span>
                                        </div>
                                        <textarea
                                            value={about}
                                            onChange={e => setAbout(e.target.value)}
                                            maxLength={50}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50 transition-colors resize-none h-24"
                                            placeholder="Tell us about yourself"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Phone Number</label>
                                        <input
                                            value={phoneNumber}
                                            onChange={e => {
                                                let val = e.target.value.replace(/\D/g, '');
                                                if (!val) {
                                                    setPhoneNumber('');
                                                    return;
                                                }
                                                if (val[0] === '9') val = '7' + val;
                                                else if (val[0] === '8') val = '7' + val.substring(1);
                                                else if (val[0] !== '7') val = '7' + val;

                                                setPhoneNumber('+' + val.substring(0, 11));
                                            }}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-blue-500/50 transition-colors"
                                            placeholder="+7999..."
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 flex flex-col gap-3">
                                    {(error || success) && (
                                        <div className={`text-sm text-center py-2 rounded-lg ${error ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                                            {error || success}
                                        </div>
                                    )}
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleSaveProfile}
                                            disabled={isSaving}
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl flex items-center gap-2 font-medium transition-all active:scale-95 disabled:opacity-50"
                                        >
                                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                            {isSaving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'security' && (
                            <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                                    <h3 className="text-lg font-medium text-white mb-2 flex items-center gap-2"><Lock size={20} className="text-blue-400" /> Password</h3>
                                    <p className="text-sm text-white/60 mb-6">
                                        Change your account password. For security, we'll send a verification code to your email
                                        <span className="text-white font-medium ml-1">({user.email})</span>.
                                    </p>

                                    {passwordStep === 'initial' ? (
                                        <button
                                            onClick={handleRequestCode}
                                            disabled={secLoading}
                                            className="bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded-xl flex items-center gap-3 transition-all w-full justify-center border border-white/5"
                                        >
                                            {secLoading ? <Loader2 className="animate-spin" /> : <Mail size={18} />}
                                            Request Password Change
                                        </button>
                                    ) : (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Verification Code</label>
                                                <div className="relative">
                                                    <Key className="absolute left-3 top-3 text-white/40" size={18} />
                                                    <input
                                                        value={code}
                                                        onChange={e => setCode(e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-blue-500/50 transition-colors tracking-widest"
                                                        placeholder="12345"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-medium text-white/40 uppercase tracking-wider">New Password</label>
                                                <div className="relative">
                                                    <Lock className="absolute left-3 top-3 text-white/40" size={18} />
                                                    <input
                                                        type="password"
                                                        value={newPassword}
                                                        onChange={e => setNewPassword(e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-blue-500/50 transition-colors"
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    onClick={() => setPasswordStep('initial')}
                                                    className="flex-1 px-4 py-2 rounded-xl text-white/60 hover:bg-white/5 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleChangePassword}
                                                    disabled={secLoading}
                                                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    {secLoading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                                    Update Password
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
