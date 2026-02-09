import React, { useState } from 'react';
import { X, Hash, Volume2 } from 'lucide-react';

const CreateChannelModal = ({ onClose, onCreate, group, existingGroups, existingChannels }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState('text');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        await onCreate({ name, type, group });
        setLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-sm bg-[#1c1c1e] rounded-xl shadow-2xl border border-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-white">Создать канал</h3>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider block">Тип канала</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setType('text')}
                                className={`p-3 rounded-lg border flex items-center gap-2 transition-all ${type === 'text' ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' : 'bg-black/20 border-white/5 text-white/40 hover:bg-white/5'}`}
                            >
                                <Hash size={20} />
                                <span className="font-medium text-sm">Текстовый</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('voice')}
                                className={`p-3 rounded-lg border flex items-center gap-2 transition-all ${type === 'voice' ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-black/20 border-white/5 text-white/40 hover:bg-white/5'}`}
                            >
                                <Volume2 size={20} />
                                <span className="font-medium text-sm">Голосовой</span>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase tracking-wider block">Название канала</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-white/20">
                                {type === 'text' ? '#' : <Volume2 size={16} />}
                            </span>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                                placeholder="новый-канал"
                                className="w-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-white focus:outline-none focus:border-white/20 transition-colors placeholder:text-white/10"
                                autoFocus
                                maxLength={30}
                            />
                        </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2">
                        <button
                            onClick={onClose}
                            type="button"
                            className="px-4 py-2 text-sm text-white/60 hover:underline"
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || loading}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            Создать канал
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateChannelModal;
