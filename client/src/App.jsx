import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { API_URL, getImageUrl } from './config';
import { SocketProvider, useSocket } from './context/SocketContext';
import { Lock, Send, Loader2, Video, Phone, UserPlus, Search, Menu, Settings as SettingsIcon, ArrowRight, Check, CheckCheck, Paperclip, Mic, Play, Pause, X, File as FileIcon, Download, Plus, Minus, RotateCcw, Maximize, Volume2, VolumeX, MessageSquare, Users, Hash, PlusCircle, Compass, Home } from 'lucide-react';
import Login from './components/Login';
import ProfileSetup from './components/ProfileSetup';
import Settings from './components/Settings';
import ContactProfile from './components/ContactProfile';
import CallModal from './components/CallModal';
import CreateGroupModal from './components/CreateGroupModal';
import CreateChannelModal from './components/CreateChannelModal';
import GroupSettingsModal from './components/GroupSettingsModal';
import GroupCallModal from './components/GroupCallModal';
import ChatSearchSidebar from './components/ChatSearchSidebar';

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

const Sidebar = ({ user, activeChat, setActiveChat, onOpenSettings, servers = [], onSelectGroup, onCreateGroup, activeCallsInGroups = {} }) => {
  const { sendMessage, messages, dialogs, contacts, setDialogs, setContacts } = useSocket();
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' or 'contacts'

  useEffect(() => {
    // Fetch dialogs on mount
    sendMessage({ method: 'dialogs.get' });
  }, []);

  useEffect(() => {
    if (activeTab === 'contacts') {
      setContactsLoading(true);
      sendMessage({ method: 'user.list' });
    }
  }, [activeTab]);

  useEffect(() => {
    // Debounce search
    const timeout = setTimeout(() => {
      if (searchText.trim()) {
        setIsSearching(true);
        if (activeTab === 'contacts') {
          setIsSearching(false); // We handle contact search via filtering render
        } else {
          sendMessage({ method: 'user.search', args: { username: searchText } });
        }
      } else {
        setIsSearching(false);
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchText, activeTab]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      if (lastMsg.type === 'dialogs.list') {
        setDialogs(lastMsg.dialogs);
        setLoading(false);
      } else if (lastMsg.type === 'user.list_result') {
        setContacts(lastMsg.users);
        setContactsLoading(false);
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

      } else if (lastMsg.type === 'messages.read_done') {
        // I read this peer's messages. Set unread to 0.
        setDialogs(prev => prev.map(d => d.peer.id === lastMsg.peer_id ? { ...d, unread_count: 0 } : d));
      } else if (lastMsg.type === 'user.status') {
        const { user_id, status, last_seen } = lastMsg;
        console.log("DEBUG: user.status received", lastMsg);

        // Only update if we actually have this user in our dialogs or contacts
        // This prevents creating ghost/unknown users
        const hasInDialogs = dialogs.some(d => d.peer?.id === user_id && d.peer?.display_name);
        const hasInContacts = contacts.some(c => c.id === user_id && c.display_name);

        if (!hasInDialogs && !hasInContacts) {
          console.log("DEBUG: Ignoring status update for unknown user", user_id);
          return; // Ignore status updates for users we don't know
        }

        const updatePeer = (peer) => {
          if (!peer.display_name) {
            console.error("DEBUG: Skipping update for peer without name!", peer);
            return peer; // Return unchanged if invalid
          }
          return {
            ...peer,
            is_online: status === 'online',
            last_seen: last_seen
          };
        };

        setDialogs(prev => prev.map(d => {
          if (d.peer.id == user_id && d.peer.display_name) {
            console.log("DEBUG: Updating dialog peer", d.peer);
            return { ...d, peer: updatePeer(d.peer) };
          }
          return d;
        }));

        setContacts(prev => prev.map(c => {
          if (c.id == user_id && c.display_name) return updatePeer(c);
          return c;
        }));

        // Also update activeChat if it matches (for immediate header update)
        setActiveChat(prev => {
          if (prev?.peer?.id == user_id && prev?.peer?.display_name) {
            console.log("DEBUG: Updating activeChat peer from", prev.peer);
            const newIsOnline = status === 'online';
            if (prev.peer.is_online !== newIsOnline || prev.peer.last_seen !== last_seen) {
              return {
                ...prev,
                peer: {
                  ...prev.peer,
                  is_online: newIsOnline,
                  last_seen: last_seen
                }
              };
            }
          }
          return prev;
        });
      }
    }
  }, [messages, isSearching, activeChat, user]);

  const handleSelect = (item, isSearch = false) => {
    // Validate that the item has valid peer data
    if (item.peer && !item.peer.display_name) {
      console.warn("DEBUG: Attempted to select invalid dialog", item);
      return; // Don't select invalid dialogs
    }

    if (isSearch || activeTab === 'contacts') {
      // Validate item has display_name
      if (!item.display_name) {
        console.warn("DEBUG: Attempted to select invalid contact", item);
        return;
      }

      // Check if we already have a dialog?
      const existing = dialogs.find(d => d.peer.id === item.id);
      if (existing) {
        setActiveChat(existing);
      } else {
        const dialog = {
          id: 'temp_' + item.id,
          peer: item,
          unread_count: 0,
          last_message: ''
        };
        setActiveChat(dialog);
      }

      // Reset Search
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

  // Filter contacts locally
  const filteredContacts = contacts.filter(c =>
    !searchText ||
    c.username.toLowerCase().includes(searchText.toLowerCase()) ||
    c.display_name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div className="w-80 h-full border-r border-white/10 flex flex-col bg-black/20 backdrop-blur-xl relative shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-3">
        <div className="relative">
          <button
            className="text-white/60 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
            onClick={() => setShowMenu(!showMenu)}
          >
            <Menu size={24} />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute top-12 left-0 w-64 bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden p-1">
                <div className="p-3 border-b border-white/5 mb-1 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold overflow-hidden">
                    {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : user.display_name[0]}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h3 className="text-white font-medium truncate text-left">{user.display_name}</h3>
                    <p className="text-white/40 text-xs truncate text-left">@{user.username}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowMenu(false); onOpenSettings(); }}
                  className="w-full text-left px-3 py-2 text-sm text-white/80 hover:bg-white/5 rounded-lg flex items-center gap-3">
                  <SettingsIcon size={18} /> Настройки
                </button>
                <div className="my-1 border-t border-white/5" />
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-3"
                >
                  <div className="rotate-180"><ArrowRight size={18} /></div> Выйти
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 text-left">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-white/40" size={16} />
            <input
              className="bg-white/5 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm text-white focus:bg-black/40 outline-none w-full transition-all text-left"
              placeholder={activeTab === 'chats' ? "Поиск" : "Контакты"}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-2 gap-2 border-b border-white/5">
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'chats' ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5'}`}
        >
          Чаты
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'contacts' ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5'}`}
        >
          Контакты
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {activeTab === 'chats' && (
          <>
            {!isSearching && (
              <div className="mb-4">
                <div className="px-3 py-2 text-[10px] font-bold text-blue-400 uppercase tracking-widest flex justify-between items-center group">
                  <span>Сообщества</span>
                  <button onClick={onCreateGroup} className="p-0.5 hover:bg-white/10 rounded text-blue-400 hover:text-blue-300 transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
                {servers.map(server => (
                  <div
                    key={server.id}
                    onClick={() => onSelectGroup(server)}
                    className={`p-2.5 flex gap-3 cursor-pointer hover:bg-white/5 transition-all rounded-xl mb-0.5 ${activeChat?.group_id === server.id ? 'bg-blue-500/15 border border-blue-500/20' : 'border border-transparent'}`}
                  >
                    <div className="relative w-11 h-11 shrink-0">
                      <div className="w-full h-full rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold overflow-hidden shadow-lg">
                        {server.avatar_url ? <img src={getImageUrl(server.avatar_url)} className="w-full h-full object-cover" /> : server.name[0]}
                      </div>
                      {activeCallsInGroups[server.id] && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-lg border-2 border-[#1c1c1e] flex items-center justify-center animate-pulse shadow-lg shadow-green-500/20">
                          <Video size={10} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                      <h3 className="font-semibold text-white truncate text-sm">{server.name}</h3>
                      <p className="text-xs text-white/40 truncate">{server.channels?.length || 0} channels</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isSearching && <div className="px-3 py-2 text-[10px] font-bold text-white/30 uppercase tracking-widest text-left">Сообщения</div>}

            {isSearching ? (
              searchResults.map(u => (
                <div key={u.id} onClick={() => handleSelect(u, true)} className="p-3 flex gap-3 cursor-pointer hover:bg-white/5 transition-colors rounded-xl">
                  <div className="w-11 h-11 rounded-full bg-blue-500/20 flex items-center justify-center text-white overflow-hidden shrink-0">
                    {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : u.display_name[0]}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                    <h3 className="font-medium text-white truncate text-sm">{u.display_name}</h3>
                    <p className="text-xs text-white/40 truncate">@{u.username}</p>
                  </div>
                </div>
              ))
            ) : dialogs.length === 0 && (!servers || servers.length === 0) ? (
              <div className="text-center text-white/20 text-sm py-12">Нет активных чатов</div>
            ) : (
              dialogs
                .filter(dialog => dialog.peer && dialog.peer.display_name) // Only show dialogs with valid peer data
                .map(dialog => (
                  <div
                    key={dialog.id}
                    onClick={() => handleSelect(dialog)}
                    className={`p-2.5 flex gap-3 cursor-pointer hover:bg-white/5 transition-all rounded-xl mb-0.5 ${activeChat?.type !== 'group' && activeChat?.id === dialog.id ? 'bg-blue-500/15 border border-blue-500/20' : 'border border-transparent'}`}
                  >
                    <div className="relative w-11 h-11 shrink-0">
                      <div className="w-full h-full rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold overflow-hidden shadow-md">
                        {dialog.peer.avatar_url ? <img src={dialog.peer.avatar_url} className="w-full h-full object-cover" /> : dialog.peer.display_name[0]}
                      </div>
                      {dialog.peer.is_online && (
                        <div className="absolute right-0 bottom-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1c1c1e]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h3 className="font-semibold text-white truncate text-sm">{dialog.peer.display_name}</h3>
                        {dialog.updated_at && <span className="text-[10px] text-white/30">{new Date(dialog.updated_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-white/50 truncate pr-2">{dialog.last_message || 'Медиа'}</p>
                        {dialog.unread_count > 0 && <div className="bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[17px] text-center">{dialog.unread_count}</div>}
                      </div>
                    </div>
                  </div>
                ))
            )}
          </>
        )}

        {activeTab === 'contacts' && (
          <div className="space-y-1">
            {filteredContacts.map(u => (
              <div key={u.id} onClick={() => handleSelect(u)} className="p-3 flex gap-3 cursor-pointer hover:bg-white/5 transition-all rounded-xl">
                <div className="relative w-11 h-11 shrink-0">
                  <div className="w-full h-full rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold overflow-hidden shadow-sm">
                    {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" /> : u.display_name[0]}
                  </div>
                  {u.is_online && <div className="absolute right-0 bottom-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1c1c1e]" />}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center text-left">
                  <h3 className="font-medium text-white truncate text-sm">{u.display_name}</h3>
                  <p className="text-xs text-white/40 truncate">@{u.username}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


const ServerList = ({ servers, activeServer, onSelect, onCreate, activeCallsInGroups = {} }) => {
  return (
    <div className="w-[72px] h-full bg-[#1e1e1e] flex flex-col items-center py-3 gap-3 overflow-y-auto no-scrollbar border-r border-white/5 shrink-0 z-20 select-none">
      {/* Home / DMs */}
      <div
        onClick={() => onSelect('home')}
        className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-[#36393f] transition-all cursor-pointer flex items-center justify-center text-white group relative ${activeServer === 'home' ? 'bg-blue-500 rounded-[16px]' : 'hover:bg-blue-500'}`}
      >
        {activeServer === 'home' && <div className="absolute -left-4 w-2 h-10 bg-white rounded-r-lg" />}
        <Home size={24} />
      </div>

      <div className="w-8 h-[2px] bg-white/10 rounded-full mx-auto" />

      {/* Servers */}
      {servers.map(server => (
        <div
          key={server.id}
          onClick={() => onSelect(server)}
          className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-[#36393f] transition-all cursor-pointer flex items-center justify-center text-white font-bold overflow-hidden relative group ${activeServer?.id === server.id ? 'rounded-[16px]' : ''}`}
        >
          {activeServer?.id === server.id && (
            <div className="absolute -left-4 w-2 h-10 bg-white rounded-r-lg" />
          )}
          {server.avatar_url ? (
            <img src={server.avatar_url} className="w-full h-full object-cover" />
          ) : (
            server.name.substring(0, 2).toUpperCase()
          )}
          {activeCallsInGroups[server.id] && (
            <div className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-[#1e1e1e] flex items-center justify-center animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]">
              <Video size={8} className="text-white" />
            </div>
          )}
        </div>
      ))}

      {/* Add Server */}
      <div
        onClick={onCreate}
        className="w-12 h-12 rounded-[24px] hover:rounded-[16px] bg-[#36393f] hover:bg-green-500 text-green-500 hover:text-white transition-all cursor-pointer flex items-center justify-center group"
      >
        <Plus size={24} />
      </div>
    </div>
  );
};




const ChatArea = ({ activeChat, user, onOpenProfile, onOpenUserIdProfile, onStartCall, onStartGroupCall, onJoinGroupCall, activeCallsInGroups = {}, onForward, onOpenForwardedChat, onSelectChannel, onCreateChannel, onOpenGroupSettings, dialogs = [], contacts = [] }) => {
  const { sendMessage, messages, status } = useSocket();
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const scrollRef = React.useRef(null);
  const [viewingMedia, setViewingMedia] = useState(null); // Local to ChatArea for shared media

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);

  const [contextMenu, setContextMenu] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState(null); // Message to forward
  const [uploadProgress, setUploadProgress] = useState(null); // { progress: 0-100 }


  // Resolve peer from fresh data (dialogs/contacts) or fallback to activeChat.peer
  const currentPeer = React.useMemo(() => {
    // If activeChat is missing or malformed
    if (!activeChat?.peer) return null;

    const peerId = activeChat.peer.id;
    if (!peerId) return activeChat.peer;

    // Try to find in dialogs first (most likely to have fresh status)
    const fromDialog = dialogs.find(d => d.peer.id == peerId); // Loose check

    if (fromDialog?.peer) return fromDialog.peer;

    // Try contacts
    const fromContact = contacts.find(c => c.id == peerId); // Loose check
    if (fromContact) return fromContact;

    // Fallback
    return activeChat.peer;
  }, [activeChat, dialogs, contacts]);

  // Handle right-click context menu
  const handleContextMenu = (e, msg) => {
    e.preventDefault(); // Block browser default menu
    e.stopPropagation();

    // Use cursor position but ensure menu stays within viewport
    const menuWidth = 192; // w-48 = 12rem = 192px
    const menuHeight = 200; // Approximate height

    let x = e.clientX;
    let y = e.clientY;

    // Ensure menu doesn't go off-screen
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }

    setContextMenu({ x, y, message: msg });
  };

  const handleJumpToMessage = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-blue-500/20');
      setTimeout(() => el.classList.remove('bg-blue-500/20'), 2000);
    }
  };

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (activeChat && status === 'connected') {
      // Load history
      if (activeChat.type === 'channel') {
        sendMessage({ method: 'messages.get_history', args: { channel_id: activeChat.channel_id } });
      } else if (activeChat.peer?.id) {
        sendMessage({ method: 'messages.get_history', args: { peer_id: activeChat.peer.id } });
      }
      setHistory([]); // Reset while loading
    }
  }, [activeChat?.id, activeChat?.type, status]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      const isCurrentChatHistory = (
        (lastMsg.type === 'messages.history' && (
          (activeChat?.type === 'channel' && lastMsg.channel_id === activeChat.channel_id) ||
          (activeChat?.type !== 'channel' && lastMsg.peer_id === activeChat?.peer.id)
        ))
      );

      if (isCurrentChatHistory) {
        setHistory(lastMsg.messages);
        if (lastMsg.messages.length > 0) {
          const lastId = lastMsg.messages[lastMsg.messages.length - 1].id;
          if (activeChat.type === 'channel') {
            // sendMessage({ method: 'messages.read', args: { channel_id: activeChat.channel_id, max_id: lastId } });
          } else {
            sendMessage({ method: 'messages.read', args: { peer_id: activeChat.peer.id, max_id: lastId } });
          }
        }
      } else if (lastMsg.type === 'message.new') {
        const isForThisChat = (
          (activeChat?.type === 'channel' && lastMsg.channel_id === activeChat.channel_id) ||
          (activeChat?.type !== 'channel' && (lastMsg.peer_id === activeChat?.peer.id || lastMsg.sender_id === activeChat?.peer.id))
        );

        if (isForThisChat) {
          setHistory(prev => [...prev, lastMsg.message]);
          if (activeChat.type !== 'channel' && lastMsg.sender_id === activeChat.peer.id) {
            sendMessage({ method: 'messages.read', args: { peer_id: activeChat.peer.id, max_id: lastMsg.message.id } });
          }
        }
      } else if (lastMsg.type === 'messages.read') {
        if (activeChat?.type !== 'channel' && lastMsg.peer_id === activeChat?.peer.id) {
          setHistory(prev => prev.map(m => m.sender_id === user.id ? { ...m, is_read: true } : m));
        }
      } else if (lastMsg.type === 'messages.deleted') {
        setHistory(prev => prev.filter(m => !lastMsg.ids.includes(m.id)));
      } else if (lastMsg.type === 'messages.forward_done') {
        setForwardingMessage(null); // Clear forward state
      }
    }
  }, [messages, activeChat, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);


  // Removed duplicate uploadProgress declaration

  const uploadFile = async (file) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/upload`);

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

    const args = {
      type: type,
      text: type === 'photo' ? 'Фото' : (type === 'video' ? 'Видео' : file.name),
      content: url
    };

    if (activeChat.type === 'channel') {
      args.channel_id = activeChat.channel_id;
    } else {
      args.peer_id = activeChat.peer.id;
    }

    sendMessage({
      method: 'message.send',
      args: args
    });
  };

  const handlePaste = async (e) => {
    if (!e.clipboardData || !e.clipboardData.items) return;

    const items = e.clipboardData.items;
    let blob = null;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        blob = items[i].getAsFile();
        break;
      }
    }

    if (blob) {
      e.preventDefault();
      // Handle the pasted image file
      const url = await uploadFile(blob);
      if (!url) return;

      const type = 'photo';
      const args = {
        type: type,
        text: 'Фото',
        content: url
      };

      if (activeChat.type === 'channel') {
        args.channel_id = activeChat.channel_id;
      } else {
        args.peer_id = activeChat.peer.id;
      }

      sendMessage({
        method: 'message.send',
        args: args
      });
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Microphone access requires HTTPS or localhost. Please enable SSL/TLS on your server.");
        return;
      }
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
            const args = {
              type: 'voice',
              text: 'Голосовое сообщение',
              content: url
            };

            if (activeChat.type === 'channel') {
              args.channel_id = activeChat.channel_id;
            } else {
              args.peer_id = activeChat.peer.id;
            }

            sendMessage({
              method: 'message.send',
              args: args
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

  const handleReply = (msg) => {
    setReplyingTo(msg);
    // Focus input
  };

  const handleDelete = (msgId, forAll) => {
    sendMessage({
      method: 'messages.delete',
      args: { message_ids: [msgId], delete_for_all: forAll }
    });
    setContextMenu(null);
  };

  const handleSend = () => {
    if ((!input.trim() && !uploadProgress) || !activeChat) return;

    // Check if reply
    const args = { type: 'text', text: input };

    if (activeChat.type === 'channel') {
      args.channel_id = activeChat.channel_id;
    } else {
      args.peer_id = activeChat.peer.id;
    }

    if (replyingTo) {
      args.reply_to_msg_id = replyingTo.id;
    }

    sendMessage({ method: 'message.send', args });
    setInput('');
    setReplyingTo(null); // Clear reply state
  };

  if (!activeChat) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-black/10 backdrop-blur-sm">
        <div className="bg-white/5 p-4 rounded-full mb-4">
          <Lock size={32} className="text-white/20" />
        </div>
        <h3 className="text-lg font-medium text-white/60">Выберите чат, чтобы начать общение</h3>
      </div>
    );
  }




  return (
    <div className="flex-1 flex h-full overflow-hidden relative">
      <div className="flex-1 flex flex-col h-full bg-black/10 backdrop-blur-sm relative min-w-0">
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
          <div className="flex items-center gap-3 cursor-pointer group text-left" onClick={() => activeChat?.group_id ? onOpenGroupSettings(activeChat.group_id) : onOpenProfile()}>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-400 to-purple-400 flex items-center justify-center text-white font-bold overflow-hidden group-hover:opacity-80 transition-opacity">
              {currentPeer?.avatar_url ? (
                <img src={currentPeer.avatar_url} className="w-full h-full object-cover" />
              ) : (
                currentPeer?.display_name?.[0] || '?'
              )}
            </div>
            <div>
              <h3 className="font-bold text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{activeChat?.name || currentPeer?.display_name || 'Unknown'}</h3>
              {activeChat?.group_id ? (
                <span className="text-xs text-blue-400/60 font-medium">group chat</span>
              ) : (
                currentPeer?.is_online ? (
                  <span className="text-xs text-blue-400 font-medium">online</span>
                ) : (
                  <span className="text-xs text-white/40">
                    {currentPeer?.last_seen ? `last seen ${new Date(currentPeer.last_seen * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'offline'}
                  </span>
                )
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-white/40">
            {!activeChat.group_id && activeChat.type !== 'channel' && (
              <>
                <button onClick={() => currentPeer && onStartCall(currentPeer, false)} className="hover:bg-white/10 p-2 rounded-full transition-colors" disabled={!currentPeer}>
                  <Phone size={20} className="hover:text-white" />
                </button>
                <button onClick={() => currentPeer && onStartCall(currentPeer, true)} className="hover:bg-white/10 p-2 rounded-full transition-colors" disabled={!currentPeer}>
                  <Video size={20} className="hover:text-white" />
                </button>
              </>
            )}
            {activeChat.group_id && (
              activeCallsInGroups[activeChat.group_id] ? (
                <button onClick={() => onJoinGroupCall(activeChat)} className="bg-green-500/10 text-green-400 border border-green-400/20 px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-green-500/20 transition-all animate-pulse shadow-lg shadow-green-500/10 active:scale-95">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                  Join Call
                </button>
              ) : (
                <button onClick={() => onStartGroupCall(activeChat)} className="hover:bg-white/10 p-2.5 rounded-xl transition-all">
                  <Video size={20} className="hover:text-white/60" />
                </button>
              )
            )}
            <button onClick={() => setShowSearch(!showSearch)} className={`hover:bg-white/10 p-2.5 rounded-xl transition-all ${showSearch ? 'bg-white/10 text-white' : ''}`}>
              <Search size={20} className="hover:text-white/60" />
            </button>
          </div>
        </div>

        {activeChat.group_id && activeCallsInGroups[activeChat.group_id] && !groupCallActive && (
          <div className="mx-6 mt-4 p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/10 backdrop-blur-xl rounded-[1.5rem] border border-white/5 flex items-center justify-between animate-in slide-in-from-top-4 duration-500 shadow-xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <Video size={24} />
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-[3px] border-[#1c1c1e] animate-pulse" />
              </div>
              <div>
                <p className="text-white font-black text-sm tracking-tight uppercase">Live Group Call</p>
                <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Active conversation in this group</p>
              </div>
            </div>
            <button
              onClick={() => onJoinGroupCall(activeChat)}
              className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-2xl shadow-blue-500/30 active:scale-90 relative z-10"
            >
              Join Now
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4" ref={scrollRef}>
          {history.map((msg) => {
            const isMe = msg.sender_id === user.id;
            const isGroup = !!activeChat.group_id;
            const sender = msg.sender || (isMe ? user : null);

            return (
              <div key={msg.id} id={`msg-${msg.id}`} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && isGroup && (
                  <div
                    className="w-8 h-8 rounded-full bg-white/10 mb-1 cursor-pointer flex-shrink-0 group overflow-hidden border border-white/10"
                    onClick={() => onOpenUserIdProfile(msg.sender_id)}
                  >
                    {sender?.avatar_url ? (
                      <img src={sender.avatar_url} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white group-hover:opacity-80 transition-opacity">
                        {sender?.display_name?.[0] || '?'}
                      </div>
                    )}
                  </div>
                )}
                <div
                  className={`max-w-[70%] p-3 rounded-2xl relative group/msg cursor-pointer ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white/10 text-white rounded-tl-sm'}`}
                  onContextMenu={(e) => handleContextMenu(e, msg)}
                >
                  {!isMe && isGroup && (
                    <p
                      className="text-xs font-bold text-blue-400 mb-1 cursor-pointer hover:underline"
                      onClick={(e) => { e.stopPropagation(); onOpenUserIdProfile(msg.sender_id); }}
                    >
                      {sender?.display_name || sender?.username || 'Unknown'}
                    </p>
                  )}
                  {/* Reply Context */}
                  {msg.reply_to_msg_id && (() => {
                    const replyMsg = history.find(m => m.id === msg.reply_to_msg_id);
                    const replySender = replyMsg ? (
                      replyMsg.sender_id === user.id ? user : (
                        activeChat.peer.id == replyMsg.sender_id ? activeChat.peer : (
                          contacts.find(c => c.id == replyMsg.sender_id) ||
                          dialogs.find(d => d.peer.id == replyMsg.sender_id)?.peer ||
                          { display_name: 'Unknown', username: 'unknown' }
                        )
                      )
                    ) : null;

                    return (
                      <div
                        className={`mb-2 text-xs border-l-2 pl-2 py-1 rounded cursor-pointer transition-colors ${isMe ? 'border-white/50 bg-white/10 hover:bg-white/20' : 'border-blue-400 bg-black/20 hover:bg-black/30'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const el = document.getElementById(`msg-${msg.reply_to_msg_id}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                      >
                        {replyMsg ? (
                          <>
                            <p className={`font-bold mb-0.5 ${isMe ? 'text-blue-100' : 'text-blue-400'}`}>
                              {replySender?.display_name || replySender?.username || 'Unknown'}
                            </p>
                            <p className="opacity-70 truncate max-w-[200px]">
                              {replyMsg.type === 'text' ? replyMsg.content :
                                (replyMsg.type === 'photo' ? 'Photo' :
                                  (replyMsg.type === 'video' ? 'Video' :
                                    (replyMsg.type === 'voice' ? 'Voice Message' :
                                      (replyMsg.type === 'file' ? 'File' : 'Media'))))}
                            </p>
                          </>
                        ) : (
                          <p className="opacity-50 italic">Message not found</p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Forwarded message header */}
                  {msg.fwd_from_id && (() => {
                    // Try to find the original sender in dialogs, contacts, current user, or activeChat peer
                    let forwardedFrom = dialogs.find(d => d.peer.id == msg.fwd_from_id)?.peer
                      || contacts.find(c => c.id == msg.fwd_from_id)
                      || (user.id == msg.fwd_from_id ? user : null)
                      || (activeChat?.peer?.id == msg.fwd_from_id ? activeChat.peer : null);

                    return (
                      <div
                        className="text-xs text-blue-300 mb-1 cursor-pointer hover:underline flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Open chat with the person who sent the original message (even if it's me - Saved Messages like functionality)
                          if (forwardedFrom) {
                            const targetDialog = dialogs.find(d => d.peer.id == msg.fwd_from_id) || {
                              id: 'temp_' + msg.fwd_from_id,
                              peer: forwardedFrom,
                              messages: []
                            };
                            onOpenForwardedChat && onOpenForwardedChat(targetDialog);
                          }
                        }}
                      >
                        <ArrowRight size={12} />
                        Forwarded from {forwardedFrom?.display_name || forwardedFrom?.username || 'Unknown'}
                      </div>
                    );
                  })()}

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

        {/* Context Menu - rendered in portal for reliable positioning */}
        {contextMenu && ReactDOM.createPortal(
          <div
            className="fixed bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl z-[9999] overflow-hidden w-48"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => handleReply(contextMenu.message)} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white flex items-center gap-2 transition-colors">
              <MessageSquare size={16} /> Ответить
            </button>
            <button onClick={() => { onForward(contextMenu.message); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-white flex items-center gap-2 transition-colors">
              <ArrowRight size={16} /> Переслать
            </button>
            <div className="h-px bg-white/10 my-1" />
            <button onClick={() => handleDelete(contextMenu.message.id, false)} className="w-full text-left px-4 py-3 hover:bg-red-500/10 text-red-500 flex items-center gap-2 transition-colors">
              <X size={16} /> Удалить у меня
            </button>
            {contextMenu.message.sender_id == user.id && (
              <button onClick={() => handleDelete(contextMenu.message.id, true)} className="w-full text-left px-4 py-3 hover:bg-red-500/10 text-red-500 flex items-center gap-2 transition-colors">
                <X size={16} /> Удалить у всех
              </button>
            )}
          </div>,
          document.body
        )}

        {/* Reply Context */}
        {replyingTo && (
          <div className="px-4 py-2 bg-black/40 border-t border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-1 h-8 bg-blue-500 rounded-full" />
              <div>
                <p className="text-blue-400 text-xs font-bold">Ответ на сообщение</p>
                <p className="text-white/60 text-xs truncate max-w-[300px]">{replyingTo.content || 'Медиа'}</p>
              </div>
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-white/40 hover:text-white p-1">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Input */}
        <div className="p-4 bg-black/20 border-t border-white/10">
          <div className="max-w-4xl mx-auto flex gap-3 items-center">
            <label className="text-white/40 hover:text-white transition-colors cursor-pointer">
              <Paperclip size={20} />
              <input type="file" className="hidden" onChange={handleFileSelect} />
            </label>
            <input
              className="flex-1 bg-white/5 hover:bg-white/10 focus:bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white outline-none transition-all placeholder:text-white/30"
              placeholder="Написать сообщение..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              onPaste={handlePaste}
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
      {showSearch && (
        <ChatSearchSidebar
          activeChat={activeChat}
          onClose={() => setShowSearch(false)}
          onJumpToMessage={handleJumpToMessage}
        />
      )}
    </div>
  );
};

const MainLayout = ({ user, onStartCall, groupCallActive, activeGroupCall, groupParticipants, groupRemoteStreams, activeCallsInGroups, startGroupCall, joinGroupCall, leaveGroupCall, toggleGroupMic, toggleGroupCam, isMicOn, isCamOn, localStream }) => {
  const [activeChat, setActiveChat] = useState(() => {
    try {
      const saved = localStorage.getItem(`samor_active_chat_${user.id}`);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // Groups State
  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerId] = useState('home');
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(null); // group ID
  const [showGroupSettings, setShowGroupSettings] = useState(null); // group ID

  // Derived active server
  const activeServer = activeServerId === 'home' ? 'home' : (servers.find(s => s.id === activeServerId) || 'home');

  useEffect(() => {
    if (activeChat) {
      localStorage.setItem(`samor_active_chat_${user.id}`, JSON.stringify(activeChat));
    } else {
      localStorage.removeItem(`samor_active_chat_${user.id}`);
    }
  }, [activeChat, user.id]);

  const { sendMessage, messages, dialogs, contacts } = useSocket();

  // Load Groups
  useEffect(() => {
    sendMessage({ method: 'groups.list' });
  }, []);

  // Groups Message Handler
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      if (lastMsg.type === 'groups.list_result') {
        setServers(lastMsg.groups);
        setLoadingGroups(false);
      } else if (lastMsg.type === 'groups.create_success') {
        setServers(prev => {
          if (prev.find(s => s.id === lastMsg.group.id)) return prev;
          return [...prev, lastMsg.group];
        });
        setActiveServerId(lastMsg.group.id);
      } else if (lastMsg.type === 'groups.channel_created') {
        setServers(prev => prev.map(s => {
          if (s.id === lastMsg.group_id) {
            const exists = s.channels?.find(c => c.id === lastMsg.channel.id);
            return { ...s, channels: exists ? s.channels : [...(s.channels || []), lastMsg.channel] };
          }
          return s;
        }));
      } else if (lastMsg.type === 'groups.updated') {
        setServers(prev => prev.map(s =>
          s.id === lastMsg.group_id ? { ...s, name: lastMsg.name, avatar_url: lastMsg.avatar_url } : s
        ));
        if (activeChat?.group_id === lastMsg.group_id) {
          setActiveChat(prev => ({
            ...prev,
            name: lastMsg.name,
            avatar_url: lastMsg.avatar_url,
            peer: {
              ...prev.peer,
              display_name: lastMsg.name,
              avatar_url: lastMsg.avatar_url
            }
          }));
        }
      } else if (lastMsg.type === 'groups.deleted') {
        const deletedId = lastMsg.group_id;
        setServers(prev => prev.filter(s => s.id !== deletedId));

        if (activeServerId === deletedId) {
          setActiveServerId('home');
        }

        if (activeChat?.group_id === deletedId) {
          setActiveChat(null);
        }
      }
    } else if (lastMsg.type === 'groups.new_membership') {
      sendMessage({ method: 'groups.list' });
    }
  }, [messages, activeChat]); // Added activeChat to deps for group updates

  // Handle activeChat peer updates (DMs)
  useEffect(() => {
    if (!activeChat || activeChat.type === 'channel') return; // Skip for channels

    if (activeChat?.peer?.id && dialogs.length > 0) {
      const freshDialog = dialogs.find(d => d.peer.id == activeChat.peer.id);
      if (freshDialog?.peer) {
        const currentPeerJson = JSON.stringify(activeChat.peer);
        const freshPeerJson = JSON.stringify(freshDialog.peer);
        if (currentPeerJson !== freshPeerJson) {
          setActiveChat(prev => ({ ...prev, peer: freshDialog.peer }));
        }
      }
    }
  }, [dialogs, activeChat?.peer?.id]);

  useEffect(() => {
    if (!activeChat || activeChat.type === 'channel') return;

    if (activeChat.peer?.id && (!activeChat.peer.display_name || !activeChat.peer.username)) {
      sendMessage({ method: 'user.get_info', args: { user_id: activeChat.peer.id } });
    }

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.type === 'user.info' && lastMsg.user.id == activeChat.peer.id) {
      setActiveChat(prev => ({ ...prev, peer: lastMsg.user }));
    }
  }, [messages, activeChat?.peer?.id]);

  const [showSettings, setShowSettings] = useState(false);

  const handleSearchSelect = (foundUser) => {
    setActiveServerId('home');
    const fakeDialog = {
      id: 'temp_' + foundUser.id,
      peer: foundUser,
      messages: []
    };
    setActiveChat(fakeDialog);
  };

  const handleChannelSelect = (channel) => {
    // Treat channel like a chat object but with special type
    setActiveChat({
      id: `channel_${channel.id}`,
      type: 'channel',
      channel_id: channel.id,
      group_id: activeServerId,
      peer: { display_name: channel.name, id: `channel_${channel.id}` }, // Mock peer for header
      name: channel.name,
      messages: []
    });
  };

  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [viewingMedia, setViewingMedia] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);

  const handleContactSelect = (selection) => {
    if (!selection) {
      console.warn("DEBUG: handleContactSelect called with null selection");
      return;
    }

    if (activeServerId !== 'home') setActiveServerId('home'); // Switch to home

    let targetDialog = selection.peer ? selection : {
      id: 'temp_' + selection.id,
      peer: selection,
      messages: []
    };

    if (forwardingMessage) {
      setForwardingMessage(null);
    } else {
      setActiveChat(targetDialog);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden glass-panel max-w-[1600px] mx-auto border-x border-white/10 shadow-2xl relative">
      {showSettings && <Settings user={user} onClose={() => setShowSettings(false)} />}
      {showCreateGroup && <CreateGroupModal onClose={() => setShowCreateGroup(false)} onCreate={(data) => sendMessage({ method: 'groups.create', args: data })} />}
      {showCreateChannel && <CreateChannelModal
        group={showCreateChannel}
        onClose={() => setShowCreateChannel(null)}
        onCreate={(data) => sendMessage({ method: 'groups.channels.create', args: { group_id: data.group, name: data.name, type: data.type } })}
      />}

      {showGroupSettings && (
        <GroupSettingsModal
          groupId={showGroupSettings}
          user={user}
          contacts={contacts}
          dialogs={dialogs}
          onClose={() => setShowGroupSettings(null)}
          onOpenProfile={(id) => setViewingProfileId(id)}
        />
      )}

      {viewingProfileId && (
        <ContactProfile
          userId={viewingProfileId}
          onClose={() => setViewingProfileId(null)}
          onOpenMedia={(url) => setViewingMedia({ type: 'photo', src: url })}
          onSendMessage={(p) => {
            handleContactSelect(p);
            setViewingProfileId(null);
            setShowGroupSettings(null);
          }}
        />
      )}

      {groupCallActive && (
        <GroupCallModal
          active={groupCallActive}
          group={activeGroupCall}
          localStream={localStream}
          remoteStreams={groupRemoteStreams}
          participants={groupParticipants}
          onLeave={leaveGroupCall}
          isMicOn={isMicOn}
          isCamOn={isCamOn}
          toggleMic={toggleGroupMic}
          toggleCam={toggleGroupCam}
        />
      )}

      {viewingMedia && (
        <MediaViewer
          src={viewingMedia.src}
          type={viewingMedia.type}
          onClose={() => setViewingMedia(null)}
        />
      )}

      <Sidebar
        user={user}
        activeChat={activeChat}
        setActiveChat={handleContactSelect}
        onOpenSettings={() => setShowSettings(true)}
        servers={servers}
        onSelectGroup={(server) => {
          const mainChannel = server.channels?.find(c => c.type === 'text') || server.channels?.[0];
          if (mainChannel) {
            setActiveChat({
              id: `channel_${mainChannel.id}`,
              type: 'channel',
              group_id: server.id,
              channel_id: mainChannel.id,
              name: server.name,
              avatar_url: server.avatar_url,
              peer: {
                id: `group_${server.id}`,
                display_name: server.name,
                avatar_url: server.avatar_url,
                is_online: true
              }
            });
          }
        }}
        onCreateGroup={() => setShowCreateGroup(true)}
        activeCallsInGroups={activeCallsInGroups}
      />

      <ChatArea
        activeChat={activeChat}
        onOpenGroupSettings={(gid) => setShowGroupSettings(gid)}
        dialogs={dialogs}
        contacts={contacts}
        user={user}
        onOpenProfile={() => activeChat && activeChat.type !== 'channel' && activeChat.type !== 'group' && setViewingProfileId(activeChat.peer.id)}
        onOpenUserIdProfile={(id) => setViewingProfileId(id)}
        onStartCall={onStartCall}
        onStartGroupCall={startGroupCall}
        onJoinGroupCall={joinGroupCall}
        activeCallsInGroups={activeCallsInGroups}
        onForward={(msg) => setForwardingMessage(msg)}
        onOpenForwardedChat={(targetDialog) => setActiveChat(targetDialog)}
        onSelectChannel={handleChannelSelect}
        onCreateChannel={(gid) => setShowCreateChannel(gid)}
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

  // Group Call State
  const [groupCallActive, setGroupCallActive] = useState(false);
  const [activeGroupCall, setActiveGroupCall] = useState(null); // {id, name, avatar_url}
  const [groupParticipants, setGroupParticipants] = useState([]);
  const [groupRemoteStreams, setGroupRemoteStreams] = useState({}); // {userId: stream }
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const groupPeerConnections = useRef({}); // {userId: pc }
  const [activeCallsInGroups, setActiveCallsInGroups] = useState({}); // {groupId: true }

  // Ringtone (Blob-based for background playback)
  const ringtoneAudioRef = useRef(null);
  const chimeAudioRef = useRef(null);

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

    // Generate Chime (Short beep)
    const chimeDuration = 0.5;
    const chimeFrames = sampleRate * chimeDuration;
    const chimeBuffer = new ArrayBuffer(44 + chimeFrames * 2);
    const chimeView = new DataView(chimeBuffer);

    // Copy RIFF/WAVE header and modify sizes
    for (let i = 0; i < 44; i++) chimeView.setUint8(i, view.getUint8(i));
    chimeView.setUint32(4, 36 + chimeFrames * 2, true);
    chimeView.setUint32(40, chimeFrames * 2, true);

    for (let i = 0; i < chimeFrames; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-6 * t) * 0.2;
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      chimeView.setInt16(44 + i * 2, int16, true);
    }
    const chimeBlob = new Blob([chimeView], { type: 'audio/wav' });
    const chimeUrl = URL.createObjectURL(chimeBlob);
    chimeAudioRef.current = new Audio(chimeUrl);

    // Request Notification Permission on mount/interaction
    if (Notification.permission === 'default') {
      document.addEventListener('click', () => {
        if (Notification.permission === 'default') Notification.requestPermission();
      }, { once: true });
    }

    return () => {
      // Intentionally skipping revocation to prevent ERR_FILE_NOT_FOUND during re-renders/HMR
    };
  }, []);

  const playRingtone = () => {
    if (ringtoneAudioRef.current) {
      ringtoneAudioRef.current.currentTime = 0;
      ringtoneAudioRef.current.play().catch(e => console.log("Audio play failed:", e));
    }
  };

  const playChime = () => {
    if (chimeAudioRef.current) {
      chimeAudioRef.current.currentTime = 0;
      chimeAudioRef.current.play().catch(e => console.log("Audio play failed:", e));
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

  const createGroupPeerConnection = async (targetUserId, groupId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendMessage({
          method: 'groups.call.signal',
          args: { group_id: groupId, target_id: targetUserId, data: { candidate: event.candidate } }
        });
      }
    };

    pc.ontrack = (event) => {
      setGroupRemoteStreams(prev => ({
        ...prev,
        [targetUserId]: event.streams[0]
      }));
    };

    groupPeerConnections.current[targetUserId] = pc;
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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Camera/Microphone access requires HTTPS or localhost. Please enable SSL/TLS on your server.");
        setCallStatus('idle');
        setActiveCallPeer(null);
        return;
      }
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
          text: 'Звонок отклонен',
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

    // Cleanup Group Call PCs
    Object.values(groupPeerConnections.current).forEach(pc => pc.close());
    groupPeerConnections.current = {};
    setGroupRemoteStreams({});
    setGroupParticipants([]);
    setGroupCallActive(false);
    setActiveGroupCall(null);

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
    setActiveCallPeer(null);
    iceCandidateQueue.current = [];
    callStartTimeRef.current = null;
  };

  const startGroupCall = async (group) => {
    setActiveGroupCall(group);
    setGroupCallActive(true);
    sendMessage({ method: 'groups.call.start', args: { group_id: group.id } });

    // Auto join after starting
    joinGroupCall(group);
  };

  const joinGroupCall = async (group) => {
    setActiveGroupCall(group);
    setGroupCallActive(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsCamOn(true);
      setIsMicOn(true);
      sendMessage({ method: 'groups.call.join', args: { group_id: group.id } });
    } catch (err) {
      console.error("Error joining group call:", err);
      alert("Could not access camera/mic");
      setGroupCallActive(false);
    }
  };

  const leaveGroupCall = () => {
    console.log("DEBUG: leaveGroupCall called");
    console.log("DEBUG: activeGroupCall:", activeGroupCall);
    if (activeGroupCall) {
      console.log("DEBUG: Sending groups.call.leave message for group", activeGroupCall.id);
      sendMessage({ method: 'groups.call.leave', args: { group_id: activeGroupCall.id } });
    }

    console.log("DEBUG: Immediately closing modal and cleaning up");
    // Immediately close modal and cleanup for current user
    setGroupCallActive(false);
    setActiveGroupCall(null);
    cleanupCall();
  };

  const toggleGroupMic = () => {
    if (localStreamRef.current) {
      const enabled = !isMicOn;
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = enabled);
      setIsMicOn(enabled);
    }
  };

  const toggleGroupCam = () => {
    if (localStreamRef.current) {
      const enabled = !isCamOn;
      localStreamRef.current.getVideoTracks().forEach(t => t.enabled = enabled);
      setIsCamOn(enabled);
    }
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
      } else if (msg.type === 'groups.list_result') {
        const activeCalls = {};
        msg.groups.forEach(g => {
          if (g.has_active_call) activeCalls[g.id] = true;
        });
        setActiveCallsInGroups(activeCalls);
      } else if (msg.type === 'groups.call.started') {
        setActiveCallsInGroups(prev => ({ ...prev, [msg.group_id]: true }));
        if (msg.started_by !== user.id) {
          playChime();
          if (Notification.permission === "granted") {
            new Notification("Active Group Call", {
              body: "A video call has started in one of your groups.",
              icon: "/logo.png"
            });
          }
        }
      } else if (msg.type === 'groups.call.ended') {
        setActiveCallsInGroups(prev => {
          const next = { ...prev };
          delete next[msg.group_id];
          return next;
        });
      } else if (msg.type === 'groups.call.member_joined') {
        setGroupParticipants(prev => {
          if (prev.find(p => p.id === msg.user.id)) return prev;
          return [...prev, msg.user];
        });
      } else if (msg.type === 'groups.call.member_left') {
        console.log("DEBUG: Received groups.call.member_left", msg);
        console.log("DEBUG: Current user ID:", user.id);
        console.log("DEBUG: Leaving user ID:", msg.user_id);
        console.log("DEBUG: Current groupCallActive:", groupCallActive);

        // Check if the leaving user is the current user
        if (msg.user_id === user.id) {
          console.log("DEBUG: Current user is leaving");
          // Current user left - only cleanup if we haven't already
          // (leaveGroupCall already did the cleanup)
          if (groupCallActive) {
            console.log("DEBUG: Cleaning up for current user");
            setGroupCallActive(false);
            setActiveGroupCall(null);
            cleanupCall();
          } else {
            console.log("DEBUG: Already cleaned up, skipping");
          }
        } else {
          console.log("DEBUG: Another user is leaving, removing from participants");
          // Another user left - remove from participants
          setGroupParticipants(prev => {
            console.log("DEBUG: Current participants before filter:", prev);
            const filtered = prev.filter(p => p.id !== msg.user_id);
            console.log("DEBUG: Participants after filter:", filtered);
            return filtered;
          });
          setGroupRemoteStreams(prev => {
            const next = { ...prev };
            delete next[msg.user_id];
            return next;
          });
          if (groupPeerConnections.current[msg.user_id]) {
            groupPeerConnections.current[msg.user_id].close();
            delete groupPeerConnections.current[msg.user_id];
          }
        }
      } else if (msg.type === 'groups.call.join_result') {
        setGroupParticipants(msg.participants);
        (async () => {
          for (const p of msg.participants) {
            const pc = await createGroupPeerConnection(p.id, msg.group_id);
            localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendMessage({
              method: 'groups.call.signal',
              args: { group_id: msg.group_id, target_id: p.id, data: { sdp: offer } }
            });
          }
        })();
      } else if (msg.type === 'groups.call.signal') {
        const { sender_id, data, group_id } = msg;
        (async () => {
          let pc = groupPeerConnections.current[sender_id];
          if (data.sdp) {
            if (data.sdp.type === 'offer') {
              if (!pc) pc = await createGroupPeerConnection(sender_id, group_id);
              localStreamRef.current?.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendMessage({
                method: 'groups.call.signal',
                args: { group_id, target_id: sender_id, data: { sdp: answer } }
              });
            } else if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            }
          } else if (data.candidate && pc) {
            try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { }
          }
        })();
      }
    });
  }, [messages, isResuming]); // callStatus ref dependency handled via closure or checks

  if (status !== 'connected' || isResuming) {
    return <div className="h-screen flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2" /> {isResuming ? 'Resuming Session...' : 'Connecting...'}</div>;
  }

  if (authStep === 'main' && user) {
    return (
      <>
        <MainLayout
          user={user}
          onStartCall={startCall}
          groupCallActive={groupCallActive}
          activeGroupCall={activeGroupCall}
          groupParticipants={groupParticipants}
          groupRemoteStreams={groupRemoteStreams}
          activeCallsInGroups={activeCallsInGroups}
          startGroupCall={startGroupCall}
          joinGroupCall={joinGroupCall}
          leaveGroupCall={leaveGroupCall}
          toggleGroupMic={toggleGroupMic}
          toggleGroupCam={toggleGroupCam}
          isMicOn={isMicOn}
          isCamOn={isCamOn}
          localStream={localStream}
        />
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
