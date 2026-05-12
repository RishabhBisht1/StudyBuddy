import { useRef, useState, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface Peer {
  connection: RTCPeerConnection;
  stream: MediaStream | null;
  name: string;
  avatar?: string;
}

interface UseWebRTCOptions {
  socketRef: React.MutableRefObject<Socket | null>;
  roomId: string;
  localStream: MediaStream | null;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add TURN servers here for production:
    // { urls: 'turn:your.turn.server', username: '...', credential: '...' }
  ],
};

export const useWebRTC = ({ socketRef, roomId, localStream }: UseWebRTCOptions) => {
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const peersRef = useRef<Map<string, Peer>>(new Map());

  // Use refs to avoid stale closures in callbacks
  const streamRef = useRef(localStream);

  useEffect(() => {
    streamRef.current = localStream;
  }, [localStream]);

  const updatePeers = (updater: (map: Map<string, Peer>) => Map<string, Peer>) => {
    peersRef.current = updater(new Map(peersRef.current));
    setPeers(new Map(peersRef.current));
  };

  // ── Create RTCPeerConnection for a new peer ──────────────────
  const createPeerConnection = useCallback(
    (targetSocketId: string, peerName: string, peerAvatar?: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      const currentStream = streamRef.current;
      const currentSocket = socketRef.current;

      // Add local tracks to the connection
      if (currentStream) {
        currentStream.getTracks().forEach((track) => {
          pc.addTrack(track, currentStream);
        });
      }

      // Trickle ICE: send candidates as they're discovered
      pc.onicecandidate = (event) => {
        if (event.candidate && currentSocket) {
          currentSocket.emit('webrtc:ice-candidate', {
            targetSocketId,
            candidate: event.candidate,
          });
        }
      };

      // Handle incoming remote stream
      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        updatePeers((map) => {
          const peer = map.get(targetSocketId);
          if (peer) {
            map.set(targetSocketId, { ...peer, stream: remoteStream });
          }
          return map;
        });
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] ${peerName}: ${pc.connectionState}`);
        if (pc.connectionState === 'failed') {
          pc.restartIce();
        }
      };

      // Store the connection
      updatePeers((map) => {
        map.set(targetSocketId, { connection: pc, stream: null, name: peerName, avatar: peerAvatar });
        return map;
      });

      return pc;
    },
    []
  );

  // ── Initiate connection to an existing participant ───────────
  const initiateOffer = useCallback(
    async (targetSocketId: string, peerName: string, peerAvatar?: string) => {
      const currentSocket = socketRef.current;
      const currentStream = streamRef.current;
      if (!currentSocket || !currentStream) return;

      const pc = createPeerConnection(targetSocketId, peerName, peerAvatar);

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);

        currentSocket.emit('webrtc:offer', { targetSocketId, offer });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    },
    [createPeerConnection]
  );

  // ── Handle incoming offer ────────────────────────────────────
  const handleIncomingOffer = useCallback(
    async ({ fromSocketId, fromUser, offer }: {
      fromSocketId: string;
      fromUser: { name: string; avatar?: string };
      offer: RTCSessionDescriptionInit;
    }) => {
      const currentSocket = socketRef.current;
      const currentStream = streamRef.current;
      if (!currentSocket || !currentStream) return;

      const pc = createPeerConnection(fromSocketId, fromUser.name, fromUser.avatar);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        currentSocket.emit('webrtc:answer', { targetSocketId: fromSocketId, answer });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    },
    [createPeerConnection]
  );

  // ── Handle incoming answer ───────────────────────────────────
  const handleIncomingAnswer = useCallback(
    async ({ fromSocketId, answer }: {
      fromSocketId: string;
      answer: RTCSessionDescriptionInit;
    }) => {
      const peer = peersRef.current.get(fromSocketId);
      if (!peer) return;

      try {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Error setting remote description:', err);
      }
    },
    []
  );

  // ── Handle incoming ICE candidate ────────────────────────────
  const handleIceCandidate = useCallback(
    async ({ fromSocketId, candidate }: {
      fromSocketId: string;
      candidate: RTCIceCandidateInit;
    }) => {
      const peer = peersRef.current.get(fromSocketId);
      if (!peer) return;

      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    },
    []
  );

  // ── Remove peer on disconnect ────────────────────────────────
  const removePeer = useCallback((socketId: string) => {
    const peer = peersRef.current.get(socketId);
    if (peer) {
      peer.connection.close();
      updatePeers((map) => {
        map.delete(socketId);
        return map;
      });
    }
  }, []);

  // ── Socket event listeners ───────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('webrtc:offer', handleIncomingOffer);
    socket.on('webrtc:answer', handleIncomingAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('webrtc:offer', handleIncomingOffer);
      socket.off('webrtc:answer', handleIncomingAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
    };
  }, [socketRef.current, handleIncomingOffer, handleIncomingAnswer, handleIceCandidate]);

  return { peers, initiateOffer, removePeer };
};