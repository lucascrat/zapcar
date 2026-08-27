
import React, { useState, useEffect, useRef } from 'react';
import { ChatWindow } from './components/ChatWindow';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminDashboardDesktop } from './components/AdminDashboardDesktop';
import { InstallPrompt } from './components/InstallPrompt'; // Importar componente
import { AndroidSetup } from './components/AndroidSetup'; // Importar componente Android
import { BingoUserView } from './components/BingoUserView'; // Importar Bingo
import { DriverSubscription } from './components/DriverSubscription'; // Importar Planos
import { RideCalculator } from './components/RideCalculator'; // Importar Calculadora
import { ClientDashboard } from './components/ClientDashboard'; // Importar Dashboard Cliente
import { DriverRideCall } from './components/DriverRideCall'; // Importar Chamada
import { DriverRideScreen } from './components/DriverRideScreen'; // Import Tela de Corrida Ativa
import { LoginFlow } from './components/LoginFlow';
import { AdminPasswordReset } from './components/AdminPasswordReset';
import { WalletScreen } from './components/WalletScreen';
import { InstantStore } from './components/InstantStore';
import { RewardsHub } from './components/RewardsHub';
import { MarqueeBanner } from './components/MarqueeBanner';
import { RidePaymentModal } from './components/RidePaymentModal';
import { DriverProfileEditor } from './components/DriverProfileEditor';
import { DriverDashboard } from './components/DriverDashboard';

import {

  fetchOnlineDrivers,
  subscribeToMessages,
  subscribeToProfiles,
  fetchMyClients,

  fetchMessages,
  updateDriverStatus, // Import for status toggle
  fetchOpenBroadcastRide, // Nova função importada
  fetchUserProfile, // Nova função importada
  subscribeToBroadcasts, // Importar função de broadcast
  fetchAppSettings, // Import fetchAppSettings
  updateUserLocation, // Import updateUserLocation
  updateUserAvatar, // Import updateUserAvatar
  updateDriverPipStatus, // Import updateDriverPipStatus
  subscribeToRides, // Import rides
  acceptRide, // Import accept
  updateRideStatus, // Import update status
  fetchActiveRide, // Import fetch active
  updateDriverBalanceForCoupon,
  supabase, // Import supabase
  fetchAdminContact
} from './services/supabaseClient';
import { acceptRideSequential, rejectRideSequential, checkNotificationTimeouts } from './services/sequentialNotifications';
import { activatePlan, checkSubscriptionStatus } from './services/paymentService';
import { UserProfile, UserRole, DriverStatus, Message, BroadcastMessage, Ride, AppSettings } from './types';
import { APP_NAME } from './constants';
import { soundService } from './services/soundService';
import { AdMobService } from './services/adMobService';
import { pushService } from './services/pushService';
import { sendNotification } from './services/notificationSender';

const APP_VERSION = "6.2 (Stable)";

