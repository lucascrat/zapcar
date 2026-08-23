/**
 * AdminSupportView - Central de Atendimento
 * Inbox de conversas de suporte entre o Admin e Motoristas/Clientes.
 * Sem esta tela, mensagens enviadas pelo app (motorista/cliente) chegavam
 * ao banco mas nunca apareciam em lugar nenhum do painel novo.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserProfile, UserRole, Message, ChatContact } from '../../../types';
import {
    fetchSupportConversations,
    fetchMessages,
    markMessagesAsRead,
    subscribeToMessages
} from '../../../services/supabaseClient';
import { soundService } from '../../../services/soundService';
import { ChatWindow } from '../../../components/ChatWindow';

interface AdminSupportViewProps {
    currentUser: UserProfile;
    onUnreadChange?: () => void;
    /** Id de um contato a abrir automaticamente (ex: veio de uma notificação push). */
    initialPartnerId?: string | null;
}

export const AdminSupportView: React.FC<AdminSupportViewProps> = ({ currentUser, onUnreadChange, initialPartnerId }) => {
    const [conversations, setConversations] = useState<ChatContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPartner, setSelectedPartner] = useState<UserProfile | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [search, setSearch] = useState('');

    // Ref para acessar o partner selecionado dentro do listener realtime sem re-inscrever o canal
    const selectedPartnerRef = useRef<UserProfile | null>(null);
    useEffect(() => { selectedPartnerRef.current = selectedPartner; }, [selectedPartner]);

    const loadConversations = useCallback(async () => {
        const data = await fetchSupportConversations(currentUser.id);
        setConversations(data);
        setLoading(false);
    }, [currentUser.id]);

    useEffect(() => {
        loadConversations();

        const sub = subscribeToMessages(currentUser.id, (newMsg) => {
            const openPartnerId = selectedPartnerRef.current?.id;
            const isFromPartnerOpen = openPartnerId && (newMsg.sender_id === openPartnerId || newMsg.receiver_id === openPartnerId);
            const isIncoming = newMsg.receiver_id === currentUser.id;

            if (isFromPartnerOpen) {
                setMessages(prev => {
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });
                if (isIncoming) {
                    markMessagesAsRead(currentUser.id, openPartnerId!);
                }
            }

            if (isIncoming) {
                // Toca alerta somente se a conversa que recebeu não está aberta na tela
                if (!isFromPartnerOpen) {
                    soundService.playMessageAlert();
                }
                onUnreadChange?.();
            }

            loadConversations();
        });

        return () => { sub.unsubscribe(); };
    }, [currentUser.id, loadConversations, onUnreadChange]);

    const handleSelectConversation = async (contact: ChatContact) => {
        setSelectedPartner(contact.user);
        const msgs = await fetchMessages(currentUser.id, contact.user.id);
        setMessages(msgs);
        if (contact.unreadCount > 0) {
            await markMessagesAsRead(currentUser.id, contact.user.id);
            setConversations(prev => prev.map(c => c.user.id === contact.user.id ? { ...c, unreadCount: 0 } : c));
            onUnreadChange?.();
        }
    };

    // Abre automaticamente a conversa indicada (ex: admin tocou numa notificação push).
    useEffect(() => {
        if (!initialPartnerId || conversations.length === 0) return;
        if (selectedPartnerRef.current?.id === initialPartnerId) return;
        const contact = conversations.find(c => c.user.id === initialPartnerId);
        if (contact) handleSelectConversation(contact);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPartnerId, conversations]);

    const handleSendMessage = async (msg: Message) => {
        setMessages(prev => [...prev, msg]);
        setConversations(prev => {
            const idx = prev.findIndex(c => c.user.id === msg.receiver_id);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], lastMessage: msg };
            const [item] = updated.splice(idx, 1);
            return [item, ...updated];
        });
    };

    const filteredConversations = conversations.filter(c =>
        !search.trim() || c.user.username?.toLowerCase().includes(search.toLowerCase())
    );

    const formatPreview = (msg?: Message) => {
        if (!msg) return 'Sem mensagens';
        if (msg.media_type === 'image') return '📷 Imagem';
        if (msg.media_type === 'audio') return '🎤 Áudio';
        if (msg.media_type === 'location') return '📍 Localização';
        return msg.content?.length > 42 ? msg.content.slice(0, 42) + '…' : msg.content;
    };

    const formatTime = (iso?: string) => {
        if (!iso) return '';
        const d = new Date(iso);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        return sameDay
            ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    };

    if (loading) {
        return <div className="admin-loading">Carregando central de atendimento...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Central de Atendimento</h2>
                <p className="text-sm text-gray-400 mt-1">Converse com motoristas e clientes que entraram em contato pelo app</p>
            </div>

            <div
                className="grid grid-cols-1 lg:grid-cols-3 gap-0 rounded-2xl overflow-hidden border border-white/5"
                style={{ height: 'calc(100vh - 260px)', minHeight: '480px', background: 'var(--color-surface, #202c33)' }}
            >
                {/* Conversation List */}
                <div className={`lg:col-span-1 border-r border-white/5 flex flex-col ${selectedPartner ? 'hidden lg:flex' : 'flex'}`}>
                    <div className="p-4 border-b border-white/5 shrink-0">
                        <div className="relative">
                            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">search</span>
                            <input
                                type="text"
                                placeholder="Buscar conversa..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-black/20 text-white text-sm rounded-full pl-10 pr-4 py-2.5 border border-white/5 outline-none focus:border-white/20 transition"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {filteredConversations.length === 0 ? (
                            <div className="p-10 text-center text-gray-500 text-sm">
                                <span className="material-icons text-4xl opacity-30 mb-2 block">forum</span>
                                Nenhuma conversa ainda.
                            </div>
                        ) : (
                            filteredConversations.map(contact => (
                                <button
                                    key={contact.user.id}
                                    onClick={() => handleSelectConversation(contact)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/5 text-left transition hover:bg-white/5 ${selectedPartner?.id === contact.user.id ? 'bg-white/10' : ''}`}
                                >
                                    <img
                                        src={contact.user.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(contact.user.username || 'U')}
                                        className="w-11 h-11 rounded-full object-cover shrink-0 border border-white/10"
                                        alt=""
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-bold text-white truncate">{contact.user.username || 'Usuário'}</span>
                                            <span className="text-[10px] text-gray-500 shrink-0">{formatTime(contact.lastMessage?.created_at)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 mt-0.5">
                                            <span className={`text-xs truncate ${contact.unreadCount > 0 ? 'text-white font-semibold' : 'text-gray-500'}`}>
                                                {formatPreview(contact.lastMessage)}
                                            </span>
                                            {contact.unreadCount > 0 && (
                                                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-whatsapp-green text-white text-[10px] font-bold flex items-center justify-center">
                                                    {contact.unreadCount > 9 ? '9+' : contact.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-gray-600 uppercase font-bold tracking-wide">
                                            {contact.user.role === UserRole.DRIVER ? 'Motorista' : 'Cliente'}
                                        </span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Chat Window */}
                <div className={`lg:col-span-2 ${selectedPartner ? 'flex' : 'hidden lg:flex'} flex-col`}>
                    {selectedPartner ? (
                        <ChatWindow
                            currentUser={currentUser}
                            chatPartner={selectedPartner}
                            messages={messages}
                            onSendMessage={handleSendMessage}
                            onBack={() => setSelectedPartner(null)}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                            <span className="material-icons text-6xl opacity-20 mb-3">support_agent</span>
                            <p className="text-sm">Selecione uma conversa para responder</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminSupportView;
