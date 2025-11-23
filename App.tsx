

import React, { useState, useEffect, useRef } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { AdminDashboard } from './components/AdminDashboard';
import { 
  registerClientWithPhoto, 
  fetchOnlineDrivers, 
  subscribeToMessages, 
  subscribeToProfiles,
  fetchMyClients,
  registerDriver,
  loginDriver,
  fetchMessages,
} from './services/supabaseClient';
import { UserProfile, UserRole, DriverStatus, Message } from './types';
import { APP_NAME } from './constants';
import { soundService } from './services/soundService';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeContact, setActiveContact] = useState<UserProfile | null>(null);
  
  const [contactList, setContactList] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // Login States
  const [loginMode, setLoginMode] = useState<'client' | 'driver' | 'admin'>('client'); 
  const [isRegisteringDriver, setIsRegisteringDriver] = useState(false);
  const [entryName, setEntryName] = useState('');
  const [entryPhone, setEntryPhone] = useState('');
  const [entryAvatarFile, setEntryAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  
  const [authPassword, setAuthPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Mobile View State
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  // Refs
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // --- Lifecycle ---

  // Load Contacts based on Role and Listen for changes
  useEffect(() => {
    if (!currentUser) return;
    
    // Admin handles its own data fetching in the AdminDashboard component
    if (currentUser.role === UserRole.ADMIN) return;

    const loadContacts = async () => {
      if (currentUser.role === UserRole.CLIENT) {
        // Clients see Drivers
        const drivers = await fetchOnlineDrivers();
        setContactList(drivers);
      } else if (currentUser.role === UserRole.DRIVER) {
        // Drivers see Clients who messaged them
        const clients = await fetchMyClients(currentUser.id);
        setContactList(clients);
      }
    };

    loadContacts();
    
    // Subscribe to profile changes (e.g. new driver online, driver status change)
    const profileSub = subscribeToProfiles(() => {
        loadContacts();
    });

    return () => {
        profileSub.unsubscribe();
    };
  }, [currentUser]);

  // Load History and Subscribe to Messages
  useEffect(() => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return;

    // 1. Load History if a contact is active
    if (activeContact) {
        const loadHistory = async () => {
            const history = await fetchMessages(currentUser.id, activeContact.id);
            setMessages(history);
        };
        loadHistory();
    }

    // 2. Subscribe to new messages
    const sub = subscribeToMessages(currentUser.id, (newMsg) => {
      // Logic for received messages
      if (newMsg.sender_id !== currentUser.id) {
        soundService.playReceived();
        
        // System Notification Logic (Background/Overlay)
        // If app is hidden OR if user is a driver (to ensure they don't miss it even if app is open but they looked away)
        if (document.hidden || currentUser.role === UserRole.DRIVER) {
             const senderName = contactList.find(c => c.id === newMsg.sender_id)?.username || "Novo Cliente";
             soundService.sendNotification(
                 `Nova mensagem de ${senderName}`, 
                 newMsg.media_type === 'text' ? newMsg.content : 'Enviou um arquivo de mídia'
             );
        }

        // If a driver receives a message from a NEW client, we need to refresh the contact list
        if (currentUser.role === UserRole.DRIVER) {
            setContactList(prev => {
                const exists = prev.some(c => c.id === newMsg.sender_id);
                if (!exists) {
                    fetchMyClients(currentUser.id).then(setContactList);
                }
                return prev;
            });
        }
      }

      // If this message belongs to the active chat, append it
      if (activeContact && (newMsg.sender_id === activeContact.id || newMsg.receiver_id === activeContact.id)) {
          setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
          });
      }
    });

    return () => {
      sub.unsubscribe();
    };
  }, [currentUser, activeContact, contactList]); // Added contactList to dependency to help with notification naming

  // --- Handlers ---

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setEntryAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleLogin = async () => {
    if (!entryName.trim()) return;
    setIsLoading(true);

    try {
      if (loginMode === 'client') {
        if (!entryPhone.trim()) {
            alert("Por favor, insira seu telefone.");
            setIsLoading(false);
            return;
        }
        // Registra ou Loga Cliente com Foto e Telefone
        const user = await registerClientWithPhoto(entryName, entryPhone, entryAvatarFile || undefined);
        if (user) {
          setCurrentUser(user);
        }
      } 
      else if (loginMode === 'driver') {
        if (isRegisteringDriver) {
          const user = await registerDriver(entryName);
          if (user) {
              setCurrentUser(user);
              soundService.requestPermission(); // Ask permission immediately on signup
          }
        } else {
          // Login
          const user = await loginDriver(entryName);
          if (user) {
            setCurrentUser(user);
            soundService.requestPermission(); // Ask permission on login
          } else {
             alert("Motorista não encontrado. Verifique o nome ou cadastre-se.");
          }
        }
      }
      else if (loginMode === 'admin') {
        if (authPassword === 'admin123') { // Hardcoded admin password
          setCurrentUser({
            id: 'admin-master',
            username: 'Administrador',
            role: UserRole.ADMIN,
            status: DriverStatus.AVAILABLE,
            avatar_url: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff'
          });
        } else {
          alert("Senha de administrador incorreta.");
        }
      }
    } catch (e) {
      console.error("Login Error", e);
      alert("Ocorreu um erro inesperado. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactSelect = (contact: UserProfile) => {
    if (currentUser?.role === UserRole.ADMIN) return;

    setActiveContact(contact);
    setMessages([]); // Clear previous messages while loading new ones
    setShowChatOnMobile(true);
  };

  const handleBackToList = () => {
    setShowChatOnMobile(false);
    setActiveContact(null);
  };

  // --- Render: Admin Dashboard (Dedicated Page) ---
  if (currentUser && currentUser.role === UserRole.ADMIN) {
    return <AdminDashboard currentUser={currentUser} onLogout={() => setCurrentUser(null)} />;
  }

  // --- Render: Login Screen ---
  if (!currentUser) {
    return (
      <div className="h-[100dvh] w-full bg-gray-100 flex items-center justify-center relative overflow-hidden">
        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
          <button 
            onClick={() => { setLoginMode('driver'); setIsRegisteringDriver(false); setEntryName(''); setAuthPassword(''); }}
            className={`p-3 rounded-full transition shadow-lg ${loginMode === 'driver' ? 'bg-whatsapp-green text-white transform scale-110' : 'bg-white text-gray-400'}`}
            title="Acesso Motorista"
          >
            <span className="material-icons">directions_car</span>
          </button>
          
          <button 
            onClick={() => { setLoginMode('admin'); setEntryName('Admin'); setAuthPassword(''); }}
            className={`p-3 rounded-full transition shadow-lg ${loginMode === 'admin' ? 'bg-blue-600 text-white transform scale-110' : 'bg-white text-gray-400'}`}
            title="Acesso Admin"
          >
            <span className="material-icons">admin_panel_settings</span>
          </button>
          
          {loginMode !== 'client' && (
            <button 
              onClick={() => { setLoginMode('client'); setEntryName(''); setEntryPhone(''); setAvatarPreview(null); }}
              className="p-3 bg-white text-gray-400 shadow-lg rounded-full hover:text-whatsapp-green"
              title="Voltar para Cliente"
            >
              <span className="material-icons">person</span>
            </button>
          )}
        </div>

        <div className="bg-white p-8 rounded-xl shadow-xl w-[90%] max-w-md text-center z-10">
          <div className="mb-6 flex flex-col items-center">
             {/* Avatar Picker for Client */}
             {loginMode === 'client' ? (
                 <div className="relative cursor-pointer group" onClick={() => avatarInputRef.current?.click()}>
                    <div className="w-24 h-24 rounded-full bg-gray-200 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center">
                        {avatarPreview ? (
                            <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <span className="material-icons text-5xl text-gray-400">add_a_photo</span>
                        )}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-whatsapp-green p-2 rounded-full text-white shadow-sm transform scale-75">
                        <span className="material-icons text-sm">edit</span>
                    </div>
                    <input 
                        type="file" 
                        ref={avatarInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handleAvatarChange}
                    />
                 </div>
             ) : (
                 <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg ${loginMode === 'admin' ? 'bg-blue-600' : 'bg-whatsapp-green'}`}>
                    <span className="material-icons text-4xl text-white">
                        {loginMode === 'driver' ? 'directions_car' : 'security'}
                    </span>
                 </div>
             )}
          </div>
          
          <h2 className="text-2xl font-bold text-whatsapp-dark mb-2">
            {loginMode === 'client' ? 'Bem-vindo(a)' : loginMode === 'driver' ? (isRegisteringDriver ? 'Novo Motorista' : 'Login Motorista') : 'Área Administrativa'}
          </h2>
          <p className="text-gray-500 mb-6 text-sm">
            {loginMode === 'client' 
              ? 'Preencha seus dados para começar.' 
              : loginMode === 'driver'
                ? (isRegisteringDriver ? 'Cadastro de parceiro.' : 'Entre para ver solicitações.')
                : 'Acesso restrito.'}
          </p>

          <div className="space-y-3">
            <input
              type="text"
              placeholder={loginMode === 'client' ? "Seu Nome Completo" : "Nome de Usuário"}
              value={entryName}
              onChange={e => setEntryName(e.target.value)}
              disabled={isLoading}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-gray-50"
            />

            {loginMode === 'client' && (
                <input
                    type="tel"
                    placeholder="Seu Telefone (Whatsapp)"
                    value={entryPhone}
                    onChange={e => setEntryPhone(e.target.value)}
                    disabled={isLoading}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-gray-50"
                />
            )}

            {(loginMode === 'driver' || loginMode === 'admin') && (
              <input
                type="password"
                placeholder={loginMode === 'admin' ? "Senha Admin" : isRegisteringDriver ? "Senha (Opcional)" : "Senha"}
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                disabled={isLoading}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-gray-50"
              />
            )}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className={`w-full text-white font-bold py-3 rounded-lg transition shadow-md flex justify-center items-center ${
                  loginMode === 'admin' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-whatsapp-green hover:bg-whatsapp-outgoing'
              } ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading ? (
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                  loginMode === 'client' ? 'INICIAR ATENDIMENTO' : (isRegisteringDriver ? 'CADASTRAR' : 'ENTRAR')
              )}
            </button>
          </div>

          {loginMode === 'driver' && (
            <div className="mt-4 text-sm">
              <button 
                onClick={() => setIsRegisteringDriver(!isRegisteringDriver)}
                className="text-whatsapp-green hover:underline font-medium p-2"
                disabled={isLoading}
              >
                {isRegisteringDriver ? 'Já tenho conta? Fazer Login' : 'Não tem conta? Cadastre-se como Motorista'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Render: Main App (Client/Driver Chat) ---
  return (
    <div className="h-[100dvh] w-full flex overflow-hidden bg-app-bg">
      
      {/* Sidebar */}
      <div className={`w-full md:w-[400px] bg-whatsapp-dark border-r border-gray-800 flex flex-col ${showChatOnMobile ? 'hidden md:flex' : 'flex'}`}>
        {/* My Profile Header */}
        <div className="h-16 px-4 flex items-center justify-between shrink-0 bg-whatsapp-panel shadow-sm z-10">
          <div className="flex items-center gap-3">
             <img src={currentUser.avatar_url || 'https://via.placeholder.com/40'} alt="Me" className="w-10 h-10 rounded-full border border-gray-600 object-cover" />
             <div>
               <p className="text-gray-200 font-medium truncate max-w-[150px]">{currentUser.username}</p>
               <span className="text-xs text-gray-400 uppercase font-bold tracking-wider">
                 {currentUser.role === 'driver' ? 'Motorista' : 'Cliente'}
               </span>
             </div>
          </div>
          <div className="flex gap-2 text-gray-400">
            <button className="p-2 rounded-full hover:bg-gray-700 transition" title="Configurações"><span className="material-icons">settings</span></button>
            <button className="p-2 rounded-full hover:bg-red-900/30 hover:text-red-400 transition" title="Sair" onClick={() => setCurrentUser(null)}><span className="material-icons">logout</span></button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-2 bg-whatsapp-dark border-b border-gray-800/50">
            <div className="bg-whatsapp-panel rounded-lg flex items-center px-4 py-2 transition focus-within:bg-[#2a3942]">
               <span className="material-icons text-gray-400 text-sm">search</span>
               <input 
                 type="text" 
                 placeholder={currentUser.role === 'client' ? "Buscar motorista..." : "Buscar cliente..."}
                 className="bg-transparent text-gray-200 placeholder-gray-500 ml-4 w-full text-sm outline-none"
               />
            </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {contactList.map(contact => (
            <div 
              key={contact.id}
              onClick={() => handleContactSelect(contact)}
              className={`flex items-center px-4 py-3 cursor-pointer hover:bg-whatsapp-panel border-b border-gray-800 transition active:bg-[#2a3942] ${activeContact?.id === contact.id ? 'bg-whatsapp-panel' : ''}`}
            >
              <div className="relative w-12 h-12 mr-4 shrink-0">
                <img src={contact.avatar_url || 'https://via.placeholder.com/150'} alt={contact.username} className="w-full h-full rounded-full object-cover" />
                {contact.role === UserRole.DRIVER && (
                  <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-whatsapp-dark ${
                    contact.status === DriverStatus.AVAILABLE ? 'bg-green-500' : 
                    contact.status === DriverStatus.BUSY ? 'bg-red-500' : 'bg-gray-500'
                  }`}></span>
                )}
              </div>
              
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-gray-100 font-medium truncate text-[16px]">{contact.username}</h3>
                  <span className="text-xs text-gray-500">
                     {contact.role === UserRole.DRIVER && contact.status === DriverStatus.AVAILABLE ? "Online" : "Agora"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-gray-400 text-sm truncate">
                    {contact.role === UserRole.DRIVER 
                        ? (contact.status === DriverStatus.AVAILABLE ? "Disponível - Toque para conversar" : "Ocupado no momento") 
                        : `Tel: ${contact.phone || 'Sem telefone'}`}
                  </p>
                </div>
              </div>
            </div>
          ))}
          
          {contactList.length === 0 && (
             <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center">
                <span className="material-icons text-4xl mb-2 opacity-20">
                    {currentUser.role === UserRole.CLIENT ? 'drive_eta' : 'person_off'}
                </span>
                <p>
                    {currentUser.role === UserRole.CLIENT 
                     ? 'Nenhum motorista disponível no momento.' 
                     : 'Nenhuma mensagem recente.'}
                </p>
             </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-whatsapp-panel relative ${!showChatOnMobile ? 'hidden md:flex' : 'flex'} h-full`}>
        {activeContact ? (
          <>
              {/* Mobile Header Override */}
              <div className="md:hidden bg-whatsapp-panel h-16 flex items-center px-2 border-b border-gray-700 shadow-sm shrink-0 z-20">
                <button onClick={handleBackToList} className="text-gray-300 p-2 rounded-full hover:bg-gray-700 mr-1 active:scale-95 transition">
                  <span className="material-icons">arrow_back</span>
                </button>
                <div className="flex items-center flex-1" onClick={() => {/* Show Contact Info */}}>
                   <img src={activeContact.avatar_url || 'https://via.placeholder.com/40'} className="w-9 h-9 rounded-full mr-3 object-cover" alt="" />
                   <div className="flex flex-col">
                     <span className="text-white font-medium text-base leading-tight">{activeContact.username}</span>
                     <span className="text-xs text-gray-400 truncate">
                        {activeContact.role === UserRole.DRIVER 
                            ? (activeContact.status === 'available' ? 'Online' : 'Ocupado') 
                            : activeContact.phone || 'Detalhes'}
                     </span>
                   </div>
                </div>
                <div className="flex gap-3 pr-2">
                   <button className="text-whatsapp-green"><span className="material-icons">videocam</span></button>
                   <button className="text-whatsapp-green"><span className="material-icons">call</span></button>
                </div>
              </div>
              
              <ChatWindow 
                currentUser={currentUser}
                chatPartner={activeContact}
                messages={messages}
                onSendMessage={(msg) => setMessages(p => [...p, msg])}
              />
          </>
        ) : (
          <div className="hidden md:flex h-full flex-col items-center justify-center text-center border-b-8 border-whatsapp-green bg-[#222e35]">
              <div className="mb-4">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/120px-WhatsApp.svg.png" alt="Welcome" className="opacity-40 w-32" />
              </div>
              <h1 className="text-3xl font-light text-gray-200 mb-4">{APP_NAME}</h1>
              <p className="text-gray-400 text-sm max-w-md">
                Envie e receba mensagens sem precisar manter seu celular conectado.<br/>
                Otimizado para comunicação rápida entre motoristas e passageiros.
              </p>
              <div className="mt-8 flex items-center gap-2 text-gray-500 text-xs">
                 <span className="material-icons text-[12px]">lock</span>
                 Protegido com criptografia de ponta a ponta
              </div>
          </div>
        )}
      </div>

    </div>
  );
}
