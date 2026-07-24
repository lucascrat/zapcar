import React, { useState, useEffect, useRef } from 'react';
import { Message, UserProfile, UserRole } from '../types';
import { sendMessage, generateUUID, markMessagesAsRead } from '../services/supabaseClient';
import { soundService } from '../services/soundService';

interface ChatWindowProps {
  currentUser: UserProfile;
  chatPartner: UserProfile | null;
  messages: Message[];
  onSendMessage: (msg: Message) => void;
  onBack?: () => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ currentUser, chatPartner, messages, onSendMessage, onBack }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    // Mark messages as read if they are from the partner and unread
    if (chatPartner && messages.length > 0) {
      const hasUnread = messages.some(m => m.sender_id === chatPartner.id && !m.is_read);
      if (hasUnread) {
        markMessagesAsRead(currentUser.id, chatPartner.id);
      }
    }
  }, [messages, chatPartner, currentUser.id]);

  const handleSendText = async () => {
    if (!inputText.trim() || !chatPartner) return;

    const newMessage: Message = {
      id: generateUUID(),
      sender_id: currentUser.id,
      receiver_id: chatPartner.id,
      content: inputText.trim(),
      media_type: 'text',
      created_at: new Date().toISOString(),
      is_read: false
    };

    onSendMessage(newMessage);
    soundService.playSent(); // Play Sound
    setInputText('');
    scrollToBottom();

    try {
      await sendMessage(newMessage);
    } catch (e) {
      console.error("Failed to send message to DB", e);
    }
  };

  if (!chatPartner) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 relative max-h-screen">

      {/* HEADER */}
      <div className="bg-white px-4 py-3 flex items-center shadow-sm z-10 sticky top-0 border-b border-gray-200">
        {onBack && (
          <button
            onClick={onBack}
            className="mr-3 text-gray-600 hover:text-gray-900 transition-colors p-1"
          >
            <span className="material-icons text-2xl">arrow_back</span>
          </button>
        )}

        <div className="relative">
          <img src={chatPartner.avatar_url || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full mr-3 object-cover shadow-sm border border-gray-100" alt="Avatar" />
        </div>
        <div className="flex flex-col flex-1">
          <h3 className="font-bold text-gray-900 text-[16px] leading-tight">{chatPartner.username}</h3>
          <span className="text-xs text-gray-500 font-medium">
            {chatPartner.role === UserRole.DRIVER
              ? `${chatPartner.vehicle_model || 'Veículo'} • ${chatPartner.vehicle_plate || ''}`
              : 'Passageiro'}
          </span>
        </div>
      </div>

      {/* MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 scrollbar-thin flex flex-col gap-3">
        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUser.id;

          return (
            <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl relative shadow-sm text-[15px]
                ${isMe
                  ? 'bg-black text-white rounded-tr-sm'
                  : 'bg-white text-gray-800 rounded-tl-sm border border-gray-100'
                }`}>

                {/* Mantendo renderização básica de mídia pra evitar erro em histórico antigo */}
                {msg.media_type === 'image' && msg.media_url && (
                  <img src={msg.media_url} alt="anexo" className="max-w-full rounded-lg mb-1" />
                )}

                {msg.content && <p className="leading-snug break-words">{msg.content}</p>}

                <span className={`text-[10px] block mt-1 text-right font-medium opacity-60 ${isMe ? 'text-gray-300' : 'text-gray-500'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      {/* INPUT AREA */}
      <div className="p-3 bg-white border-t border-gray-200 justify-end items-end sticky bottom-0 z-10 w-full flex gap-2 pb-safe">
        <div className="flex-1 bg-gray-100 rounded-full flex items-center px-4 py-1.5 focus-within:ring-2 ring-black/10 transition-shadow">
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-gray-900 placeholder-gray-500 py-2.5 text-[15px] w-full"
            placeholder="Digite sua mensagem..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
          />
        </div>
        <button
          onClick={handleSendText}
          disabled={!inputText.trim()}
          className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-black transition-all shadow-md shrink-0 active:scale-95"
        >
          <span className="material-icons ml-1 text-xl">send</span>
        </button>
      </div>

    </div>
  );
};
