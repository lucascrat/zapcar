import React, { useRef, useState, useEffect } from 'react';

interface AudioRecorderProps {
  onAudioReady: (blob: Blob, mimeType: string) => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioReady }) => {
  const [status, setStatus] = useState<'idle' | 'recording' | 'locked'>('idle');
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  // Gesture tracking
  const startY = useRef<number>(0);
  const startX = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => setPermissionGranted(true))
      .catch((err) => console.log("Mic permission error", err));

    return () => {
      stopTimer();
    };
  }, []);

  const startTimer = () => {
    startTimeRef.current = Date.now();
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const getSupportedMimeType = () => {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setStatus('recording');
      startTimer();

      if (navigator.vibrate) navigator.vibrate(50);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Erro ao acessar microfone.");
      setStatus('idle');
    }
  };

  const stopRecording = (shouldSend: boolean) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // We attach a one-time listener to onstop to handle the final blob
      mediaRecorderRef.current.onstop = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());

        if (shouldSend && chunksRef.current.length > 0) {
          const type = getSupportedMimeType() || 'audio/webm';
          const blob = new Blob(chunksRef.current, { type });
          onAudioReady(blob, type);
        }
      };
      mediaRecorderRef.current.stop();
    }
    stopTimer();
    setStatus('idle');
    setDragOffset({ x: 0, y: 0 });
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Override onstop to do nothing (or just don't set the specific listener above)
      mediaRecorderRef.current.onstop = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
    }
    stopTimer();
    setStatus('idle');
    setDragOffset({ x: 0, y: 0 });
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  };

  // --- Gesture Handlers ---

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    startX.current = e.clientX;
    startRecording();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (status !== 'recording') return;
    e.preventDefault();

    const deltaY = e.clientY - startY.current;
    const deltaX = e.clientX - startX.current;

    setDragOffset({ x: deltaX, y: deltaY });

    // Lock Threshold (Swipe Up)
    if (deltaY < -50) {
      setStatus('locked');
      setDragOffset({ x: 0, y: 0 });
      if (navigator.vibrate) navigator.vibrate(100);
    }

    // Cancel Threshold (Swipe Left)
    if (deltaX < -100) {
      cancelRecording();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (status === 'recording') {
      stopRecording(true);
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- Render ---

  if (status === 'locked') {
    return (
      <div className="absolute inset-0 bg-whatsapp-panel flex items-center px-4 z-20 animate-fade-in">
        <button
          onClick={cancelRecording}
          className="p-3 text-red-500 hover:bg-red-500/10 rounded-full transition mr-auto"
        >
          <span className="material-icons text-2xl">delete</span>
        </button>

        <div className="flex items-center gap-2 text-gray-300 font-mono text-base absolute left-1/2 transform -translate-x-1/2">
          <span className="material-icons text-red-500 text-xs animate-pulse">fiber_manual_record</span>
          {formatDuration(duration)}
        </div>

        {/* Send Button - Positioned exactly where the Mic button was */}
        <button
          onClick={() => stopRecording(true)}
          className="w-12 h-12 rounded-full bg-whatsapp-green text-white shadow-lg hover:bg-emerald-600 transition animate-bounce-in flex items-center justify-center absolute right-1 bottom-1" // Adjusted to match idle position roughly (parent has padding)
        >
          <span className="material-icons text-white text-xl">send</span>
        </button>
      </div>
    );
  }

  if (status === 'recording') {
    return (
      <>
        {/* Overlay for "Slide to Cancel" - Absolute over the input area */}
        <div className="absolute inset-0 bg-whatsapp-panel flex items-center justify-end pr-20 pl-4 z-20 pointer-events-none overflow-hidden">
          <div className="flex items-center gap-2 text-gray-400 animate-pulse mr-auto">
            <span className="material-icons text-red-500 text-xs">fiber_manual_record</span>
            <span className="font-mono">{formatDuration(duration)}</span>
          </div>

          <div className="flex items-center gap-1 text-gray-500 text-sm opacity-80 transform transition-transform" style={{ transform: `translateX(${dragOffset.x}px)` }}>
            <span className="material-icons text-sm">chevron_left</span>
            <span>Deslize para cancelar</span>
          </div>
        </div>

        {/* Lock Indicator (Floating above) */}
        <div className="absolute bottom-24 right-6 flex flex-col items-center gap-2 z-30 pointer-events-none transition-opacity duration-300" style={{ opacity: Math.abs(dragOffset.y) > 30 ? 1 : 0 }}>
          <div className={`bg-gray-800/80 p-3 rounded-full backdrop-blur-sm mb-2 ${Math.abs(dragOffset.y) > 50 ? 'scale-125 bg-whatsapp-green' : 'animate-bounce'}`}>
            <span className="material-icons text-white">lock_open</span>
          </div>
          <span className="text-white text-xs shadow-black drop-shadow-md">Solte para travar</span>
        </div>

        {/* The Button (Being Held) */}
        <button
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-12 h-12 rounded-full bg-whatsapp-green text-white shadow-lg scale-150 transition-transform z-30 absolute right-4 bottom-3 touch-none flex items-center justify-center"
          style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.5)` }}
        >
          <span className="material-icons text-xl animate-pulse">mic</span>
        </button>
      </>
    );
  }

  // Idle State - WhatsApp Style Floating Button
  return (
    <button
      onPointerDown={handlePointerDown}
      className="w-12 h-12 rounded-full bg-whatsapp-green text-white hover:bg-emerald-600 transition-all shadow-md flex items-center justify-center z-10 shrink-0"
      title="Segure para gravar"
    >
      <span className="material-icons text-xl">mic</span>
    </button>
  );
};
