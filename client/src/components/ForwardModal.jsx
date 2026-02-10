import React, { useState } from 'react';
import { X, Search, ArrowRight, Home, Hash, Users } from 'lucide-react';
import { getImageUrl } from '../config';

const ForwardModal = ({ onClose, onForward, dialogs = [], servers = [], contacts = [] }) => {
    const [searchText, setSearchText] = useState('');

    const filteredDialogs = dialogs.filter(d =>
        d.peer?.display_name?.toLowerCase().includes(searchText.toLowerCase()) ||
        d.peer?.username?.toLowerCase().includes(searchText.toLowerCase())
    );

    const filteredServers = servers.filter(s =>
        s.name.toLowerCase().includes(searchText.toLowerCase())
    );

    const filteredContacts = contacts.filter(c =>
        !dialogs.some(d => d.peer?.id === c.id) && (
            c.display_name?.toLowerCase().includes(searchText.toLowerCase()) ||
            c.username?.toLowerCase().includes(searchText.toLowerCase())
        )
    );

    const handleSelect = (target) => {
        onForward(target);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-md bg-[#1c1c1e] rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <div className="flex items-center gap-2">
                        <ArrowRight size={20} className="text-blue-400" />
                        <h3 className="text-lg font-bold text-white tracking-tight">Переслать сообщение</h3>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1 hover:bg-white/10 rounded-full">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-3 bg-white/5 border-b border-white/10">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-white/30" size={16} />
                        <input
                            className="w-full bg-black/30 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-white/20"
                            placeholder="Поиск чата или контакта..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
                    {/* Groups/Servers */}
                    {filteredServers.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5 opacity-70">
                                <Users size={10} /> Сообщества
                            </div>
                            <div className="space-y-0.5 mt-1">
                                {filteredServers.map(server => (
                                    <div
                                        key={server.id}
                                        onClick={() => handleSelect({ type: 'group', id: server.id, server })}
                                        className="p-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-all rounded-xl active:scale-[0.98] group"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold overflow-hidden shadow-lg shrink-0">
                                            {server.avatar_url ? <img src={getImageUrl(server.avatar_url)} className="w-full h-full object-cover" /> : server.name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold text-white truncate">{server.name}</h4>
                                            <p className="text-[10px] text-white/40 truncate flex items-center gap-1">
                                                <Hash size={8} /> {server.channels?.[0]?.name || 'общий-чат'}
                                            </p>
                                        </div>
                                        <ArrowRight size={14} className="text-white/0 group-hover:text-blue-400 transition-all -translate-x-2 group-hover:translate-x-0" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recent Dialogs */}
                    {filteredDialogs.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 opacity-70">
                                <Home size={10} /> Недавние чаты
                            </div>
                            <div className="space-y-0.5 mt-1">
                                {filteredDialogs.map(dialog => (
                                    <div
                                        key={dialog.id}
                                        onClick={() => handleSelect({ type: 'peer', id: dialog.peer.id, peer: dialog.peer })}
                                        className="p-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-all rounded-xl active:scale-[0.98] group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold overflow-hidden shadow-lg shrink-0">
                                            {dialog.peer.avatar_url ? <img src={dialog.peer.avatar_url} className="w-full h-full object-cover" /> : dialog.peer.display_name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold text-white truncate">{dialog.peer.display_name}</h4>
                                            <p className="text-[10px] text-white/40 truncate">@{dialog.peer.username}</p>
                                        </div>
                                        <ArrowRight size={14} className="text-white/0 group-hover:text-blue-400 transition-all -translate-x-2 group-hover:translate-x-0" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contacts fallback */}
                    {filteredContacts.length > 0 && (
                        <div>
                            <div className="px-3 py-1.5 text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-1.5">
                                Контакты
                            </div>
                            <div className="space-y-0.5 mt-1">
                                {filteredContacts.map(contact => (
                                    <div
                                        key={contact.id}
                                        onClick={() => handleSelect({ type: 'peer', id: contact.id, peer: contact })}
                                        className="p-2.5 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-all rounded-xl active:scale-[0.98] group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold overflow-hidden shrink-0 border border-emerald-500/10">
                                            {contact.avatar_url ? <img src={contact.avatar_url} className="w-full h-full object-cover" /> : contact.display_name[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold text-white truncate">{contact.display_name}</h4>
                                            <p className="text-[10px] text-white/40 truncate">@{contact.username}</p>
                                        </div>
                                        <ArrowRight size={14} className="text-white/0 group-hover:text-blue-400 transition-all -translate-x-2 group-hover:translate-x-0" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {filteredDialogs.length === 0 && filteredServers.length === 0 && filteredContacts.length === 0 && (
                        <div className="py-12 text-center flex flex-col items-center gap-2 opacity-30">
                            <Search size={32} />
                            <p className="text-sm">Ничего не найдено</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForwardModal;
