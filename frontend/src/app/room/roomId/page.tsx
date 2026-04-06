// frontend/src/app/room/[roomId]/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Mic, MicOff, Video, VideoOff, Phone, Users,
  Clock, Shield, Volume2, VolumeX, Crown, Timer,
  Play, Pause, RotateCcw, BookOpen, MessageSquare,
} from 'lucide-react';
import { getSocket, disconnectSocket } from '../../../lib/socket';
import { useWebRTC } from '../../../hooks/useWebRTC';
import { useStudyTimer } from '../../../hooks/useStudyTimer';
import Cookies from 'js-cookie';

// ── Types ─────────────────────────────────────────────────────────
interface Participant {
  socketId: string;
  userId: string;
  name: string;
  avatar?: string;
  isCaptain: boolean;
}

interface KickVoteUpdate {
  targetSocketId: string;
  targetName: string;
  currentVotes: number;
  requiredVotes: number;
  initiatedBy: string;
  voterName: string;
}

// ── Main Component ────────────────────────────────────────────────
export default function MeetingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  // ── Refs ─────────────────────────────────────────────────────
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  // ── State ────────────────────────────────────────────────────
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [studyMode, setStudyMode] = useState<'discussion' | 'silent'>('discussion');
  const [mySocketId, setMySocketId] = useState('');
  const [kickVotes, setKickVotes] = useState<Map<string, KickVoteUpdate>>(new Map());
  const [isConnecting, setIsConnecting] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'participants' | 'timer'>('participants');
  const [meetingInfo, setMeetingInfo] = useState<{ title: string; subject: string } | null>(null);

  // ── WebRTC & Timer Hooks ─────────────────────────────────────
  const { peers, initiateOffer, removePeer } = useWebRTC({
    socket: socketRef.current,
    roomId,
    localStream,
  });

  const { timer, startTimer, pauseTimer, resetTimer, formatTime } = useStudyTimer(
    socketRef.current,
    roomId,
    isCaptain
  );

  // ── 1. Get local media stream ────────────────────────────────
  const initLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      // Graceful degradation — try audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioStream);
        setIsCamOn(false);
        toast('Camera not available. Joining with audio only.', { icon: '📷' });
        return audioStream;
      } catch {
        toast.error('Could not access camera or microphone.');
        return null;
      }
    }
  };

  // ── 2. Connect to socket and join room ───────────────────────
  const connectAndJoin = useCallback(async (stream: MediaStream) => {
    const token = Cookies.get('accessToken');
    if (!token) {
      router.push('/login');
      return;
    }

    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setMySocketId(socket.id ?? '');

      // Join the room via socket
      socket.emit(
        'join-room',
        { roomId },
        (response: {
          error?: string;
          success?: boolean;
          participants?: Participant[];
          studyMode?: 'discussion' | 'silent';
          timer?: { isRunning: boolean; remaining: number; phase: 'focus' | 'break' };
          isCaptain?: boolean;
        }) => {
          setIsConnecting(false);

          if (response.error) {
            toast.error(response.error);
            router.push('/dashboard');
            return;
          }

          setParticipants(response.participants ?? []);
          setStudyMode(response.studyMode ?? 'discussion');
          setIsCaptain(response.isCaptain ?? false);

          // ─── Initiate WebRTC with all existing participants ───
          // Each existing participant will receive our offer
          response.participants?.forEach((participant) => {
            if (participant.socketId !== socket.id) {
              initiateOffer(participant.socketId, participant.name, participant.avatar);
            }
          });
        }
      );
    });

    // ─── Room participant events ──────────────────────────────
    socket.on('user-joined', (participant: Participant) => {
      setParticipants((prev) => [...prev, participant]);
      toast(`${participant.name} joined`, { icon: '👋', duration: 2000 });
      // New joiners will send us an offer — we don't initiate here
    });

    socket.on('user-left', ({ socketId, name }: { socketId: string; name: string }) => {
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      removePeer(socketId);
      toast(`${name} left`, { icon: '🚪', duration: 2000 });
    });

    // ─── Study mode change ────────────────────────────────────
    socket.on('study-mode:changed', ({ mode }: { mode: 'silent' | 'discussion' }) => {
      setStudyMode(mode);
      toast(
        mode === 'silent' ? '🔇 Silent Study Mode activated' : '💬 Discussion Mode activated',
        { duration: 3000 }
      );
    });

    // ─── Kick vote events ─────────────────────────────────────
    socket.on('kick:vote-update', (update: KickVoteUpdate) => {
      setKickVotes((prev) => {
        const map = new Map(prev);
        map.set(update.targetSocketId, update);
        return map;
      });
      toast(
        `Vote to remove ${update.targetName}: ${update.currentVotes}/${update.requiredVotes}`,
        { icon: '🗳️', duration: 4000 }
      );
    });

    socket.on('kick:user-kicked', ({ socketId, name }: { socketId: string; name: string }) => {
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      removePeer(socketId);
      setKickVotes((prev) => {
        const map = new Map(prev);
        map.delete(socketId);
        return map;
      });
      toast.error(`${name} was removed from the room.`);
    });

    socket.on('kick:you-were-kicked', ({ reason }: { reason: string }) => {
      toast.error(`You were removed: ${reason}`);
      setTimeout(() => router.push('/dashboard'), 2000);
    });

    socket.on('kick:vote-expired', ({ targetName }: { targetName: string }) => {
      toast(`Vote to remove ${targetName} expired.`, { icon: '⏰' });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      toast.error('Connection error. Retrying...');
    });
  }, [roomId, router, initiateOffer, removePeer]);

  // ── Initialization effect ────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      const stream = await initLocalMedia();
      if (stream && mounted) {
        await connectAndJoin(stream);
      }
    })();

    return () => {
      mounted = false;
      // Cleanup: stop local tracks and disconnect
      localStream?.getTracks().forEach((track) => track.stop());
      disconnectSocket();
    };
  }, []); // eslint-disable-line

  // ── Media Controls ───────────────────────────────────────────
  const toggleCamera = () => {
    const videoTrack = localStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsCamOn(videoTrack.enabled);
    }
  };

  const toggleMic = () => {
    const audioTrack = localStream?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  };

  const leaveRoom = () => {
    localStream?.getTracks().forEach((t) => t.stop());
    disconnectSocket();
    router.push('/dashboard');
  };

  // ── Study mode toggle (captain only) ─────────────────────────
  const handleStudyModeChange = (mode: 'silent' | 'discussion') => {
    socketRef.current?.emit('study-mode:change', { roomId, mode });
  };

  // ── Vote to kick ─────────────────────────────────────────────
  const initiateKick = (targetSocketId: string) => {
    if (targetSocketId === mySocketId) return;
    socketRef.current?.emit('kick:initiate', { roomId, targetSocketId });
    toast('Vote submitted.', { icon: '🗳️' });
  };

  // ── Timer progress percentage ────────────────────────────────
  const timerProgress = ((25 * 60 - timer.remaining) / (25 * 60)) * 100;
  const circumference = 2 * Math.PI * 54; // r=54

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  if (isConnecting) {
    return (
      <div className="min-h-screen bg-[#0d0d14] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 font-mono text-sm tracking-widest">CONNECTING TO ROOM…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d14] flex flex-col text-white font-['DM_Sans',_sans-serif]">

      {/* ── Top Bar ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#12121e]">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${studyMode === 'silent' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          <span className="text-sm font-medium text-white/80">
            {studyMode === 'silent' ? '🔇 Silent Study' : '💬 Discussion'} Mode
          </span>
          {isCaptain && (
            <span className="ml-2 flex items-center gap-1 bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full text-xs font-semibold">
              <Crown size={10} /> Captain
            </span>
          )}
        </div>

        <div className="text-xs font-mono text-white/40 tracking-widest">
          ROOM · {roomId.slice(0, 8).toUpperCase()}
        </div>

        <div className="flex items-center gap-2 text-white/50 text-sm">
          <Users size={14} />
          <span>{participants.length + 1} participants</span>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Video Grid ───────────────────────────────────── */}
        <main className="flex-1 p-4 overflow-auto">
          <div className={`grid gap-3 h-full ${
            peers.size === 0 ? 'grid-cols-1' :
            peers.size === 1 ? 'grid-cols-2' :
            peers.size <= 3 ? 'grid-cols-2' :
            'grid-cols-3'
          }`}>

            {/* Local Video */}
            <div className="relative rounded-2xl overflow-hidden bg-[#1a1a2e] border border-white/10 group aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted  // Always mute local (avoid echo)
                className={`w-full h-full object-cover ${!isCamOn ? 'hidden' : ''}`}
              />
              {!isCamOn && (
                <div className="w-full h-full flex items-center justify-center bg-[#1a1a2e]">
                  <div className="w-20 h-20 rounded-full bg-indigo-600/30 flex items-center justify-center text-3xl">
                    {/* User initials */}
                    <span className="font-bold text-indigo-300">ME</span>
                  </div>
                </div>
              )}
              {/* Name tag */}
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded-lg text-xs">
                <span className="text-white/90">You</span>
                {!isMicOn && <MicOff size={10} className="text-red-400" />}
                {isCaptain && <Crown size={10} className="text-amber-400" />}
              </div>
              {studyMode === 'silent' && (
                <div className="absolute top-3 right-3 bg-amber-500/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold text-black">
                  SILENT
                </div>
              )}
            </div>

            {/* Remote Peers */}
            {Array.from(peers.entries()).map(([socketId, peer]) => (
              <div
                key={socketId}
                className="relative rounded-2xl overflow-hidden bg-[#1a1a2e] border border-white/10 aspect-video group"
              >
                {peer.stream ? (
                  <video
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el && peer.stream) el.srcObject = peer.stream;
                    }}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-purple-600/30 flex items-center justify-center">
                      <span className="text-2xl font-bold text-purple-300">
                        {peer.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Name tag */}
                <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-1 rounded-lg text-xs">
                  <span className="text-white/90">{peer.name}</span>
                </div>

                {/* Kick button (hover, non-captain only) */}
                {!participants.find((p) => p.socketId === socketId)?.isCaptain && (
                  <button
                    onClick={() => initiateKick(socketId)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity
                               bg-red-600/80 hover:bg-red-600 backdrop-blur px-2 py-1 rounded text-[10px]
                               font-semibold text-white flex items-center gap-1"
                  >
                    <Shield size={10} /> Vote Kick
                  </button>
                )}

                {/* Active kick vote overlay */}
                {kickVotes.has(socketId) && (() => {
                  const vote = kickVotes.get(socketId)!;
                  return (
                    <div className="absolute inset-0 bg-red-900/50 backdrop-blur-sm flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-red-300 font-bold text-sm">VOTE IN PROGRESS</div>
                        <div className="text-white/70 text-xs mt-1">
                          {vote.currentVotes}/{vote.requiredVotes} votes
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </main>

        {/* ── Right Sidebar ─────────────────────────────────── */}
        <aside className="w-72 bg-[#12121e] border-l border-white/10 flex flex-col">

          {/* Sidebar Tabs */}
          <div className="flex border-b border-white/10">
            {(['participants', 'timer'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-3 text-xs font-semibold tracking-wider uppercase transition-colors flex items-center justify-center gap-1.5
                  ${sidebarTab === tab
                    ? 'text-indigo-400 border-b-2 border-indigo-500'
                    : 'text-white/40 hover:text-white/70'
                  }`}
              >
                {tab === 'participants' ? <><Users size={12} /> People</> : <><Clock size={12} /> Timer</>}
              </button>
            ))}
          </div>

          {/* Participants Tab */}
          {sidebarTab === 'participants' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">

              {/* Study Mode Controls (Captain) */}
              {isCaptain && (
                <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-xs text-white/50 font-semibold mb-2 uppercase tracking-wider">Study Mode</p>
                  <div className="flex gap-2">
                    {(['silent', 'discussion'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => handleStudyModeChange(mode)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all
                          ${studyMode === mode
                            ? mode === 'silent'
                              ? 'bg-amber-500 text-black'
                              : 'bg-emerald-500 text-black'
                            : 'bg-white/10 text-white/60 hover:bg-white/20'
                          }`}
                      >
                        {mode === 'silent' ? <><VolumeX size={10} className="inline mr-1" />Silent</> : <><Volume2 size={10} className="inline mr-1" />Discuss</>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Local user */}
              <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                  ME
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">You</p>
                  {isCaptain && <p className="text-[10px] text-amber-400 flex items-center gap-1"><Crown size={8} /> Captain</p>}
                </div>
                <div className="flex gap-1">
                  {!isMicOn && <MicOff size={12} className="text-red-400" />}
                  {!isCamOn && <VideoOff size={12} className="text-red-400" />}
                </div>
              </div>

              {/* Remote participants */}
              {participants
                .filter((p) => p.socketId !== mySocketId)
                .map((p) => (
                <div key={p.socketId} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/5 transition-colors group">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{p.name}</p>
                    {p.isCaptain && <p className="text-[10px] text-amber-400 flex items-center gap-1"><Crown size={8} /> Captain</p>}
                  </div>
                  {!p.isCaptain && (
                    <button
                      onClick={() => initiateKick(p.socketId)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-400
                                 hover:text-red-300 font-semibold px-1.5 py-0.5 rounded border border-red-500/30 hover:border-red-400/50"
                    >
                      Kick
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Timer Tab */}
          {sidebarTab === 'timer' && (
            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-6">

              {/* Phase indicator */}
              <div className={`px-3 py-1 rounded-full text-xs font-bold tracking-widest
                ${timer.phase === 'focus' ? 'bg-indigo-600/30 text-indigo-300' : 'bg-emerald-600/30 text-emerald-300'}`}>
                {timer.phase === 'focus' ? '🎯 FOCUS TIME' : '☕ BREAK TIME'}
              </div>

              {/* SVG Circular Timer */}
              <div className="relative w-40 h-40">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  {/* Track */}
                  <circle
                    cx="60" cy="60" r="54"
                    fill="none"
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="8"
                  />
                  {/* Progress */}
                  <circle
                    cx="60" cy="60" r="54"
                    fill="none"
                    stroke={timer.phase === 'focus' ? '#6366F1' : '#10B981'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - timerProgress / 100)}
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-mono font-bold text-white">
                    {formatTime(timer.remaining)}
                  </span>
                  <span className="text-[10px] text-white/40 uppercase tracking-widest mt-1">
                    {timer.isRunning ? 'Running' : 'Paused'}
                  </span>
                </div>
              </div>

              {/* Captain Timer Controls */}
              {isCaptain ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => timer.isRunning ? pauseTimer() : startTimer()}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                      ${timer.isRunning
                        ? 'bg-amber-500 hover:bg-amber-400 text-black'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                  >
                    {timer.isRunning ? <><Pause size={14} />Pause</> : <><Play size={14} />Start</>}
                  </button>
                  <button
                    onClick={resetTimer}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm bg-white/10 hover:bg-white/20 text-white/70 transition-all"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              ) : (
                <p className="text-xs text-white/30 italic text-center">
                  Only the captain can control the timer.
                </p>
              )}

              {/* Quick duration buttons (captain only) */}
              {isCaptain && !timer.isRunning && (
                <div className="w-full">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2 text-center">Quick Set</p>
                  <div className="flex gap-2">
                    {[15, 25, 45].map((min) => (
                      <button
                        key={min}
                        onClick={() => startTimer(min * 60)}
                        className="flex-1 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-indigo-600/40 text-white/60 hover:text-white transition-all"
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* ── Bottom Control Bar ─────────────────────────────────── */}
      <footer className="bg-[#12121e] border-t border-white/10 px-6 py-4">
        <div className="flex items-center justify-center gap-3 max-w-lg mx-auto">

          {/* Mic toggle */}
          <button
            onClick={toggleMic}
            title={isMicOn ? 'Mute' : 'Unmute'}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all text-sm
              ${isMicOn
                ? 'bg-white/10 hover:bg-white/20 text-white'
                : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 ring-1 ring-red-500/50'
              }`}
          >
            {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>

          {/* Camera toggle */}
          <button
            onClick={toggleCamera}
            title={isCamOn ? 'Turn off camera' : 'Turn on camera'}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all
              ${isCamOn
                ? 'bg-white/10 hover:bg-white/20 text-white'
                : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 ring-1 ring-red-500/50'
              }`}
          >
            {isCamOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>

          {/* Leave button */}
          <button
            onClick={leaveRoom}
            className="w-14 h-12 rounded-2xl bg-red-600 hover:bg-red-500 flex items-center justify-center
                       transition-all shadow-lg shadow-red-900/30 active:scale-95"
          >
            <Phone size={18} className="rotate-[135deg] text-white" />
          </button>

          {/* Participants sidebar toggle */}
          <button
            onClick={() => setSidebarTab('participants')}
            className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all text-white/80"
          >
            <Users size={18} />
          </button>

          {/* Timer sidebar toggle */}
          <button
            onClick={() => setSidebarTab('timer')}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all
              ${timer.isRunning
                ? 'bg-indigo-600/40 text-indigo-300 ring-1 ring-indigo-500/50 animate-pulse'
                : 'bg-white/10 hover:bg-white/20 text-white/80'
              }`}
          >
            <Timer size={18} />
          </button>
        </div>
      </footer>
    </div>
  );
}