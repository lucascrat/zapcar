
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
  updateDriverStatus, // Import for status toggle
} from './services/supabaseClient';
import { UserProfile, UserRole, DriverStatus, Message } from './types';
import { APP_NAME } from './constants';
import { soundService } from './services/soundService';

const APP_VERSION = "2.1 (Prod)";

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
  
  // New Driver Registration States
  const [entryVehicleType, setEntryVehicleType] = useState<'car' | 'motorcycle'>('car');
  const [entryVehicleModel, setEntryVehicleModel] = useState('');
  const [entryVehiclePlate, setEntryVehiclePlate] = useState('');
  const [entryVehicleColor, setEntryVehicleColor] = useState('');

  const [authPassword, setAuthPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Mobile View State
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);

  // Refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<any>(null);

  // --- Lifecycle ---

  // 1. PERSISTÊNCIA DE DADOS (LOCAL STORAGE)
  // Verifica se há usuário salvo na memória do aparelho ao iniciar
  useEffect(() => {
    const savedUser = localStorage.getItem('chegoja_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        console.log("Login automático via memória do aparelho:", user.username);
        setCurrentUser(user);
        
        // Se for motorista, tenta reativar o Wake Lock e permissões
        if (user.role === UserRole.DRIVER) {
           setTimeout(() => requestDriverPermissions(), 1000);
        }
      } catch (e) {
        console.error("Erro ao restaurar sessão:", e);
        localStorage.removeItem('chegoja_user');
      }
    }
  }, []);

  // Wake Lock for Drivers (Keep Screen On)
  useEffect(() => {
    if (currentUser?.role === UserRole.DRIVER) {
      const requestWakeLock = async () => {
        try {
          if ('wakeLock' in navigator) {
            wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            console.log("Wake Lock is active");
          }
        } catch (err) {
          console.warn("Wake Lock request failed:", err);
        }
      };

      requestWakeLock();

      // Re-request wake lock if visibility changes (e.g. user switches tabs and comes back)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && currentUser?.role === UserRole.DRIVER) {
          requestWakeLock();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (wakeLockRef.current) {
          wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
      };
    }
  }, [currentUser]);

  // Load Contacts based on Role and Listen for changes
  useEffect(() => {
    if (!currentUser) return;
    
    // Admin handles its own data fetching in the AdminDashboard component
    if (currentUser.role === UserRole.ADMIN) return;

    // Check approval status immediately (if driver)
    if (currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
       // Do not load contacts if not approved
       return;
    }

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
        // Refresh local user data just in case status changed externally
        if (currentUser.role === UserRole.DRIVER) {
            // Note: In a full app we would fetch the user profile again here to sync state
        }
        loadContacts();
    });

    return () => {
        profileSub.unsubscribe();
    };
  }, [currentUser]);

  // Load History and Subscribe to Messages
  useEffect(() => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return;

    // Approval Gate
    if (currentUser.role === UserRole.DRIVER && !currentUser.is_approved) return;

    // 1. Load History if a contact is active
    if (activeContact) {
        const loadHistory = async () => {
            const history = await fetchMessages(currentUser.id, activeContact.id);
            setMessages(history);
        };
        loadHistory();
    }

    // 2. Subscribe to new messages (Background Aware)
    const sub = subscribeToMessages(currentUser.id, (newMsg) => {
      // Logic for received messages
      if (newMsg.sender_id !== currentUser.id) {
        // Toca som interno do app
        soundService.playReceived();
        
        // --- LÓGICA DE SEGUNDO PLANO ---
        // Se o documento estiver oculto OU o usuário for motorista (prioridade máxima),
        // envia notificação de sistema persistente
        if (document.visibilityState === 'hidden' || currentUser.role === UserRole.DRIVER) {
             const senderName = contactList.find(c => c.id === newMsg.sender_id)?.username || "Novo Cliente";
             
             // Envia notificação de sistema (aparece na barra de status do Android/PC)
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

  const requestDriverPermissions = async () => {
    try {
      // 1. Notificações (Som e Pop-up)
      await soundService.requestPermission();

      // 2. Microfone e Câmera (Isso aciona o prompt do navegador)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach(track => track.stop());

      // 3. Geolocalização
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => console.log("GPS Ativo e Permitido"),
          (err) => console.warn("GPS Negado ou Erro", err),
          { enableHighAccuracy: true }
        );
      }

    } catch (e) {
      console.warn("Algumas permissões foram negadas pelo motorista:", e);
    }
  };

  const handleLogin = async () => {
    if (!entryName.trim()) return;
    setIsLoading(true);

    try {
      let user: UserProfile | null = null;

      if (loginMode === 'client') {
        if (!entryPhone.trim()) {
            alert("Por favor, insira seu telefone.");
            setIsLoading(false);
            return;
        }
        // Registra ou Loga Cliente com Foto e Telefone
        user = await registerClientWithPhoto(entryName, entryPhone, entryAvatarFile || undefined);
      } 
      else if (loginMode === 'driver') {
        if (isRegisteringDriver) {
          // Validação básica
          if (!entryVehicleModel || !entryVehiclePlate) {
              alert("Por favor, preencha o modelo e a placa do veículo.");
              setIsLoading(false);
              return;
          }
          // Pass extended info
          user = await registerDriver(
              entryName, 
              entryVehicleType, 
              entryVehicleModel, 
              entryVehiclePlate, 
              entryVehicleColor,
              entryAvatarFile || undefined
          );
          if (user) await requestDriverPermissions();
        } else {
          // Login
          user = await loginDriver(entryName);
          if (user) {
            await requestDriverPermissions();
          } else {
            // Lógica de Redirecionamento Automático
            alert(`Motorista "${entryName}" não encontrado.\n\nRedirecionando para a tela de cadastro. Por favor, complete os dados do seu veículo e foto.`);
            setIsRegisteringDriver(true);
            setIsLoading(false);
            return; // Interrompe para que o usuário veja a tela de cadastro
          }
        }
      }
      else if (loginMode === 'admin') {
        // Credenciais atualizadas
        if (entryName === 'Holanda2025' && authPassword === '01Deus02@@@@') { 
          user = {
            id: 'admin-master',
            username: 'Holanda2025',
            role: UserRole.ADMIN,
            status: DriverStatus.AVAILABLE,
            avatar_url: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff'
          };
        } else {
          alert("Credenciais de administrador incorretas.");
        }
      }

      if (user) {
        // SALVA NA MEMÓRIA DO APARELHO (PERSISTÊNCIA)
        localStorage.setItem('chegoja_user', JSON.stringify(user));
        setCurrentUser(user);
      }

    } catch (e) {
      console.error("Login Error", e);
      alert("Ocorreu um erro inesperado. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
      // LIMPA MEMÓRIA DO APARELHO
      localStorage.removeItem('chegoja_user');
      setCurrentUser(null);
      setContactList([]);
      setMessages([]);
      setActiveContact(null);
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

  const handleStatusToggle = async () => {
    if (!currentUser || currentUser.role !== UserRole.DRIVER) return;
    
    const newStatus = currentUser.status === DriverStatus.AVAILABLE ? DriverStatus.BUSY : DriverStatus.AVAILABLE;
    
    // Optimistic Update
    const updatedUser = { ...currentUser, status: newStatus };
    setCurrentUser(updatedUser);
    localStorage.setItem('chegoja_user', JSON.stringify(updatedUser));
    
    // Update DB
    await updateDriverStatus(currentUser.id, newStatus);
  };

  const resetForm = () => {
      setEntryName('');
      setEntryPhone('');
      setAvatarPreview(null);
      setEntryAvatarFile(null);
      setAuthPassword('');
      setEntryVehicleModel('');
      setEntryVehiclePlate('');
      setEntryVehicleColor('');
  };

  // --- Render: Admin Dashboard (Dedicated Page) ---
  if (currentUser && currentUser.role === UserRole.ADMIN) {
    return <AdminDashboard currentUser={currentUser} onLogout={handleLogout} />;
  }

  // --- Render: Pending Approval Screen (Drivers) ---
  if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
      return (
          <div className="h-[100dvh] w-full bg-gray-100 flex items-center justify-center p-6 text-center">
              <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
                  <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <span className="material-icons text-4xl text-yellow-600">hourglass_empty</span>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">Cadastro em Análise</h2>
                  <p className="text-gray-500 mb-8">
                      Olá, <b>{currentUser.username}</b>. Seu cadastro foi recebido e está aguardando aprovação da administração.
                      Você será notificado assim que sua conta for ativada.
                  </p>
                  
                  <div className="space-y-4">
                      <a 
                        href="https://wa.me/5581999999999" // TODO: Update with real admin number
                        target="_blank"
                        rel="noreferrer" 
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition shadow-md"
                      >
                          <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WA" className="w-5 h-5 filter brightness-0 invert" />
                          Falar com Suporte
                      </a>
                      
                      <button 
                          onClick={handleLogout}
                          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-3 rounded-lg transition"
                      >
                          Sair / Voltar
                      </button>
                  </div>
              </div>
          </div>
      );
  }

  // --- Render: Login Screen ---
  if (!currentUser) {
    return (
      <div className="h-[100dvh] w-full bg-gray-100 flex items-center justify-center relative overflow-hidden">
        {/* Top Right Controls */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-20">
          <button 
            onClick={() => { setLoginMode('driver'); setIsRegisteringDriver(false); resetForm(); }}
            className={`p-3 rounded-full transition shadow-lg ${loginMode === 'driver' ? 'bg-whatsapp-green text-white transform scale-110' : 'bg-white text-gray-400'}`}
            title="Acesso Motorista"
          >
            <span className="material-icons">directions_car</span>
          </button>
          
          <button 
            onClick={() => { setLoginMode('admin'); setEntryName(''); setAuthPassword(''); }}
            className={`p-3 rounded-full transition shadow-lg ${loginMode === 'admin' ? 'bg-blue-600 text-white transform scale-110' : 'bg-white text-gray-400'}`}
            title="Acesso Admin"
          >
            <span className="material-icons">admin_panel_settings</span>
          </button>
          
          {loginMode !== 'client' && (
            <button 
              onClick={() => { setLoginMode('client'); resetForm(); }}
              className="p-3 bg-white text-gray-400 shadow-lg rounded-full hover:text-whatsapp-green"
              title="Voltar para Cliente"
            >
              <span className="material-icons">person</span>
            </button>
          )}
        </div>

        <div className="bg-white p-8 rounded-xl shadow-xl w-[90%] max-w-md text-center z-10 max-h-[90vh] overflow-y-auto">
          <div className="mb-6 flex flex-col items-center">
             {/* Avatar Picker for Client OR Driver Registration */}
             {(loginMode === 'client' || (loginMode === 'driver' && isRegisteringDriver)) ? (
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
                ? (isRegisteringDriver ? 'Complete seu cadastro com foto e dados do veículo.' : 'Entre para ver solicitações.')
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

            {loginMode === 'driver' && isRegisteringDriver && (
                <>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setEntryVehicleType('car')}
                            className={`flex-1 p-2 rounded-lg border flex items-center justify-center gap-2 transition ${entryVehicleType === 'car' ? 'bg-whatsapp-green text-white border-whatsapp-green' : 'bg-gray-50 text-gray-500 border-gray-300'}`}
                        >
                            <span className="material-icons text-sm">directions_car</span>
                            Carro
                        </button>
                        <button 
                            onClick={() => setEntryVehicleType('motorcycle')}
                            className={`flex-1 p-2 rounded-lg border flex items-center justify-center gap-2 transition ${entryVehicleType === 'motorcycle' ? 'bg-whatsapp-green text-white border-whatsapp-green' : 'bg-gray-50 text-gray-500 border-gray-300'}`}
                        >
                            <span className="material-icons text-sm">two_wheeler</span>
                            Moto
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="text"
                            placeholder="Modelo (Ex: Civic)"
                            value={entryVehicleModel}
                            onChange={e => setEntryVehicleModel(e.target.value)}
                            className="col-span-2 p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-gray-50"
                        />
                         <input
                            type="text"
                            placeholder="Placa"
                            value={entryVehiclePlate}
                            onChange={e => setEntryVehiclePlate(e.target.value)}
                            className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-gray-50 uppercase"
                        />
                         <input
                            type="text"
                            placeholder="Cor"
                            value={entryVehicleColor}
                            onChange={e => setEntryVehicleColor(e.target.value)}
                            className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-gray-50"
                        />
                    </div>
                </>
            )}

            {(loginMode === 'driver' || loginMode === 'admin') && !isRegisteringDriver && (
              <div>
                  <input
                    type="password"
                    placeholder={loginMode === 'admin' ? "Senha Admin" : "Senha"}
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    disabled={isLoading}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-gray-50"
                  />
              </div>
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
                  loginMode === 'client' ? 'INICIAR ATENDIMENTO' : (isRegisteringDriver ? 'FINALIZAR CADASTRO' : 'ENTRAR')
              )}
            </button>
          </div>

          {loginMode === 'driver' && (
            <div className="mt-4 text-sm">
              <button 
                onClick={() => { setIsRegisteringDriver(!isRegisteringDriver); resetForm(); }}
                className="text-whatsapp-green hover:underline font-medium p-2"
                disabled={isLoading}
              >
                {isRegisteringDriver ? 'Já tenho conta? Fazer Login' : 'Não tem conta? Cadastre-se como Motorista'}
              </button>
            </div>
          )}
        </div>
        
        {/* Version Indicator */}
        <div className="absolute bottom-2 text-xs text-gray-400 opacity-50 font-mono">
            {APP_NAME} {APP_VERSION}
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
          <div className="flex gap-2 text-gray-400 items-center">
             {currentUser.role === UserRole.DRIVER && (
                 <>
                    {/* Status Toggle Button - HIGHLIGHTED */}
                    <button 
                        onClick={handleStatusToggle}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 shadow-sm ${
                            currentUser.status === DriverStatus.AVAILABLE 
                            ? 'bg-green-600 text-white hover:bg-green-500 ring-2 ring-green-600/30' 
                            : 'bg-red-600 text-white hover:bg-red-500 ring-2 ring-red-600/30'
                        }`}
                        title="Toque para mudar status"
                    >
                        <span className="material-icons text-sm">{currentUser.status === DriverStatus.AVAILABLE ? 'lock_open' : 'lock'}</span>
                        {currentUser.status === DriverStatus.AVAILABLE ? 'LIVRE' : 'OCUPADO'}
                    </button>
                    
                    {/* Admin Contact Button - HIGHLIGHTED */}
                    <a 
                        href="https://wa.me/5581999999999" // TODO: Update admin number
                        target="_blank"
                        rel="noreferrer"
                        className="bg-gray-700 hover:bg-gray-600 text-gray-200 p-2 rounded-full transition flex items-center justify-center" 
                        title="Falar com Suporte/Admin"
                    >
                        <span className="material-icons text-sm">support_agent</span>
                    </a>
                 </>
             )}
            <button className="p-2 rounded-full hover:bg-gray-700 transition" title="Configurações"><span className="material-icons">settings</span></button>
            <button className="p-2 rounded-full hover:bg-red-900/30 hover:text-red-400 transition" title="Sair" onClick={handleLogout}><span className="material-icons">logout</span></button>
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
                  <div className="flex items-center gap-1">
                      <h3 className="text-gray-100 font-medium truncate text-[16px]">{contact.username}</h3>
                      {contact.role === UserRole.DRIVER && (
                          <span 
                            className={`material-icons text-sm ml-1 ${contact.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}
                            title={contact.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                          >
                             {contact.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                          </span>
                      )}
                  </div>
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
                     <span className="text-white font-medium text-base leading-tight flex items-center gap-1">
                        {activeContact.username}
                        {activeContact.role === UserRole.DRIVER && (
                          <span className={`material-icons text-xs ${activeContact.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}>
                             {activeContact.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                          </span>
                        )}
                     </span>
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
