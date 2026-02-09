import React, { useEffect, useRef, useState } from 'react';
import { X, Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, Minimize2, Users } from 'lucide-react';

// VideoTile Component
const VideoTile = ({ stream, name, isMuted, isMicOn, isCamOn }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isMuted}
                className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2">
                <span className="text-white text-sm font-bold">{name}</span>
                {isMicOn !== undefined && !isMicOn && <MicOff size={14} className="text-red-400" />}
                {isCamOn !== undefined && !isCamOn && <VideoOff size={14} className="text-red-400" />}
            </div>
        </>
    );
};

const GroupCallModal = ({
    active,
    group,
    localStream,
    remoteStreams,
    participants,
    onLeave,
    isMicOn,
    isCamOn,
    toggleMic,
    toggleCam
}) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const toggleMinimize = (e) => {
        e?.stopPropagation();
        setIsMinimized(!isMinimized);
    };

    if (!active) return null;

    // Minimized View
    if (isMinimized) {
        const firstRemoteStream = Object.values(remoteStreams)[0];

        return (
            <div
                className="fixed z-[60] w-72 h-48 bg-[#1c1c1e] rounded-xl overflow-hidden shadow-2xl border border-white/20 group bottom-4 right-4 animate-in slide-in-from-bottom-4 duration-300"
            >
                <div className="relative w-full h-full">
                    {firstRemoteStream ? (
                        <video
                            ref={ref => { if (ref) ref.srcObject = firstRemoteStream; }}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black text-white p-4 text-center">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold shadow-lg mb-2">
                                {group?.avatar_url ? <img src={group.avatar_url} className="w-full h-full object-cover rounded-full" /> : group?.name?.[0]}
                            </div>
                            <p className="font-bold text-sm truncate w-full">{group?.name}</p>
                            <div className="flex items-center gap-1 text-xs text-white/50 mt-1">
                                <Users size={10} />
                                <span>{Object.keys(remoteStreams).length + 1} участника(ов)</span>
                            </div>
                        </div>
                    )}

                    {/* Overlay on Hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                        <button
                            onClick={toggleMinimize}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer"
                            title="Развернуть"
                        >
                            <Maximize2 size={20} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onLeave(); }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="p-3 bg-red-500 hover:bg-red-600 rounded-full text-white transition-colors cursor-pointer"
                            title="Покинуть звонок"
                        >
                            <PhoneOff size={20} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Full View
    return (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
            {/* Header */}
            <div className="p-6 flex items-center justify-between border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white text-xl font-bold shadow-lg">
                        {group?.avatar_url ? <img src={group.avatar_url} className="w-full h-full object-cover rounded-2xl" /> : group?.name?.[0]}
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white tracking-tight uppercase">Звонок в {group?.name}</h2>
                        <div className="flex items-center gap-2 text-white/40 text-xs font-bold uppercase tracking-widest">
                            <Users size={12} className="text-blue-400" />
                            <span>{Object.keys(remoteStreams).length + 1} Участников</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={toggleMinimize}
                        className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all border border-white/10 active:scale-95"
                        title="Свернуть"
                    >
                        <Minimize2 size={24} />
                    </button>
                    <button
                        onClick={onLeave}
                        className="p-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl transition-all border border-red-500/20 active:scale-95"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* Video Grid */}
            <div className="flex-1 p-6 overflow-y-auto">
                <div className={`grid gap-4 h-full ${Object.keys(remoteStreams).length === 0 ? 'grid-cols-1' :
                    Object.keys(remoteStreams).length === 1 ? 'grid-cols-2' :
                        'grid-cols-2 md:grid-cols-3'
                    }`}>
                    {/* Local Stream */}
                    <div className="relative rounded-[2rem] overflow-hidden bg-white/5 border border-white/10 group aspect-video">
                        {localStream ? (
                            <VideoTile stream={localStream} name="Вы" isMuted={true} isMicOn={isMicOn} isCamOn={isCamOn} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-black">
                                <p className="text-white/40">No Video</p>
                            </div>
                        )}
                    </div>

                    {/* Remote Streams */}
                    {Object.entries(remoteStreams).map(([userId, stream]) => {
                        const participant = participants.find(p => p.id == userId);
                        return (
                            <div key={userId} className="relative rounded-[2rem] overflow-hidden bg-white/5 border border-white/10 group aspect-video">
                                <VideoTile stream={stream} name={participant?.display_name || 'Unknown'} isMuted={false} />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Controls */}
            <div className="p-8 flex justify-center items-center gap-6 bg-gradient-to-t from-black to-transparent">
                <button
                    onClick={toggleMic}
                    className={`p-5 rounded-3xl transition-all shadow-xl active:scale-95 ${isMicOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white shadow-red-500/20'}`}
                >
                    {isMicOn ? <Mic size={28} /> : <MicOff size={28} />}
                </button>
                <button
                    onClick={onLeave}
                    className="p-6 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all shadow-2xl shadow-red-600/30 active:scale-90"
                >
                    <PhoneOff size={32} />
                </button>
                <button
                    onClick={toggleCam}
                    className={`p-5 rounded-3xl transition-all shadow-xl active:scale-95 ${isCamOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white shadow-red-500/20'}`}
                >
                    {isCamOn ? <Video size={28} /> : <VideoOff size={28} />}
                </button>
            </div>
        </div>
    );
};

export default GroupCallModal;
