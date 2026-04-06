import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface TimerState {
  remaining: number;
  isRunning: boolean;
  phase: 'focus' | 'break';
}

export const useStudyTimer = (socket: Socket | null, roomId: string, isCaptain: boolean) => {
  const [timer, setTimer] = useState<TimerState>({
    remaining: 25 * 60,
    isRunning: false,
    phase: 'focus',
  });

  // ── Captain controls ─────────────────────────────────────────
  const startTimer = useCallback((duration?: number) => {
    if (!socket || !isCaptain) return;
    socket.emit('timer:start', { roomId, duration: duration || timer.remaining });
  }, [socket, roomId, isCaptain, timer.remaining]);

  const pauseTimer = useCallback(() => {
    if (!socket || !isCaptain) return;
    socket.emit('timer:pause', { roomId });
  }, [socket, roomId, isCaptain]);

  const resetTimer = useCallback(() => {
    if (!socket || !isCaptain) return;
    socket.emit('timer:reset', { roomId });
  }, [socket, roomId, isCaptain]);

  // ── Server-driven timer events ───────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onStarted = ({ remaining, phase }: { remaining: number; phase: 'focus' | 'break' }) => {
      setTimer({ remaining, isRunning: true, phase });
    };

    const onTick = ({ remaining, phase }: { remaining: number; phase: 'focus' | 'break' }) => {
      setTimer((prev) => ({ ...prev, remaining, phase }));
    };

    const onPaused = ({ remaining }: { remaining: number }) => {
      setTimer((prev) => ({ ...prev, remaining, isRunning: false }));
    };

    const onReset = ({ remaining }: { remaining: number }) => {
      setTimer({ remaining, isRunning: false, phase: 'focus' });
    };

    const onEnded = ({ nextPhase, nextDuration }: { nextPhase: 'focus' | 'break'; nextDuration: number }) => {
      setTimer({ remaining: nextDuration, isRunning: false, phase: nextPhase });
    };

    socket.on('timer:started', onStarted);
    socket.on('timer:tick', onTick);
    socket.on('timer:paused', onPaused);
    socket.on('timer:reset', onReset);
    socket.on('timer:ended', onEnded);

    return () => {
      socket.off('timer:started', onStarted);
      socket.off('timer:tick', onTick);
      socket.off('timer:paused', onPaused);
      socket.off('timer:reset', onReset);
      socket.off('timer:ended', onEnded);
    };
  }, [socket]);

  // Formatted time helper
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return { timer, startTimer, pauseTimer, resetTimer, formatTime };
};