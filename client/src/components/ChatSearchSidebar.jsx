import React, { useState, useEffect } from 'react';
import { Search, Image, Video, Mic, FileText, Link as LinkIcon, X, Calendar, Download } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { getImageUrl } from '../config';

const ChatSearchSidebar = ({ activeChat, onClose, onJumpToMessage }) => {
    const { sendMessage, messages } = useSocket();
    const [query, setQuery] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // all, photo, video, voice, file, link
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            handleSearch();
        }, 500);
        return () => clearTimeout(timer);
    }, [query, activeTab, activeChat]);

    const handleSearch = () => {
        setLoading(true);
        const args = {
            query: query,
            filter_type: activeTab === 'all' ? null : activeTab
        };

        if (activeChat.type === 'channel' || activeChat.group_id) {
            args.channel_id = activeChat.channel_id || activeChat.id;
        } else {
            args.peer_id = activeChat.peer?.id || activeChat.id;
        }

        sendMessage({ method: 'messages.search', args });
    };

    // Listen for results
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.type === 'messages.search_result') {
            // Check if this result matches our current filter context to avoid race conditions visually
            // (Simpler: just set results)
            setResults(lastMsg.messages);
            setLoading(false);
        }
    }, [messages]);

    const tabs = [
        { id: 'all', icon: <Search size={16} />, label: 'Все' },
        { id: 'photo', icon: <Image size={16} />, label: 'Фото' },
        { id: 'video', icon: <Video size={16} />, label: 'Видео' },
        { id: 'voice', icon: <Mic size={16} />, label: 'Голос' },
        { id: 'file', icon: <FileText size={16} />, label: 'Файлы' },
        { id: 'link', icon: <LinkIcon size={16} />, label: 'Ссылки' },
    ];

    const renderResult = (msg) => {
        const date = new Date(msg.created_at * 1000).toLocaleDateString([], {
            day: 'numeric', month: 'short', year: 'numeric'
        });

        return (
            <div
                key={msg.id}
                onClick={() => onJumpToMessage(msg.id)}
                className="p-3 hover:bg-white/5 rounded-xl cursor-pointer transition-colors group flex gap-3 items-start"
            >
                <div className="w-10 h-10 rounded-full bg-white/10 shrink-0 flex items-center justify-center overflow-hidden">
                    {msg.sender?.avatar_url ? <img src={getImageUrl(msg.sender.avatar_url)} className="w-full h-full object-cover" /> : msg.sender?.display_name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                        <span className="text-sm font-bold text-white truncate">{msg.sender?.display_name}</span>
                        <span className="text-[10px] text-white/40">{date}</span>
                    </div>

                    {msg.type === 'text' && (
                        <p className="text-sm text-white/80 line-clamp-2 break-words">{msg.content}</p>
                    )}

                    {msg.type === 'photo' && (
                        <div className="mt-1 rounded-lg overflow-hidden h-24 w-full bg-black/20">
                            <img src={getImageUrl(msg.media_url)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        </div>
                    )}

                    {msg.type === 'video' && (
                        <div className="mt-1 flex items-center gap-2 text-blue-400 bg-blue-400/10 p-2 rounded-lg">
                            <Video size={16} /> <span className="text-sm">Видеофайл</span>
                        </div>
                    )}

                    {msg.type === 'voice' && (
                        <div className="mt-1 flex items-center gap-2 text-green-400 bg-green-400/10 p-2 rounded-lg">
                            <Mic size={16} /> <span className="text-sm">Голосовое сообщение</span>
                        </div>
                    )}

                    {msg.type === 'file' && (
                        <div className="mt-1 flex items-center gap-2 text-purple-400 bg-purple-400/10 p-2 rounded-lg">
                            <FileText size={16} /> <span className="text-sm truncate">{msg.content}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (

        <div className="w-80 border-l border-white/10 bg-[#1c1c1e] flex flex-col h-full animate-in slide-in-from-right-10 duration-300 shadow-2xl z-20">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors">
                    <X size={20} />
                </button>
                <h3 className="font-bold text-white text-lg">Поиск</h3>
            </div>

            {/* Search Input */}
            <div className="px-4 py-2">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Поиск сообщений..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
                        autoFocus
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="px-2 pb-2">
                <div className="flex gap-1 overflow-x-auto p-2 no-scrollbar">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${activeTab === tab.id
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/20'
                                : 'bg-white/5 text-white/60 border-transparent hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-1">
                {loading ? (
                    <div className="flex justify-center p-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/20"></div>
                    </div>
                ) : results.length > 0 ? (
                    results.map(renderResult)
                ) : (
                    <div className="text-center py-12 text-white/20 text-sm">
                        Ничего не найдено
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatSearchSidebar;
