import React, { useEffect, useRef, useState } from 'react';
import { Phone, Video, Mic, MicOff, VideoOff, PhoneOff, PictureInPicture, Minimize2, Maximize2 } from 'lucide-react';

const CallModal = ({
    callStatus, // 'incoming', 'outgoing', 'connected'
    peer, // Use 'peer' to be consistent (the user we are calling or who is calling us)
    localStream,
    remoteStream,
    onAccept,
    onReject,
    onHangup,
    isVideoCall
}) => {
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCamOn, setIsCamOn] = useState(true);
    const [isMinimized, setIsMinimized] = useState(false);

    useEffect(() => {
        if (localStream && localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, isMinimized]);

    useEffect(() => {
        if (remoteStream && remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, callStatus, isMinimized]);

    const toggleMic = (e) => {
        e?.stopPropagation();
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = !isMicOn);
            setIsMicOn(!isMicOn);
        }
    };

    const toggleCam = (e) => {
        e?.stopPropagation();
        if (localStream) {
            localStream.getVideoTracks().forEach(track => track.enabled = !isCamOn);
            setIsCamOn(!isCamOn);
        }
    };

    const togglePiP = async (e) => {
        e?.stopPropagation();
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (remoteVideoRef.current && remoteVideoRef.current.readyState >= 1) {
            try {
                await remoteVideoRef.current.requestPictureInPicture();
            } catch (e) {
                console.error("PiP failed", e);
                alert("PiP failed: " + e.message);
            }
        }
    };

    const toggleMinimize = (e) => {
        e?.stopPropagation();
        setIsMinimized(!isMinimized);
    };



    if (!callStatus || callStatus === 'idle') return null;

    if (isMinimized) {
        return (
            <div
                className="fixed z-[60] w-72 h-48 bg-[#1c1c1e] rounded-xl overflow-hidden shadow-2xl border border-white/20 group bottom-4 right-4 animate-in slide-in-from-bottom-4 duration-300"
            >
                {/* Minimized Content */}
                <div className="relative w-full h-full">
                    {callStatus === 'connected' && remoteStream ? (
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-black text-white p-4 text-center">
                            {peer?.avatar_url ? (
                                <img src={peer.avatar_url} className="w-12 h-12 rounded-full mb-2 object-cover border-2 border-white/10" />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center font-bold text-lg mb-2">
                                    {peer?.display_name?.[0]}
                                </div>
                            )}
                            <p className="font-bold text-sm truncate w-full">{peer?.display_name}</p>
                            <p className="text-xs text-white/50">{callStatus === 'connected' ? 'Connected' : 'Calling...'}</p>
                        </div>
                    )}

                    {/* Overlay on Hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                        <button
                            onClick={toggleMinimize}
                            className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                            title="Maximize"
                        >
                            <Maximize2 size={20} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onHangup(); }}
                            className="p-3 bg-red-500 hover:bg-red-600 rounded-full text-white transition-colors"
                            title="End Call"
                        >
                            <PhoneOff size={20} />
                        </button>
                    </div>

                    {/* Self View Mini */}
                    {localStream && isVideoCall && (
                        <div className="absolute top-2 right-2 w-20 h-14 bg-black/50 rounded-lg overflow-hidden border border-white/10 shadow-md">
                            <video
                                ref={localVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover mirror"
                            />
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300">

            {/* Top Bar for Minimize */}
            <div className="absolute top-6 right-6 z-50 flex gap-4">
                {callStatus === 'connected' && (
                    <button
                        onClick={toggleMinimize}
                        className="p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-105"
                        title="Minimize Call"
                    >
                        <Minimize2 size={24} />
                    </button>
                )}
            </div>

            {/* Main Video Area */}
            <div className="relative w-full max-w-4xl h-[70vh] bg-[#1c1c1e] rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
                {callStatus === 'connected' && remoteStream ? (
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-6 animate-pulse">
                        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 shadow-xl">
                            {peer?.avatar_url ? (
                                <img src={peer.avatar_url} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-5xl font-bold text-white">
                                    {peer?.display_name?.[0]}
                                </div>
                            )}
                        </div>
                        <div className="text-center">
                            <h2 className="text-3xl font-bold text-white mb-2">{peer?.display_name}</h2>
                            <p className="text-white/50 text-lg">
                                {callStatus === 'incoming' ? 'Incoming Call...' :
                                    callStatus === 'outgoing' ? 'Calling...' :
                                        'Connecting...'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Local Video (PIP) */}
                {localStream && isVideoCall && (
                    <div className="absolute top-6 right-6 w-48 h-36 bg-black/50 rounded-xl overflow-hidden border border-white/20 shadow-lg" onClick={e => e.stopPropagation()}>
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover mirror"
                        />
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="mt-8 flex items-center gap-6">
                {callStatus === 'incoming' ? (
                    <>
                        <button
                            onClick={onReject}
                            className="bg-red-500 hover:bg-red-600 text-white p-6 rounded-full transition-all hover:scale-110 shadow-lg"
                        >
                            <PhoneOff size={32} />
                        </button>
                        <button
                            onClick={onAccept}
                            className="bg-green-500 hover:bg-green-600 text-white p-6 rounded-full transition-all hover:scale-110 shadow-lg animate-bounce"
                        >
                            <Phone size={32} />
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={toggleMic}
                            className={`p-4 rounded-full transition-all ${isMicOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white text-black'}`}
                        >
                            {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
                        </button>

                        {isVideoCall && (
                            <button
                                onClick={toggleCam}
                                className={`p-4 rounded-full transition-all ${isCamOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white text-black'}`}
                            >
                                {isCamOn ? <Video size={24} /> : <VideoOff size={24} />}
                            </button>
                        )}

                        {/* PiP Button */}
                        {isVideoCall && (callStatus === 'connected') && (
                            <button
                                onClick={togglePiP}
                                className="p-4 rounded-full transition-all bg-white/10 hover:bg-white/20 text-white"
                                title="Picture in Picture"
                            >
                                <PictureInPicture size={24} />
                            </button>
                        )}

                        <button
                            onClick={onHangup}
                            className="bg-red-500 hover:bg-red-600 text-white p-6 rounded-full transition-all hover:scale-110 shadow-lg"
                        >
                            <PhoneOff size={32} />
                        </button>
                    </>
                )}
            </div>

            <style>{`
                .mirror {
                    transform: scaleX(-1);
                }
            `}</style>
        </div>
    );
};

export default CallModal;