export default function App() {
  // DEBUG MOUNT
  useEffect(() => {
    try {
      const log = document.getElementById('debug-log');
      if (log) log.innerHTML += '<div style="color:cyan">[APP] Componente App Montado!</div>';
    } catch (e) { }
  }, []);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [activeContact, setActiveContact] = useState<UserProfile | null>(null);

  const [contactList, setContactList] = useState<UserProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Mobile View State
  const [showChatOnMobile, setShowChatOnMobile] = useState(false);
  const [showAndroidSetup, setShowAndroidSetup] = useState(false); // Estado do modal Android

  // BINGO STATE
  const [showBingo, setShowBingo] = useState(false);

  // PLANOS STATE
  // CALCULATOR STATE
  const [showCalculator, setShowCalculator] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showStore, setShowStore] = useState(false);

  // DRIVER MENU STATE
  const [showDriverMenu, setShowDriverMenu] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showDriverProfile, setShowDriverProfile] = useState(false);
  const [driverProfileInitialTab, setDriverProfileInitialTab] = useState<'profile' | 'pix' | 'withdraw'>('profile');
  const [incomingRide, setIncomingRide] = useState<Ride | null>(null);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [isRideMapMinimized, setIsRideMapMinimized] = useState(false); // Controla se a tela de mapa está minimizada
  const [bannerText, setBannerText] = useState('ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ');
  const [appSettings, setAppSettingsState] = useState<AppSettings | null>(null);

  // REFS para evitar stale closures em subcrições de tempo real
  const activeRideRef = useRef<Ride | null>(null);
  const incomingRideRef = useRef<Ride | null>(null);
  const rejectedRidesRef = useRef<Set<string>>(new Set()); // IDs de corridas rejeitadas
  const isProcessingRideAction = useRef<boolean>(false); // Flag para prevenir múltiplas ações simultâneas

  // Sincronizar REFS com States e Monitorar Integridade
  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);
  useEffect(() => { incomingRideRef.current = incomingRide; }, [incomingRide]);

  // PROTEÇÃO DE INTEGRIDADE: Se activeRide for uma corrida rejeitada, remover imediatamente
  useEffect(() => {
    if (activeRide && rejectedRidesRef.current.has(activeRide.id)) {
      console.error(`[Integrity] DETECTADO activeRide (${activeRide.id}) que está na lista de rejected! Removendo imediatamente.`);
      setActiveRide(null);
      if (incomingRide?.id === activeRide.id) setIncomingRide(null);
    }
  }, [activeRide, incomingRide]);

  // Detecta quando o usuário chega pelo link de "esqueci minha senha" (e-mail
  // de recuperação do Supabase Auth, usado só pelo login de admin). Quando
  // isso acontece, o SDK autentica uma sessão temporária e dispara esse
  // evento - mostramos a tela de definir nova senha em vez do app normal.
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Carregar dados iniciais (Settings e Corrida Ativa)
  useEffect(() => {
    const init = async () => {
      console.log('[DEBUG] init function starting, currentUser:', currentUser ? currentUser.id : 'null');
      try {
        const settings = await fetchAppSettings();
        console.log('[DEBUG] settings fetched');
        setAppSettingsState(settings);

        if (currentUser) {
          console.log('[DEBUG] Initializing services for user:', currentUser.id);

          // Check for pending ride from notification click (cold start)
          if ((window as any).Android?.getPendingRideId) {
            const pendingId = (window as any).Android.getPendingRideId();
            if (pendingId) {
              console.log('[DEBUG] Pending ride ID from native intent:', pendingId);
              // Small delay to ensure listeners are ready
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('openRide', { detail: { rideId: pendingId } }));
              }, 500);
            }
          }

          const role = currentUser.role === UserRole.CLIENT ? 'client' : 'driver';

          if (currentUser.role === UserRole.DRIVER) {

          }

          let ride = await fetchActiveRide(currentUser.id, role);

          // Fix: If no active ride for driver, check for pending broadcast call
          if (!ride && currentUser.role === UserRole.DRIVER && currentUser.is_approved) {


            // Passar undefined para vehicleType para pegar qualquer um por enquanto (DEBUG)
            ride = await fetchOpenBroadcastRide(undefined);

            if (ride) {
              console.log('[DEBUG] Broadcast ride found in init:', ride.id);

            } else {

            }
          }

          if (ride) {
            // NOVO: Garantir que não estamos reabrindo uma corrida que recém rejeitamos
            if (rejectedRidesRef.current.has(ride.id)) {
              console.log('[DEBUG] Ignorado: Corrida ativa encontrada no init estava na lista de rejeitadas');
              return;
            }

            if (currentUser.role === UserRole.DRIVER && ride.status === 'searching') {
              console.log('[DEBUG] Pending ride found in init. Triggering call modal.');
              setIncomingRide(ride);
              soundService.playRingtone();
            } else {
              console.log('[DEBUG] Active ride found in init:', ride.id);
              setActiveRide(ride);
            }
          }

          // Inicializar Push Notifications para todos os usuários
          console.log('[DEBUG] Calling pushService.initialize...');
          await pushService.initialize(currentUser.id);

          // Permissões específicas por papel
          if (currentUser.role === UserRole.DRIVER) {
            console.log('[DEBUG] Driver detected, handles permissions...');
            // Solicitar permissão de notificação (Web API)
            soundService.requestPermission();

            // Solicitar permissões nativas Android (overlay, bateria, etc)
            // Apenas se estiver rodando no Android nativo via Capacitor
            if (window.Android?.requestPermissions) {
              console.log('[DEBUG] Calling native Android permissions for driver...');
              window.Android.requestPermissions();
            }
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error in init function:', error);
      }
    };
    init();

    // Sincronização em tempo real das configurações (Taxas, Banners, etc)
    const settingsSub = supabase
      .channel('global_settings_sync')
      .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'app_settings' }, (payload) => {
        console.log('[Realtime] App Settings atualizado globalmente:', payload.new);
        setAppSettingsState(payload.new as AppSettings);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(settingsSub);
    };
  }, [currentUser]);

  // Handle 'openRide' event from push notifications
  useEffect(() => {
    const handleOpenRideEvent = async (event: any) => {
      const rideId = event.detail?.rideId;
      if (!rideId || !currentUser || currentUser.role !== UserRole.DRIVER) return;

      console.log(`[PushNav] Evento openRide recebido para corrida: ${rideId}`);

      // Se já estamos em uma corrida ativa diferente, ignorar
      if (activeRideRef.current && activeRideRef.current.id !== rideId) {
        console.log('[PushNav] Já existe uma corrida ativa diferente. Ignorando.');
        return;
      }

      try {
        const { fetchRideById } = await import('./services/supabaseClient');
        const ride = await fetchRideById(rideId);

        if (ride && ride.status === 'searching') {
          console.log('[PushNav] Corrida válida encontrada. Abrindo modal de chamada.');
          setIncomingRide(ride);
          soundService.playRingtone();
        } else if (ride && (ride.status === 'accepted' || ride.status === 'en_route') && ride.driver_id === currentUser.id) {
          console.log('[PushNav] Corrida já aceita/em curso por mim. Abrindo tela da corrida.');
          setActiveRide(ride);
        } else {
          console.log('[PushNav] Corrida não disponível ou status incompatível:', ride?.status);
          if (window.Android?.showToast) window.Android.showToast("Esta corrida não está mais disponível.");
        }
      } catch (err) {
        console.error('[PushNav] Erro ao processar evento openRide:', err);
      }
    };

    window.addEventListener('openRide', handleOpenRideEvent);
    return () => window.removeEventListener('openRide', handleOpenRideEvent);
  }, [currentUser]);

  // Subscrever a corridas (Para Motorista receber chamadas e para ambos verem atualizações)
  useEffect(() => {
    if (!currentUser) return;

    console.log(`[Realtime] Iniciando monitoramento de corridas para ${currentUser.role}...`);

    const sub = subscribeToRides(currentUser.id, currentUser.role === UserRole.CLIENT ? 'client' : 'driver', async (ride) => {
      // LOGICA PARA MOTORISTA (Receber Chamada)
      if (currentUser.role === UserRole.DRIVER) {
        // IMPORTANTE: Se a corrida foi cancelada e está na lista de rejeitadas, limpar tudo
        if (ride.status === 'cancelled' && rejectedRidesRef.current.has(ride.id)) {
          console.log(`[Realtime] Corrida ${ride.id} foi cancelada (havia sido rejeitada). Limpando estados.`);

          // Limpar incomingRide se for esta corrida
          if (incomingRideRef.current?.id === ride.id) {
            setIncomingRide(null);
            soundService.stopRingtone();
          }

          // Limpar activeRide se for esta corrida
          if (activeRideRef.current?.id === ride.id) {
            setActiveRide(null);
          }

          // Remover da lista de rejeitadas
          rejectedRidesRef.current.delete(ride.id);
          return;
        }

        // Corrida buscando motorista (comportamento normal ou direcionado)
        if (ride.status === 'searching' && !activeRideRef.current && (!incomingRideRef.current || incomingRideRef.current.id !== ride.id)) {
          // NOVO: Ignorar se o motorista estiver OFFLINE ou BUSY
          if (currentUser.status !== DriverStatus.AVAILABLE) {
            console.log(`[Realtime] Chamada ignorada: Motorista está ${currentUser.status}`);
            return;
          }

          // Se for uma corrida direcionada (tem driver_id preenchido), só eu posso ver
          if (ride.driver_id && ride.driver_id !== currentUser.id) {
            console.log(`[Realtime] Corrida ignorada (direcionada para outro motorista)`);
            return;
          }

          // CORREÇÃO: Sistema Sequencial (notifyNextDriver) usa 'current_notified_driver_id',
          // não 'driver_id', para marcar de quem é a vez. Sem este check, TODOS os motoristas
          // disponíveis com o mesmo tipo de veículo recebiam a chamada ao mesmo tempo, e o
          // rodízio por proximidade virava um broadcast de fato.
          if (!ride.driver_id && ride.current_notified_driver_id && ride.current_notified_driver_id !== currentUser.id) {
            console.log(`[Realtime] Corrida ignorada (é a vez do motorista ${ride.current_notified_driver_id})`);
            return;
          }

          // Corrida sequencial ainda sem motorista notificado (janela entre o INSERT e o
          // UPDATE do notifyNextDriver) e que não é broadcast explícito: aguardar a próxima
          // atualização em vez de mostrar para todo mundo.
          if (!ride.driver_id && !ride.current_notified_driver_id && !ride.is_broadcast) {
            console.log(`[Realtime] Corrida ${ride.id} ainda sem motorista notificado. Aguardando.`);
            return;
          }

          // IMPORTANTE: Verificar se esta corrida foi rejeitada recentemente
          if (rejectedRidesRef.current.has(ride.id)) {
            console.log(`[Realtime] Corrida ${ride.id} foi rejeitada. Ignorando.`);
            return;
          }

          // NOVO: Filtrar por tipo de veículo (Moto não recebe carro, Carro não recebe moto)
          // EXCEÇÃO: Se for uma corrida direcionada (ride.driver_id === currentUser.id), permitir mesmo se o tipo for diferente (Admin Override)
          const isDirectedToMe = ride.driver_id === currentUser.id;

          if (!isDirectedToMe && ride.vehicle_type && currentUser.vehicle_type && ride.vehicle_type !== currentUser.vehicle_type) {
            console.log(`[Realtime] Corrida ignorada (Tipo incompatível: ${ride.vehicle_type} vs ${currentUser.vehicle_type})`);
            return;
          }

          // Adicionar prefixo especial para corridas da central
          const displayRide = isDirectedToMe
            ? { ...ride, origin_address: `📞 CENTRAL: ${ride.origin_address}` }
            : ride;

          if (isDirectedToMe) {
            console.log(`[Realtime] 📞 CENTRAL: Corrida direcionada recebida! ID: ${ride.id}`);
          } else {
            console.log(`[Realtime] Nova corrida broadcast detectada!`);
          }

          setIncomingRide(displayRide);
          soundService.playRingtone();
          if (window.Android?.bringToFront) window.Android.bringToFront();
        }

        // Bloco removido: status 'accepted' não é mais usado como chamada inicial
        // Todas as corridas (broadcast ou direcionadas) chegam como 'searching'

        // --- CORREÇÃO: Monitorar mudanças na corrida que está TOCANDO (Incoming) ---
        if (incomingRideRef.current && ride.id === incomingRideRef.current.id) {
          console.log(`[Realtime] Atualização da corrida incoming ${ride.id}: status=${ride.status}, driver_id=${ride.driver_id}`);

          // CASO PRINCIPAL: Corrida saiu do status 'searching' = alguém aceitou ou foi cancelada
          if (ride.status !== 'searching') {
            // 1. Cliente cancelou a chamada
            if (ride.status === 'cancelled') {
              console.log("[Realtime] Chamada recebida foi CANCELADA pelo cliente.");
              setIncomingRide(null);
              soundService.stopRingtone();
              if (window.Android?.showToast) window.Android.showToast("Cliente cancelou a solicitação.");
              else if (window.Android?.showToast) window.Android.showToast("Cliente cancelou a solicitação.");
            }
            // 2. Corrida foi aceita (en_route) por MIM
            else if (ride.status === 'en_route' && ride.driver_id === currentUser.id) {
              console.log("[Realtime] ✅ Corrida aceita por MIM. Abrindo navegação.");
              soundService.stopRingtone();

              // Verificar se não foi rejeitada
              if (rejectedRidesRef.current.has(ride.id)) {
                console.log("[Realtime] ⚠️ BLOQUEADO: Corrida foi rejeitada. Ignorando.");
                setIncomingRide(null);
                return;
              }

              setActiveRide({ ...ride, driver: currentUser });
              setIncomingRide(null);
            }
            // 3. Corrida foi aceita por OUTRO motorista (en_route com outro driver_id)
            else if ((ride.status === 'en_route' || ride.status === 'accepted') && ride.driver_id && ride.driver_id !== currentUser.id) {
              console.log("[Realtime] 🚫 Corrida aceita por OUTRO motorista. Encerrando chamada.");
              setIncomingRide(null);
              soundService.stopRingtone();
              if (window.Android?.showToast) window.Android.showToast("Corrida aceita por outro motorista.");
            }
            // 4. Qualquer outro status que não é 'searching' = corrida não está mais disponível
            else if (ride.status === 'accepted' && ride.driver_id === currentUser.id) {
              // Reservada para mim (Central), mantém tocando
              console.log("[Realtime] Corrida reservada (accepted). Aguardando aceite manual.");
            }
            else {
              // Status desconhecido ou transição inesperada - fechar por segurança
              console.log(`[Realtime] Corrida com status '${ride.status}' não é mais searching. Encerrando chamada.`);
              setIncomingRide(null);
              soundService.stopRingtone();
            }
          }
          // CASO SECUNDÁRIO: Ainda em 'searching' mas driver_id mudou (reatribuição para outro motorista)
          else if (ride.status === 'searching' && ride.driver_id && ride.driver_id !== currentUser.id) {
            console.log("[Realtime] 🚫 Corrida reatribuída para outro motorista. Encerrando chamada.");
            setIncomingRide(null);
            soundService.stopRingtone();
          }
          // CASO SECUNDÁRIO (Sequencial): Ainda em 'searching', sem driver_id, mas o rodízio
          // (current_notified_driver_id) passou para outro motorista - encerrar minha chamada.
          else if (ride.status === 'searching' && !ride.driver_id && ride.current_notified_driver_id && ride.current_notified_driver_id !== currentUser.id) {
            console.log("[Realtime] 🚫 Rodízio passou para outro motorista. Encerrando chamada.");
            setIncomingRide(null);
            soundService.stopRingtone();
          }
        }

        // Se a corrida que eu estou fazendo mudar (cancelamento, etc)
        if (activeRideRef.current && ride.id === activeRideRef.current.id) {
          if (ride.status === 'cancelled') {
            if (window.Android?.showToast) window.Android.showToast("O cliente cancelou a corrida.");
            setActiveRide(null);
            soundService.stopRingtone();
          } else {
            // Manter meus próprios dados de motorista que já estão no activeRide
            setActiveRide({ ...ride, driver: currentUser });
          }
        }
      }

      // LOGICA PARA CLIENTE (Ver Aceite, Chegada, etc)
      if (currentUser.role === UserRole.CLIENT) {
        if (ride.status === 'finished' || ride.status === 'cancelled') {
          // Mostrar mensagem apropriada para o cliente
          if (ride.status === 'cancelled') {
            console.log("[Realtime] Corrida cancelada. Notificando cliente.");
            if (window.Android?.showToast) {
              window.Android.showToast("Motorista ocupado. Tente novamente.");
            } else {
              if (window.Android?.showToast) window.Android.showToast("Motorista ocupado. Tente novamente.");
            }
          }
          setActiveRide(null);
        } else {
          // Manter dados que já temos (como motorista) e mesclar com o novo status
          setActiveRide(prev => {
            if (!prev) return ride;

            // Se o ID do motorista mudou ou não tínhamos motorista, buscar dados novos
            if (ride.driver_id && (!prev.driver || prev.driver_id !== ride.driver_id)) {
              fetchUserProfile(ride.driver_id).then(driverData => {
                setActiveRide(current => current ? { ...current, ...ride, driver: driverData || undefined } : null);
              });
              return { ...prev, ...ride }; // Retorna temporário enquanto busca
            }

            return { ...prev, ...ride, driver: prev.driver }; // Mescla status novo com motorista atual
          });
        }
      }
    });

    return () => {
      console.log(`[Realtime] Encerrando monitoramento de corridas.`);
      sub.unsubscribe();
    };
  }, [currentUser?.id, currentUser?.role]); // Fix: Removed activeRideRef dependency to prevent reconnection gaps

  // Watchdog do Sistema de Notificação Sequencial: se o motorista da vez (current_notified_driver_id)
  // não responder dentro do timeout (ex: recebeu só a push e não abriu o app), alguém precisa
  // detectar isso e chamar o próximo motorista da fila. checkNotificationTimeouts existia mas nunca
  // era chamada em lugar nenhum - a corrida ficava presa esperando indefinidamente. Como qualquer
  // usuário (cliente aguardando ou motorista navegando) pode ter o app aberto, rodamos aqui para
  // qualquer papel: é uma query leve e idempotente (só age em corridas realmente expiradas).
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      checkNotificationTimeouts().catch(err => {
        console.error('[Watchdog] Erro ao checar timeouts de notificação:', err);
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [currentUser?.id]);

  const handleAcceptRide = async () => {
    if (!incomingRide || !currentUser) return;

    // Prevenir múltiplas chamadas simultâneas
    if (isProcessingRideAction.current) {
      console.log(`[Ride] ⚠️ Já está processando uma ação. Ignorando.`);
      return;
    }

    isProcessingRideAction.current = true;

    try {
      // IMPORTANTE: Verificar se esta corrida foi rejeitada recentemente
      if (rejectedRidesRef.current.has(incomingRide.id)) {
        console.log(`[Ride] ⚠️ BLOQUEADO: Tentativa de aceitar corrida ${incomingRide.id} que foi rejeitada.`);
        soundService.stopRingtone();
        setIncomingRide(null);
        return;
      }

      // Check if this is a Central dispatch ride (already accepted status)
      const isCentralDispatch = incomingRide.status === 'accepted' && incomingRide.driver_id === currentUser.id;

      if (isCentralDispatch) {
        // Central ride - already accepted, just activate it
        console.log('[Dispatch] Ativando corrida da Central');
        soundService.stopRingtone();

        // Bloqueio extra: só ativa se não foi rejeitada no último segundo
        if (rejectedRidesRef.current.has(incomingRide.id)) {
          console.log(`[Ride] ⚠️ Central: Tentativa de ativar corrida já rejeitada.`);
          setIncomingRide(null);
          return;
        }

        setActiveRide({ ...incomingRide, driver: currentUser });
        setIncomingRide(null);
      } else {
        // Normal ride - need to accept it
        const ok = await acceptRideSequential(incomingRide.id, currentUser.id);
        if (ok) {
          soundService.stopRingtone();
          setActiveRide({ ...incomingRide, status: 'en_route', driver_id: currentUser.id, driver: currentUser });
          setIncomingRide(null);
        } else {
          if (window.Android?.showToast) window.Android.showToast("Esta corrida já foi aceita por outro motorista.");
          setIncomingRide(null);
          soundService.stopRingtone();
        }
      }
    } finally {
      isProcessingRideAction.current = false;
    }
  };

  const handleRejectRide = async () => {
    // Usar Ref para garantir dados mais atuais, mesmo em closures antigos
    const currentIncomingRide = incomingRideRef.current || incomingRide;

    if (!currentIncomingRide || !currentUser) return;

    // Prevenir múltiplas chamadas simultâneas
    if (isProcessingRideAction.current) {
      console.log(`[Ride] ⚠️ Já está processando uma ação. Ignorando.`);
      return;
    }

    isProcessingRideAction.current = true;

    try {
      console.log(`[Ride] Motorista recusou a corrida ${currentIncomingRide.id}. Buscando outro...`);

      // IMPORTANTE: Parar som e limpar incomingRide IMEDIATAMENTE para evitar aceite automático
      soundService.stopRingtone();
      const rideIdToReject = currentIncomingRide.id;
      const isDirect = currentIncomingRide.is_direct;

      // Adicionar ao conjunto de rejeitadas IMEDIATAMENTE antes de qualquer async
      rejectedRidesRef.current.add(rideIdToReject);
      console.log(`[Ride] Corrida ${rideIdToReject} adicionada à lista de rejeitadas`);
      setIncomingRide(null);

      // Se for chamada direta, cancelar a corrida ao invés de rotacionar
      if (isDirect) {
        console.log(`[Ride] Chamada direta rejeitada. Cancelando corrida ${rideIdToReject}.`);
        const { supabase } = await import('./services/supabaseClient');
        await supabase.from('rides').update({
          status: 'cancelled',
          driver_id: null
        }).eq('id', rideIdToReject);
      } else {
        // Se for Broadcast PURO (sem motorista definido), rejeitar apenas localmente
        // Para não remover a corrida da lista dos outros motoristas
        if (!currentIncomingRide.driver_id && currentIncomingRide.is_broadcast) {
          console.log("[Ride] Rejeitado localmente (Broadcast Puro). Mantendo disponível para outros.");
          return;
        }

        // Se tem driver_id (foi rotacionado especificamente para mim), tratar sequencialmente
        console.log(`[Ride] Rejeitando corrida sequencial ${rideIdToReject}...`);

        try {
          const success = await rejectRideSequential(rideIdToReject, currentUser.id);

          if (success) {
            console.log('[Ride] Corrida rejeitada e passada para o próximo.');
          } else {
            console.error('[Ride] Falha ao rejeitar corrida sequencial.');
            // Fallback: tentar limpar manualmente se falhar
            const { supabase } = await import('./services/supabaseClient');
            await supabase.from('rides')
              .update({ driver_id: null, status: 'searching' })
              .eq('id', rideIdToReject)
              .eq('driver_id', currentUser.id);
          }
        } catch (error) {
          console.error('[Ride] Erro ao chamar rejectRideSequential:', error);
        }
      }

      // Remover da lista de rejeitadas após 30 segundos (tempo suficiente para rotação)
      setTimeout(() => {
        rejectedRidesRef.current.delete(rideIdToReject);
        console.log(`[Ride] Corrida ${rideIdToReject} removida da lista de rejeitadas`);
      }, 30000);
    } finally {
      isProcessingRideAction.current = false;
    }
  };


  // Refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const profileAvatarRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<any>(null);

  // Computed Subscription Status
  const subStatus = currentUser?.role === UserRole.DRIVER
    ? checkSubscriptionStatus(currentUser.subscription_expires_at)
    : { isValid: true, daysLeft: 0 };

  const [isAdMobReady, setIsAdMobReady] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false); // PiP State

  // Refs para estabilizar inscrições em tempo real
  const activeContactRef = useRef<UserProfile | null>(null);
  const contactListRef = useRef<UserProfile[]>([]);
  // Refs para estabilizar inscrições em tempo real
  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  useEffect(() => {
    contactListRef.current = contactList;
  }, [contactList]);

  // --- Lifecycle ---

  useEffect(() => {
    // Initialize AdMob
    const initAdMob = async () => {
      await AdMobService.initialize();
      setIsAdMobReady(true);
    };
    initAdMob();

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
  // 1. PERSISTÊNCIA DE DATOS (LOCAL STORAGE)
  useEffect(() => {
    const savedUser = localStorage.getItem('chegoja_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        console.log("Login automático via memória do aparelho:", user.username);

        // --- VERIFICAÇÃO DE BANCO NOVO ---
        // Se mudamos de banco, o ID no localStorage será inválido no novo banco.
        // Precisamos verificar se este perfil existe de fato.
        fetchUserProfile(user.id).then(dbProfile => {
          if (!dbProfile) {
            console.warn("Sessão antiga detectada ou perfil inexistente. Limpando localStorage.");
            localStorage.removeItem('chegoja_user');
            setCurrentUser(null);
            return;
          }

          // Se existir, atualiza os dados em memória com os do banco (moedas, status, etc)
          setCurrentUser(dbProfile);
          localStorage.setItem('chegoja_user', JSON.stringify(dbProfile));

          // Se for motorista, tenta reativar o Wake Lock e permissões
          if (dbProfile.role === UserRole.DRIVER) {
            setTimeout(() => requestDriverPermissions(), 1000);
            if ((window as any).Android?.requestPermissions) {
              (window as any).Android.requestPermissions();
            }
          }
        }).catch(err => {
          console.error("Erro ao validar perfil no Supabase:", err);
        });

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
          console.log("[Payment] Pagamento aprovado! Plano ativado.");
          // Recarregar perfil atualizado do banco (sem precisar de senha)
          const updatedUser = await fetchUserProfile(currentUser.id);
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

  // 3.5 PiP Listeners (Native)
  useEffect(() => {
    const handlePipExit = () => {
      console.log("Saiu do PiP");
      setIsPipActive(false); // Update local state
      window.focus();

      if (currentUser?.role === UserRole.DRIVER) {
        updateDriverPipStatus(currentUser.id, false);
      }

      // Só toca o som de chamada se houver uma corrida real pendente
      if (incomingRideRef.current) {
        setTimeout(() => {
          soundService.playRingtone();
        }, 500);
      }
    };

    const handlePipEnter = () => {
      console.log("Entrou no PiP");
      setIsPipActive(true); // Update local state
      if (currentUser?.role === UserRole.DRIVER) {
        updateDriverPipStatus(currentUser.id, true);
      }
    };

    window.addEventListener('pipExit', handlePipExit);
    window.addEventListener('pipEnter', handlePipEnter);

    return () => {
      window.removeEventListener('pipExit', handlePipExit);
      window.removeEventListener('pipEnter', handlePipEnter);
    };
  }, [currentUser]);

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

    const profileSub = subscribeToProfiles(async (payload?: any) => {
      // Refresh current user if it was their profile that changed
      if (payload?.new?.id === currentUser.id) {
        console.log("[Realtime] Atualizando perfil do usuário logado...");
        const updated = await fetchUserProfile(currentUser.id);
        if (updated) {
          setCurrentUser(updated);
          localStorage.setItem('chegoja_user', JSON.stringify(updated));
        }
      }
      loadContacts();
    });

    return () => {
      profileSub.unsubscribe();
    };
  }, [currentUser]);

  // 5a. Carregar Histórico quando mudar o contato
  useEffect(() => {
    if (!currentUser || !activeContact || currentUser.role === UserRole.ADMIN) return;

    const loadHistory = async () => {
      console.log(`[Chat] Carregando histórico com ${activeContact.username}...`);
      const history = await fetchMessages(currentUser.id, activeContact.id);

      setMessages(prev => {
        // Mescla o histórico com mensagens que já podem estar na tela (otimistas)
        // Evita duplicatas usando o ID
        const existingIds = new Set(prev.map(m => m.id));
        const newOnes = history.filter(m => !existingIds.has(m.id));
        return [...prev, ...newOnes].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
    };
    loadHistory();
  }, [currentUser?.id, activeContact?.id]);

  // 5b. Inscrição ÚNICA e ESTÁVEL para mensagens
  useEffect(() => {
    if (!currentUser || currentUser.role === UserRole.ADMIN) return;

    console.log(`[Realtime] Iniciando inscrição de mensagens para ${currentUser.username}...`);
    const sub = subscribeToMessages(currentUser.id, async (newMsg) => {
      // Usamos REFs para pegar os valores MAIS RECENTES sem disparar re-inscrição
      const currentActive = activeContactRef.current;
      const currentList = contactListRef.current;

      console.log(`[Chat] Nova mensagem recebida:`, newMsg);

      if (newMsg.sender_id !== currentUser.id) {
        // Notificação se o app estiver em background ou sem foco
        if (document.visibilityState === 'hidden' || !document.hasFocus()) {
          const senderName = currentList.find(c => c.id === newMsg.sender_id)?.username || "Novo Cliente";
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

          // LÓGICA DE INTERRUPÇÃO
          if (currentActive && currentActive.id !== newMsg.sender_id) {
            soundService.playReceived();
            setContactList(prev => {
              const exists = prev.some(c => c.id === newMsg.sender_id);
              if (exists) {
                return prev.map(c => c.id === newMsg.sender_id ? { ...c, unread_count: (c.unread_count || 0) + 1 } : c);
              } else {
                fetchUserProfile(newMsg.sender_id).then(profile => {
                  if (profile) setContactList(curr => [{ ...profile, unread_count: 1 }, ...curr]);
                });
                return prev;
              }
            });
            return;
          }

          if (isIncomingCallAlert) soundService.playRingtone();
          else soundService.playMessageAlert();

          if (window.Android?.bringToFront) window.Android.bringToFront();

          let senderProfile = currentList.find(c => c.id === newMsg.sender_id);
          if (!senderProfile) {
            senderProfile = await fetchUserProfile(newMsg.sender_id) || undefined;
            if (senderProfile) setContactList(prev => [senderProfile as UserProfile, ...prev]);
          }

          if (senderProfile && !currentActive) {
            setTimeout(() => {
              setActiveContact(senderProfile!);
              setShowChatOnMobile(true);
            }, 200);
          }
        } else {
          soundService.playReceived();
        }
      }

      // Atualizar a lista de mensagens se for do chat que está ABERTO agora
      if (currentActive && (newMsg.sender_id === currentActive.id || newMsg.receiver_id === currentActive.id)) {
        console.log(`[Chat] Adicionando mensagem ao chat ativo.`);
        setMessages(prev => {
          const index = prev.findIndex(m => m.id === newMsg.id);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = newMsg;
            return updated;
          }
          return [...prev, newMsg];
        });
      }
    });

    return () => {
      console.log(`[Realtime] Encerrando inscrição de mensagens.`);
      sub.unsubscribe();
    };
  }, [currentUser?.id]); // APENAS depende do ID do usuário logado


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

        // Notificação via toast nativo ou console (sem bloquear a UI)
        if (window.Android?.showToast) {
          window.Android.showToast(`${broadcast.title}: ${broadcast.message}`);
        }
        console.log(`[Broadcast] ${broadcast.title}: ${broadcast.message}`);
      }
    };

    const sub = subscribeToBroadcasts(handleBroadcast);

    return () => {
      sub.unsubscribe();
    };

  }, [currentUser]);

  // 7. Profile Realtime Listener - Sync coins and status automatically
  useEffect(() => {
    if (!currentUser?.id) return;

    console.log(`[Realtime] Iniciando monitoramento do perfil: ${currentUser.id}`);

    const profileSub = supabase
      .channel(`profile-sync-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'chegoja',
          table: 'profiles',
          filter: `id=eq.${currentUser.id}`
        },
        (payload) => {
          console.log('[Realtime] Perfil atualizado:', payload.new);
          const updated = payload.new as UserProfile;

          // Só atualiza se houver mudança real para evitar loops
          setCurrentUser(prev => {
            if (!prev) return updated;

            // Verificar se mudou moedas ou status ou aprovação
            const hasChanged =
              prev.wallet_coins !== updated.wallet_coins ||
              prev.status !== updated.status ||
              prev.is_approved !== updated.is_approved ||
              prev.avatar_url !== updated.avatar_url;

            if (hasChanged) {
              const newUser = { ...prev, ...updated };
              localStorage.setItem('chegoja_user', JSON.stringify(newUser));
              return newUser;
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      console.log(`[Realtime] Encerrando monitoramento do perfil.`);
      profileSub.unsubscribe();
    };
  }, [currentUser?.id]);

  // 8. Pending Driver Logic: Auto-select Admin Contact (MOVED TO TOP LEVEL)
  useEffect(() => {
    if (currentUser && currentUser.role === UserRole.DRIVER && currentUser.is_approved === false && !activeContact) {
      fetchAdminContact().then((admin: UserProfile | null) => {
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
          const me = await fetchUserProfile(currentUser.id);
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

  const lastGpsUpdate = useRef<number>(0);

  // Subscrever ao movimento do MOTORISTA (para o Cliente ver no mapa a cada 35 segundos)
  useEffect(() => {
    if (currentUser?.role === UserRole.CLIENT && activeRide?.driver_id && activeRide.status !== 'searching') {
      console.log("[GPS] Iniciando rastreamento econômico do motorista (35s)...");

      const updateLocation = async () => {
        const updatedDriver = await fetchUserProfile(activeRide.driver_id!);
        if (updatedDriver && activeRide) {
          console.log("[GPS] Localização do motorista atualizada.");
          setActiveRide(prev => prev ? { ...prev, driver: updatedDriver } : null);
        }
      };

      // Busca imediata
      updateLocation();

      // Intervalo de 35 segundos para economizar API
      const interval = setInterval(updateLocation, 35000);

      return () => clearInterval(interval);
    }
  }, [currentUser, activeRide?.driver_id, activeRide?.status === 'searching']);

  // 9. Continuous Location Tracking (GPS) - Agora com throttle para economizar banco
  useEffect(() => {
    if (!currentUser) return;

    let watchId: number | null = null;

    if ('geolocation' in navigator) {
      console.log("Iniciando rastreamento de localização com economia...");
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const now = Date.now();

          // Throttle: Só envia pro banco a cada 10 segundos
          if (now - lastGpsUpdate.current > 10000) {
            updateUserLocation(currentUser.id, latitude, longitude);
            lastGpsUpdate.current = now;
          }
        },
        (error) => {
          console.warn("Erro no rastreamento de localização:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 10000
        }
      );
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [currentUser?.id]);

  // --- Handlers ---

  const handleUpdateProfileAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && currentUser) {
      const confirmUpdate = window.confirm("Deseja alterar sua foto de perfil?");
      if (!confirmUpdate) return;

      const newUrl = await updateUserAvatar(currentUser.id, file);
      if (newUrl) {
        const updated = { ...currentUser, avatar_url: newUrl };
        setCurrentUser(updated);
        localStorage.setItem('chegoja_user', JSON.stringify(updated));
        alert("Foto de perfil atualizada com sucesso!");
      } else {
        alert("Erro ao atualizar foto. Tente novamente.");
      }
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

  const handleEnterPip = () => {
    // Bolha flutuante (FloatingBubbleService) no lugar do PiP nativo do Android:
    // o PiP tem um tamanho mínimo imposto pela plataforma que não dá pra reduzir
    // (fica grande e quadrado), a bolha desenhada via overlay permite um ícone
    // pequeno e discreto de verdade, do tamanho que a gente quiser.
    if ((window as any).Android && (window as any).Android.showFloatingBubble) {
      (window as any).Android.showFloatingBubble();
      if (currentUser?.role === UserRole.DRIVER) {
        updateDriverPipStatus(currentUser.id, true);
      }
    } else {
      alert("O ícone flutuante só está disponível no aplicativo Android nativo.");
    }
  };

  const handleLoginSuccess = async (user: UserProfile) => {
    localStorage.setItem('chegoja_user', JSON.stringify(user));
    setCurrentUser(user);

    if (user.role === UserRole.DRIVER) {
      requestDriverPermissions();
    }

    if (user.role !== UserRole.ADMIN) {
      const active = await fetchActiveRide(user.id, user.role as any);
      if (active) {
        if (user.role === UserRole.DRIVER && active.status === 'searching') {
          setIncomingRide(active);
          soundService.playRingtone();
        } else {
          setActiveRide(active);
        }
      }
    }
  };

  const handleLogout = () => {
    supabase.auth.signOut().catch(console.warn);
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



  // --- Render: Admin Dashboard (Dedicated Page) ---
  if (currentUser && currentUser.role === UserRole.ADMIN) {
    // Usar novo AdminDashboardDesktop focado em desktop
    return <AdminDashboardDesktop currentUser={currentUser} onLogout={handleLogout} />;
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
        {/* AdMob Banner Removed */}
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

  // --- Render: Redefinir senha de administrador (link de e-mail) ---
  if (isPasswordRecovery) {
    return <AdminPasswordReset onDone={() => setIsPasswordRecovery(false)} />;
  }

  // --- Render: Login Screen ---
  if (!currentUser) {
    return <LoginFlow onLoginSuccess={handleLoginSuccess} />;
  }

  // --- Render: PiP Mode (Simplified) ---
  if (isPipActive) {
    return (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-black">
        <div className="w-[55vw] h-[55vw] max-w-[110px] max-h-[110px] min-w-[56px] min-h-[56px] rounded-full overflow-hidden border-2 border-whatsapp-green shadow-xl animate-pulse bg-whatsapp-green flex items-center justify-center">
          <span className="material-icons text-white" style={{ fontSize: 'clamp(30px, 30vw, 60px)' }}>directions_car</span>
        </div>
      </div>
    );
  }

  // --- Render: Main App (Client/Driver Chat) ---
  return (
    <div className="min-h-screen h-[100dvh] w-full flex flex-col overflow-hidden bg-app-bg relative">
      {/* AdMob Banner Removed */}
      <MarqueeBanner text={bannerText} />

      <div className="flex-1 flex overflow-hidden relative">
        <InstallPrompt />
        {showAndroidSetup && <AndroidSetup onClose={() => setShowAndroidSetup(false)} />}




        {/* DRIVER ACTIVE RIDE SCREEN (Só mostra se não estiver minimizado) */}
        {activeRide && currentUser?.role === UserRole.DRIVER && !activeContact && !isRideMapMinimized && (
          <DriverRideScreen
            ride={activeRide}
            driver={currentUser}
            settings={appSettings}
            onStatusUpdate={async (statusInput) => {
              const newStatus = statusInput as any; // Allow custom statuses

              // 1. Handle Local ACK (Driver clicked "Close" on Success Screen)
              if (newStatus === 'finished_ack') {
                await updateDriverStatus(currentUser.id, DriverStatus.AVAILABLE);
                setActiveRide(null);
                setIsRideMapMinimized(false);
                return;
              }

              // 2. Handle Normal DB Updates
              const ok = await updateRideStatus(activeRide.id, newStatus);
              if (ok) {
                // Notificar Cliente sobre mudanças importantes
                if (newStatus === 'arrived' || newStatus === 'started' || newStatus === 'waiting_payment') {
                  const title = newStatus === 'arrived' ? "Motorista Chegou! 🚗" : newStatus === 'started' ? "Corrida Iniciada! 🚀" : "Corrida Finalizada! 🏁";
                  const body = newStatus === 'arrived' ? "Seu motorista parceiro chegou ao local de partida." : newStatus === 'started' ? "Sua corrida começou. Boa viagem!" : "O motorista solicitou o pagamento da corrida.";

                  sendNotification(
                    title,
                    body,
                    'user',
                    {
                      targetUserId: activeRide.client_id,
                      sound: 'ubb',
                      data: {
                        type: 'status_update',
                        ride_id: activeRide.id,
                        status: newStatus
                      }
                    }
                  ).catch(err => console.error("[Push] Erro ao notificar cliente:", err));
                }

                if (newStatus === 'cancelled') {
                  // Cancelled -> Close immediately
                  await updateDriverStatus(currentUser.id, DriverStatus.AVAILABLE);
                  setActiveRide(null);
                  setIsRideMapMinimized(false);
                } else if (newStatus === 'finished') {
                  // Finished -> Keep open to show Success Screen
                  // Se finalizar com cupom, creditar motorista
                  if (activeRide.coupon_id) {
                    const discount = activeRide.discount_amount || 0;
                    if (discount > 0) {
                      await updateDriverBalanceForCoupon(currentUser.id, discount, activeRide.id);
                      alert(`Bônus de R$ ${discount.toFixed(2)} creditado em sua carteira!`);
                    }
                  }
                  // Update local state to show 'Success' UI in DriverRideScreen
                  setActiveRide({ ...activeRide, status: 'finished' });
                } else {
                  setActiveRide({ ...activeRide, status: newStatus });
                }
              }
            }}
            onChat={() => {
              // Não fecha mais o mapa, o chat é tratado internamente pelo popup
            }}
            onMinimize={() => setIsRideMapMinimized(true)}
          />
        )}



        {/* BOTÃO FLUTUANTE PARA VOLTAR AO MAPA (Quando minimizado) */}
        {activeRide && currentUser?.role === UserRole.DRIVER && isRideMapMinimized && (
          <button
            onClick={() => setIsRideMapMinimized(false)}
            className="fixed bottom-24 right-4 z-[90] bg-whatsapp-green text-black p-4 rounded-2xl shadow-2xl animate-bounce flex items-center gap-2 font-bold"
          >
            <span className="material-icons">navigation</span>
            <span className="text-sm">Voltar ao Mapa</span>
          </button>
        )}

        {currentUser?.role === UserRole.DRIVER && !isPipActive && (
          <button
            onClick={handleEnterPip}
            className="fixed top-[30%] right-4 z-[95] bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-full shadow-2xl flex items-center justify-center active:scale-95"
          >
            <span className="material-icons text-xl">picture_in_picture_alt</span>
          </button>
        )}

        {/* DRIVER RIDE CALL OVERLAY */}
        {incomingRide && (
          <DriverRideCall
            ride={incomingRide}
            onAccept={handleAcceptRide}
            onReject={handleRejectRide}
          />
        )}

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

        {/* DRIVER PROFILE OVERLAY */}
        {showDriverProfile && currentUser && currentUser.role === UserRole.DRIVER && (
          <DriverProfileEditor
            currentUser={currentUser}
            initialTab={driverProfileInitialTab}
            onClose={() => setShowDriverProfile(false)}
            onUpdate={(updated) => {
              setCurrentUser(updated);
              localStorage.setItem('chegoja_user', JSON.stringify(updated));
            }}
          />
        )}

        {/* MAIN VIEW LOGIC */}
        {currentUser?.role === UserRole.CLIENT && !activeContact && !showBingo && !showPlans && !showCalculator ? (
          <ClientDashboard
            currentUser={currentUser}
            onStartChat={(driver) => {
              setActiveContact(driver);
              setShowChatOnMobile(true);
            }}
            onOpenBingo={() => setShowBingo(true)}
            onOpenWallet={() => setShowWallet(true)}
            activeRide={activeRide}
            setActiveRide={setActiveRide}
            onUpdateUser={(updated) => {
              setCurrentUser(updated);
              localStorage.setItem('chegoja_user', JSON.stringify(updated));
            }}
            onLogout={handleLogout}
          />
        ) : currentUser?.role === UserRole.DRIVER && !activeContact && !showBingo && !showPlans && !showCalculator ? (
          <DriverDashboard
            currentUser={currentUser}
            onOpenProfile={(tab) => { setDriverProfileInitialTab(tab || 'profile'); setShowDriverProfile(true); }}
            onOpenPlans={() => setShowPlans(true)}
            onOpenBingo={() => setShowBingo(true)}
            onOpenCalculator={() => setShowCalculator(true)}
            onLogout={handleLogout}
            onUpdateUser={(updated) => {
              setCurrentUser(updated);
              localStorage.setItem('chegoja_user', JSON.stringify(updated));
            }}
          />
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar */}
            <div className={`w-full md:w-[400px] bg-whatsapp-dark border-r border-gray-800 flex flex-col relative ${showChatOnMobile ? 'hidden md:flex' : 'flex'}`}>
              {/* My Profile Header */}
              <div className="h-16 px-4 flex items-center justify-between shrink-0 bg-whatsapp-panel shadow-sm z-10">
                <div className="flex items-center gap-3">
                  <div className="relative group cursor-pointer" onClick={() => profileAvatarRef.current?.click()} title="Alterar foto">
                    <img src={currentUser.avatar_url || 'https://via.placeholder.com/40'} alt="Me" className="w-10 h-10 rounded-full border border-gray-600 object-cover group-hover:opacity-80 transition" />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 rounded-full transition">
                      <span className="material-icons text-white text-xs">edit</span>
                    </div>
                  </div>
                  <input
                    type="file"
                    ref={profileAvatarRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleUpdateProfileAvatar}
                  />
                  <div className="flex flex-col">
                    <p className="text-gray-200 font-medium truncate max-w-[120px] sm:max-w-[150px] leading-tight">{currentUser.username}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                        {currentUser.role === 'driver' ? 'Motorista' : 'Cliente'}
                      </span>
                      {currentUser.role === 'client' && (
                        <div className="flex items-center gap-1 bg-yellow-400/10 px-1.5 py-0.5 rounded-full border border-yellow-400/20">
                          <span className="material-icons text-yellow-500 text-[10px]">stars</span>
                          <span className="text-yellow-400 text-[10px] font-black">{currentUser.wallet_coins || 0}</span>
                        </div>
                      )}
                    </div>
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

                      <div className="relative">
                        <button
                          onClick={() => setShowDriverMenu(!showDriverMenu)}
                          className="p-2 rounded-full hover:bg-gray-700/50 active:scale-90 transition text-gray-300"
                        >
                          <span className="material-icons">grid_view</span>
                          {subStatus.daysLeft <= 5 && (
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-whatsapp-panel"></span>
                          )}
                        </button>

                        {showDriverMenu && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowDriverMenu(false)}></div>
                            <div className="absolute right-0 top-12 bg-[#2a3942] rounded-xl shadow-2xl border border-gray-700 p-2 w-48 z-50 flex flex-col gap-1 animate-fade-in">
                              <button
                                onClick={() => { setShowCalculator(true); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-blue-400">calculate</span>
                                Simular Corrida
                              </button>
                              <button
                                onClick={() => { setShowBingo(true); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-purple-400">casino</span>
                                Bingo
                              </button>
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
                              <button
                                onClick={() => { soundService.requestPermission(); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-blue-400">notifications_active</span>
                                Ativar Sons
                              </button>
                              <button
                                onClick={() => { handleEnterPip(); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-indigo-400">picture_in_picture_alt</span>
                                Modo Flutuante (PiP)
                              </button>
                              <button
                                onClick={() => { setShowDriverProfile(true); setShowDriverMenu(false); }}
                                className="flex items-center gap-3 px-3 py-3 hover:bg-gray-700/50 rounded-lg transition text-white text-sm"
                              >
                                <span className="material-icons text-teal-400">account_balance_wallet</span>
                                <div className="flex flex-col">
                                  <span>Meus Dados / PIX</span>
                                  <span className="text-[10px] font-bold text-green-400">R$ {(currentUser.financial_balance || 0).toFixed(2)}</span>
                                </div>
                              </button>
                              <div className="h-[1px] bg-gray-600 my-1"></div>
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
                        className="bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 text-white p-2 rounded-full transition flex items-center justify-center animate-bounce shadow-lg ring-2 ring-yellow-400 ring-offset-2 ring-offset-whatsapp-panel"
                        title="Jogar Bingo - Ganhe Prêmios!"
                      >
                        <span className="material-icons text-sm font-bold drop-shadow-md">emoji_events</span>
                      </button>
                      <button
                        onClick={() => setShowWallet(true)}
                        className="bg-green-600 hover:bg-green-500 text-white p-2 rounded-full transition flex items-center justify-center shadow-lg"
                        title="Minha Carteira"
                      >
                        <span className="material-icons text-sm">account_balance_wallet</span>
                      </button>
                      <button className="p-2 rounded-full hover:bg-red-900/30 hover:text-red-400 transition" title="Sair" onClick={handleLogout}><span className="material-icons">logout</span></button>
                    </>
                  )}
                </div>
              </div>

              {/* Search Bar */}
              <div className="p-1 sm:p-2 bg-whatsapp-dark border-b border-gray-800/50">
                <div className="bg-whatsapp-panel rounded-lg flex items-center px-3 sm:px-4 py-1.5 sm:py-2 transition focus-within:bg-[#2a3942]">
                  <span className="material-icons text-gray-400 text-sm">search</span>
                  <input
                    type="text"
                    placeholder={currentUser.role === 'client' ? "Buscar motorista..." : "Buscar cliente..."}
                    className="bg-transparent text-gray-200 placeholder-gray-500 ml-4 w-full text-sm outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {contactList.map((contact) => (
                  <div
                    key={contact.id}
                    onClick={() => handleContactSelect(contact)}
                    className={`flex items-center px-3 sm:px-4 py-2.5 sm:py-3 cursor-pointer hover:bg-whatsapp-panel border-b border-gray-800 transition active:bg-[#2a3942] ${activeContact?.id === contact.id ? 'bg-whatsapp-panel' : ''}`}
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
                      <div className="flex justify-between items-center mb-0.5 sm:mb-1">
                        <div className="flex items-center gap-1 sm:gap-2 overflow-hidden">
                          <h3 className="text-gray-100 font-medium truncate text-[15px] sm:text-[16px]">{contact.username}</h3>
                          {contact.role === UserRole.DRIVER && (
                            <>
                              <span
                                className={`material-icons text-sm ml-1 ${contact.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}
                                title={contact.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                              >
                                {contact.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 sm:gap-1 shrink-0">
                          <span className="text-[10px] sm:text-xs text-gray-500">
                            {contact.role === UserRole.DRIVER && contact.status === DriverStatus.AVAILABLE ? "Online" : "Agora"}
                          </span>
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
              </div>
            </div>

            {/* Chat Area */}
            <div className={`flex-1 flex flex-col bg-whatsapp-panel relative ${!showChatOnMobile ? 'hidden md:flex' : 'flex'} h-full`}>
              {activeContact ? (
                <ChatWindow
                  currentUser={currentUser}
                  chatPartner={activeContact}
                  messages={messages}
                  onSendMessage={(msg) => setMessages(p => [...p, msg])}
                  onBack={handleBackToList}
                />
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
        )}
      </div>

      {/* REWARDS/WALLET OVERLAY */}
      {showWallet && currentUser && (
        <div className="absolute inset-0 z-[120] bg-black animate-fade-in flex flex-col">
          {currentUser.role === UserRole.CLIENT ? (
            <RewardsHub
              currentUser={currentUser}
              onClose={() => setShowWallet(false)}
              onUpdateUser={(updated) => {
                setCurrentUser(updated);
                localStorage.setItem('chegoja_user', JSON.stringify(updated));
              }}
              initialTab="wallet"
            />
          ) : (
            <WalletScreen
              currentUser={currentUser}
              onClose={() => setShowWallet(false)}
              onOpenStore={() => { setShowWallet(false); setShowStore(true); }}
              onUpdateUser={(updated) => {
                setCurrentUser(updated);
                localStorage.setItem('chegoja_user', JSON.stringify(updated));
              }}
            />
          )}
        </div>
      )}

      {/* STORE OVERLAY */}
      {showStore && currentUser && (
        <div className="absolute inset-0 z-[130] bg-black animate-fade-in flex flex-col">
          {currentUser.role === UserRole.CLIENT ? (
            <RewardsHub
              currentUser={currentUser}
              onClose={() => setShowStore(false)}
              onUpdateUser={(updated) => {
                setCurrentUser(updated);
                localStorage.setItem('chegoja_user', JSON.stringify(updated));
              }}
            />
          ) : (
            <InstantStore
              currentUser={currentUser}
              onClose={() => setShowStore(false)}
              onUpdateUser={(updated) => {
                setCurrentUser(updated);
                localStorage.setItem('chegoja_user', JSON.stringify(updated));
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
