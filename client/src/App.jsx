import React, { useState, useEffect, useRef } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import { Lock, Send, Loader2, Video, Phone, UserPlus, Search, Menu, Settings as SettingsIcon, ArrowRight, Check, CheckCheck, Paperclip, Mic, Play, Pause, X, File as FileIcon, Download, Plus, Minus, RotateCcw, Maximize, Volume2, VolumeX } from 'lucide-react';
import Login from './components/Login';
import ProfileSetup from './components/ProfileSetup';
import Settings from './components/Settings';
import ContactProfile from './components/ContactProfile';
import CallModal from './components/CallModal';

const MediaViewer = ({ src, type, onClose }) => {
  if (!src) return null;

  // Photo State
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Video State
  const videoRef = React.useRef(null);
  const [isPlaying, setIsPlaying] = useState(true); // AutoPlay
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = React.useRef(null);

  // Photo Handlers
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    const newScale = Math.min(Math.max(0.5, scale + delta), 4);
    setScale(newScale);
  };

  const handleMouseDown = (e) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
    // Show controls on move
    setShowControls(true);
    resetControlsTimeout();
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  // Video Handlers
  useEffect(() => {
    if (type === 'video' && videoRef.current) {
      const video = videoRef.current;

      const onTimeUpdate = () => {
        setCurrentTime(video.currentTime);
        if (video.duration) {
          setProgress((video.currentTime / video.duration) * 100);
        }
      };

      const onLoadedMetadata = () => {
        setDuration(video.duration);
        setIsPlaying(!video.paused);
      };

      const onEnded = () => {
        setIsPlaying(false);
        setShowControls(true);
      };

      video.addEventListener('timeupdate', onTimeUpdate);
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('ended', onEnded);

      return () => {
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('ended', onEnded);
      };
    }
  }, [type, src]);

  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 2000);
  };

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
      setShowControls(true);
      resetControlsTimeout();
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.min(Math.max(0, x / rect.width), 1);

    if (videoRef.current && duration) {
      videoRef.current.currentTime = percentage * duration;
      setProgress(percentage * 100);
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      const fileName = src.split('/').pop() || 'download';
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      window.open(src, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-in fade-in duration-200 overflow-hidden"
      onClick={onClose}
      onWheel={type === 'photo' ? handleWheel : undefined}
      onMouseMove={handleMouseMove}
    >
      {/* Top Controls */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent pointer-events-none transition-opacity duration-300 ${!showControls && isPlaying && type === 'video' ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="text-white/90 text-sm font-medium px-2 pointer-events-auto drop-shadow-md">
          {type === 'photo' ? 'Photo Viewer' : 'Video Player'}
        </div>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors pointer-events-auto backdrop-blur-sm"
        >
          <X size={24} />
        </button>
      </div>

      {/* Main Content */}
      <div
        className="flex-1 flex items-center justify-center relative w-full h-full overflow-hidden"
        onMouseDown={type === 'photo' ? handleMouseDown : undefined}
        onMouseMove={type === 'photo' ? handleMouseMove : undefined}
        onMouseUp={type === 'photo' ? handleMouseUp : undefined}
        onMouseLeave={type === 'photo' ? handleMouseUp : undefined}
        onClick={type === 'video' ? togglePlay : undefined}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            transform: type === 'photo' ? `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})` : 'none',
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            cursor: type === 'photo' ? (scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default') : 'pointer'
          }}
          className="max-w-full max-h-full flex items-center justify-center p-4 w-full h-full"
        >
          {type === 'photo' ? (
            <img
              src={src}
              className="max-w-full max-h-[85vh] object-contain shadow-2xl rounded-sm select-none pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="relative w-full h-full flex items-center justify-center">
              <video
                ref={videoRef}
                src={src}
                autoPlay
                className="max-w-full max-h-[90vh] shadow-2xl rounded-md pointer-events-none"
                onError={(e) => {
                  console.error("Video Error:", e);
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
              <div className="hidden absolute inset-0 flex-col items-center justify-center text-white gap-4 pointer-events-none">
                <div className="bg-black/60 p-6 rounded-xl backdrop-blur-md flex flex-col items-center pointer-events-auto border border-white/10">
                  <p className="font-bold text-lg mb-2">Video Cannot Be Played</p>
                  <p className="text-white/60 text-sm mb-4">The format might not be supported.</p>
                  <button
                    onClick={handleDownload}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <Download size={18} /> Download
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Video Controls Overlay */}
      {type === 'video' && (
        <div
          className={`absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-20 transition-opacity duration-300 pointer-events-auto ${!showControls && isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          onClick={e => e.stopPropagation()}
        >
          {/* Progress Bar */}
          <div
            className="w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer relative group flex items-center"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-blue-500 rounded-full relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity scale-0 group-hover:scale-100 duration-200" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-white/90 transition-colors"
              >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
              </button>

              <div className="flex items-center gap-2 group relative">
                <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors">
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <div className="w-0 overflow-hidden group-hover:w-24 transition-all duration-300 flex items-center">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const newVol = parseFloat(e.target.value);
                      setVolume(newVol);
                      if (videoRef.current) {
                        videoRef.current.volume = newVol;
                        videoRef.current.muted = newVol === 0;
                      }
                      setIsMuted(newVol === 0);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-20 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer hover:bg-white/50 accent-white"
                  />
                </div>
              </div>

              <div className="text-sm font-medium text-white/90">
                {formatTime(currentTime)} <span className="text-white/40 mx-1">/</span> {formatTime(duration)}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={handleDownload} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors">
                <Download size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Toolbar */}
      {type === 'photo' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#1c1c1e]/90 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 flex items-center gap-4 shadow-2xl z-10 pointer-events-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors">
              <Minus size={20} />
            </button>
            <span className="text-xs text-white/50 w-8 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(4, s + 0.2))} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors">
              <Plus size={20} />
            </button>
          </div>

          <div className="w-[1px] h-6 bg-white/10" />

          <button onClick={() => setRotation(r => r - 90)} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors" title="Rotate">
            <RotateCcw size={20} />
          </button>

          <button onClick={handleReset} className="p-2 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition-colors" title="Reset View">
            <Maximize size={20} />
          </button>

          <div className="w-[1px] h-6 bg-white/10" />

          <button onClick={handleDownload} className="p-2 hover:bg-white/10 rounded-full text-blue-400 hover:text-blue-300 transition-colors" title="Download">
            <Download size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

const FileMessage = ({ msg }) => {
  // Extract filename from URL or user fallback
  const fileName = msg.content === 'File' && msg.media_url ? msg.media_url.split('/').pop() : msg.content;

  const handleDownload = async (e) => {
    e.stopPropagation();
    try {
      const response = await fetch(msg.media_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      window.open(msg.media_url, '_blank'); // Fallback
    }
  };

  return (
    <div className="flex items-center gap-3 p-1 rounded-lg min-w-[200px] group cursor-pointer hover:bg-white/5 transition-colors" onClick={handleDownload}>
      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
        <FileIcon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate text-white/90 max-w-[150px]">{fileName}</p>
        <div className="flex items-center gap-1 text-xs text-blue-400">
          <Download size={12} /> <span>Download</span>
        </div>
      </div>
    </div>
  );
};

const AudioMessage = ({ src }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = React.useRef(null);
  const [waveform] = useState(() => Array.from({ length: 40 }, () => Math.floor(Math.random() * 60) + 20)); // Simulated waveform data

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration !== Infinity) setDuration(audio.duration);
    };

    // Fallback for duration if infinity (common with streamed/blob sometimes initially)
    audio.ondurationchange = () => {
      if (audio.duration !== Infinity) setDuration(audio.duration);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.ontimeupdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (time) => {
    if (!time || time === Infinity) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="flex items-center gap-3 p-1 min-w-[240px]">
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-white text-blue-600 flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0"
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-1" />}
      </button>

      <div className="flex flex-col flex-1 min-w-0">
        {/* Waveform Visualization */}
        <div className="flex items-center gap-[1px] h-6 mb-1 overflow-hidden opacity-80">
          {waveform.map((height, i) => {
            const isActive = (i / waveform.length) * 100 < progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-colors ${isActive ? 'bg-white' : 'bg-white/40'}`}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>

        <div className="flex justify-between items-center text-xs text-white/70 font-medium">
          <span>{isPlaying ? formatTime(audioRef.current?.currentTime) : formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ user, activeChat, setActiveChat, onOpenSettings }) => {
  const { sendMessage, messages } = useSocket();
  const [dialogs, setDialogs] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    // Fetch dialogs on mount
    sendMessage({ method: 'dialogs.get' });
  }, []);

  useEffect(() => {
    // Debounce search
    const timeout = setTimeout(() => {
      if (searchText.trim()) {
        setIsSearching(true);
        sendMessage({ method: 'user.search', args: { username: searchText } });
      } else {
        setIsSearching(false);
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchText]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      if (lastMsg.type === 'dialogs.list') {
        setDialogs(lastMsg.dialogs);
        setLoading(false);
      } else if (lastMsg.type === 'search_result') {
        // Single result for now
        setSearchResults([lastMsg.user]);
      } else if (lastMsg.type === 'error' && isSearching) {
        setSearchResults([]);
      }

      // Real-time Updates
      if (lastMsg.type === 'message.new') {
        const msg = lastMsg.message;
        setDialogs(prev => {
          let updated = [...prev];
          const idx = updated.findIndex(d => d.peer.id === (lastMsg.sender_id === user.id ? lastMsg.peer_id : lastMsg.sender_id));

          // If new dialog, fetch all? Or simpler just re-fetch for now to ensure consistency
          if (idx === -1) {
            sendMessage({ method: 'dialogs.get' });
            return prev;
          }

          // Optimistic Update
          updated[idx].last_message = msg.type === 'text' ? msg.content : `[${msg.type}]`;
          updated[idx].updated_at = msg.created_at;
          if (lastMsg.sender_id !== user.id && lastMsg.sender_id !== activeChat?.peer.id) {
            updated[idx].unread_count += 1;
          }

          // Sort
          updated.sort((a, b) => b.updated_at - a.updated_at);
          return updated;
        });

        // If it's a new message in current chat from peer, we read it instantly, so count stays 0 visually if we handled read logic right. 
        // But let's rely on fetch for simplicity if complex.
      } else if (lastMsg.type === 'messages.read_done') {
        // I read this peer's messages. Set unread to 0.
        setDialogs(prev => prev.map(d => d.peer.id === lastMsg.peer_id ? { ...d, unread_count: 0 } : d));
      } else if (lastMsg.type === 'user.status') {
        const { user_id, status, last_seen } = lastMsg;
        setDialogs(prev => prev.map(d => {
          if (d.peer.id === user_id) {
            return {
              ...d,
              peer: {
                ...d.peer,
                is_online: status === 'online',
                last_seen: last_seen
              }
            };
          }
          return d;
        }));

        // Also update activeChat if it matches (for immediate header update)
        if (activeChat?.peer?.id === user_id) {
          setActiveChat(prev => ({
            ...prev,
            peer: {
              ...prev.peer,
              is_online: status === 'online',
              last_seen: last_seen
            }
          }));
        }
      }
    }
  }, [messages, isSearching, activeChat, user]);

  const handleSelect = (item, isSearch = false) => {
    if (isSearch) {
      const dialog = {
        id: 'temp_' + item.id,
        peer: item,
        unread_count: 0,
        last_message: ''
      };
      setActiveChat(dialog);
      setSearchText('');
      setIsSearching(false);
    } else {
      setActiveChat(item);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('samor_token');
    window.location.reload();
  };

  return (
    <div className="w-80 h-full border-r border-white/10 flex flex-col bg-black/20 backdrop-blur-xl relative">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-3">
        <div className="relative">
          <button
            className="text-white/60 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
            onClick={() => setShowMenu(!showMenu)}
          >
            <Menu size={24} />
          </button>

          {/* Menu Dropdown */}
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute top-12 left-0 w-64 bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden animate-in fade-in slide-in-from-top-2 p-1">
                <div className="p-3 border-b border-white/5 mb-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold overflow-hidden">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} className="w-full h-full object-cover" />
                      ) : (
                        user.display_name[0]
                      )}
                    </div>
                    <div className="overflow-hidden flex-1">
                      <h3 className="text-white font-medium truncate">{user.display_name}</h3>
                      <p className="text-white/40 text-xs truncate">@{user.username}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { setShowMenu(false); onOpenSettings(); }}
                  className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/5 rounded-lg flex items-center gap-3">
                  <SettingsIcon size={18} /> Settings
                </button>
                <div className="my-1 border-t border-white/5" />
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-3"
                >
                  <div className="rotate-180"><ArrowRight size={18} /></div> Log Out
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
            <input
              className="bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm text-white focus:bg-black/40 outline-none w-full transition-all text-left"
              placeholder="Search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="p-2">
            <p className="px-4 py-2 text-xs text-blue-400 font-bold uppercase tracking-wider">Global Search</p>
            {searchResults.length === 0 ? (
              <div className="text-center text-white/20 text-sm p-4">No users found</div>
            ) : (
              searchResults.map(u => (
                <div
                  key={u.id}
                  onClick={() => handleSelect(u, true)}
                  className="p-3 flex gap-3 cursor-pointer hover:bg-white/5 transition-colors rounded-lg"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-pink-500 to-orange-400 flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                      u.display_name[0]
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="font-medium text-white truncate">{u.display_name}</h3>
                    <p className="text-sm text-white/40 truncate">@{u.username}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center p-4"><Loader2 className="animate-spin text-white/20" /></div>
        ) : dialogs.length === 0 ? (
          <div className="text-center text-white/20 text-sm p-8">No chats yet</div>
        ) : (
          dialogs.map(dialog => (
            <div
              key={dialog.id}
              onClick={() => handleSelect(dialog)}
              className={`p-3 flex gap-3 cursor-pointer hover:bg-white/5 transition-colors ${activeChat?.id === dialog.id ? 'bg-blue-500/20 hover:bg-blue-500/20' : ''}`}
            >
              <div className="relative w-12 h-12 shrink-0">
                <div className="w-full h-full rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold text-lg overflow-hidden">
                  {dialog.peer.avatar_url ? (
                    <img src={dialog.peer.avatar_url} className="w-full h-full object-cover" />
                  ) : (
                    dialog.peer.display_name[0]
                  )}
                </div>
                {dialog.peer.is_online && (
                  <div className="absolute right-0 bottom-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[#1c1c1e]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h3 className="font-medium text-white truncate">{dialog.peer.display_name}</h3>
                  {dialog.updated_at && <span className="text-xs text-white/40">{new Date(dialog.updated_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-white/60 truncate max-w-[140px]">{dialog.last_message || 'Media'}</p>
                  {dialog.unread_count > 0 && (
                    <div className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
                      {dialog.unread_count}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const ChatArea = ({ activeChat, user, onOpenProfile, onStartCall }) => {
  const { sendMessage, messages } = useSocket();
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const scrollRef = React.useRef(null);

  const [viewingMedia, setViewingMedia] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);

  useEffect(() => {
    if (activeChat) {
      // Load history
      sendMessage({ method: 'messages.get_history', args: { peer_id: activeChat.peer.id } });
      setHistory([]); // Reset while loading
    }
  }, [activeChat]);

  // ... (useEffects for messages logic remain same, omitted for brevity if unchanged, but for replacement I must include context)

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      if (lastMsg.type === 'messages.history' && lastMsg.peer_id === activeChat?.peer.id) {
        setHistory(lastMsg.messages);
        if (lastMsg.messages.length > 0) {
          const lastId = lastMsg.messages[lastMsg.messages.length - 1].id;
          sendMessage({ method: 'messages.read', args: { peer_id: activeChat.peer.id, max_id: lastId } });
        }
      } else if (lastMsg.type === 'message.new' && (lastMsg.peer_id === activeChat?.peer.id || lastMsg.sender_id === activeChat?.peer.id)) {
        setHistory(prev => [...prev, lastMsg.message]);
        if (lastMsg.sender_id === activeChat.peer.id) {
          sendMessage({ method: 'messages.read', args: { peer_id: activeChat.peer.id, max_id: lastMsg.message.id } });
        }
      } else if (lastMsg.type === 'messages.read') {
        if (lastMsg.peer_id === activeChat?.peer.id) {
          setHistory(prev => prev.map(m => m.sender_id === user.id ? { ...m, is_read: true } : m));
        }
      }
    }
  }, [messages, activeChat, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);


  const [uploadProgress, setUploadProgress] = useState(null);

  const uploadFile = async (file) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://localhost:8000/api/upload');

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress({ progress: percent, fileName: file.name });
        }
      };

      xhr.onload = () => {
        setUploadProgress(null);
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          resolve(data.url);
        } else {
          console.error("Upload failed", xhr.responseText);
          alert("Upload failed");
          resolve(null);
        }
      };

      xhr.onerror = () => {
        setUploadProgress(null);
        console.error("Upload error");
        alert("Network Error");
        resolve(null);
      };

      xhr.send(formData);
    });
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Optimistic / Loading state could be added here
    const url = await uploadFile(file);
    if (!url) return;

    let type = 'file';
    if (file.type.startsWith('image/')) type = 'photo';
    else if (file.type.startsWith('video/')) type = 'video';

    sendMessage({
      method: 'message.send',
      args: {
        type: type,
        text: type === 'photo' ? 'Photo' : (type === 'video' ? 'Video' : file.name),
        content: url, // Sending URL instead of base64
        peer_id: activeChat.peer.id
      }
    });
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioFile = new File([audioBlob], "voice_message.webm", { type: "audio/webm" });

          const url = await uploadFile(audioFile);
          if (url) {
            sendMessage({
              method: 'message.send',
              args: {
                type: 'voice',
                text: 'Voice Message',
                content: url,
                peer_id: activeChat.peer.id
              }
            });
          }

          stream.getTracks().forEach(track => track.stop());
        };

        recorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Mic error:", err);
        alert("Microphone access denied");
      }
    }
  };

  const handleSend = () => {
    if (!input.trim() || !activeChat) return;
    sendMessage({ method: 'message.send', args: { type: 'text', text: input, peer_id: activeChat.peer.id } });
    setInput('');
  };

  if (!activeChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-black/10 backdrop-blur-sm">
        <div className="bg-white/5 p-4 rounded-full mb-4">
          <Lock size={32} className="text-white/20" />
        </div>
        <h3 className="text-lg font-medium text-white/60">Select a chat to start messaging</h3>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-black/10 backdrop-blur-sm relative">
      {/* Viewer Overlay */}
      {viewingMedia && (
        <MediaViewer
          src={viewingMedia.src}
          type={viewingMedia.type}
          onClose={() => setViewingMedia(null)}
        />
      )}

      {/* Upload Progress Overlay (Bottom Left) */}
      {uploadProgress && (
        <div className="absolute bottom-20 left-6 z-20 bg-[#1c1c1e] border border-white/10 p-3 rounded-xl shadow-2xl flex items-center gap-3 w-64 animate-in slide-in-from-bottom-2">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
            <Loader2 className="animate-spin" size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between text-xs text-white/70 mb-1">
              <span className="truncate max-w-[120px]">{uploadProgress.fileName}</span>
              <span>{uploadProgress.progress}%</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${uploadProgress.progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between bg-black/20">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={onOpenProfile}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold overflow-hidden group-hover:opacity-80 transition-opacity">
            {activeChat.peer.avatar_url ? (
              <img src={activeChat.peer.avatar_url} className="w-full h-full object-cover" />
            ) : (
              activeChat.peer.display_name[0]
            )}
          </div>
          <div>
            <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors">{activeChat.peer.display_name}</h3>
            {activeChat.peer.is_online ? (
              <span className="text-xs text-blue-400 font-medium">online</span>
            ) : (
              <span className="text-xs text-white/40">
                {activeChat.peer.last_seen ? `last seen ${new Date(activeChat.peer.last_seen * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'offline'}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 text-white/40">
          <button onClick={() => onStartCall(activeChat.peer, false)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
            <Phone size={20} className="hover:text-white" />
          </button>
          <button onClick={() => onStartCall(activeChat.peer, true)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
            <Video size={20} className="hover:text-white" />
          </button>
          <button className="hover:bg-white/10 p-2 rounded-full transition-colors">
            <Search size={20} className="hover:text-white" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={scrollRef}>
        {history.map((msg) => {
          const isMe = msg.sender_id === user.id;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] p-3 rounded-2xl ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white/10 text-white rounded-tl-sm'}`}>
                {msg.type === 'call_log' && (
                  <div className="w-full flex justify-center my-2">
                    <span className="bg-white/10 text-white/60 text-xs px-3 py-1 rounded-full flex items-center gap-1">
                      <Phone size={12} /> {msg.content}
                    </span>
                  </div>
                )}

                {msg.type === 'text' && <p>{msg.content}</p>}
                {msg.type === 'photo' && (
                  <div className="rounded-lg overflow-hidden mb-1 relative group w-full max-w-[280px] aspect-[4/3] bg-black/20">
                    <img
                      src={msg.media_url}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 cursor-pointer"
                      onClick={() => setViewingMedia({ type: 'photo', src: msg.media_url })}
                    />
                  </div>
                )}

                {msg.type === 'video' && (
                  <div
                    className="rounded-lg overflow-hidden mb-1 relative group w-full max-w-[320px] aspect-video bg-black/50 cursor-pointer"
                    onClick={() => setViewingMedia({ type: 'video', src: msg.media_url })}
                  >
                    <video
                      src={`${msg.media_url}#t=0.1`}
                      muted
                      playsInline
                      preload="metadata"
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center group-hover:scale-110 transition-transform border border-white/20">
                        <Play size={20} fill="white" className="text-white ml-1" />
                      </div>
                    </div>
                  </div>
                )}

                {msg.type === 'file' && <FileMessage msg={msg} />}

                {msg.type === 'voice' && <AudioMessage src={msg.media_url} />}

                <div className="flex items-center justify-end gap-1 mt-1 opacity-60">
                  <span className="text-[10px]">
                    {new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    msg.is_read ? (
                      <CheckCheck size={14} className="text-blue-200" /> // 2 Blue Ticks (simulated with lighter blue)
                    ) : (
                      <Check size={14} /> // 1 Tick
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="p-4 bg-black/20 border-t border-white/10">
        <div className="max-w-4xl mx-auto flex gap-3 items-center">
          <label className="text-white/40 hover:text-white transition-colors cursor-pointer">
            <Paperclip size={20} />
            <input type="file" className="hidden" onChange={handleFileSelect} />
          </label>
          <input
            className="flex-1 bg-white/5 hover:bg-white/10 focus:bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none transition-all placeholder:text-white/30"
            placeholder="Write a message..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={toggleRecording}
            className={`transition-colors ${isRecording ? 'text-red-500 animate-pulse' : 'text-white/40 hover:text-white'}`}
          >
            <Mic size={20} />
          </button>
          <button
            onClick={handleSend}
            className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full transition-colors"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

const MainLayout = ({ user, onStartCall }) => {
  const [activeChat, setActiveChat] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Handle Global Search bridging to ephemeral activeChat
  const handleSearchSelect = (foundUser) => {
    // Check if dialog exists, else create fake one
    // Logic to be implemented or handled by backend fetching existing dialogs
    const fakeDialog = {
      id: 'temp_' + foundUser.id,
      peer: foundUser,
      messages: []
    };
    setActiveChat(fakeDialog);
  };

  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [viewingMedia, setViewingMedia] = useState(null); // Lift media state or manage locally? 
  // Actually MediaViewer is local to ChatArea currently, but ContactProfile needs it too. 
  // Ideally lift viewingMedia to MainLayout, BUT ChatArea has it inside.
  // For now let's duplicate or move logic? 
  // Moving logic is better. Let's make MediaViewer Global in MainLayout? 
  // Or just have ContactProfile handle it internally? 
  // User wants "open through viewer".

  // Let's implement local MediaViewer inside MainLayout for "Global" popups like Profile.
  // ChatArea has it's own. It's fine for now to have two instances if they don't conflict (z-index).

  return (
    <div className="flex h-screen w-full overflow-hidden glass-panel max-w-[1600px] mx-auto border-x border-white/10 shadow-2xl relative">
      {showSettings && <Settings user={user} onClose={() => setShowSettings(false)} />}

      {viewingProfileId && (
        <ContactProfile
          userId={viewingProfileId}
          onClose={() => setViewingProfileId(null)}
          onOpenMedia={(url) => setViewingMedia({ type: 'photo', src: url })}
        />
      )}

      {/* Global Media Viewer (for Profile) */}
      {viewingMedia && (
        <MediaViewer
          src={viewingMedia.src}
          type={viewingMedia.type}
          onClose={() => setViewingMedia(null)}
        />
      )}

      <Sidebar user={user} activeChat={activeChat} setActiveChat={setActiveChat} onOpenSettings={() => setShowSettings(true)} />
      <ChatArea
        activeChat={activeChat}
        user={user}
        onOpenProfile={() => activeChat && setViewingProfileId(activeChat.peer.id)}
        onStartCall={onStartCall}
      />
    </div>
  );
};

// Orchestrator
const AppContent = () => {
  const { status, sendMessage, messages } = useSocket();
  const [user, setUser] = useState(null);
  const [authStep, setAuthStep] = useState('login'); // login, verify, setup, main
  const [tempToken, setTempToken] = useState(null);
  const [isResuming, setIsResuming] = useState(false);

  // WebRTC State
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const [callStatus, setCallStatus] = useState('idle'); // idle, outgoing, incoming, connected
  const [activeCallPeer, setActiveCallPeer] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const localStreamRef = useRef(null); // Ref for robust cleanup
  const [remoteStream, setRemoteStream] = useState(null);
  const [isVideoCall, setIsVideoCall] = useState(true);

  // Ringtone (Blob-based for background playback)
  const ringtoneAudioRef = useRef(null);

  useEffect(() => {
    // Generate simple sine wave WAV blob
    const sampleRate = 44100;
    const duration = 2; // seconds
    const numChannels = 1;
    const numFrames = sampleRate * duration;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    // file length
    view.setUint32(4, 36 + dataSize, true);
    // RIFF type
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // format chunk identifier
    view.setUint32(12, 0x666d7420, false); // "fmt "
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (1 is PCM)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate
    view.setUint32(28, byteRate, true);
    // block align
    view.setUint16(32, blockAlign, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    view.setUint32(36, 0x64617461, false); // "data"
    // data chunk length
    view.setUint32(40, dataSize, true);

    // Generate sine wave pulsing
    for (let i = 0; i < numFrames; i++) {
      const t = i / sampleRate;
      // 800Hz tone, pulsing on/off every 0.4s
      const freq = 800;
      const amp = (Math.sin(2 * Math.PI * (1 / 0.8) * t) > 0) ? 0.1 : 0;
      const sample = Math.sin(2 * Math.PI * freq * t) * amp;
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(44 + i * 2, int16, true);
    }

    const blob = new Blob([view], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);

    ringtoneAudioRef.current = new Audio(url);
    ringtoneAudioRef.current.loop = true;

    // Request Notification Permission on mount/interaction
    if (Notification.permission === 'default') {
      document.addEventListener('click', () => {
        if (Notification.permission === 'default') Notification.requestPermission();
      }, { once: true });
    }

    return () => {
      URL.revokeObjectURL(url);
    };
  }, []);

  const playRingtone = () => {
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.currentTime = 0;
      ringtoneAudioRef.current.play().catch(e => console.log("Audio play failed:", e));
    }
  };

  const stopRingtone = () => {
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.pause();
      ringtoneAudioRef.current.currentTime = 0;
    }
  };

  const peerConnection = useRef(null);
  const activeCallPeerRef = useRef(null); // Ref for effect access

  const iceCandidateQueue = useRef([]);
  const callStartTimeRef = useRef(null); // Track duration

  // Message Processing State
  const processedMessageCountRef = useRef(0);

  useEffect(() => { activeCallPeerRef.current = activeCallPeer; }, [activeCallPeer]);

  const initializePeerConnection = async (targetId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Use passed targetId or fallback to ref if available (but simpler to just pass it)
        const recipient = targetId || activeCallPeerRef.current?.id;
        if (recipient) {
          sendMessage({
            method: 'call.ice_candidate',
            args: { target_id: recipient, data: event.candidate }
          });
        }
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    peerConnection.current = pc;
    return pc;
  };

  const stopTracks = () => {
    const stream = localStreamRef.current || localStream;
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      setLocalStream(null);
      localStreamRef.current = null;
    }
  };

  const startCall = async (peer, video = true) => {
    if (callStatus !== 'idle') return;
    setIsVideoCall(video);
    setActiveCallPeer(peer);
    setCallStatus('outgoing');
    stopTracks(); // Ensure previous tracks are released

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video
      });
      setLocalStream(stream);
      localStreamRef.current = stream;

      const pc = await initializePeerConnection(peer.id);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendMessage({
        method: 'call.offer',
        args: { target_id: peer.id, data: { sdp: offer, isVideo: video } }
      });
    } catch (err) {
      console.error("Error starting call:", err);
      setCallStatus('idle');
      setActiveCallPeer(null);
    }
  };

  const acceptCall = async () => {
    stopRingtone();
    setCallStatus('connected');
    callStartTimeRef.current = Date.now(); // Start timer
    stopTracks(); // Ensure previous tracks are released
    await sleep(500); // Wait for device release

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoCall
      });
      setLocalStream(stream);
      localStreamRef.current = stream;

      const pc = peerConnection.current;
      if (!pc) return;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendMessage({
        method: 'call.answer',
        args: { target_id: activeCallPeer.id, data: answer }
      });

      // Flush queued candidates if any
      processIceQueue(pc);

    } catch (err) {
      console.error("Error accepting call:", err);
      alert("Error accepting call: " + err.message);
      endCall();
    }
  };

  const processIceQueue = async (pc) => {
    while (iceCandidateQueue.current.length > 0) {
      const candidate = iceCandidateQueue.current.shift();
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("Error adding queued ice candidate", e);
      }
    }
  };

  const rejectCall = () => {
    if (activeCallPeer) {
      sendMessage({ method: 'call.reject', args: { target_id: activeCallPeer.id } });
      // Log Decline
      sendMessage({
        method: 'message.send',
        args: {
          type: 'call_log',
          text: 'Declined Call',
          peer_id: activeCallPeer.id
        }
      });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (activeCallPeer) {
      sendMessage({ method: 'call.hangup', args: { target_id: activeCallPeer.id } });

      // Log Duration or Missed
      if (callStatus === 'connected' && callStartTimeRef.current) {
        const durationMs = Date.now() - callStartTimeRef.current;
        const seconds = Math.floor((durationMs / 1000) % 60);
        const minutes = Math.floor((durationMs / (1000 * 60)));
        const durationStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        sendMessage({
          method: 'message.send',
          args: {
            type: 'call_log',
            text: `Call ended (${durationStr})`,
            peer_id: activeCallPeer.id
          }
        });
      } else if (callStatus === 'outgoing') {
        sendMessage({
          method: 'message.send',
          args: {
            type: 'call_log',
            text: 'Missed Call',
            peer_id: activeCallPeer.id
          }
        });
      }
    }
    cleanupCall();
  };

  const cleanupCall = () => {
    stopRingtone();
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    } else if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
    setCallStatus('idle');
    setCallStatus('idle');
    setActiveCallPeer(null);
    iceCandidateQueue.current = [];
    callStartTimeRef.current = null;
  };

  // 1. Resume Session on Connect
  useEffect(() => {
    if (status === 'connected') {
      const token = localStorage.getItem('samor_token');
      if (token) {
        setIsResuming(true);
        sendMessage({ method: 'auth.login_token', args: { token } });
      }
    }
  }, [status]);

  // Main Message Loop
  useEffect(() => {
    // Process all new messages since last check
    const currentLength = messages.length;
    let newMessages = [];

    if (currentLength > processedMessageCountRef.current) {
      newMessages = messages.slice(processedMessageCountRef.current);
      processedMessageCountRef.current = currentLength;
    }

    if (newMessages.length === 0) return;

    newMessages.forEach(msg => {
      if (msg.type === 'auth_success') {
        setUser(msg.user);
        setAuthStep('main');
        setIsResuming(false);
        if (msg.user.token) {
          localStorage.setItem('samor_token', msg.user.token);
        }
      } else if (msg.type === 'error' && isResuming) {
        localStorage.removeItem('samor_token');
        setIsResuming(false);
      } else if (msg.type === 'user.profile_updated') {
        setUser(msg.user);

        // --- Call Signals ---
      } else if (msg.type === 'call.offer') {
        if (callStatus !== 'idle') {
          sendMessage({ method: 'call.reject', args: { target_id: msg.sender_id, data: 'busy' } });
        } else {
          const { sdp, isVideo } = msg.data;

          (async () => {
            try {
              const pc = await initializePeerConnection(msg.sender_id);
              await pc.setRemoteDescription(new RTCSessionDescription(sdp));
              processIceQueue(pc);

              setIsVideoCall(isVideo);
              setCallStatus('incoming');
              setActiveCallPeer({ id: msg.sender_id, display_name: "Incoming Call...", username: "..." });

              // Notify & Ring
              playRingtone();
              if (Notification.permission === 'granted') {
                new Notification("Incoming Call", {
                  body: "Someone is calling you",
                  icon: "/vite.svg" // Fallback icon
                });
              }

              sendMessage({ method: 'user.get_info', args: { user_id: msg.sender_id } });
            } catch (e) {
              console.error("Error handling offer:", e);
            }
          })();
        }
      } else if (msg.type === 'call.answer') {
        if (callStatus === 'outgoing' && peerConnection.current) {
          const pc = peerConnection.current;
          pc.setRemoteDescription(new RTCSessionDescription(msg.data)).then(() => {
            setCallStatus('connected');
            processIceQueue(pc);
          });
        }
      } else if (msg.type === 'call.ice_candidate') {
        const pc = peerConnection.current;
        if (pc) {
          if (pc.remoteDescription) {
            pc.addIceCandidate(new RTCIceCandidate(msg.data))
              .catch(e => console.error("Add Ice Error", e));
          } else {
            iceCandidateQueue.current.push(msg.data);
          }
        }
      } else if (msg.type === 'call.hangup' || msg.type === 'call.reject') {
        cleanupCall();
      } else if (msg.type === 'user.info' && callStatus === 'incoming' && msg.user.id === activeCallPeerRef.current?.id) {
        setActiveCallPeer(msg.user);
      }
    });
  }, [messages, isResuming]); // callStatus ref dependency handled via closure or checks

  if (status !== 'connected' || isResuming) {
    return <div className="h-screen flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2" /> {isResuming ? 'Resuming Session...' : 'Connecting...'}</div>;
  }

  if (authStep === 'main' && user) {
    return (
      <>
        <MainLayout user={user} onStartCall={startCall} />
        <CallModal
          callStatus={callStatus}
          peer={activeCallPeer}
          localStream={localStream}
          remoteStream={remoteStream}
          onAccept={acceptCall}
          onReject={rejectCall}
          onHangup={endCall}
          isVideoCall={isVideoCall}
        />
      </>
    );
  }

  // Login component now handles both Login and Registration flows
  return <Login onLoginSuccess={(u) => {
    setUser(u);
    setAuthStep('main');
    if (u.token) localStorage.setItem('samor_token', u.token);
  }} />;
};

function App() {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
}

export default App;
