
import React, { useRef, useState, useEffect } from 'react';

interface AudioRecorderProps {
  onAudioReady: (blob: Blob, mimeType: string) => void;
  isRecording: boolean;
  setIsRecording: (val: boolean) => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioReady, isRecording, setIsRecording }) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);

  // Solicita permissão ao montar (opcional, ou na primeira interação)
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => setPermissionGranted(true))
      .catch((err) => {
          console.log("Mic permission not yet granted or denied", err);
      });
  }, []);

  // Detect supported mime type
  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus', 
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const type = mimeType || 'audio/webm';
        if (chunksRef.current.length > 0) {
            const blob = new Blob(chunksRef.current, { type });
            // Pequeno delay para garantir que o usuário realmente quis enviar
            onAudioReady(blob, type);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Feedback vibração
      if (navigator.vibrate) navigator.vibrate(50);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Erro ao acessar microfone. Verifique as permissões.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
       // Feedback vibração
      if (navigator.vibrate) navigator.vibrate(50);
    }
  };

  // Event Handlers for Hold-to-Record
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault(); // Prevents selection/scrolling
    startRecording();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    stopRecording();
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
     // If user slides finger away, cancel? For now, we just send.
     if (isRecording) stopRecording();
  };

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      className={`p-3 rounded-full transition-all duration-200 select-none touch-none flex items-center justify-center shadow-md ${
        isRecording 
          ? 'bg-red-500 scale-125 text-white ring-4 ring-red-200' 
          : 'bg-whatsapp-green text-white hover:bg-emerald-600'
      }`}
      title="Segure para gravar"
      style={{ minWidth: '44px', minHeight: '44px' }}
    >
      <span className={`material-icons text-xl ${isRecording ? 'animate-pulse' : ''}`}>
        mic
      </span>
    </button>
  );
};
