
import React, { useState, useEffect, useRef } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { AdminDashboard } from './components/AdminDashboard';
import { InstallPrompt } from './components/InstallPrompt'; // Importar componente
import { AndroidSetup } from './components/AndroidSetup'; // Importar componente Android
import { BingoUserView } from './components/BingoUserView'; // Importar Bingo
import { DriverSubscription } from './components/DriverSubscription'; // Importar Planos
import { RideCalculator } from './components/RideCalculator'; // Importar Calculadora
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
  subscribeToBroadcasts, // Importar função de broadcast
  fetchAppSettings, // Import fetchAppSettings
  updateUserLocation // Import updateUserLocation
} from './services/supabaseClient';
import { activatePlan, checkSubscriptionStatus } from './services/paymentService';
import { UserProfile, UserRole, DriverStatus, Message, BroadcastMessage } from './types';
import { APP_NAME } from './constants';
import { soundService } from './services/soundService';

const APP_VERSION = "3.9 (Nav Fluid)";

interface MarqueeProps {
  text: string;
}

const MarqueeBanner: React.FC<MarqueeProps> = ({ text }) => (
  <div className="bg-gradient-to-r from-purple-900 via-indigo-800 to-purple-900 overflow-hidden relative h-8 flex items-center shadow-md z-30 shrink-0">
    <div className="animate-marquee whitespace-nowrap flex gap-10 items-center w-full">
      <span className="text-yellow-300 font-bold text-sm flex items-center gap-2">
        <span className="material-icons text-sm">stars</span>
        {text}
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
        {text}
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

  // PLANOS STATE
  const [showPlans, setShowPlans] = useState(false);

  // CALCULATOR STATE
  const [showCalculator, setShowCalculator] = useState(false);

  // DRIVER MENU STATE
  const [showDriverMenu, setShowDriverMenu] = useState(false);

  // MARQUEE STATE
  const [bannerText, setBannerText] = useState('ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ');

  // Refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<any>(null);

  // Computed Subscription Status
  const subStatus = currentUser?.role === UserRole.DRIVER
    ? checkSubscriptionStatus(currentUser.subscription_expires_at)
    : { isValid: true, daysLeft: 0 };

  // --- Lifecycle ---

  // 0. LOAD APP SETTINGS (Marquee Text)
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await fetchAppSettings();
      if (settings.marquee_text) {
        setBannerText(settings.marquee_text);
      }
    };
    loadSettings();

    // Remove Splash Screen
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.remove();
      }, 500);
    }
  }, []);

  // 1. PERSISTÊNCIA DE DADOS (LOCAL STORAGE)
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

  // 2. CHECK PAYMENT RETURN (Mercado Pago Redirect)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const status = query.get('status');
    const planId = query.get('plan_id');

    if (status === 'approved' && planId && currentUser) {
      const processPayment = async () => {
        setIsLoading(true);
        const success = await activatePlan(currentUser.id, planId);
        if (success) {
          alert("Pagamento aprovado! Seu plano foi ativado.");
          const updatedUser = await loginDriver(currentUser.username, currentUser.password);
          if (updatedUser) {
            setCurrentUser(updatedUser);
            localStorage.setItem('chegoja_user', JSON.stringify(updatedUser));
          }
        } else {
          alert("Houve um problema ao ativar seu plano. Entre em contato com o suporte.");
        }
        window.history.replaceState({}, document.title, "/");
        setIsLoading(false);
      };
      processPayment();
    }
  }, [currentUser]);

  // 3. Wake Lock for Drivers
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

  // 3.5 PiP Exit Listener (Native)
  useEffect(() => {
    const handlePipExit = () => {
      console.log("Saiu do PiP - Tocando alerta");
      window.focus();
      setTimeout(() => {
        soundService.playPipExitSound();
      }, 500);
    };

    window.addEventListener('pipExit', handlePipExit);
    return () => window.removeEventListener('pipExit', handlePipExit);
  }, []);

  // 4. Load Contacts
  useEffect(() => {
    if (!currentUser) return;

    if (currentUser.role === UserRole.ADMIN) return;

    if (currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
      return;
    }

    const loadContacts = async () => {
      if (currentUser.role === UserRole.CLIENT) {
        const drivers = await fetchOnlineDrivers();
        setContactList(drivers);
      } else if (currentUser.role === UserRole.DRIVER) {
        const clients = await fetchMyClients(currentUser.id);
        setContactList(clients);
      }
    };

    loadContacts();

    const profileSub = subscribeToProfiles(() => {
      loadContacts();
    });

    return () => {
      profileSub.unsubscribe();
    };
  }, [currentUser]);

  // 5. Load History and Subscribe to Messages
  useEffect(() => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return;

    if (activeContact) {
      const loadHistory = async () => {
        const history = await fetchMessages(currentUser.id, activeContact.id);
        setMessages(history);
      };
      loadHistory();
    }

    const sub = subscribeToMessages(currentUser.id, async (newMsg) => {
      if (newMsg.sender_id !== currentUser.id) {

        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
          const senderName = contactList.find(c => c.id === newMsg.sender_id)?.username || "Novo Cliente";
          soundService.sendNotification(
            `Mensagem de ${senderName}`,
            newMsg.media_type === 'text' ? newMsg.content : '📷 Enviou uma mídia'
          );
        }

        if (currentUser.role === UserRole.DRIVER && currentUser.is_approved) {
          const isIncomingCallAlert = newMsg.content && (
            newMsg.content.includes("Cliente ligando") ||
            newMsg.content.includes("ligando...")
          );

          // LÓGICA DE INTERRUPÇÃO (NOVA)
          // Se o motorista já estiver falando com alguém E a nova mensagem for de OUTRA pessoa
          if (activeContact && activeContact.id !== newMsg.sender_id) {
            // 1. Toca som discreto (Notificação)
            soundService.playReceived();

            // 2. Incrementa contador na lista (Badge)
            setContactList(prev => {
              const exists = prev.some(c => c.id === newMsg.sender_id);
              if (exists) {
                return prev.map(c => c.id === newMsg.sender_id ? { ...c, unread_count: (c.unread_count || 0) + 1 } : c);
              } else {
                // Se não estiver na lista, busca e adiciona com contador
                fetchUserProfile(newMsg.sender_id).then(profile => {
                  if (profile) {
                    setContactList(current => [{ ...profile, unread_count: 1 }, ...current]);
                  }
                });
                return prev;
              }
            });

            // 3. NÃO INTERROMPE (Não chama bringToFront agressivo nem setActiveContact)
            return;
          }

          // SE ESTIVER LIVRE OU A MENSAGEM FOR DO CHAT ATUAL:

          if (isIncomingCallAlert) {
            soundService.playRingtone();
          } else {
            soundService.playMessageAlert();
          }

          if (window.Android && window.Android.bringToFront) {
            window.Android.bringToFront();
          }

          let senderProfile = contactList.find(c => c.id === newMsg.sender_id);

          if (!senderProfile) {
            senderProfile = await fetchUserProfile(newMsg.sender_id) || undefined;
            if (senderProfile) {
              setContactList(prev => [senderProfile as UserProfile, ...prev]);
            }
          }

          if (senderProfile) {
            // Se já estiver no chat com ele, não precisa "abrir" de novo, já está aberto.
            // Só força a abertura se não estiver ativo.
            if (!activeContact) {
              setTimeout(() => {
                setActiveContact(senderProfile);
                setShowChatOnMobile(true);
              }, 200);
            }
          }
        }
        else {
          // Lógica para Clientes ou Motoristas não aprovados
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

  // 6. Broadcast Listener
  useEffect(() => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return;

    const handleBroadcast = (broadcast: BroadcastMessage) => {
      if (broadcast.target_role === 'all' || broadcast.target_role === currentUser.role) {

        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
          soundService.sendNotification(broadcast.title, broadcast.message);
        }

        if (currentUser.role === UserRole.DRIVER) {
          soundService.playRingtone();
          setTimeout(() => soundService.stopRingtone(), 5000);
        } else {
          soundService.playReceived();
        }

        alert(`[Notificação do Admin]\n${broadcast.title}\n\n${broadcast.message}`);
      }
    };

    const sub = subscribeToBroadcasts(handleBroadcast);

    return () => {
      sub.unsubscribe();
    };

  }, [currentUser]);

  // 7. Pending Driver Logic: Auto-select Admin Contact (MOVED TO TOP LEVEL)
  useEffect(() => {
    if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false && !activeContact) {
      fetchAdminContact().then(admin => {
        if (admin) setActiveContact(admin);
      });
    }
  }, [currentUser, activeContact]);

  // 8. Pending Driver Logic: Realtime Self-Approval Listener (MOVED TO TOP LEVEL)
  useEffect(() => {
    let sub: any;
    if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
      console.log("Monitorando aprovação do motorista...");
      sub = subscribeToProfiles(async () => {
        if (currentUser) {
          const me = await loginDriver(currentUser.username, currentUser.password || undefined);
          if (me && me.is_approved) {
            console.log("Motorista aprovado! Atualizando tela...");
            setCurrentUser(me);
            localStorage.setItem('chegoja_user', JSON.stringify(me));
            window.location.reload();
          }
        }
      });
    }
    return () => {
      if (sub) sub.unsubscribe();
    };
  }, [currentUser]);

  // 9. Continuous Location Tracking (GPS)
  useEffect(() => {
    if (!currentUser) return;

    let watchId: number | null = null;

    if ('geolocation' in navigator) {
      console.log("Iniciando rastreamento de localização contínuo...");
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // Atualiza no banco de dados (Silent update)
          updateUserLocation(currentUser.id, latitude, longitude);
        },
        (error) => {
          console.warn("Erro no rastreamento de localização:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 5000
        }
      );
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        console.log("Rastreamento de localização parado.");
      }
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
      await soundService.requestPermission();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        console.log("Permissão Microfone: OK");
      } catch (err) {
        console.warn("Permissão de Microfone negada:", err);
      }

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
        user = await registerClientWithPhoto(entryName, entryPhone, entryAvatarFile || undefined);
      }
      else if (loginMode === 'driver') {
        if (isRegisteringDriver) {
          if (!entryVehicleModel || !entryVehiclePlate || !entryPassword) {
            alert("Por favor, preencha todos os campos obrigatórios, incluindo a senha.");
            setIsLoading(false);
            return;
          }
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
          if (!authPassword) {
            alert("Por favor, digite sua senha.");
            setIsLoading(false);
            return;
          }

          user = await loginDriver(entryName, authPassword);

          if (!user) {
            alert(`Usuário ou senha incorretos. Verifique suas credenciais.`);
            setIsLoading(false);
            return;
          }
        }
      }
      else if (loginMode === 'admin') {
        if (entryName === 'Holanda2025' && authPassword === '01Deus02@@@@') {
          const realAdmin = await fetchAdminContact();
          if (realAdmin) {
            user = realAdmin;
          } else {
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
        localStorage.setItem('chegoja_user', JSON.stringify(user));
        setCurrentUser(user);

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
    localStorage.removeItem('chegoja_user');
    setCurrentUser(null);
    setContactList([]);
    setMessages([]);
    setActiveContact(null);
  };

  const handleContactSelect = (contact: UserProfile) => {
    if (currentUser?.role === UserRole.ADMIN) return;

    // Reset unread count when opening chat
    setContactList(prev => prev.map(c => c.id === contact.id ? { ...c, unread_count: 0 } : c));

    setActiveContact(contact);
    setMessages([]);
    setShowChatOnMobile(true);
  };

  const handleBackToList = () => {
    setShowChatOnMobile(false);
    setActiveContact(null);
  };

  const handleStatusToggle = async () => {
    if (!currentUser || currentUser.role !== UserRole.DRIVER || !currentUser.is_approved) {
      alert("Você precisa ser aprovado pelo admin para ficar online.");
      return;
    }

    if (!subStatus.isValid) {
      alert("Sua assinatura venceu! Renove para ficar online.");
      setShowPlans(true);
      return;
    }

    const newStatus = currentUser.status === DriverStatus.AVAILABLE ? DriverStatus.BUSY : DriverStatus.AVAILABLE;

    const updatedUser = { ...currentUser, status: newStatus };
    setCurrentUser(updatedUser);
    localStorage.setItem('chegoja_user', JSON.stringify(updatedUser));

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

  // --- Render: Hard Block for Expired Drivers ---
  // Se o motorista está aprovado MAS a assinatura venceu, bloqueia tudo
  if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved && !subStatus.isValid) {
    return (
      <DriverSubscription
        currentUser={currentUser}
        onClose={() => { }}
        isBlocked={true}
      />
    );
  }

  // --- Render: Pending Approval Screen (Drivers) WITH CHAT ---
  if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false) {
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
                <span className="font-bold text-sm">Cadastro Enviado!</span>
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
              ATIVAR PERMISSÕES
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
                    <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
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
                {loginMode === 'driver' ? (
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <span className="material-icons text-4xl text-white">security</span>
                )}
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
              className={`w-full text-white font-bold py-3.5 rounded-lg transition shadow-md flex justify-center items-center active:scale-95 ${loginMode === 'admin' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-whatsapp-green hover:bg-whatsapp-outgoing'
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
      <MarqueeBanner text={bannerText} />

      <div className="flex-1 flex overflow-hidden relative">
        <InstallPrompt />
        {showAndroidSetup && <AndroidSetup onClose={() => setShowAndroidSetup(false)} />}

        {/* BINGO OVERLAY */}
        {showBingo && currentUser && (
          <div className="absolute inset-0 z-[100] bg-black/90 animate-fade-in flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <BingoUserView currentUser={currentUser} onClose={() => setShowBingo(false)} />
            </div>
          </div>
        )}

        {/* PLANS OVERLAY */}
        {showPlans && currentUser && (
          <div className="absolute inset-0 z-[100] bg-black/90 animate-fade-in flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <DriverSubscription currentUser={currentUser} onClose={() => setShowPlans(false)} />
            </div>
          </div>
        )}

        {/* CALCULATOR OVERLAY */}
        {showCalculator && currentUser && (
          <RideCalculator currentUser={currentUser} onClose={() => setShowCalculator(false)} />
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
            <div className="flex gap-2 text-gray-400 items-center relative">
              {currentUser.role === UserRole.DRIVER ? (
                <>
                  {/* Status Toggle Button - ALWAYS VISIBLE */}
                  <button
                    onClick={handleStatusToggle}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 shadow-sm ${!currentUser.is_approved ? 'bg-gray-500 cursor-not-allowed' :
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

                  {/* MENU BUTTON */}
                  <div className="relative">
                    <button
                      onClick={() => setShowDriverMenu(!showDriverMenu)}
                      className="p-2 rounded-full hover:bg-gray-700/50 active:scale-90 transition text-gray-300"
                    >
                      <span className="material-icons">grid_view</span>
                      {/* Badge for Plans if expiring */}
                      {subStatus.daysLeft <= 5 && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-whatsapp-panel"></span>
                      )}
                    </button>

                    {/* DROPDOWN MENU */}
                    {showDriverMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowDriverMenu(false)}></div>
                        <div className="absolute right-0 top-12 bg-[#2a3942] rounded-xl shadow-2xl border border-gray-700 p-2 w-48 z-50 flex flex-col gap-1 animate-fade-in">

                          {/* Calculator */}
                          <button
                            onClick={() => { setShowCalculator(true); setShowDriverMenu(false); }}
                            className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                          >
                            <span className="material-icons text-blue-400">calculate</span>
                            Simular Corrida
                          </button>

                          {/* Bingo */}
                          <button
                            onClick={() => { setShowBingo(true); setShowDriverMenu(false); }}
                            className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                          >
                            <span className="material-icons text-purple-400">casino</span>
                            Bingo
                          </button>

                          {/* Plans */}
                          <button
                            onClick={() => { setShowPlans(true); setShowDriverMenu(false); }}
                            className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm w-full text-left"
                          >
                            <span className="material-icons text-yellow-400">monetization_on</span>
                            <div className="flex flex-col">
                              <span>Meus Planos</span>
                              <span className={`text-[10px] font-bold ${subStatus.daysLeft > 5 ? 'text-green-400' : 'text-red-400'}`}>
                                {subStatus.daysLeft} dias restantes
                              </span>
                            </div>
                          </button>

                          {/* Notifications */}
                          <button
                            onClick={() => { soundService.requestPermission(); setShowDriverMenu(false); }}
                            className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                          >
                            <span className="material-icons text-blue-400">notifications_active</span>
                            Ativar Sons
                          </button>

                          <div className="h-[1px] bg-gray-600 my-1"></div>

                          {/* Logout */}
                          <button
                            onClick={handleLogout}
                            className="flex items-center gap-3 px-3 py-3 hover:bg-red-900/30 rounded-lg transition text-red-400 text-sm"
                          >
                            <span className="material-icons">logout</span>
                            Sair
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                /* CLIENT BUTTONS (Keep simple or group if needed, but request was for Driver) */
                <>
                  <button
                    onClick={() => setShowCalculator(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full transition flex items-center justify-center shadow-lg"
                    title="Simular Corrida"
                  >
                    <span className="material-icons text-sm">calculate</span>
                  </button>
                  <button
                    onClick={() => setShowBingo(true)}
                    className="bg-purple-700 hover:bg-purple-600 text-white p-2 rounded-full transition flex items-center justify-center animate-pulse shadow-lg"
                    title="Jogar Bingo"
                  >
                    <span className="material-icons text-sm">casino</span>
                  </button>
                  <button className="p-2 rounded-full hover:bg-red-900/30 hover:text-red-400 transition" title="Sair" onClick={handleLogout}><span className="material-icons">logout</span></button>
                </>
              )}
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
                    <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-whatsapp-dark ${contact.status === DriverStatus.AVAILABLE ? 'bg-green-500' :
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
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-gray-500">
                        {contact.role === UserRole.DRIVER && contact.status === DriverStatus.AVAILABLE ? "Online" : "Agora"}
                      </span>
                      {/* UNREAD BADGE */}
                      {contact.unread_count && contact.unread_count > 0 && (
                        <span className="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center shadow-sm animate-pulse">
                          {contact.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={`text-sm truncate ${contact.unread_count && contact.unread_count > 0 ? 'text-gray-100 font-semibold' : 'text-gray-400'}`}>
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

          {/* PiP Footer Button (Driver Only) */}
          {currentUser.role === UserRole.DRIVER && (
            <div className="p-4 bg-whatsapp-panel border-t border-gray-800 shrink-0">
              <button
                onClick={() => {
                  if (window.Android && window.Android.enterPipMode) {
                    window.Android.enterPipMode();
                  } else {
                    alert("PiP não suportado neste dispositivo.");
                  }
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2 transition active:scale-95"
              >
                <span className="material-icons">picture_in_picture_alt</span>
                MODO JANELA FLUTUANTE
              </button>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col bg-whatsapp-panel relative ${!showChatOnMobile ? 'hidden md:flex' : 'flex'} h-full`}>
          {activeContact ? (
            <>
              <ChatWindow
                currentUser={currentUser}
                chatPartner={activeContact}
                messages={messages}
                onSendMessage={(msg) => setMessages(p => [...p, msg])}
                onBack={handleBackToList}
              />
            </>
          ) : (
            <div className="hidden md:flex h-full flex-col items-center justify-center text-center border-b-8 border-whatsapp-green bg-[#222e35]">
              <div className="mb-4">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/120px-WhatsApp.svg.png" alt="Welcome" className="opacity-40 w-32" />
              </div>
              <h1 className="text-3xl font-light text-gray-200 mb-4">{APP_NAME}</h1>
              <p className="text-gray-400 text-sm max-w-md">
                Envie e receba mensagens sem precisar manter seu celular conectado.<br />
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
