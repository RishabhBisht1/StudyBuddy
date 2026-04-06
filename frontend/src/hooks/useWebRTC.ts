import { useRef, useState, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';

interface Peer {
  connection: RTCPeerConnection;
  stream: MediaStream | null;
  name: string;
  avatar?: string;
}

interface UseWebRTCOptions {
  socket: Socket | null;
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

export const useWebRTC = ({ socket, roomId, localStream }: UseWebRTCOptions) => {
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const peersRef = useRef<Map<string, Peer>>(new Map());

  const updatePeers = (updater: (map: Map<string, Peer>) => Map<string, Peer>) => {
    peersRef.current = updater(new Map(peersRef.current));
    setPeers(new Map(peersRef.current));
  };

  // ── Create RTCPeerConnection for a new peer ──────────────────
  const createPeerConnection = useCallback(
    (targetSocketId: string, peerName: string, peerAvatar?: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      // Add local tracks to the connection
      localStream?.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });

      // Trickle ICE: send candidates as they're discovered
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('webrtc:ice-candidate', {
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
    [socket, localStream]
  );

  // ── Initiate connection to an existing participant ───────────
  const initiateOffer = useCallback(
    async (targetSocketId: string, peerName: string, peerAvatar?: string) => {
      if (!socket || !localStream) return;

      const pc = createPeerConnection(targetSocketId, peerName, peerAvatar);

      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await pc.setLocalDescription(offer);

        socket.emit('webrtc:offer', { targetSocketId, offer });
      } catch (err) {
        console.error('Error creating offer:', err);
      }
    },
    [socket, localStream, createPeerConnection]
  );

  // ── Handle incoming offer ────────────────────────────────────
  const handleIncomingOffer = useCallback(
    async ({ fromSocketId, fromUser, offer }: {
      fromSocketId: string;
      fromUser: { name: string; avatar?: string };
      offer: RTCSessionDescriptionInit;
    }) => {
      if (!socket || !localStream) return;

      const pc = createPeerConnection(fromSocketId, fromUser.name, fromUser.avatar);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('webrtc:answer', { targetSocketId: fromSocketId, answer });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    },
    [socket, localStream, createPeerConnection]
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
    if (!socket) return;

    socket.on('webrtc:offer', handleIncomingOffer);
    socket.on('webrtc:answer', handleIncomingAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('webrtc:offer', handleIncomingOffer);
      socket.off('webrtc:answer', handleIncomingAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
    };
  }, [socket, handleIncomingOffer, handleIncomingAnswer, handleIceCandidate]);

  return { peers, initiateOffer, removePeer };
};