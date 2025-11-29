import React, { useState, useEffect, useRef } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { AdminDashboard } from './components/AdminDashboard';
import { InstallPrompt } from './components/InstallPrompt'; // Importar componente
import { AndroidSetup } from './components/AndroidSetup'; // Importar componente Android
import { BingoUserView } from './components/BingoUserView'; // Importar Bingo
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
  fetchAdminContact,
  fetchUserProfile, // Nova função importada
  subscribeToBroadcasts // Importar função de broadcast
} from './services/supabaseClient';
import { UserProfile, UserRole, DriverStatus, Message, BroadcastMessage } from './types';
import { APP_NAME } from './constants';
import { soundService } from './services/soundService';

const APP_VERSION = "3.2 (Broadcast Update)";

const MarqueeBanner = () => (
  <div className="bg-gradient-to-r from-purple-900 via-indigo-800 to-purple-900 overflow-hidden relative h-8 flex items-center shadow-md z-30 shrink-0">
     <div className="animate-marquee whitespace-nowrap flex gap-10 items-center w-full">
         <span className="text-yellow-300 font-bold text-sm flex items-center gap-2">
             <span className="material-icons text-sm">stars</span>
             ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ
         </span>
         <span className="text-white font-medium text-xs">Instale o App e participe dos sorteios exclusivos.</span>
         <span className="text-yellow-300 font-bold text-sm flex items-center gap-2">
             <span className="material-icons text-sm">emoji_events</span>
             SORTEIO ATIVO AGORA!
         </span>
         <span className="text-white font-medium text-xs">Clique no ícone do Bingo para ver sua cartela.</span>
         {/* Duplicate for seamless loop */}
         <span className="text-yellow-300 font-bold text-sm flex items-center gap-2 ml-10">
             <span className="material-icons text-sm">stars</span>
             ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ
         </span>
         <span className="text-white font-medium text-xs">Instale o App e participe dos sorteios exclusivos.</span>
     </div>
     {/* Shine Effect */}
     <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-1/2 h-full -skew-x-12 animate-shimmer pointer-events-none"></div>
  </div>
);

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
  
  // Password State
  const [entryPassword, setEntryPassword] = useState('');
  const [authPassword, setAuthPassword] = useState(''); // Used for Login
  const [isLoading, setIsLoading] = useState(false);

  // Mobile View State
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [showAndroidSetup, setShowAndroidSetup] = useState(false); // Estado do modal Android
  
  // BINGO STATE
  const [showBingo, setShowBingo] = useState(false);

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
       // Do not load normal contacts if not approved. 
       // Instead, we will fetch Admin as the contact for "Pending" screen logic below
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
             // In a full app we would sync user profile here
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

    // 1. Load History if a contact is active
    if (activeContact) {
        const loadHistory = async () => {
            const history = await fetchMessages(currentUser.id, activeContact.id);
            setMessages(history);
        };
        loadHistory();
    }

    // 2. Subscribe to new messages (Background Aware)
    const sub = subscribeToMessages(currentUser.id, async (newMsg) => {
      // Logic for received messages
      if (newMsg.sender_id !== currentUser.id) {
        
        // --- NOTIFICAÇÃO GENÉRICA (CLIENTE OU MOTORISTA) ---
        // Se o app estiver em segundo plano, manda notificação push
        if (document.visibilityState === 'hidden' || !document.hasFocus() || window.Android) {
             const senderName = contactList.find(c => c.id === newMsg.sender_id)?.username || "Novo Cliente";
             soundService.sendNotification(
                 `Mensagem de ${senderName}`, 
                 newMsg.media_type === 'text' ? newMsg.content : '📷 Enviou uma mídia'
             );
        }

        // ============================================================
        // 🔥 LÓGICA DE ALERTA E SOM
        // ============================================================
        if (currentUser.role === UserRole.DRIVER && currentUser.is_approved) {
             
             // 1. DETECÇÃO DE CHAMADA ENTRANTE (PELO TEXTO DE ALERTA)
             const isIncomingCallAlert = newMsg.content && (
                newMsg.content.includes("Cliente ligando") || 
                newMsg.content.includes("ligando...")
             );

             if (isIncomingCallAlert) {
                 console.log("ALERTA DE CHAMADA RECEBIDO: Disparando som nativo imediatamente.");
                 soundService.playRingtone();
             } else {
                 // 2. MENSAGEM DE TEXTO COMUM PARA MOTORISTA
                 // Aqui usamos a nova lógica de PRIORIDADE PARA MENSAGEM
                 console.log("MENSAGEM DE TEXTO RECEBIDA: Disparando alerta de mensagem.");
                 soundService.playMessageAlert();
             }

             // 3. Força o app Android a vir para frente (PRIORIDADE VISUAL)
             if (window.Android && window.Android.bringToFront) {
                 window.Android.bringToFront();
             }

             // 4. Busca o perfil de quem enviou (pode ser novo cliente)
             let senderProfile = contactList.find(c => c.id === newMsg.sender_id);
             
             if (!senderProfile) {
                 senderProfile = await fetchUserProfile(newMsg.sender_id) || undefined;
                 if (senderProfile) {
                     setContactList(prev => [senderProfile as UserProfile, ...prev]);
                 }
             }

             // 5. SETA O CONTATO ATIVO (Auto-Open)
             // Se for Chamada, abre na hora. Se for mensagem, também abre para o motorista responder rápido.
             if (senderProfile) {
                 setTimeout(() => {
                     setActiveContact(senderProfile);
                     setShowChatOnMobile(true);
                 }, 200);
             }
        }
        else {
            // Se for cliente, comportamento padrão (som suave)
             soundService.playReceived();
             
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
      }

      // If this message belongs to the active chat, append it
      if ((activeContact && (newMsg.sender_id === activeContact.id || newMsg.receiver_id === activeContact.id)) || (newMsg.sender_id === activeContact?.id)) {
          setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
          });
      }
    });

    return () => {
      sub.unsubscribe();
    };
  }, [currentUser, activeContact, contactList]);

  // --- NOVA LÓGICA DE BROADCAST (Notificações Globais) ---
  useEffect(() => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return;

    const handleBroadcast = (broadcast: BroadcastMessage) => {
        // Verifica se a mensagem é para mim
        if (broadcast.target_role === 'all' || broadcast.target_role === currentUser.role) {
            
            // Exibe notificação do sistema se em segundo plano
            if (document.visibilityState === 'hidden' || !document.hasFocus()) {
                soundService.sendNotification(broadcast.title, broadcast.message);
            }

            // Toca som específico do perfil
            if (currentUser.role === UserRole.DRIVER) {
                // Para motoristas, usamos o som de alerta/chamada (ALTO)
                soundService.playRingtone();
                setTimeout(() => soundService.stopRingtone(), 5000); // Para após 5s
            } else {
                // Para clientes, usamos o som de notificação padrão (SUAVE)
                soundService.playReceived();
            }

            // Exibe um alerta visual simples dentro do app
            alert(`[Notificação do Admin]\n${broadcast.title}\n\n${broadcast.message}`);
        }
    };

    const sub = subscribeToBroadcasts(handleBroadcast);

    return () => {
        sub.unsubscribe();
    };

  }, [currentUser]);

  // --- Handlers ---

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setEntryAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const requestDriverPermissions = async () => {
    console.log("Iniciando solicitação de permissões completas do motorista...");
    try {
      // 1. Notificações (Som e Pop-up) - Crucial para segundo plano
      await soundService.requestPermission();

      // 2. Microfone E Camera (Pedir TUDO de uma vez para não bloquear)
      // Nota: Em dispositivos móveis, isso deve ser feito em resposta a um clique
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Para imediatamente, só queremos a permissão concedida no navegador
        stream.getTracks().forEach(track => track.stop()); 
        console.log("Permissão Microfone: OK");
      } catch (err) {
        console.warn("Permissão de Microfone negada:", err);
      }

      // 3. Geolocalização (Essencial)
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => console.log("GPS Ativo e Permitido", pos.coords),
          (err) => {
             console.warn("GPS Negado ou Erro", err);
          },
          { enableHighAccuracy: true }
        );
      }

    } catch (e) {
      console.warn("Erro geral ao solicitar permissões:", e);
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
          if (!entryVehicleModel || !entryVehiclePlate || !entryPassword) {
              alert("Por favor, preencha todos os campos obrigatórios, incluindo a senha.");
              setIsLoading(false);
              return;
          }
          // Pass extended info with password
          user = await registerDriver(
              entryName, 
              entryPassword,
              entryVehicleType, 
              entryVehicleModel, 
              entryVehiclePlate, 
              entryVehicleColor,
              entryAvatarFile || undefined
          );
        } else {
          // Login com Senha
          if (!authPassword) {
            alert("Por favor, digite sua senha.");
            setIsLoading(false);
            return;
          }

          user = await loginDriver(entryName, authPassword);
          
          if (!user) {
            // Se falhou login
            alert(`Usuário ou senha incorretos. Verifique suas credenciais.`);
            setIsLoading(false);
            return; 
          }
        }
      }
      else if (loginMode === 'admin') {
        // Credenciais atualizadas
        if (entryName === 'Holanda2025' && authPassword === '01Deus02@@@@') { 
          // Tentamos pegar o admin real do DB se existir, senão usamos o mock
          const realAdmin = await fetchAdminContact();
          if (realAdmin) {
              user = realAdmin;
          } else {
            // Fallback (não ideal para chat, mas permite gestão)
            user = {
                id: 'admin-master',
                username: 'Holanda2025',
                role: UserRole.ADMIN,
                status: DriverStatus.AVAILABLE,
                avatar_url: 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff'
            };
          }
        } else {
          alert("Credenciais de administrador incorretas.");
        }
      }

      if (user) {
        // SALVA NA MEMÓRIA DO APARELHO (PERSISTÊNCIA)
        localStorage.setItem('chegoja_user', JSON.stringify(user));
        setCurrentUser(user);
        
        // Solicita permissões logo após login se for motorista
        if (user.role === UserRole.DRIVER) {
             requestDriverPermissions();
        }
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
    if (!currentUser || currentUser.role !== UserRole.DRIVER || !currentUser.is_approved) return;
    
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
      setEntryPassword('');
      setEntryVehicleModel('');
      setEntryVehiclePlate('');
      setEntryVehicleColor('');
  };

  // --- Render: Admin Dashboard (Dedicated Page) ---
  if (currentUser && currentUser.role === UserRole.ADMIN) {
    return <AdminDashboard currentUser={currentUser} onLogout={handleLogout} />;
  }

  // --- Render: Pending Approval Screen (Drivers) WITH CHAT ---
  if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
      
      // Auto-load Admin as contact if not set
      if (!activeContact) {
         fetchAdminContact().then(admin => {
             if (admin) setActiveContact(admin);
         });
      }

      // Realtime listener for self-approval
      // Isso atualiza a tela do motorista automaticamente quando o admin aprovar
      useEffect(() => {
          console.log("Monitorando aprovação do motorista...");
          const sub = subscribeToProfiles(async () => {
              if (currentUser) {
                  // Re-fetch my own data to check approval
                  const me = await loginDriver(currentUser.username, currentUser.password || undefined);
                  if (me && me.is_approved) {
                      console.log("Motorista aprovado! Atualizando tela...");
                      setCurrentUser(me);
                      localStorage.setItem('chegoja_user', JSON.stringify(me));
                      // Force reload to clean up states
                      window.location.reload(); 
                  }
              }
          });
          return () => {
              sub.unsubscribe();
          };
      }, [currentUser]);

      return (
          <div className="flex h-[100dvh] w-full flex-col bg-gray-100 relative overflow-hidden">
            <InstallPrompt />
            {showAndroidSetup && <AndroidSetup onClose={() => setShowAndroidSetup(false)} />}
            
            {/* Header de Aviso */}
            <div className="bg-yellow-500 p-3 text-white shadow-md z-20 shrink-0">
                <div className="flex items-center justify-between px-2 mb-2">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
                            <span className="material-icons text-white">hourglass_empty</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-sm">Cadastro Realizado!</span>
                            <span className="text-xs opacity-90">Aguardando liberação do Admin.</span>
                        </div>
                    </div>
                    <button onClick={handleLogout} className="text-white/80 hover:text-white">
                        <span className="material-icons">logout</span>
                    </button>
                </div>
                
                {/* BOTÃO GRANDE PARA ATIVAR PERMISSÕES */}
                <div className="grid grid-cols-2 gap-2">
                    <button 
                        onClick={requestDriverPermissions}
                        className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 animate-pulse border-2 border-white/30"
                    >
                        <span className="material-icons">notifications_active</span>
                        PERMISSÕES WEB
                    </button>
                    
                    {/* BOTÃO PARA APP NATIVO */}
                    <button 
                        onClick={() => setShowAndroidSetup(true)}
                        className="w-full bg-green-700 hover:bg-green-800 active:scale-95 text-white font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 border-2 border-green-500/50"
                    >
                        <span className="material-icons">android</span>
                        BAIXAR APP NATIVO
                    </button>
                </div>
                <p className="text-[10px] text-white/80 text-center mt-1">
                    Fale com o suporte abaixo para agilizar sua aprovação.
                </p>
            </div>

            {/* Chat Area (Preenche o resto da tela) */}
            <div className="flex-1 relative bg-whatsapp-panel">
                 {activeContact ? (
                     <ChatWindow 
                         currentUser={currentUser}
                         chatPartner={activeContact}
                         messages={messages}
                         onSendMessage={(msg) => setMessages(p => [...p, msg])}
                     />
                 ) : (
                     <div className="h-full flex items-center justify-center text-gray-500">
                         <span className="animate-spin mr-2 material-icons">sync</span> Conectando ao suporte...
                     </div>
                 )}
            </div>
          </div>
      );
  }

  // --- Render: Login Screen ---
  if (!currentUser) {
    return (
      <div className="h-[100dvh] w-full bg-gray-100 flex items-center justify-center relative overflow-hidden">
        
        {/* PWA Prompt Component - Always active on login screen */}
        <InstallPrompt />

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

        <div className="bg-white p-8 rounded-xl shadow-xl w-[90%] max-w-md text-center z-10 max-h-[90vh] overflow-y-auto custom-scrollbar">
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
                ? (isRegisteringDriver ? 'Complete seu cadastro para análise.' : 'Entre para trabalhar.')
                : 'Acesso restrito.'}
          </p>

          <div className="space-y-3">
            <input
              type="text"
              placeholder={loginMode === 'client' ? "Seu Nome Completo" : "Nome de Usuário"}
              value={entryName}
              onChange={e => setEntryName(e.target.value)}
              disabled={isLoading}
              className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
            />

            {loginMode === 'client' && (
                <input
                    type="tel"
                    placeholder="Seu Telefone (Whatsapp)"
                    value={entryPhone}
                    onChange={e => setEntryPhone(e.target.value)}
                    disabled={isLoading}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
                />
            )}

            {loginMode === 'driver' && isRegisteringDriver && (
                <>
                    <input
                        type="password"
                        placeholder="Crie uma Senha"
                        value={entryPassword}
                        onChange={e => setEntryPassword(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
                    />

                    <div className="flex gap-2">
                        <button 
                            onClick={() => setEntryVehicleType('car')}
                            className={`flex-1 p-3 rounded-lg border flex items-center justify-center gap-2 transition ${entryVehicleType === 'car' ? 'bg-whatsapp-green text-white border-whatsapp-green' : 'bg-white text-gray-500 border-gray-300'}`}
                        >
                            <span className="material-icons text-sm">directions_car</span>
                            Carro
                        </button>
                        <button 
                            onClick={() => setEntryVehicleType('motorcycle')}
                            className={`flex-1 p-3 rounded-lg border flex items-center justify-center gap-2 transition ${entryVehicleType === 'motorcycle' ? 'bg-whatsapp-green text-white border-whatsapp-green' : 'bg-white text-gray-500 border-gray-300'}`}
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
                            className="col-span-2 p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
                        />
                         <input
                            type="text"
                            placeholder="Placa"
                            value={entryVehiclePlate}
                            onChange={e => setEntryVehiclePlate(e.target.value)}
                            className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm uppercase"
                        />
                         <input
                            type="text"
                            placeholder="Cor"
                            value={entryVehicleColor}
                            onChange={e => setEntryVehicleColor(e.target.value)}
                            className="p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
                        />
                    </div>
                </>
            )}

            {(loginMode === 'driver' && !isRegisteringDriver) || loginMode === 'admin' ? (
              <div>
                  <input
                    type="password"
                    placeholder="Sua Senha"
                    value={authPassword}
                    onChange={e => setAuthPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    disabled={isLoading}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:border-whatsapp-green transition bg-white text-base text-black placeholder-gray-500 font-medium shadow-sm"
                  />
              </div>
            ) : null}

            <button
              onClick={handleLogin}
              disabled={isLoading}
              className={`w-full text-white font-bold py-3.5 rounded-lg transition shadow-md flex justify-center items-center active:scale-95 ${
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
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-app-bg relative">
      <MarqueeBanner />
      
      <div className="flex-1 flex overflow-hidden relative">
        <InstallPrompt />
        {showAndroidSetup && <AndroidSetup onClose={() => setShowAndroidSetup(false)} />}
        
        {/* BINGO OVERLAY */}
        {showBingo && currentUser && (
            <div className="absolute inset-0 z-[100]">
                <BingoUserView currentUser={currentUser} onClose={() => setShowBingo(false)} />
            </div>
        )}
        
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
                
                {/* BINGO BUTTON */}
                <button 
                    onClick={() => setShowBingo(true)}
                    className="bg-purple-700 hover:bg-purple-600 text-white p-2 rounded-full transition flex items-center justify-center animate-pulse shadow-lg"
                    title="Jogar Bingo"
                >
                    <span className="material-icons text-sm">casino</span>
                </button>

                {currentUser.role === UserRole.DRIVER && (
                    <>
                        {/* Status Toggle Button - HIGHLIGHTED */}
                        <button 
                            onClick={handleStatusToggle}
                            className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 shadow-sm ${
                                !currentUser.is_approved ? 'bg-gray-500 cursor-not-allowed' :
                                currentUser.status === DriverStatus.AVAILABLE 
                                ? 'bg-green-600 text-white hover:bg-green-500 ring-2 ring-green-600/30' 
                                : 'bg-red-600 text-white hover:bg-red-500 ring-2 ring-red-600/30'
                            }`}
                            title={!currentUser.is_approved ? "Aguardando Aprovação" : "Toque para mudar status"}
                            disabled={!currentUser.is_approved}
                        >
                            <span className="material-icons text-sm">{currentUser.status === DriverStatus.AVAILABLE ? 'lock_open' : 'lock'}</span>
                            {currentUser.status === DriverStatus.AVAILABLE ? 'LIVRE' : 'OCUPADO'}
                        </button>
                        
                        {/* Admin Contact Button / Native App Button - HIGHLIGHTED */}
                        <button 
                            onClick={() => setShowAndroidSetup(true)}
                            className="bg-green-700 hover:bg-green-600 text-white p-2 rounded-full transition flex items-center justify-center animate-pulse" 
                            title="Baixar App Nativo Android"
                        >
                            <span className="material-icons text-sm">android</span>
                        </button>
                    </>
                )}
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
                    <div className="flex items-center gap-2">
                        <h3 className="text-gray-100 font-medium truncate text-[16px]">{contact.username}</h3>
                        {contact.role === UserRole.DRIVER && (
                           <>
                             <span 
                                className={`material-icons text-sm ml-1 ${contact.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}
                                title={contact.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                            >
                                {contact.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                            </span>
                            <span className={`text-xs font-bold uppercase ${contact.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}>
                                {contact.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                            </span>
                           </>
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
    </div>
  );
}