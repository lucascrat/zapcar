
import React, { useState, useEffect, useRef } from 'react';
import { Message, UserProfile, UserRole } from '../types';
import { AudioRecorder } from './AudioRecorder';
import { sendMessage, generateUUID, uploadFile, supabase, updateUserLocation } from '../services/supabaseClient';
import { generateSmartReply, analyzeImage } from '../services/geminiService';
import { soundService } from '../services/soundService';
import { Taximeter } from './Taximeter';

interface ChatWindowProps {
  currentUser: UserProfile;
  chatPartner: UserProfile | null;
  messages: Message[];
  onSendMessage: (msg: Message) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ currentUser, chatPartner, messages, onSendMessage }) => {
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // Taximeter State
  const [showTaximeter, setShowTaximeter] = useState(false);

  // WebRTC & Call State
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const signalingChannel = useRef<any>(null);
  const callTimerRef = useRef<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup on unmount (Calls & Ringtones)
  useEffect(() => {
    return () => {
        endCallLogic();
    };
  }, []);

  // Timer logic for connected calls
  useEffect(() => {
    if (callStatus === 'connected') {
        setCallDuration(0);
        callTimerRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
        }, 1000);
    } else {
        if (callTimerRef.current) clearInterval(callTimerRef.current);
        setCallDuration(0);
    }
    return () => {
        if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
  }, [callStatus]);

  const formatDuration = (sec: number) => {
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      return `${min}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- Real-time Signaling for WebRTC ---
  useEffect(() => {
    if (!chatPartner) return;

    // Unique channel for this pair of users
    const channelId = `signaling-${[currentUser.id, chatPartner.id].sort().join('-')}`;
    
    // Cleanup previous channel if exists
    if (signalingChannel.current) {
        supabase.removeChannel(signalingChannel.current);
    }
    
    signalingChannel.current = supabase.channel(channelId);
    
    signalingChannel.current
      .on('broadcast', { event: 'signal' }, async ({ payload }: { payload: any }) => {
        if (payload.target !== currentUser.id) return; // Ignore if not for me

        if (payload.type === 'offer') {
          // Received Incoming Call
          if (callStatus === 'idle') {
            setCallStatus('incoming');
            soundService.playRingtone();
            
            // Setup PeerConnection immediately to be ready
            if (!peerConnection.current) createPeerConnection();
            
            try {
                await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } catch (e) {
                console.warn("Error setting remote desc on offer", e);
            }
          }
        } 
        else if (payload.type === 'answer') {
          // Caller received Answer
          if (callStatus === 'calling') {
            setCallStatus('connected');
            soundService.stopRingtone();
            try {
                await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } catch (e) {
                console.warn("Error setting remote desc on answer", e);
            }
          }
        } 
        else if (payload.type === 'candidate') {
          // Received ICE Candidate
          if (peerConnection.current && peerConnection.current.remoteDescription) {
             try {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
             } catch (e) {
                 console.warn("Error adding ICE candidate", e);
             }
          }
        }
        else if (payload.type === 'hangup') {
          endCallLogic();
        }
      })
      .subscribe();

    return () => {
        if (signalingChannel.current) {
             supabase.removeChannel(signalingChannel.current);
        }
    };
  }, [chatPartner, currentUser.id]);

  // Attach Stream to Audio Element
  useEffect(() => {
      if (remoteAudioRef.current && remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(e => console.error("Error playing remote audio:", e));
      }
  }, [remoteStream]);


  // --- WebRTC Functions ---

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Public STUN server
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && chatPartner) {
        sendSignal({ type: 'candidate', candidate: event.candidate, target: chatPartner.id });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    // Handle connection state changes for debugging/UI
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            endCallLogic();
        }
    };

    peerConnection.current = pc;
    return pc;
  };

  const sendSignal = async (payload: any) => {
    if (signalingChannel.current) {
      await signalingChannel.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: { ...payload, sender: currentUser.id }
      });
    }
  };

  const startCall = async () => {
    if (!chatPartner) return;
    setCallStatus('calling');
    soundService.playRingtone(); // Play outgoing ringtone

    try {
      // Configuração para evitar eco e ruído (Modo Real)
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000
          } 
      });
      localStream.current = stream;
      
      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendSignal({ type: 'offer', sdp: offer, target: chatPartner.id });
    } catch (err) {
      console.error("Error starting call:", err);
      alert("Erro ao acessar microfone. Verifique permissões.");
      endCallLogic();
    }
  };

  const answerCall = async () => {
    if (!chatPartner || !peerConnection.current) return;
    setCallStatus('connected');
    soundService.stopRingtone();

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000
            } 
        });
        localStream.current = stream;
        
        // Add tracks to existing PC
        stream.getTracks().forEach(track => {
            if (peerConnection.current) {
                peerConnection.current.addTrack(track, stream);
            }
        });

        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        sendSignal({ type: 'answer', sdp: answer, target: chatPartner.id });
    } catch (err) {
        console.error("Error answering call:", err);
        endCallLogic();
    }
  };

  const rejectCall = () => {
      if (chatPartner) {
        sendSignal({ type: 'hangup', target: chatPartner.id });
      }
      endCallLogic();
  };

  const endCallLogic = () => {
    setCallStatus('idle');
    setRemoteStream(null);
    soundService.stopRingtone();

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setCallDuration(0);
  };

  const handleEndCall = () => {
      if (chatPartner) {
          sendSignal({ type: 'hangup', target: chatPartner.id });
      }
      endCallLogic();

      // Log the call in chat
      if (chatPartner) {
        const callMsg: Message = {
            id: generateUUID(),
            sender_id: currentUser.id,
            receiver_id: chatPartner.id,
            content: "📞 Chamada encerrada",
            media_type: 'text',
            created_at: new Date().toISOString(),
            is_read: false
        };
        onSendMessage(callMsg);
        sendMessage(callMsg);
      }
  };


  // --- Messaging Functions ---

  const handleSendText = async (textOverride?: string) => {
    const textToSend = textOverride || inputText;
    if (!textToSend.trim() || !chatPartner) return;

    // Background: Update user location if client (Silent Update)
    if (currentUser.role === UserRole.CLIENT) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    updateUserLocation(currentUser.id, pos.coords.latitude, pos.coords.longitude);
                },
                (err) => console.warn("GPS silencioso falhou (permissão negada?)", err),
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    }

    const newMessage: Message = {
      id: generateUUID(),
      sender_id: currentUser.id,
      receiver_id: chatPartner.id,
      content: textToSend,
      media_type: 'text',
      created_at: new Date().toISOString(),
      is_read: false
    };

    onSendMessage(newMessage);
    soundService.playSent(); // Play Sound
    setInputText('');

    try {
      await sendMessage(newMessage);
    } catch (e) {
      console.error("Failed to send message to DB", e);
    }
  };

  const handleRequestLocation = () => {
      handleSendText("📍 Por favor, envie sua localização atual clicando no botão de localização.");
  };

  const handleSendLocation = async () => {
    if (!chatPartner) return;
    setIsGettingLocation(true);

    if (!navigator.geolocation) {
        alert("Geolocalização não suportada pelo seu navegador.");
        setIsGettingLocation(false);
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
        
        // Também atualiza o perfil (garantia dupla)
        updateUserLocation(currentUser.id, latitude, longitude);

        const newMessage: Message = {
            id: generateUUID(),
            sender_id: currentUser.id,
            receiver_id: chatPartner.id,
            content: "📍 Localização Atual",
            media_url: googleMapsUrl,
            media_type: 'location',
            created_at: new Date().toISOString(),
            is_read: false
        };

        onSendMessage(newMessage);
        soundService.playSent();
        await sendMessage(newMessage);
        setIsGettingLocation(false);
    }, (error) => {
        console.error("Erro GPS:", error);
        alert("Não foi possível obter sua localização. Verifique as permissões do navegador.");
        setIsGettingLocation(false);
    }, {
        enableHighAccuracy: true,
        timeout: 10000
    });
  };

  const handleAudioReady = async (audioBlob: Blob, mimeType: string) => {
    if (!chatPartner) return;
    setIsUploading(true);
    
    // Determine extension from mimeType sent by AudioRecorder
    let ext = 'webm';
    if (mimeType.includes('mp4')) ext = 'mp4';
    if (mimeType.includes('ogg')) ext = 'ogg';
    if (mimeType.includes('wav')) ext = 'wav';

    // Upload to Supabase Storage
    const publicUrl = await uploadFile(audioBlob, 'audio', ext);

    if (publicUrl) {
        const newMessage: Message = {
            id: generateUUID(),
            sender_id: currentUser.id,
            receiver_id: chatPartner.id,
            content: "Mensagem de voz",
            media_url: publicUrl,
            media_type: 'audio',
            created_at: new Date().toISOString(),
            is_read: false
        };
        onSendMessage(newMessage);
        soundService.playSent();
        await sendMessage(newMessage);
    } else {
        alert("Erro ao enviar áudio. Tente novamente.");
    }
    setIsUploading(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chatPartner) return;
    setIsUploading(true);

    // Upload to Supabase Storage
    const publicUrl = await uploadFile(file, 'images');

    if (publicUrl) {
      const newMessage: Message = {
        id: generateUUID(),
        sender_id: currentUser.id,
        receiver_id: chatPartner.id,
        content: "Imagem",
        media_url: publicUrl,
        media_type: 'image',
        created_at: new Date().toISOString(),
        is_read: false
      };

      onSendMessage(newMessage);
      soundService.playSent();
      await sendMessage(newMessage);
    } else {
        alert("Erro ao enviar imagem.");
    }
    setIsUploading(false);
  };

  const triggerSmartReply = async () => {
    if (currentUser.role !== UserRole.DRIVER || !chatPartner) return;
    setIsProcessingAI(true);
    
    const history = messages.slice(-5).map(m => 
      `${m.sender_id === currentUser.id ? 'Eu' : 'Cliente'}: ${m.content}`
    );

    const suggestion = await generateSmartReply(history, currentUser.username);
    setInputText(suggestion);
    setIsProcessingAI(false);
  };

  if (!chatPartner) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] relative">
      {/* Hidden Audio Element for WebRTC */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Taximeter Overlay */}
      {showTaximeter && (
          <Taximeter currentUser={currentUser} onClose={() => setShowTaximeter(false)} />
      )}

      {/* Call Overlay */}
      {callStatus !== 'idle' && (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-white animate-fade-in">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-600 mb-8 animate-pulse">
            <img src={chatPartner.avatar_url || "https://via.placeholder.com/150"} alt="Calling" className="w-full h-full object-cover" />
          </div>
          
          <h2 className="text-2xl font-light mb-2">
              {callStatus === 'calling' ? 'Chamando...' : callStatus === 'incoming' ? 'Recebendo Chamada...' : 'Em Chamada'}
          </h2>
          <h3 className="text-xl font-bold mb-4">{chatPartner.username}</h3>
          
          {callStatus === 'connected' && (
              <div className="text-3xl font-mono mb-12 text-gray-300">
                  {formatDuration(callDuration)}
              </div>
          )}
          
          <div className="flex gap-8 items-center mt-4">
             {callStatus === 'incoming' ? (
                <>
                    <button 
                        onClick={rejectCall}
                        className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center hover:bg-red-700 active:scale-95 transition shadow-lg animate-bounce"
                    >
                        <span className="material-icons">call_end</span>
                    </button>
                    <button 
                        onClick={answerCall}
                        className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 active:scale-95 transition shadow-lg animate-bounce"
                    >
                        <span className="material-icons">call</span>
                    </button>
                </>
             ) : (
                <>
                    <button className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 active:scale-95 transition">
                        <span className="material-icons">videocam_off</span>
                    </button>
                    <button className="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center hover:bg-gray-600 active:scale-95 transition">
                        <span className="material-icons">mic_off</span>
                    </button>
                    <button 
                    onClick={handleEndCall}
                    className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center hover:bg-red-700 active:scale-95 transition shadow-lg"
                    >
                    <span className="material-icons">call_end</span>
                    </button>
                </>
             )}
          </div>
        </div>
      )}

      {/* Desktop Header - ONLY SHOW IF NOT INSIDE ADMIN DASHBOARD (Check if we have a back button handled by parent logic maybe? Or just keep it generic) */}
      {/* Logic: If currentUser is ADMIN, we hide this header because AdminDashboard provides its own tab header */}
      {currentUser.role !== UserRole.ADMIN && (
      <div className="h-16 bg-whatsapp-panel hidden md:flex items-center px-4 justify-between z-10 shadow-sm shrink-0">
        <div className="flex items-center cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center mr-3 overflow-hidden">
            {chatPartner.avatar_url ? (
              <img src={chatPartner.avatar_url} alt={chatPartner.username} className="w-full h-full object-cover" />
            ) : (
              <span className="material-icons text-white">person</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-gray-100 font-medium text-base flex items-center gap-2">
                {chatPartner.username}
                {chatPartner.role === UserRole.DRIVER && (
                    <span 
                        className={`material-icons text-sm ${chatPartner.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}
                        title={chatPartner.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                    >
                        {chatPartner.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                    </span>
                )}
            </span>
            <span className="text-xs text-gray-400 truncate w-32 lg:w-auto">
              {chatPartner.role === UserRole.DRIVER 
                 ? (chatPartner.status === 'available' ? 'Online' : 'Ocupado')
                 : `Tel: ${chatPartner.phone || 'N/A'}`
              }
            </span>
          </div>
        </div>
        <div className="flex gap-4 text-gray-400 items-center">
          {currentUser.role === UserRole.DRIVER && (
              <>
                <button 
                    onClick={() => setShowTaximeter(true)}
                    className="px-3 py-1.5 rounded-full bg-gray-700 hover:bg-gray-600 text-green-400 text-xs font-bold uppercase tracking-wide border border-green-400/30 flex items-center gap-2"
                >
                    <span className="material-icons text-sm">local_taxi</span> Taxímetro
                </button>
                
                <button 
                    onClick={handleRequestLocation}
                    className="px-3 py-1.5 rounded-full bg-blue-900/40 hover:bg-blue-900/60 text-blue-400 text-xs font-bold uppercase tracking-wide border border-blue-400/30 flex items-center gap-2"
                    title="Pedir Localização ao Cliente"
                >
                    <span className="material-icons text-sm">place</span> Pedir Loc.
                </button>
              </>
          )}
          <div className="w-[1px] h-6 bg-gray-600 mx-1 hidden lg:block"></div>
          <button onClick={startCall} className="p-2 rounded-full hover:bg-gray-700/50 active:scale-90 transition"><span className="material-icons">call</span></button>
          <button className="p-2 rounded-full hover:bg-gray-700/50 active:scale-90 transition"><span className="material-icons">more_vert</span></button>
        </div>
      </div>
      )}

      {/* Mobile Header (Now includes Driver Buttons) - Hide if Admin too, Admin handles its own back button */}
      {currentUser.role !== UserRole.ADMIN && (
      <div className="md:hidden bg-whatsapp-panel h-16 flex items-center px-2 border-b border-gray-700 shadow-sm shrink-0 z-20">
        <button onClick={() => {/* Handle Back in parent */}} className="text-gray-300 p-2 rounded-full hover:bg-gray-700 mr-1 active:scale-95 transition">
             {/* Back button logic handled by parent, this is just placeholder visual if needed, currently parent passes nothing to close specifically here but visual consistency maintained */}
             <span className="material-icons">arrow_back</span>
        </button>
        <div className="flex items-center flex-1 overflow-hidden" onClick={() => {/* Show Info */}}>
            <img src={chatPartner.avatar_url || 'https://via.placeholder.com/40'} className="w-9 h-9 rounded-full mr-2 object-cover shrink-0" alt="" />
            <div className="flex flex-col min-w-0">
                <span className="text-white font-medium text-base leading-tight flex items-center gap-1 truncate">
                {chatPartner.username}
                </span>
                <span className="text-xs text-gray-400 truncate">
                {chatPartner.role === UserRole.DRIVER ? (chatPartner.status === 'available' ? 'Online' : 'Ocupado') : 'Toque p/ dados'}
                </span>
            </div>
        </div>
        <div className="flex items-center gap-1 pr-1">
             {currentUser.role === UserRole.DRIVER && (
                 <>
                    <button onClick={() => setShowTaximeter(true)} className="p-2 text-green-400 active:bg-gray-700 rounded-full" title="Taxímetro">
                        <span className="material-icons">local_taxi</span>
                    </button>
                    <button onClick={handleRequestLocation} className="p-2 text-blue-400 active:bg-gray-700 rounded-full" title="Pedir Localização">
                        <span className="material-icons">place</span>
                    </button>
                 </>
             )}
            <button onClick={startCall} className="p-2 text-whatsapp-green active:bg-gray-700 rounded-full"><span className="material-icons">call</span></button>
        </div>
      </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-chat-pattern bg-contain bg-repeat opacity-95 scrollbar-thin scrollbar-thumb-gray-600" style={{backgroundColor: '#0b141a'}}>
        <div className="space-y-1 pb-2">
          {/* Date Separator Mock */}
          <div className="flex justify-center my-4">
            <span className="bg-[#1f2c34] text-gray-400 text-xs py-1.5 px-3 rounded-lg shadow-sm uppercase tracking-wide font-medium">Hoje</span>
          </div>

          {messages.map((msg) => {
            const isMe = msg.sender_id === currentUser.id;
            const isCallLog = msg.content?.includes("Chamada");

            if (isCallLog) {
                return (
                    <div key={msg.id} className="flex justify-center my-2">
                        <div className="bg-[#1f2c34] text-gray-300 text-xs py-1.5 px-3 rounded-lg shadow-sm flex items-center gap-2">
                            <span className="material-icons text-sm">call_end</span>
                            {msg.content}
                            <span className="text-[10px] opacity-60 ml-1">
                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                );
            }

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group mb-1.5`}>
                <div className={`max-w-[85%] md:max-w-[65%] rounded-lg p-1.5 relative shadow-sm text-sm ${
                  isMe ? 'bg-whatsapp-outgoing text-white rounded-tr-none' : 'bg-whatsapp-incoming text-white rounded-tl-none'
                }`}>
                  {/* Media Rendering */}
                  {msg.media_type === 'image' && msg.media_url && (
                    <div className="rounded-lg overflow-hidden mb-1 cursor-pointer active:opacity-90 transition">
                      <img src={msg.media_url} alt="Enviada" className="w-full h-auto object-cover min-w-[150px] min-h-[100px]" />
                    </div>
                  )}
                  
                  {msg.media_type === 'audio' && msg.media_url && (
                     <div className="flex items-center gap-2 min-w-[200px] py-2 px-1">
                        <div className="w-9 h-9 rounded-full bg-gray-500 flex items-center justify-center shrink-0">
                           <span className="material-icons text-white text-lg">play_arrow</span>
                        </div>
                        <audio controls src={msg.media_url} className="w-full h-8" />
                     </div>
                  )}

                  {msg.media_type === 'location' && msg.media_url && (
                      <div className="min-w-[200px] cursor-pointer" onClick={() => window.open(msg.media_url, '_blank')}>
                         <div className="bg-[#2a3942] rounded-lg overflow-hidden relative">
                             {/* Map Mock Graphic */}
                             <div className="h-32 bg-gray-700 opacity-80 flex items-center justify-center bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=0,0&zoom=1&size=200x150&sensor=false')] bg-cover">
                                 <div className="w-8 h-8 rounded-full bg-red-500/90 border-2 border-white flex items-center justify-center shadow-lg animate-bounce">
                                     <span className="material-icons text-white text-xs">place</span>
                                 </div>
                             </div>
                             <div className="p-2 flex items-center gap-2 bg-[#202c33]">
                                 <span className="material-icons text-red-400">location_on</span>
                                 <span className="text-blue-300 text-sm hover:underline">Ver localização em tempo real</span>
                             </div>
                         </div>
                      </div>
                  )}

                  {/* Text Content */}
                  {msg.media_type === 'text' && (
                     <p className="px-1 pb-1 leading-relaxed break-words text-[15px] md:text-[14px]">{msg.content}</p>
                  )}
                  
                  {/* Timestamp */}
                  <div className={`flex justify-end items-center gap-1 ${isMe ? '-mt-1' : ''}`}>
                     <span className="text-[10px] text-gray-400/80">
                       {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                     </span>
                     {isMe && <span className="material-icons text-[14px] text-[#53bdeb]">done_all</span>}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-whatsapp-panel px-2 py-2 flex items-end gap-2 z-10 pb-safe md:pb-2">
        <div className="flex items-center pb-1.5 gap-1">
            <button className="p-2 text-gray-400 hover:bg-gray-700 rounded-full transition hidden md:block">
            <span className="material-icons">sentiment_satisfied</span>
            </button>
            
            <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:bg-gray-700 rounded-full transition active:scale-90"
            disabled={isUploading}
            title="Enviar Foto"
            >
            <span className="material-icons transform rotate-45">attach_file</span>
            </button>
            <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={handleImageUpload} 
            />

            {/* Location Button */}
            <button 
            onClick={handleSendLocation}
            className={`p-2 text-gray-400 hover:bg-gray-700 rounded-full transition active:scale-90 ${isGettingLocation ? 'text-green-500 animate-pulse' : ''}`}
            disabled={isUploading || isGettingLocation}
            title="Enviar Localização Atual"
            >
            <span className="material-icons">location_on</span>
            </button>
        </div>

        {/* AI Suggestion for Drivers */}
        {currentUser.role === UserRole.DRIVER && (
          <button 
            onClick={triggerSmartReply}
            disabled={isProcessingAI}
            className={`p-2 mb-1.5 rounded-full transition active:scale-90 shrink-0 ${isProcessingAI ? 'text-yellow-500 animate-spin' : 'text-emerald-400 bg-emerald-900/20 hover:bg-emerald-900/40'}`}
            title="Sugestão IA"
          >
            <span className="material-icons">auto_awesome</span>
          </button>
        )}

        <div className="flex-1 bg-[#2a3942] rounded-2xl flex items-center px-4 py-2 mx-1 min-h-[44px] mb-1">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder={isUploading ? "Enviando arquivo..." : isGettingLocation ? "Obtendo GPS..." : "Mensagem"}
            disabled={isUploading || isGettingLocation}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-400 text-[16px] md:text-sm max-h-20 overflow-y-auto disabled:opacity-50"
          />
        </div>

        <div className="pb-1">
            {inputText.trim() ? (
            <button 
                onClick={() => handleSendText()}
                className="p-3 text-white bg-whatsapp-green rounded-full hover:bg-emerald-600 active:scale-90 transition shadow-md flex items-center justify-center"
            >
                <span className="material-icons text-lg">send</span>
            </button>
            ) : (
            <AudioRecorder 
                onAudioReady={handleAudioReady}
                isRecording={isRecording}
                setIsRecording={setIsRecording}
            />
            )}
        </div>
      </div>
    </div>
  );
};