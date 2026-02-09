import React, { useState, useEffect } from 'react';
import { API_URL } from '../config';
import { useSocket } from '../context/SocketContext';
import { Mail, Lock, User, Key, ArrowRight, Loader2, CheckCircle2, Camera } from 'lucide-react';

const Login = ({ onLoginSuccess }) => {
    const { sendMessage, messages } = useSocket();
    const [mode, setMode] = useState('login'); // login, register
    const [loading, setLoading] = useState(false);

    // Login State
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    // Register State
    const [regStep, setRegStep] = useState(0); // 0: Email, 1: Code, 2: Password, 3: Profile
    const [regEmail, setRegEmail] = useState('');
    const [regCode, setRegCode] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regConfirmPassword, setRegConfirmPassword] = useState('');
    const [regUsername, setRegUsername] = useState('');
    const [regDisplayName, setRegDisplayName] = useState('');
    const [regPhoneNumber, setRegPhoneNumber] = useState('');

    // Avatar State
    const [regAvatarUrl, setRegAvatarUrl] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    const [tempToken, setTempToken] = useState(null);

    const [error, setError] = useState(null);

    // Watch for auth success / responses
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) return;

        if (lastMsg.type === 'auth_success') {
            setLoading(false);
            onLoginSuccess(lastMsg.user);
        } else if (lastMsg.type === 'error') {
            setLoading(false);
            setError(lastMsg.message);
        } else if (lastMsg.type === 'success' && mode === 'register' && regStep === 0) {
            setLoading(false);
            setError(null);
            // Code sent
            setRegStep(1);
        } else if (lastMsg.type === 'auth_code_verified' && regStep === 1) {
            setLoading(false);
            setError(null);
            setTempToken(lastMsg.temp_token);
            setRegStep(2);
        }
    }, [messages, mode, regStep, onLoginSuccess]);

    // --- Login Handlers ---
    const handleLogin = () => {
        if (!loginEmail || !loginPassword) return;
        setLoading(true);
        setError(null);
        sendMessage({ method: 'auth.login_pwd', args: { email: loginEmail, password: loginPassword } });
    };

    // --- Register Handlers ---
    const handleRegSendCode = () => {
        if (!regEmail) return;
        setLoading(true);
        setError(null);
        sendMessage({ method: 'auth.request_code', args: { email: regEmail, type: 'register' } });
    };

    const handleRegVerifyCode = () => {
        if (!regCode) return;
        setLoading(true);
        setError(null);
        sendMessage({ method: 'auth.verify_code', args: { code: regCode } });
    };

    const handleRegSetPassword = () => {
        const p1 = regPassword.trim();
        const p2 = regConfirmPassword.trim();

        if (!p1 || !p2) {
            setError("Password cannot be empty");
            return;
        }
        if (p1 !== p2) {
            setError("Passwords do not match");
            return;
        }
        setError(null);
        setRegStep(3);
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploading(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.url) setRegAvatarUrl(data.url);
        } catch (e) { console.error(e); }
        finally { setIsUploading(false); }
    };

    const handleRegComplete = () => {
        if (!regUsername || !regDisplayName || !regPhoneNumber) return;
        if (!/^(\+7|8)\d{10}$/.test(regPhoneNumber)) {
            setError("Invalid Russian phone number (+7... or 8...)");
            return;
        }
        setLoading(true);
        setError(null);
        sendMessage({
            method: 'auth.register',
            args: {
                temp_token: tempToken,
                username: regUsername,
                display_name: regDisplayName,
                password: regPassword,
                avatar: regAvatarUrl,
                phone_number: regPhoneNumber
            }
        });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
            <div className="glass-panel p-8 rounded-2xl w-full max-w-sm">

                {/* Tabs */}
                <div className="flex rounded-xl bg-white/5 p-1 mb-8">
                    <button
                        onClick={() => setMode('login')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/60 hover:text-white'}`}
                    >
                        Вход
                    </button>
                    <button
                        onClick={() => setMode('register')}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'register' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/60 hover:text-white'}`}
                    >
                        Регистрация
                    </button>
                </div>

                <div className="min-h-[300px] flex flex-col justify-center">
                    {mode === 'login' ? (
                        <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                            <h2 className="text-2xl font-bold mb-2 text-white">С возвращением</h2>
                            <p className="text-white/40 text-sm mb-6">Введите данные для входа в аккаунт</p>

                            <div className="relative">
                                <Mail className="absolute left-3 top-3 text-white/40" size={20} />
                                <input
                                    type="email"
                                    placeholder="Email адрес"
                                    className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                                    value={loginEmail}
                                    onChange={e => setLoginEmail(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                />
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 text-white/40" size={20} />
                                <input
                                    type="password"
                                    placeholder="Пароль"
                                    className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                                    value={loginPassword}
                                    onChange={e => setLoginPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                />
                            </div>
                            <button
                                onClick={handleLogin}
                                disabled={loading}
                                className="premium-button w-full py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : <>Войти <ArrowRight size={18} /></>}
                            </button>
                            {error && <div className="text-red-500 bg-red-500/10 p-2 rounded-lg text-sm mt-4 text-center">{error}</div>}
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                            {regStep === 0 && (
                                <>
                                    <h2 className="text-2xl font-bold mb-2 text-white">Создать аккаунт</h2>
                                    <p className="text-white/40 text-sm mb-6">Начните с подтверждения email</p>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-3 text-white/40" size={20} />
                                        <input
                                            type="email"
                                            placeholder="Email адрес"
                                            className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                                            value={regEmail}
                                            onChange={e => setRegEmail(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        onClick={handleRegSendCode}
                                        disabled={loading}
                                        className="premium-button w-full py-3 rounded-xl flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Loader2 className="animate-spin" /> : <>Отправить код <ArrowRight size={18} /></>}
                                    </button>
                                </>
                            )}

                            {regStep === 1 && (
                                <>
                                    <h2 className="text-2xl font-bold mb-2 text-white">Подтверждение Email</h2>
                                    <p className="text-white/40 text-sm mb-6">Код отправлен на {regEmail}</p>
                                    <div className="relative">
                                        <Key className="absolute left-3 top-3 text-white/40" size={20} />
                                        <input
                                            type="text"
                                            placeholder="12345"
                                            className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none tracking-widest text-center text-xl"
                                            value={regCode}
                                            onChange={e => setRegCode(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        onClick={handleRegVerifyCode}
                                        disabled={loading}
                                        className="premium-button w-full py-3 rounded-xl flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Loader2 className="animate-spin" /> : <>Подтвердить <CheckCircle2 size={18} /></>}
                                    </button>
                                </>
                            )}

                            {regStep === 2 && (
                                <>
                                    <h2 className="text-2xl font-bold mb-2 text-white">Установка пароля</h2>
                                    <p className="text-white/40 text-sm mb-6">Придумайте надежный пароль</p>
                                    <div className="space-y-3">
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 text-white/40" size={20} />
                                            <input
                                                type="password"
                                                placeholder="Пароль"
                                                className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                                                value={regPassword}
                                                onChange={e => setRegPassword(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleRegSetPassword()}
                                            />
                                        </div>
                                        <div className="relative">
                                            <Lock className="absolute left-3 top-3 text-white/40" size={20} />
                                            <input
                                                type="password"
                                                placeholder="Подтвердите пароль"
                                                className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                                                value={regConfirmPassword}
                                                onChange={e => setRegConfirmPassword(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleRegSetPassword()}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleRegSetPassword}
                                        className="premium-button w-full py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                                    >
                                        Далее <ArrowRight size={18} />
                                    </button>
                                </>
                            )}

                            {regStep === 3 && (
                                <>
                                    <h2 className="text-2xl font-bold mb-2 text-white">Настройка профиля</h2>

                                    <div className="flex justify-center mb-4">
                                        <label className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors relative group overflow-hidden">
                                            {regAvatarUrl ? (
                                                <img src={regAvatarUrl} className="w-full h-full object-cover" />
                                            ) : isUploading ? (
                                                <Loader2 className="animate-spin text-white" />
                                            ) : (
                                                <Camera size={20} className="text-white/40 group-hover:text-white" />
                                            )}
                                            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                                        </label>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="relative">
                                            <User className="absolute left-3 top-3 text-white/40" size={20} />
                                            <input
                                                placeholder="Отображаемое имя"
                                                className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                                                value={regDisplayName}
                                                onChange={e => setRegDisplayName(e.target.value)}
                                            />
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-4 top-3 text-white/40 font-mono">@</span>
                                            <input
                                                placeholder="Имя пользователя"
                                                className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                                                value={regUsername}
                                                onChange={e => setRegUsername(e.target.value)}
                                            />
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-4 top-3 text-white/40 font-mono">#</span>
                                            <input
                                                placeholder="+79990000000"
                                                className="premium-input w-full pl-10 pr-4 py-3 rounded-xl outline-none"
                                                value={regPhoneNumber}
                                                onChange={e => {
                                                    let val = e.target.value.replace(/\D/g, '');
                                                    if (!val) {
                                                        setRegPhoneNumber('');
                                                        return;
                                                    }
                                                    if (val[0] === '9') val = '7' + val;
                                                    else if (val[0] === '8') val = '7' + val.substring(1);
                                                    else if (val[0] !== '7') val = '7' + val;

                                                    setRegPhoneNumber('+' + val.substring(0, 11));
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleRegComplete}
                                        disabled={loading}
                                        className="premium-button w-full py-3 rounded-xl flex items-center justify-center gap-2 mt-2"
                                    >
                                        {loading ? <Loader2 className="animate-spin" /> : <>Завершить <CheckCircle2 size={18} /></>}
                                    </button>
                                </>
                            )}
                            {error && <div className="text-red-500 bg-red-500/10 p-2 rounded-lg text-sm mb-4">{error}</div>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;
