import React, { useState, useRef } from 'react';

interface AudioRecorderProps {
  onAudioReady: (blob: Blob, mimeType: string) => void;
  isRecording: boolean;
  setIsRecording: (val: boolean) => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ onAudioReady, isRecording, setIsRecording }) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // Detect supported mime type
  const getSupportedMimeType = () => {
    const types = [
      'audio/mp4',             // Safari/iOS preferido
      'audio/webm;codecs=opus', // Chrome/Firefox preferido
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return ''; // Browser default
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
        const blob = new Blob(chunksRef.current, { type });
        onAudioReady(blob, type);
        
        // Parar todos os tracks para liberar o microfone (importante para mobile)
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Erro ao acessar microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      className={`p-2 rounded-full transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'hover:bg-gray-700'}`}
      title={isRecording ? "Parar gravação" : "Gravar áudio"}
    >
      <span className="material-icons text-gray-400 text-xl">
        {isRecording ? 'stop' : 'mic'}
      </span>
    </button>
  );
};