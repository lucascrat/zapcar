
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, UserRole, Ride, DriverStatus, AppSettings, Coupon } from '../types';
import { fetchOnlineDrivers, createRideRequest, fetchActiveRide, fetchRideById, subscribeToRides, fetchAppSettings, cancelRide, subscribeToProfiles, fetchAvailableCoupons, useCoupon, updateUserProfile, supabase, fetchUserProfile } from '../services/supabaseClient';
import { notifyNextDriver } from '../services/sequentialNotifications';
// AdMob removido da tela do cliente para experiência limpa
// import { AdMobService } from '../services/adMobService';
import { AdBanner } from './AdBanner';
import { DriverStories } from './DriverStories';
import { AppMap } from './AppMap';
import { RideStatusOverlay } from './RideStatusOverlay';
import { sendNotification } from '../services/notificationSender';
import { RewardsHub } from './RewardsHub';
import { geocodeForward, geocodeReverse, getDirections } from '../services/placesService';

interface ClientDashboardProps {
    currentUser: UserProfile;
    onStartChat: (driver: UserProfile) => void;
    onOpenBingo: () => void;
    onOpenWallet?: () => void;
    activeRide: Ride | null;
    setActiveRide: (ride: Ride | null) => void;
    onUpdateUser?: (user: UserProfile) => void;
    onLogout: () => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
    currentUser,
    onStartChat,
    onOpenBingo,
    onOpenWallet,
    activeRide,
    setActiveRide,
    onUpdateUser,
    onLogout
}) => {
    const [drivers, setDrivers] = useState<UserProfile[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
    const [selectedVehicleType, setSelectedVehicleType] = useState<'car' | 'motorcycle'>('car');
    // Inicializa com a última localização conhecida do cliente (salva no banco
    // pelo rastreamento contínuo em App.tsx), igual já funciona no dashboard
    // do motorista — evita que o mapa comece numa cidade errada (hardcoded)
    // enquanto o GPS atual ainda não respondeu.
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | undefined>(() =>
        currentUser.lat && currentUser.lng ? { lat: currentUser.lat, lng: currentUser.lng } : undefined
    );
    const gpsWatchIdRef = useRef<number | null>(null);
    const [activeTab, setActiveTab] = useState<'home' | 'delivery' | 'pay' | 'drivers' | 'rewards' | 'wallet' | 'profile'>('home');
    // 'ride' = corrida de passageiro | 'delivery' = entrega de pacote (99 Entrega style)
    const [serviceMode, setServiceMode] = useState<'ride' | 'delivery'>('ride');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isRefreshingWallet, setIsRefreshingWallet] = useState(false);
    const [sidebarCoins, setSidebarCoins] = useState<number>(currentUser.wallet_coins || 0);

    // View State Management
    type ViewState = 'home' | 'search_input' | 'location_check' | 'vehicle_select';
    const [viewState, setViewState] = useState<ViewState>('home');


    // Handle initial search click
    const startSearch = async (fieldParam: 'origin' | 'destination' | React.MouseEvent = 'destination') => {
        const field = (fieldParam === 'origin' || fieldParam === 'destination') ? fieldParam : 'destination';
        setViewState('search_input');
        setActiveField(field);

        // Load recent addresses from history
        const { data: historyData } = await supabase.rpc('search_address_history', { p_query: '' });
        if (historyData && historyData.length > 0) {
            const formattedHistory = historyData.slice(0, 5).map((item: any) => ({
                description: item.address,
                place_id: `history_${item.lat}_${item.lng}`,
                isHistory: true,
                location: { lat: item.lat, lng: item.lng },
                usageCount: item.p_count
            }));
            setRecentAddresses(formattedHistory);
        }

        // Update current location
        if (navigator.geolocation && (!currentAddress || currentAddress === 'Obtendo localização...')) {
            navigator.geolocation.getCurrentPosition((pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                if (!isManualOrigin.current) {
                    geocodeReverse(pos.coords.longitude, pos.coords.latitude).then(address => {
                        if (address) setCurrentAddress(address);
                    });
                }
            }, (err) => {
                console.warn('Erro ao obter localização:', err);
                setCurrentAddress(prev => prev === 'Obtendo localização...' ? 'Toque para digitar seu local de partida' : prev);
            }, { enableHighAccuracy: true, timeout: 10000 });
        }
    };

    const confirmLocation = () => {
        setViewState('vehicle_select');
        if (destination) {
            updateEstimates({ lat: destination.lat, lng: destination.lng });
        }
    };

    // State for Custom Autocomplete
    const [destinationText, setDestinationText] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [activeField, setActiveField] = useState<'origin' | 'destination' | null>(null);
    const [currentAddress, setCurrentAddress] = useState<string>('Obtendo localização...');
    const [destination, setDestination] = useState<{ lat: number, lng: number, address: string } | null>(null);
    const [recentAddresses, setRecentAddresses] = useState<any[]>([]); // Histórico de endereços
    const isManualOrigin = useRef(false);
    const activeRideRef = useRef(activeRide);
    activeRideRef.current = activeRide;
    const [estimates, setEstimates] = useState<{ car: number, motorcycle: number, distance: number, time: number } | null>(null);

    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pix' | 'card' | 'coins'>('cash');

    const originInputRef = useRef<HTMLInputElement>(null);
    const destinationInputRef = useRef<HTMLInputElement>(null);

    // Focus input when viewState changes
    useEffect(() => {
        if (viewState === 'search_input') {
            setTimeout(() => {
                if (activeField === 'origin') originInputRef.current?.focus();
                else destinationInputRef.current?.focus();
            }, 100);
        }
    }, [viewState, activeField]);

    // ... calculatePrices logic restored ...
    const calculatePrices = (distanceKm: number, timeMin: number) => {
        if (!settings) return null;
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const parseTime = (timeStr?: string) => {
            if (!timeStr) return 0;
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const nightStart = parseTime(settings.night_start_time || '19:00');
        const nightEnd = parseTime(settings.night_end_time || '23:59');
        const dawnStart = parseTime(settings.dawn_start_time || '00:00');
        const dawnEnd = parseTime(settings.dawn_end_time || '05:00');

        let carBase = settings.car_base_price;
        let carPerKm = settings.car_price_km;
        let carPerMin = settings.car_price_per_minute || 0; // Use explicit per-minute setting
        let carStartDistLimit = settings.car_start_distance_limit || 0;
        let carMinFare = settings.car_price_min || 0; // Minimum Ride Price

        let motoBase = settings.moto_base_price;
        let motoPerKm = settings.moto_price_km;
        let motoPerMin = settings.moto_price_per_minute || 0;
        let motoStartDistLimit = settings.moto_start_distance_limit || 0;
        let motoMinFare = settings.moto_price_min || 0;

        const isNight = (nightStart < nightEnd)
            ? (currentTime >= nightStart && currentTime <= nightEnd)
            : (currentTime >= nightStart || currentTime <= nightEnd);

        const isDawn = (dawnStart < dawnEnd)
            ? (currentTime >= dawnStart && currentTime <= dawnEnd)
            : (currentTime >= dawnStart || currentTime <= dawnEnd);

        if (isDawn) {
            carBase = settings.dawn_car_base_price ?? carBase;
            carPerKm = settings.dawn_car_price_km ?? carPerKm;
            carPerMin = settings.dawn_car_price_min ?? carPerMin;
            motoBase = settings.dawn_moto_base_price ?? motoBase;
            motoPerKm = settings.dawn_moto_price_km ?? motoPerKm;
            motoPerMin = settings.dawn_moto_price_min ?? motoPerMin;
        } else if (isNight) {
            carBase = settings.night_car_base_price ?? carBase;
            carPerKm = settings.night_car_price_km ?? carPerKm;
            carPerMin = settings.night_car_price_min ?? carPerMin;
            motoBase = settings.night_moto_base_price ?? motoBase;
            motoPerKm = settings.night_moto_price_km ?? motoPerKm;
            motoPerMin = settings.night_moto_price_min ?? motoPerMin;
        }

        const carExtraKm = Math.max(0, distanceKm - carStartDistLimit);
        // Logic: Base + DistPrice + TimePrice
        // Charge Time ALWAYS (even within limit), unlike previous logic.
        const carCalculated = carBase + (carExtraKm * carPerKm) + (timeMin * carPerMin);
        const carPrice = Math.max(carCalculated, carMinFare);

        const motoExtraKm = Math.max(0, distanceKm - motoStartDistLimit);
        const motoCalculated = motoBase + (motoExtraKm * motoPerKm) + (timeMin * motoPerMin);
        const motoPrice = Math.max(motoCalculated, motoMinFare);

        return {
            car: carPrice,
            motorcycle: motoPrice,
            distance: distanceKm,
            time: timeMin
        };
    };

    const updateEstimates = async (dest: { lat: number, lng: number }) => {
        if (!userLocation) return;
        const route = await getDirections([userLocation.lng, userLocation.lat], [dest.lng, dest.lat]);
        if (route) {
            const distanceKm = route.distanceMeters / 1000;
            const timeMin = route.durationSeconds / 60;
            const calculated = calculatePrices(distanceKm, timeMin);
            setEstimates(calculated);
        }
    };

    useEffect(() => {
        if (destination) {
            updateEstimates({ lat: destination.lat, lng: destination.lng });
        } else {
            setEstimates(null);
        }
    }, [destination, userLocation]);

    useEffect(() => {
        const loadInitialData = async () => {
            const [onlineDrivers, appSettings, availableCoupons] = await Promise.all([
                fetchOnlineDrivers(),
                fetchAppSettings(),
                fetchAvailableCoupons()
            ]);
            setDrivers(onlineDrivers);
            setSettings(appSettings);
            setCoupons(availableCoupons);
        };
        loadInitialData();

        // Subscriptions para Realtime
        const settingsSub = supabase
            .channel('app_settings_changes')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'app_settings' }, (payload) => {
                console.log('[Realtime] App Settings atualizado:', payload.new);
                setSettings(payload.new as AppSettings);
            })
            .subscribe();

        const couponsSub = supabase
            .channel('coupons_changes')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'coupons' }, () => {
                fetchAvailableCoupons().then(setCoupons);
            })
            .subscribe();

        if (navigator.geolocation) {
            // watchPosition em vez de getCurrentPosition: continua tentando/
            // atualizando em vez de uma única tentativa que pode falhar ou
            // demorar (GPS frio), garantindo que a localização real do
            // aparelho é sempre usada assim que disponível.
            gpsWatchIdRef.current = navigator.geolocation.watchPosition((pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                // Simple reverse geocode for current location if not manual
                if (!isManualOrigin.current) {
                    geocodeReverse(pos.coords.longitude, pos.coords.latitude).then(address => {
                        if (address) setCurrentAddress(address);
                    });
                }
            }, (err) => {
                console.warn('Erro ao obter localização:', err);
                setCurrentAddress(prev => prev === 'Obtendo localização...' ? 'Toque para digitar seu local de partida' : prev);
            }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
        }
        const profileSub = subscribeToProfiles(() => fetchOnlineDrivers().then(setDrivers));
        const rideSub = subscribeToRides(currentUser.id, 'client', async (updatedRide) => {
            // Se foi cancelada, limpar estado e avisar (só se ainda não foi tratada por outro caminho, ex: falha ao notificar motorista)
            if (updatedRide.status === 'cancelled') {
                console.log('[Dashboard] Corrida cancelada detectada via Realtime.');
                if (activeRideRef.current && activeRideRef.current.id === updatedRide.id) {
                    notify("Motorista ocupado ou corrida cancelada.");
                    setActiveRide(null);
                }
                return;
            }

            // Se a corrida foi atualizada e tem motorista, precisamos buscar os dados completos (join)
            // pois o realtime retorna apenas os dados crus da tabela
            if (updatedRide.driver_id) {
                const fullRide = await fetchActiveRide(currentUser.id, 'client');
                if (fullRide) {
                    setActiveRide(fullRide);
                    return;
                }
            }
            setActiveRide(updatedRide);
        });

        return () => {
            profileSub.unsubscribe();
            rideSub.unsubscribe();
            supabase.removeChannel(settingsSub);
            supabase.removeChannel(couponsSub);
            if (gpsWatchIdRef.current !== null) {
                navigator.geolocation.clearWatch(gpsWatchIdRef.current);
                gpsWatchIdRef.current = null;
            }
        };
    }, [currentUser.id]);

    // Polling de segurança para garantir que não fique preso em status antigos
    useEffect(() => {
        let interval: NodeJS.Timeout;
        // Executa polling se houver corrida ativa (mesmo waiting_payment)
        if (activeRide && activeRide.status !== 'cancelled') {
            interval = setInterval(async () => {
                // Se estiver aguardando pagamento, buscamos especificamente pelo ID para ver se finalizou
                // pois fetchActiveRide ignora status 'finished'
                let check: Ride | null = null;

                if (activeRide.status === 'waiting_payment' || activeRide.status === 'finished') {
                    check = await fetchRideById(activeRide.id);
                } else {
                    check = await fetchActiveRide(currentUser.id, 'client');
                }

                // Se não retornou nada (active ride API retorna null se cancelada/finalizada antiga)
                if (!check) {
                    // Verificar explicitamente se foi cancelada
                    const confirm = await fetchRideById(activeRide.id);
                    if (confirm && confirm.status === 'cancelled') {
                        console.log('[Polling] Corrida cancelada detectada.');
                        notify("Motorista ocupado ou corrida cancelada.");
                        setActiveRide(null);
                        return;
                    }
                }

                // Se a corrida mudou de status
                if (check && check.status !== activeRide.status) {
                    console.log('[Polling] Status atualizado:', check.status);
                    if (check.status === 'cancelled') {
                        notify("Todos os motoristas estão ocupados tente novamente mais tarde.");
                        setActiveRide(null);
                    } else {
                        setActiveRide(check);
                    }
                }

                // REMOVIDO: loop de backup que chamava findAndAssignNextDriver a cada 3s.
                // Esse loop escrevia direto em `driver_id` (sem lock atômico, ao contrário
                // de atomic_accept_ride) em paralelo com o sistema sequencial
                // (notifyNextDriver/current_notified_driver_id, ver services/sequentialNotifications.ts),
                // que roda de forma independente e sem coordenação com este. Resultado: os
                // dois sistemas podiam atribuir motoristas DIFERENTES pra mesma corrida ao
                // mesmo tempo, e o filtro de exibição da chamada no App.tsx prioriza
                // `driver_id`, então quem esse loop escolhia "vencia" a visibilidade mesmo
                // que o sistema sequencial estivesse no meio do rodízio com outro motorista -
                // gerando corridas "roubadas"/comportamento imprevisível. Agora que o watchdog
                // do sistema sequencial (checkNotificationTimeouts, ver App.tsx) realmente
                // roda, esse backup não é mais necessário.
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [activeRide?.status, activeRide?.id, currentUser.id]);

    useEffect(() => {
        const refresh = async () => {
            setIsRefreshingWallet(true);
            try {
                const updated = await fetchUserProfile(currentUser.id);
                if (updated) {
                    setSidebarCoins(updated.wallet_coins || 0);
                    if (onUpdateUser) onUpdateUser(updated);
                }
            } finally {
                setIsRefreshingWallet(false);
            }
        };
        const t = setInterval(refresh, 30000);
        return () => clearInterval(t);
    }, [currentUser.id]);

    // AdMob Banner removido para tela limpa do cliente

    // Function to search addresses (Mapbox + History)
    const handleSearch = async (query: string, field: 'origin' | 'destination') => {
        if (field === 'destination') setDestinationText(query);
        else setCurrentAddress(query);

        if (query.length < 3) {
            setSuggestions([]);
            return;
        }

        setActiveField(field);

        // 1. Search in History (Supabase RPC)
        const { data: historyData } = await supabase.rpc('search_address_history', { p_query: query });
        const historySuggestions = (historyData || []).map((item: any) => ({
            description: item.address,
            place_id: `history_${item.lat}_${item.lng}`,
            isHistory: true,
            location: { lat: item.lat, lng: item.lng }
        }));

        // 2. Search via Mapbox
        const proximity: [number, number] | undefined = userLocation ? [userLocation.lng, userLocation.lat] : undefined;
        const matches = await geocodeForward(query, proximity);
        const mapboxSuggestions = matches.map((m) => ({
            description: m.address,
            place_id: `mapbox_${m.lat}_${m.lng}`,
            isHistory: false,
            location: { lat: m.lat, lng: m.lng }
        }));

        // Merge: History first, then Mapbox
        setSuggestions([...historySuggestions, ...mapboxSuggestions]);
    };

    // Handle Selection
    const handleSelectAddress = (item: any) => {
        const field = activeField; // Capture current field
        setSuggestions([]);
        setActiveField(null);


        const updateLocation = (lat: number, lng: number, address: string) => {
            if (activeField === 'origin' || field === 'origin') {
                isManualOrigin.current = true;
                setUserLocation({ lat, lng });
                setCurrentAddress(address);
                // Also update map center/marker if needed via effect
            } else {
                setDestination({ lat, lng, address });
                setDestinationText(address);
                setViewState('location_check'); // Auto-advance
            }

            // Save to History (Fire and Forget)
            supabase.rpc('register_address_usage', {
                p_address: address,
                p_lat: lat,
                p_lng: lng
            }).then();
        };

        // Mapbox forward geocoding já retorna as coordenadas junto da sugestão
        updateLocation(item.location.lat, item.location.lng, item.description);
    };

    // ... (Existing Effects for Initial Data and Geo) ...

    // REMOVED OLD AUTOCOMPLETE EFFECT (It was failing on web sometimes)

    const notify = (msg: string) => {
        if (window.Android?.showToast) {
            window.Android.showToast(msg);
        } else {
            alert(msg);
        }
    };

    const handleRequestRide = async (type: 'car' | 'motorcycle') => {
        try {
            if (!userLocation) {
                notify("GPS desligado ou sem sinal. Ative a localização e aguarde um momento.");
                return;
            }

            if (!destination) {
                notify("Atenção: Você precisa selecionar um destino na lista de sugestões.");
                return;
            }


            let originalPrice = type === 'car' ? (estimates?.car || settings?.car_base_price || 0) : (estimates?.motorcycle || settings?.moto_base_price || 0);
            let finalPrice = originalPrice;
            let discountAmount = 0;

            // Aplicar desconto do cupom se válido
            if (selectedCoupon && (selectedCoupon.vehicle_type === 'all' || selectedCoupon.vehicle_type === type)) {
                discountAmount = selectedCoupon.discount_value;
                finalPrice = Math.max(0, originalPrice - discountAmount);
            }

            // Validar pagamento com moedas
            if (paymentMethod === 'coins') {
                const userCoins = currentUser.wallet_coins || 0;
                const coinValue = settings?.coin_value_brl || 0.10; // Valor padrão: R$ 0,10 por moeda
                const requiredCoins = Math.ceil(finalPrice / coinValue);

                if (userCoins < requiredCoins) {
                    notify(`Saldo insuficiente! Você precisa de ${requiredCoins} moedas (possui ${userCoins}). Escolha outro método de pagamento.`);
                    return;
                }
            }

            const { data: newRide, error: dbError } = await createRideRequest({
                client_id: currentUser.id,
                driver_id: undefined,
                vehicle_type: type,
                origin_lat: userLocation.lat,
                origin_lng: userLocation.lng,
                origin_address: currentAddress,
                destination_lat: destination.lat,
                destination_lng: destination.lng,
                destination_address: destination.address,
                estimated_price: finalPrice,
                distance_km: estimates?.distance,
                estimated_time: estimates?.time,
                payment_method: paymentMethod,
                status: 'searching',
                coupon_id: selectedCoupon?.id,
                discount_amount: discountAmount,
                is_direct: false,
                is_delivery: serviceMode === 'delivery'
            });

            if (newRide) {
                setActiveRide(newRide);

                // ✅ SISTEMA SEQUENCIAL: Notificar UM motorista por vez
                console.log(`[ClientDashboard] Iniciando notificação sequencial para corrida ${newRide.id}`);

                notifyNextDriver(newRide.id).then((result) => {
                    if (result.success) {
                        console.log(`[ClientDashboard] ✅ Motorista ${result.driver_id} notificado com sucesso`);
                    } else {
                        console.log(`[ClientDashboard] ⚠️ Falha ao notificar: ${result.message}`);

                        // Se não há motoristas disponíveis, notificar cliente
                        if (result.message?.includes('cancelled')) {
                            notify("Nenhum motorista disponível no momento. Tente novamente.");
                            setActiveRide(null);
                        }
                    }
                }).catch(error => {
                    console.error('[ClientDashboard] ❌ Erro ao notificar motorista:', error);
                });

                // Consumir cupom se houver um selecionado
                if (selectedCoupon) {
                    await useCoupon(selectedCoupon.id);
                    setSelectedCoupon(null);
                }
            } else {
                notify(`Erro no servidor: ${dbError || 'Sem resposta'}`);
            }
        } catch (err: any) {
            console.error("[RideRequest] Crash:", err);
            notify("Erro interno ao solicitar. Tente reiniciar o app.");
        }
    };

    const handleCancelRide = async () => {
        if (!activeRide) return;

        // Se a corrida já foi finalizada, apenas limpamos o estado para voltar ao mapa
        if (activeRide.status === 'finished') {
            setActiveRide(null);
            return;
        }

        const confirmCancel = window.confirm("Deseja cancelar esta corrida?");
        if (confirmCancel) {
            await cancelRide(activeRide.id);
            if (activeRide.driver_id) {
                sendNotification(
                    "Corrida Cancelada ❌",
                    "O cliente cancelou a chamada.",
                    'user',
                    {
                        targetUserId: activeRide.driver_id,
                        sound: 'default',
                        data: { type: 'ride_cancelled', ride_id: activeRide.id }
                    }
                ).catch(() => { });
            }
            setActiveRide(null);
            if (window.Android?.showToast) window.Android.showToast("Corrida cancelada.");
        }
    };

    const handleSaveClientProfile = async () => {
        const firstName = (document.getElementById('firstName') as HTMLInputElement)?.value;
        const lastName = (document.getElementById('lastName') as HTMLInputElement)?.value;
        const whatsapp = (document.getElementById('whatsapp') as HTMLInputElement)?.value;
        const cpf = (document.getElementById('cpf') as HTMLInputElement)?.value;
        const pixKey = (document.getElementById('pixKey') as HTMLInputElement)?.value;
        const addressStreet = (document.getElementById('addressStreet') as HTMLInputElement)?.value;
        const addressNumber = (document.getElementById('addressNumber') as HTMLInputElement)?.value;
        const addressNeighborhood = (document.getElementById('addressNeighborhood') as HTMLInputElement)?.value;
        const addressCity = (document.getElementById('addressCity') as HTMLInputElement)?.value;
        const addressZip = (document.getElementById('addressZip') as HTMLInputElement)?.value;

        const fullName = `${firstName} ${lastName}`.trim();

        const updateData = {
            username: fullName || currentUser.username,
            whatsapp: whatsapp || null,
            cpf: cpf || null,
            pix_key: pixKey || null,
            address_street: addressStreet || null,
            address_number: addressNumber || null,
            address_neighborhood: addressNeighborhood || null,
            address_city: addressCity || null,
            address_zip: addressZip || null,
        };

        const success = await updateUserProfile(currentUser.id, updateData);

        if (!success) {
            notify('Erro ao salvar perfil. Verifique sua conexão.');
        } else {
            notify('Perfil atualizado com sucesso!');
            if (onUpdateUser) {
                onUpdateUser({ ...currentUser, ...updateData } as UserProfile);
            }
        }
    };

    // Helper for Menu Items
    const MenuItem = ({ icon, label, active, onClick }: any) => (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all ${active ? 'bg-whatsapp-green/10 text-whatsapp-green' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
        >
            <span className="material-icons">{icon}</span>
            <span className="font-bold text-sm tracking-wide">{label}</span>
        </button>
    );

    return (
        <div className="flex-1 flex flex-col h-full bg-[#111b21] relative overflow-hidden font-sans">

            {/* Header antigo removido: a home no estilo 99 tem header amarelo próprio
                (avatar + saudação + moedas), e as abas Entrega/Pay também. */}

            {/* Side Menu Drawer */}
            {isMenuOpen && (
                <>
                    <div
                        className="absolute inset-0 bg-black/60 z-50 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsMenuOpen(false)}
                    ></div>
                    <div className="absolute top-0 left-0 bottom-0 w-[75%] max-w-[300px] bg-[#1c272d] z-[60] shadow-2xl flex flex-col border-r border-white/5 animate-slide-in-left">
                        <div className="p-8 bg-[#111b21] border-b border-white/5">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <img src={currentUser.avatar_url || "/logo.png"} className="w-14 h-14 rounded-full border-2 border-whatsapp-green object-cover" />
                                    <div>
                                        <h2 className="text-white font-bold text-lg leading-tight">{currentUser.username.split(' ')[0]}</h2>
                                        <p className="text-gray-400 text-xs text-brand-600 flex items-center gap-1 font-bold mt-1">
                                            <span className="material-icons text-[12px]">star</span> 5.0
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Wallet Balance in Sidebar */}
                            <div className="bg-gradient-to-r from-brand-500 to-brand-600 p-4 rounded-2xl shadow-lg shadow-brand-900/20 active:scale-95 transition-transform" onClick={() => { setActiveTab('wallet'); setIsMenuOpen(false); }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                            <span className="material-icons text-white text-lg">stars</span>
                                        </div>
                                        <div>
                                            <p className="text-white/60 text-[10px] font-black uppercase tracking-wider leading-none">Minhas Moedas</p>
                                            <p className="text-white font-black text-xl leading-none mt-1">{sidebarCoins}</p>
                                            <div className="mt-1 flex items-center gap-2">
                                                <span className={`text-sm font-black ${((sidebarCoins * (settings?.coin_value_brl || 0)) || 0) > 0 ? 'text-green-200' : ((sidebarCoins * (settings?.coin_value_brl || 0)) || 0) < 0 ? 'text-red-200' : 'text-white/70'}`}>
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((sidebarCoins * (settings?.coin_value_brl || 0)) || 0)}
                                                </span>
                                                {isRefreshingWallet && (
                                                    <span className="material-icons text-white/70 text-sm animate-spin">autorenew</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="material-icons text-white/50 text-sm">chevron_right</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                            <MenuItem icon="map" label="Mapa" active={activeTab === 'home'} onClick={() => { setActiveTab('home'); setIsMenuOpen(false); }} />
                            <MenuItem icon="person" label="Perfil" active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setIsMenuOpen(false); }} />
                            {/* <MenuItem icon="people" label="Motoristas" active={activeTab === 'drivers'} onClick={() => { setActiveTab('drivers'); setIsMenuOpen(false); }} /> */}
                            <MenuItem icon="account_balance_wallet" label="Carteira" active={activeTab === 'wallet'} onClick={() => { setActiveTab('wallet'); setIsMenuOpen(false); }} />
                            <MenuItem icon="card_giftcard" label="Prêmios" active={activeTab === 'rewards'} onClick={() => { setActiveTab('rewards'); setIsMenuOpen(false); }} />
                            <div className="h-px bg-white/5 my-3 mx-4"></div>
                            <MenuItem icon="style" label="Bingo" onClick={() => { onOpenBingo(); setIsMenuOpen(false); }} />
                        </div>

                        {/* Logout Button */}
                        <div className="px-3 pb-4">
                            <button
                                onClick={onLogout}
                                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg"
                            >
                                <span className="material-icons text-sm">logout</span>
                                Sair
                            </button>
                        </div>

                        <div className="p-6 border-t border-white/5">
                            <p className="text-center text-gray-600 text-[10px] font-bold uppercase tracking-widest">ChegoJá v6.2</p>
                        </div>
                    </div>
                </>
            )}

            {/* ---------------------------------------------------------------------------------- */}
            {/* VIEW: HOME - Estilo 99 (header amarelo + mapa em card + busca + banners + atalhos) */}
            {viewState === 'home' && activeTab === 'home' && !activeRide && (
                <div className="absolute inset-0 z-10 flex flex-col bg-gray-100">
                    {/* Header Amarelo */}
                    <div className="bg-brand-400 px-5 pt-5 pb-16 shrink-0 relative">
                        <div className="flex items-center justify-between">
                            <button onClick={() => setIsMenuOpen(true)} className="flex items-center gap-3 active:scale-95 transition-transform">
                                <div className="relative">
                                    <img src={currentUser.avatar_url || "/logo.png"} className="w-11 h-11 rounded-full object-cover border-2 border-white shadow" />
                                </div>
                                <h1 className="chegoja-header-name text-gray-900 font-black text-2xl tracking-tight">Olá, {currentUser.username.split(' ')[0]}!</h1>
                            </button>
                            <button
                                onClick={() => setActiveTab('pay')}
                                className="shrink-0 bg-black/10 px-3 py-1.5 rounded-full flex items-center gap-1.5 active:scale-95 transition-transform"
                            >
                                <span className="material-icons text-gray-900 text-base">stars</span>
                                <span className="text-gray-900 font-black text-sm">{sidebarCoins}</span>
                            </button>
                        </div>
                    </div>

                    {/* Conteúdo rolável */}
                    <div className="flex-1 overflow-y-auto relative -mt-12 pb-32">
                        <div className="px-4 space-y-4">
                            {/* Card do Mapa */}
                            <div className="chegoja-map-card rounded-3xl overflow-hidden shadow-lg h-52 relative bg-gray-200">
                                <AppMap drivers={drivers} userLocation={userLocation} onMarkerClick={onStartChat} settings={settings} />
                            </div>

                            {/* Barra de Busca "Para onde vamos?" */}
                            <button
                                onClick={() => { setServiceMode('ride'); startSearch(); }}
                                type="button"
                                className="w-full bg-white rounded-full py-4 px-6 flex items-center gap-3 shadow-lg active:scale-[0.98] transition-all"
                            >
                                <span className="material-icons text-gray-900 text-2xl">search</span>
                                <span className="chegoja-search-bar text-gray-900 text-xl font-black tracking-tight">Para onde vamos?</span>
                            </button>

                            {/* Banners promocionais em carrossel (cadastrados pelo admin) */}
                            <AdBanner />

                            {/* Card destaque: Entregas */}
                            <button
                                onClick={() => setActiveTab('delivery')}
                                className="w-full bg-white rounded-2xl p-4 flex items-center justify-between shadow-sm active:scale-[0.98] transition-all"
                            >
                                <div className="flex items-center gap-3 text-left">
                                    <div className="w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center">
                                        <span className="material-icons text-brand-700">inventory_2</span>
                                    </div>
                                    <div>
                                        <p className="text-gray-900 font-black text-sm">Precisa enviar algo?</p>
                                        <p className="text-gray-500 text-xs">Peça uma entrega de moto ou carro</p>
                                    </div>
                                </div>
                                <span className="material-icons text-gray-400">chevron_right</span>
                            </button>

                            {/* Praticidade / Atalhos */}
                            <div>
                                <h3 className="text-gray-900 font-black text-lg mb-3 px-1">Praticidade no dia a dia</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setActiveTab('rewards')}
                                        className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-4 text-left active:scale-[0.98] transition-all shadow-sm"
                                    >
                                        <div className="h-1 w-8 bg-blue-500 rounded-full mb-2"></div>
                                        <p className="text-gray-900 font-black text-sm uppercase leading-tight">Cupons de Desconto</p>
                                        <p className="text-gray-600 text-xs mt-1">Economize nas corridas!</p>
                                        <span className="material-icons text-blue-500 text-3xl mt-2">local_offer</span>
                                    </button>
                                    <button
                                        onClick={onOpenBingo}
                                        className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl p-4 text-left active:scale-[0.98] transition-all shadow-sm"
                                    >
                                        <div className="h-1 w-8 bg-orange-500 rounded-full mb-2"></div>
                                        <p className="text-gray-900 font-black text-sm uppercase leading-tight">Sorteio Ativo</p>
                                        <p className="text-gray-600 text-xs mt-1">Veja sua cartela do Bingo</p>
                                        <span className="material-icons text-orange-500 text-3xl mt-2">emoji_events</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------------------------------------------------------------------------------- */}
            {/* VIEW: ENTREGA - Estilo 99 Entrega */}
            {viewState === 'home' && activeTab === 'delivery' && !activeRide && (
                <div className="absolute inset-0 z-10 flex flex-col bg-white">
                    {/* Header Amarelo */}
                    <div className="bg-brand-400 px-5 pt-5 pb-6 shrink-0">
                        <button onClick={() => setIsMenuOpen(true)} className="flex items-center gap-3 active:scale-95 transition-transform">
                            <img src={currentUser.avatar_url || "/logo.png"} className="w-11 h-11 rounded-full object-cover border-2 border-white shadow" />
                            <h1 className="chegoja-header-name text-gray-900 font-black text-2xl tracking-tight">Olá, {currentUser.username.split(' ')[0]}!</h1>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pb-32">
                        {/* Hero */}
                        <div className="chegoja-delivery-hero text-center pt-8 pb-6 px-6">
                            <p className="text-gray-700 font-bold text-xl tracking-wide uppercase">Você precisa,</p>
                            <div className="flex items-center justify-center gap-2 mt-1">
                                <span className="material-icons text-brand-600 text-3xl bg-brand-100 rounded-lg p-1">arrow_forward</span>
                                <h2 className="text-gray-900 font-black text-4xl tracking-tight">ChegoJá <span className="font-medium">Entrega</span></h2>
                            </div>
                            <div className="flex items-center justify-center gap-8 mt-6">
                                <img
                                    src={settings?.moto_icon_url || "/images/moto_icon_3d.png"}
                                    className="w-28 h-28 object-contain drop-shadow-xl"
                                    onError={(e) => (e.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/3233/3233315.png')}
                                    alt="Entrega de moto"
                                />
                                <img
                                    src={settings?.car_icon_url || "/images/car_icon_3d.png"}
                                    className="w-28 h-28 object-contain drop-shadow-xl"
                                    onError={(e) => (e.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png')}
                                    alt="Entrega de carro"
                                />
                            </div>
                        </div>

                        {/* Card de Origem/Destino */}
                        <div className="mx-4 bg-gray-50 rounded-3xl p-5 shadow-sm border border-gray-100">
                            <p className="text-gray-900 font-black text-lg mb-4">Enviar encomenda</p>

                            {/* Origem */}
                            <button
                                onClick={() => { setServiceMode('delivery'); startSearch('origin'); }}
                                className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm mb-3 active:scale-[0.98] transition-all text-left"
                            >
                                <div className="w-3 h-3 rounded-full border-[3px] border-teal-500 shrink-0"></div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-gray-500 text-[10px] font-bold uppercase">Enviar de</p>
                                    <p className="text-gray-900 font-bold text-sm truncate">{currentAddress || 'Sua localização atual'}</p>
                                </div>
                                <span className="material-icons text-gray-400 text-sm">edit</span>
                            </button>

                            {/* Destino */}
                            <button
                                onClick={() => { setServiceMode('delivery'); startSearch('destination'); }}
                                className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 shadow-sm active:scale-[0.98] transition-all text-left border-2 border-brand-400"
                            >
                                <div className="w-3 h-3 rounded-full border-[3px] border-orange-500 shrink-0"></div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-gray-500 text-[10px] font-bold uppercase">Entregar em</p>
                                    <p className="text-gray-900 font-black text-base truncate">{destination?.address || 'Escolher endereço de entrega'}</p>
                                </div>
                                <span className="material-icons text-gray-400">chevron_right</span>
                            </button>

                            <p className="text-gray-400 text-[11px] mt-4 flex items-center gap-1.5 px-1">
                                <span className="material-icons text-sm">info</span>
                                Após escolher o endereço, selecione moto ou carro e confirme a entrega.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ---------------------------------------------------------------------------------- */}
            {/* VIEW: PAY (Carteira) - Estilo 99Pay */}
            {viewState === 'home' && activeTab === 'pay' && !activeRide && (
                <div className="absolute inset-0 z-10 flex flex-col bg-gray-100">
                    {/* Header Amarelo */}
                    <div className="bg-brand-400 px-5 pt-5 pb-24 shrink-0">
                        <div className="flex items-center justify-between">
                            <button onClick={() => setIsMenuOpen(true)} className="flex items-center gap-3 active:scale-95 transition-transform">
                                <img src={currentUser.avatar_url || "/logo.png"} className="w-11 h-11 rounded-full object-cover border-2 border-white shadow" />
                                <h1 className="chegoja-header-name text-gray-900 font-black text-2xl tracking-tight">Olá, {currentUser.username.split(' ')[0]}</h1>
                            </button>
                            <button onClick={() => setActiveTab('profile')} className="shrink-0 w-10 h-10 rounded-full bg-black/10 flex items-center justify-center active:scale-95">
                                <span className="material-icons text-gray-900">person</span>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto -mt-16 pb-32">
                        <div className="px-4 space-y-4">
                            {/* Card de Saldo */}
                            <div className="bg-white rounded-3xl p-6 shadow-lg">
                                <p className="text-gray-500 font-bold text-sm mb-1">Saldo na Carteira (R$)</p>
                                <div className="flex items-center justify-between">
                                    <p className="chegoja-pay-balance text-gray-900 font-black text-4xl tracking-tight">
                                        {((currentUser.financial_balance || 0) + (sidebarCoins * (settings?.coin_value_brl || 0))).toFixed(2).replace('.', ',')}
                                    </p>
                                    <button
                                        onClick={onOpenWallet}
                                        className="bg-brand-400 text-gray-900 px-6 py-3 rounded-full font-black text-sm active:scale-95 transition-all shadow"
                                    >
                                        Sacar
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="material-icons text-brand-600 text-sm">stars</span>
                                    <span className="text-gray-600 text-sm font-bold">{sidebarCoins} moedas acumuladas</span>
                                </div>

                                {/* Atalhos dentro do card */}
                                <div className="grid grid-cols-3 gap-2 mt-6 pt-5 border-t border-gray-100">
                                    <button onClick={onOpenWallet} className="flex flex-col items-center gap-2 active:scale-95 transition-all">
                                        <span className="material-icons text-gray-900 text-2xl">pix</span>
                                        <span className="text-gray-700 text-xs font-bold">Saque PIX</span>
                                    </button>
                                    <button onClick={onOpenWallet} className="flex flex-col items-center gap-2 active:scale-95 transition-all">
                                        <span className="material-icons text-gray-900 text-2xl">receipt_long</span>
                                        <span className="text-gray-700 text-xs font-bold">Extrato</span>
                                    </button>
                                    <button onClick={() => setActiveTab('rewards')} className="flex flex-col items-center gap-2 active:scale-95 transition-all">
                                        <span className="material-icons text-gray-900 text-2xl">local_offer</span>
                                        <span className="text-gray-700 text-xs font-bold">Cupons</span>
                                    </button>
                                </div>
                            </div>

                            {/* Serviços */}
                            <div>
                                <div className="flex items-center justify-between px-1 mb-3">
                                    <h3 className="text-gray-900 font-black text-lg">Serviços</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={() => setActiveTab('rewards')} className="bg-white rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-all relative overflow-hidden">
                                        <span className="absolute top-3 right-3 bg-teal-100 text-teal-700 text-[9px] font-black px-2 py-0.5 rounded-md uppercase">Grátis</span>
                                        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mb-2">
                                            <span className="material-icons text-teal-600">card_giftcard</span>
                                        </div>
                                        <p className="text-gray-900 font-black text-sm">Prêmios</p>
                                        <p className="text-gray-500 text-xs">Recompensas e cupons</p>
                                    </button>
                                    <button onClick={onOpenBingo} className="bg-white rounded-2xl p-4 text-left shadow-sm active:scale-[0.98] transition-all relative overflow-hidden">
                                        <span className="absolute top-3 right-3 bg-orange-100 text-orange-700 text-[9px] font-black px-2 py-0.5 rounded-md uppercase">Ativo</span>
                                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-2">
                                            <span className="material-icons text-orange-500">casino</span>
                                        </div>
                                        <p className="text-gray-900 font-black text-sm">Bingo</p>
                                        <p className="text-gray-500 text-xs">Sorteio de prêmios</p>
                                    </button>
                                </div>
                            </div>

                            {/* Banners também aparecem na área Pay */}
                            <AdBanner />
                        </div>
                    </div>
                </div>
            )}


            {/* ---------------------------------------------------------------------------------- */}
            {/* VIEW: SEARCH INPUT (Full Screen) */}
            {viewState === 'search_input' && (
                <div className="absolute inset-0 bg-white z-[100] flex flex-col animate-fade-in">
                    {/* Header */}
                    <div className="p-4 flex items-center gap-4 bg-white shadow-sm border-b border-gray-200">
                        <button onClick={() => setViewState('home')} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100">
                            <span className="material-icons text-gray-900">arrow_back</span>
                        </button>
                        <h2 className="text-gray-900 font-bold text-lg">Escolha seu destino</h2>
                    </div>

                    {/* Inputs Section */}
                    <div className="p-4 space-y-4">
                        <div className="flex gap-3 relative">
                            {/* Graphic Connector */}
                            <div className="flex flex-col items-center pt-4 w-6">
                                <div className="w-3 h-3 rounded-full border-2 border-gray-400 bg-white mb-1"></div>
                                <div className="w-0.5 flex-1 bg-gray-300 my-1"></div>
                                <div className="w-3 h-3 rounded-full bg-accent-600 border-2 border-accent-100 mt-1"></div>
                            </div>

                            {/* Fields */}
                            <div className="flex-1 space-y-4">
                                {/* Origin */}
                                <div className="relative">
                                    <div className="bg-gray-100 p-3 rounded-xl border border-gray-200">
                                        <p className="text-[10px] text-gray-600 uppercase font-bold mb-1">Partida</p>
                                        <div className="flex items-center gap-2">
                                            <input
                                                ref={originInputRef}
                                                type="text"
                                                value={currentAddress}
                                                onChange={(e) => handleSearch(e.target.value, 'origin')}
                                                onFocus={() => setActiveField('origin')}
                                                className="bg-transparent flex-1 text-gray-900 text-sm font-medium outline-none placeholder-gray-500"
                                                placeholder="Minha localização"
                                            />
                                            {currentAddress !== 'Obtendo localização...' && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (navigator.geolocation) {
                                                            setCurrentAddress('Atualizando...');
                                                            navigator.geolocation.getCurrentPosition((pos) => {
                                                                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                                                                {
                                                                    geocodeReverse(pos.coords.longitude, pos.coords.latitude).then(address => {
                                                                        if (address) {
                                                                            setCurrentAddress(address);
                                                                            isManualOrigin.current = false;
                                                                        }
                                                                    });
                                                                }
                                                            }, (err) => {
                                                                console.warn('Erro ao atualizar localização:', err);
                                                                setCurrentAddress('Toque para digitar seu local de partida');
                                                            }, { enableHighAccuracy: true, timeout: 10000 });
                                                        }
                                                    }}
                                                    className="w-6 h-6 rounded-full bg-accent-50 flex items-center justify-center hover:bg-accent-100 transition shrink-0"
                                                    title="Atualizar localização"
                                                >
                                                    <span className="material-icons text-accent-600 text-xs">my_location</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Destination */}
                                <div className="bg-accent-50 p-3 rounded-xl border border-accent-400 ring-1 ring-accent-100">
                                    <p className="text-[10px] text-accent-700 uppercase font-bold mb-1">Destino</p>
                                    <input
                                        ref={destinationInputRef}
                                        type="text"
                                        value={destinationText}
                                        onChange={(e) => handleSearch(e.target.value, 'destination')}
                                        onFocus={() => setActiveField('destination')}
                                        className="bg-transparent w-full text-gray-900 text-sm font-medium outline-none placeholder-gray-500"
                                        placeholder="Para onde?"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Suggestions List */}
                    <div className="flex-1 overflow-y-auto px-2">
                        {/* Show search results if typing, otherwise show recent addresses */}
                        {(suggestions.length > 0 || recentAddresses.length > 0) ? (
                            <>
                                {/* Show suggestions when actively searching */}
                                {suggestions.length > 0 && suggestions.map((item) => (
                                    <div
                                        key={item.place_id}
                                        onClick={() => handleSelectAddress(item)}
                                        className="p-4 border-b border-gray-200 flex items-center gap-4 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.isHistory ? 'bg-brand-100 text-brand-700' : 'bg-accent-100 text-accent-600'}`}>
                                            <span className="material-icons text-sm">{item.isHistory ? 'history' : 'place'}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-gray-900 text-sm font-bold truncate">{item.description.split(',')[0]}</p>
                                            <p className="text-gray-600 text-xs truncate">{item.description}</p>
                                            {item.isHistory && <p className="text-[9px] text-brand-700 uppercase mt-0.5">Sugerido pelo Histórico</p>}
                                        </div>
                                        <span className="material-icons text-gray-400 text-lg">chevron_right</span>
                                    </div>
                                ))}

                                {/* Show recent addresses when not searching */}
                                {suggestions.length === 0 && recentAddresses.length > 0 && (
                                    <>
                                        <div className="p-3 px-4">
                                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Endereços Recentes</p>
                                        </div>
                                        {recentAddresses.map((item) => (
                                            <div
                                                key={item.place_id}
                                                onClick={() => handleSelectAddress(item)}
                                                className="p-4 border-b border-white/5 flex items-center gap-4 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                                            >
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-brand-500/10 text-brand-600">
                                                    <span className="material-icons text-sm">history</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-bold truncate">{item.description.split(',')[0]}</p>
                                                    <p className="text-gray-500 text-xs truncate">{item.description}</p>
                                                </div>
                                                <span className="material-icons text-gray-600 text-lg">chevron_right</span>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 px-6">
                                <span className="material-icons text-gray-700 text-6xl mb-4">search_off</span>
                                <p className="text-gray-500 text-sm text-center">
                                    {destinationText ? 'Nenhum resultado encontrado' : 'Digite um endereço para buscar'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Continue Button after editing */}
                    {destination && (
                        <div className="p-4 bg-white border-t border-gray-200 animate-slide-up pb-safe-area shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                            <button
                                onClick={() => {
                                    setViewState('location_check');
                                    updateEstimates({ lat: destination.lat, lng: destination.lng });
                                }}
                                className="w-full bg-accent-500 hover:bg-accent-600 text-accent-ink py-5 rounded-2xl font-black text-lg shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                            >
                                Confirmar e Continuar <span className="material-icons text-sm">arrow_forward</span>
                            </button>
                        </div>
                    )}
                </div>
            )}


            {/* ---------------------------------------------------------------------------------- */}
            {/* VIEW: CONFIRMATION (Check Location) & VEHICLE SELECT */}
            {(viewState === 'location_check' || viewState === 'vehicle_select') && destination && (
                <div className="absolute inset-0 z-[50] flex flex-col bg-white">
                    <div className="flex-1 relative">
                        {/* Map with Route */}
                        <AppMap
                            drivers={drivers.filter(d => d.vehicle_type === selectedVehicleType)}
                            userLocation={userLocation}
                            settings={settings}
                            showRoute={true}
                            routeOrigin={userLocation}
                            routeDestination={destination}
                            speak={false}
                            onRouteInfo={(info) => {
                                // Store route info if needed
                            }}
                        />

                        {/* Top Floating Route Card */}
                        <div className="absolute top-4 left-4 right-4 z-20">
                            <div className="bg-white rounded-2xl p-4 shadow-xl border border-gray-200 flex flex-col gap-3 animate-slide-down">
                                <div className="flex items-start gap-3 relative">
                                    <div className="flex flex-col items-center pt-1.5 h-full absolute left-0 top-0 bottom-0">
                                        <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                        <div className="w-0.5 h-8 bg-gray-300 my-1"></div>
                                        <div className="w-2 h-2 rounded-full bg-accent-600"></div>
                                    </div>
                                    <div className="flex-1 space-y-4 pl-5">
                                        <div onClick={() => startSearch('origin')} className="cursor-pointer active:bg-gray-50 p-1 -m-1 rounded-lg">
                                            <p className="text-[10px] text-gray-500 uppercase font-bold leading-none mb-1">Partida</p>
                                            <p className="text-gray-900 text-xs font-bold truncate pr-8">{currentAddress || 'Loc. Atual'}</p>
                                        </div>
                                        <div className="h-px bg-gray-200 w-full"></div>
                                        <div onClick={() => startSearch('destination')} className="cursor-pointer active:bg-accent-50 p-1 -m-1 rounded-lg">
                                            <p className="text-[10px] text-accent-700 uppercase font-bold leading-none mb-1">Destino</p>
                                            <p className="text-gray-900 text-xs font-bold truncate pr-8">{destination.address}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setViewState('search_input')} className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-900">
                                        <span className="material-icons text-sm">edit</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Distance & Time Card - Floating on Map Center (similar to reference image) */}
                        {(viewState === 'vehicle_select' || viewState === 'location_check') && estimates && (
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none animate-fade-in">
                                <div className="bg-gray-900 text-white px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2 font-bold text-sm">
                                    <span className="material-icons text-base">route</span>
                                    <span>{estimates.distance.toFixed(1)} KM • {Math.round(estimates.time)} MIN</span>
                                </div>
                            </div>
                        )}

                        {/* STEP A: CONFIRM LOCATION BUTTON */}
                        {viewState === 'location_check' && (
                            <div className="absolute bottom-20 left-6 right-6 z-30 animate-slide-up">
                                <button
                                    onClick={confirmLocation}
                                    className="w-full bg-whatsapp-green hover:bg-[#00a884] text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                >
                                    Confirmar Local <span className="material-icons text-sm">check_circle</span>
                                </button>
                            </div>
                        )}

                        {/* STEP B: VEHICLE SELECTION BOTTOM SHEET */}
                        {viewState === 'vehicle_select' && (
                            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[32px] shadow-[0_-8px_32px_rgba(0,0,0,0.15)] z-30 overflow-hidden flex flex-col max-h-[60%] animate-slide-up border-t border-gray-200 pb-16">
                                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                                    <h3 className="text-gray-900 font-bold text-sm pl-2">
                                        {serviceMode === 'delivery' ? '📦 Escolha o veículo da entrega' : 'Escolha como viajar'}
                                    </h3>
                                    <span className="text-[10px] bg-accent-100 text-accent-700 px-2 py-1 rounded-lg font-bold">
                                        {serviceMode === 'delivery' ? 'Entrega' : 'Opcionais'}
                                    </span>
                                </div>

                                <div className="overflow-y-auto p-4 space-y-3 pb-32">
                                    {/* Available Coupons Section */}
                                    {coupons.length > 0 && (
                                        <div className="mb-6">
                                            <h4 className="text-gray-900 font-black text-[10px] uppercase tracking-widest mb-3 px-1">Cupons Disponíveis</h4>
                                            <div className="flex overflow-x-auto pb-4 gap-3 snap-x scrollbar-hide -mx-1 px-1">
                                                {coupons.map((coupon) => (
                                                    <div
                                                        key={coupon.id}
                                                        onClick={() => {
                                                            if (selectedCoupon?.id === coupon.id) {
                                                                setSelectedCoupon(null);
                                                            } else {
                                                                setSelectedCoupon(coupon);
                                                            }
                                                        }}
                                                        className={`
                                                            min-w-[150px] w-[150px] snap-start
                                                            bg-emerald-50/60
                                                            border-2 rounded-[24px] p-3 cursor-pointer 
                                                            transition-all active:scale-[0.98] flex flex-col gap-2
                                                            ${selectedCoupon?.id === coupon.id
                                                                ? 'border-green-600 shadow-lg shadow-green-100'
                                                                : 'border-green-100 hover:border-green-200'}
                                                        `}
                                                    >
                                                        {/* Coupon Badge/Image */}
                                                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/80 flex items-center justify-center border border-green-100 shrink-0">
                                                            {coupon.image_url ? (
                                                                <img src={coupon.image_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="material-icons text-green-600 text-xl">local_offer</span>
                                                            )}
                                                        </div>

                                                        {/* Coupon Info */}
                                                        <div className="flex-1">
                                                            <p className="text-gray-900 font-black text-sm leading-tight">
                                                                R$ {coupon.discount_value.toFixed(2)} OFF
                                                            </p>
                                                            <p className="text-gray-500 text-[8px] uppercase font-bold tracking-tight mt-0.5 leading-none">
                                                                Válido para: {coupon.vehicle_type === 'all' ? 'Qualquer veículo' : (coupon.vehicle_type === 'car' ? 'Carro' : 'Moto')}
                                                            </p>
                                                        </div>

                                                        {/* Action Row */}
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <button
                                                                className={`flex-1 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-colors ${selectedCoupon?.id === coupon.id
                                                                    ? 'bg-green-600 text-white'
                                                                    : 'bg-white border border-green-200 text-green-700 hover:bg-green-50'
                                                                    }`}
                                                            >
                                                                {selectedCoupon?.id === coupon.id ? 'Aplicado' : 'Aplicar'}
                                                            </button>

                                                            <div className="w-8 h-8 rounded-xl bg-white border border-red-50 flex items-center justify-center group/del" onClick={(e) => {
                                                                e.stopPropagation();
                                                                // If you want actual deletion logic here, otherwise it's just visual.
                                                                // Since it's in the client dashboard, maybe just a "hide" or "not interested".
                                                            }}>
                                                                <span className="material-icons text-gray-300 group-hover/del:text-red-500 text-sm">delete</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Car Option */}
                                    <div
                                        onClick={() => setSelectedVehicleType('car')}
                                        className={`bg-gray-100 border-2 ${selectedVehicleType === 'car' ? 'border-accent-500 bg-accent-50/30' : 'border-gray-200'} rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all group shadow-sm`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <img
                                                    src={settings?.car_icon_url || "/images/car_icon_3d.png"}
                                                    className="w-16 h-16 object-contain drop-shadow-lg group-hover:scale-110 transition-transform"
                                                    onError={(e) => (e.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png')}
                                                />
                                                {selectedVehicleType === 'car' && (
                                                    <div className="absolute -top-1 -right-1 bg-accent-600 text-white rounded-full p-0.5 shadow-md">
                                                        <span className="material-icons text-[12px]">check</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-gray-900 font-black text-sm">{settings?.car_name || 'Mob Comum'}</h3>
                                                    <span className="material-icons text-gray-500 text-[10px]">person</span>
                                                    <span className="text-gray-600 text-xs font-bold">4</span>
                                                </div>
                                                <p className="text-gray-600 text-[10px] uppercase font-black tracking-tighter">{settings?.car_description || 'Viagem econômica'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {(() => {
                                                const basePrice = estimates ? estimates.car : (settings?.car_base_price || 0);
                                                let finalPrice = basePrice;
                                                const hasDiscount = selectedCoupon && (selectedCoupon.vehicle_type === 'all' || selectedCoupon.vehicle_type === 'car');

                                                if (hasDiscount) {
                                                    const disc = selectedCoupon.discount_value;
                                                    finalPrice = Math.max(0, basePrice - disc);
                                                }

                                                return (
                                                    <>
                                                        {hasDiscount && (
                                                            <p className="text-gray-400 line-through text-[10px] font-bold">R$ {basePrice.toFixed(2)}</p>
                                                        )}
                                                        <p className="text-accent-600 font-black text-lg">R$ {finalPrice.toFixed(2)}</p>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Moto Option */}
                                    <div
                                        onClick={() => setSelectedVehicleType('motorcycle')}
                                        className={`bg-gray-100 border-2 ${selectedVehicleType === 'motorcycle' ? 'border-orange-500 bg-orange-50/30' : 'border-gray-200'} rounded-2xl p-4 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all group shadow-sm`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <img
                                                    src={settings?.moto_icon_url || "/images/moto_icon_3d.png"}
                                                    className="w-16 h-16 object-contain drop-shadow-lg group-hover:scale-110 transition-transform"
                                                    onError={(e) => (e.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/3233/3233315.png')}
                                                />
                                                {selectedVehicleType === 'motorcycle' && (
                                                    <div className="absolute -top-1 -right-1 bg-orange-500 text-white rounded-full p-0.5 shadow-md">
                                                        <span className="material-icons text-[12px]">check</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-gray-900 font-black text-sm">{settings?.moto_name || 'Mob Moto'}</h3>
                                                    <span className="material-icons text-gray-500 text-[10px]">person</span>
                                                    <span className="text-gray-600 text-xs font-bold">1</span>
                                                </div>
                                                <p className="text-gray-600 text-[10px] uppercase font-black tracking-tighter">{settings?.moto_description || 'Rapidez e agilidade'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {(() => {
                                                const basePrice = estimates ? estimates.motorcycle : (settings?.moto_base_price || 0);
                                                let finalPrice = basePrice;
                                                const hasDiscount = selectedCoupon && (selectedCoupon.vehicle_type === 'all' || selectedCoupon.vehicle_type === 'motorcycle');

                                                if (hasDiscount) {
                                                    const disc = selectedCoupon.discount_value;
                                                    finalPrice = Math.max(0, basePrice - disc);
                                                }

                                                return (
                                                    <>
                                                        {hasDiscount && (
                                                            <p className="text-gray-400 line-through text-[10px] font-bold">R$ {basePrice.toFixed(2)}</p>
                                                        )}
                                                        <p className="text-orange-600 font-black text-lg">R$ {finalPrice.toFixed(2)}</p>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>



                                    {/* Payment Method Selector */}
                                    <button
                                        onClick={() => {
                                            // Toggle payment selector
                                            const methods: Array<'cash' | 'pix' | 'card' | 'coins'> = ['cash', 'pix', 'card', 'coins'];
                                            const currentIndex = methods.indexOf(paymentMethod);
                                            const nextIndex = (currentIndex + 1) % methods.length;
                                            setPaymentMethod(methods[nextIndex]);
                                        }}
                                        className="flex items-center gap-3 py-2 px-1 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer active:scale-[0.98]"
                                    >
                                        <div className={`w-6 h-6 rounded flex items-center justify-center ${paymentMethod === 'cash' ? 'bg-green-100' :
                                            paymentMethod === 'pix' ? 'bg-teal-100' :
                                                paymentMethod === 'card' ? 'bg-blue-100' :
                                                    'bg-brand-100'
                                            }`}>
                                            <span className={`material-icons text-xs ${paymentMethod === 'cash' ? 'text-green-600' :
                                                paymentMethod === 'pix' ? 'text-teal-600' :
                                                    paymentMethod === 'card' ? 'text-blue-600' :
                                                        'text-brand-700'
                                                }`}>
                                                {paymentMethod === 'cash' ? 'attach_money' :
                                                    paymentMethod === 'pix' ? 'pix' :
                                                        paymentMethod === 'card' ? 'credit_card' :
                                                            'stars'}
                                            </span>
                                        </div>
                                        <div className="flex-1 text-left">
                                            <p className="text-gray-900 font-bold text-xs">
                                                {paymentMethod === 'cash' ? 'Dinheiro' :
                                                    paymentMethod === 'pix' ? 'PIX' :
                                                        paymentMethod === 'card' ? 'Cartão' :
                                                            'Moedas do App'}
                                            </p>
                                            <p className="text-gray-600 text-[10px]">
                                                {paymentMethod === 'coins'
                                                    ? `Saldo: ${currentUser.wallet_coins || 0} moedas • Toque para trocar`
                                                    : 'Forma de pagamento • Toque para trocar'}
                                            </p>
                                        </div>
                                        <span className="material-icons text-gray-400 text-sm">sync</span>
                                    </button>

                                    {/* Main Action Button - BIGGER with more padding */}
                                    <button
                                        onClick={() => handleRequestRide(selectedVehicleType)}
                                        className={`w-full ${selectedVehicleType === 'car' ? 'bg-accent-500 hover:bg-accent-600 text-accent-ink' : 'bg-orange-500 hover:bg-orange-600 text-white'} py-5 rounded-2xl font-black text-base shadow-xl active:scale-[0.98] transition-all mb-24`}
                                    >
                                        {serviceMode === 'delivery'
                                            ? `Pedir Entrega de ${selectedVehicleType === 'car' ? (settings?.car_name || 'CARRO') : (settings?.moto_name || 'MOTO')}`
                                            : `Confirmar ${selectedVehicleType === 'car' ? (settings?.car_name || 'CARRO') : (settings?.moto_name || 'MOTO')}`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ---------------------------------------------------------------------------------- */}
            {/* OTHER TABS: DRIVERS, REWARDS, WALLET (Same as before) */}
            <div className="flex-1 relative h-full flex flex-col pointer-events-none">
                {/* Only render these if activeTab is NOT home, to allow overlaying ViewStates on Home tab */}
                <div className="pointer-events-auto h-full flex flex-col">
                    {/* activeTab === 'drivers' && (
                        <div className="p-6 space-y-8 animate-fade-in overflow-y-auto h-full pb-24 bg-[#111b21]">
                            <div className="flex items-center gap-4 mb-4">
                                <button onClick={() => setActiveTab('home')} className="material-icons text-white">arrow_back</button>
                                <div>
                                    <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-1">Motoristas</h2>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Disponíveis agora</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {drivers.length === 0 ? (
                                    <div className="text-center py-20 bg-[#1c272d]/40 rounded-[40px] border border-white/5 border-dashed">
                                        <span className="material-icons text-6xl text-gray-700 mb-4">no_accounts</span>
                                        <p className="font-bold text-gray-500 uppercase text-xs tracking-widest">Nenhum motorista online</p>
                                    </div>
                                ) : (
                                    drivers.map(driver => (
                                        <div key={driver.id} onClick={() => onStartChat(driver)} className="bg-[#1c272d] border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:bg-white/5">
                                            <div className="flex items-center gap-4">
                                                <img src={driver.avatar_url || "/logo.png"} className="w-12 h-12 rounded-full object-cover" />
                                                <div>
                                                    <h4 className="text-white font-bold">{driver.username}</h4>
                                                    <p className="text-gray-500 text-xs">{driver.vehicle_model} • {driver.vehicle_plate}</p>
                                                </div>
                                            </div>
                                            <button className="w-10 h-10 rounded-full bg-whatsapp-green text-white flex items-center justify-center shadow-lg"><span className="material-icons">chat</span></button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) */}

                    {/* Profile View */}
                    {activeTab === 'profile' && (
                        <div className="h-full flex flex-col bg-white pb-safe-area">
                            {/* Header */}
                            <div className="p-4 flex items-center gap-4 bg-white border-b border-gray-200">
                                <button onClick={() => setActiveTab('home')} className="material-icons text-gray-900">arrow_back</button>
                                <h2 className="text-xl font-black text-gray-900 uppercase flex-1">Meu Perfil</h2>
                                <button
                                    onClick={handleSaveClientProfile}
                                    className="bg-accent-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase active:scale-95 transition-all"
                                >
                                    Salvar
                                </button>
                            </div>

                            {/* Profile Content */}
                            <div className="flex-1 overflow-y-auto p-4">
                                {/* Profile Picture */}
                                <div className="flex flex-col items-center mb-6">
                                    <div className="relative">
                                        <img
                                            src={currentUser.avatar_url || "/logo.png"}
                                            className="w-24 h-24 rounded-full border-4 border-accent-500 object-cover shadow-lg"
                                            alt="Foto de perfil"
                                        />
                                        <button
                                            onClick={async () => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.accept = 'image/*';
                                                input.onchange = async (e: any) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        try {
                                                            // Use the storage service instead of base64
                                                            const fileName = `avatars/${currentUser.id}_${Date.now()}.jpg`;
                                                            const { data: uploadData, error: uploadError } = await supabase.storage
                                                                .from('chat-media')
                                                                .upload(fileName, file, { upsert: true });

                                                            if (uploadError) throw uploadError;

                                                            const { data: { publicUrl } } = supabase.storage
                                                                .from('chat-media')
                                                                .getPublicUrl(fileName);

                                                            const success = await updateUserProfile(currentUser.id, { avatar_url: publicUrl });
                                                            if (!success) throw new Error("Erro ao salvar URL no banco");

                                                            notify('Foto atualizada com sucesso!');
                                                            if (onUpdateUser) {
                                                                onUpdateUser({ ...currentUser, avatar_url: publicUrl });
                                                            }
                                                        } catch (err: any) {
                                                            console.error("Avatar error:", err);
                                                            notify('Erro ao atualizar foto: ' + (err.message || 'Desconhecido'));
                                                        }
                                                    }
                                                };
                                                input.click();
                                            }}
                                            className="absolute bottom-0 right-0 w-8 h-8 bg-accent-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-accent-700 active:scale-95 transition-all"
                                        >
                                            <span className="material-icons text-sm">edit</span>
                                        </button>
                                    </div>
                                    <p className="mt-3 text-gray-900 font-bold text-lg">{currentUser.username}</p>
                                    <p className="text-gray-500 text-sm flex items-center gap-1">
                                        <span className="material-icons text-xs text-brand-600">star</span> 5.0
                                    </p>
                                </div>

                                {/* Profile Form */}
                                <div className="space-y-4">
                                    <h3 className="text-gray-700 font-bold text-sm uppercase mb-3">Informações Pessoais</h3>

                                    {/* Nome e Sobrenome */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Nome</label>
                                            <input
                                                type="text"
                                                defaultValue={currentUser.username?.split(' ')[0] || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                                placeholder="Seu nome"
                                                id="firstName"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Sobrenome</label>
                                            <input
                                                type="text"
                                                defaultValue={currentUser.username?.split(' ').slice(1).join(' ') || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                                placeholder="Sobrenome"
                                                id="lastName"
                                            />
                                        </div>
                                    </div>

                                    {/* WhatsApp */}
                                    <div>
                                        <label className="text-gray-600 text-xs font-bold">WhatsApp</label>
                                        <input
                                            type="tel"
                                            defaultValue={currentUser.whatsapp || currentUser.phone || ''}
                                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                            placeholder="(00) 00000-0000"
                                            id="whatsapp"
                                        />
                                    </div>

                                    {/* CPF */}
                                    <div>
                                        <label className="text-gray-600 text-xs font-bold">CPF</label>
                                        <input
                                            type="text"
                                            defaultValue={(currentUser as any).cpf || ''}
                                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                            placeholder="000.000.000-00"
                                            id="cpf"
                                            maxLength={14}
                                        />
                                    </div>

                                    <h3 className="text-gray-700 font-bold text-sm uppercase mb-3 mt-6">Dados para Prêmios</h3>

                                    {/* PIX */}
                                    <div>
                                        <label className="text-gray-600 text-xs font-bold">Chave PIX</label>
                                        <input
                                            type="text"
                                            defaultValue={currentUser.pix_key || ''}
                                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                            placeholder="CPF, e-mail, telefone ou chave aleatória"
                                            id="pixKey"
                                        />
                                        <p className="text-gray-500 text-xs mt-1">Para receber prêmios em dinheiro</p>
                                    </div>

                                    <h3 className="text-gray-700 font-bold text-sm uppercase mb-3 mt-6">Endereço</h3>

                                    {/* Endereço */}
                                    <div>
                                        <label className="text-gray-600 text-xs font-bold">Rua</label>
                                        <input
                                            type="text"
                                            defaultValue={(currentUser as any).address_street || ''}
                                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                            placeholder="Nome da rua"
                                            id="addressStreet"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Número</label>
                                            <input
                                                type="text"
                                                defaultValue={(currentUser as any).address_number || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                                placeholder="Nº"
                                                id="addressNumber"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Bairro</label>
                                            <input
                                                type="text"
                                                defaultValue={(currentUser as any).address_neighborhood || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                                placeholder="Bairro"
                                                id="addressNeighborhood"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">Cidade</label>
                                            <input
                                                type="text"
                                                defaultValue={(currentUser as any).address_city || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                                placeholder="Cidade"
                                                id="addressCity"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-gray-600 text-xs font-bold">CEP</label>
                                            <input
                                                type="text"
                                                defaultValue={(currentUser as any).address_zip || ''}
                                                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 text-sm focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none"
                                                placeholder="00000-000"
                                                id="addressZip"
                                                maxLength={9}
                                            />
                                        </div>
                                    </div>
                                    <div className="pb-24"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'rewards' && (
                        /* Rewards View */
                        <div className="h-full flex flex-col bg-[#111b21] pb-safe-area">
                            <div className="p-4 flex items-center gap-4">
                                <button onClick={() => setActiveTab('home')} className="material-icons text-white">arrow_back</button>
                                <h2 className="text-xl font-black text-white uppercase">Prêmios & Cupons</h2>
                            </div>
                            <RewardsHub currentUser={currentUser} onClose={() => setActiveTab('home')} onUpdateUser={() => { }} />
                        </div>
                    )}

                    {activeTab === 'wallet' && (
                        /* Wallet View */
                        <div className="p-6 space-y-8 animate-fade-in overflow-y-auto h-full pb-24 bg-[#111b21]">
                            <div className="flex items-center gap-4 mb-4">
                                <button onClick={() => setActiveTab('home')} className="material-icons text-white">arrow_back</button>
                                <h2 className="text-2xl font-black text-white uppercase">Minha Carteira</h2>
                            </div>

                            <div className="bg-gradient-to-br from-[#00a884] to-[#017561] rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
                                <div className="relative z-10 text-center">
                                    <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-2">Saldo Disponível</p>
                                    <h3 className="chegoja-pay-balance text-4xl font-black text-white">
                                        R$ {((currentUser.financial_balance || 0) + ((currentUser.wallet_coins || 0) * (settings?.coin_value_brl || 0))).toFixed(2)}
                                    </h3>
                                    <div className="mt-6 flex flex-col gap-4 items-center">
                                        <div className="bg-black/20 px-4 py-2 rounded-full"><span className="text-white font-bold">{currentUser.wallet_coins || 0} Moedas</span></div>
                                        <button
                                            onClick={onOpenWallet}
                                            className="bg-white text-[#00a884] px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-2"
                                        >
                                            <span className="material-icons text-sm">pix</span>
                                            Sacar via PIX
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <button onClick={onOpenWallet} className="w-full bg-[#1c272d] p-4 rounded-xl text-white font-bold flex items-center justify-between border border-white/5">
                                <span>Ver Extrato Completo</span>
                                <span className="material-icons">chevron_right</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Navigation - Estilo 99 (pílula flutuante: Corrida | Entrega | Pay) */}
            {viewState === 'home' && !activeRide && (activeTab === 'home' || activeTab === 'delivery' || activeTab === 'pay') && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[45] pb-safe-area">
                    <div className="chegoja-bottom-nav bg-white rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.2)] px-4 py-2 flex items-center gap-2">
                        {([
                            { tab: 'home', icon: 'directions_car', label: 'Corrida' },
                            { tab: 'delivery', icon: 'inventory_2', label: 'Entrega' },
                            { tab: 'pay', icon: 'attach_money', label: 'Pay' },
                        ] as const).map(({ tab, icon, label }) => {
                            const isActive = activeTab === tab;
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className="flex flex-col items-center justify-center transition-all active:scale-90 px-3"
                                >
                                    <div className={`flex items-center justify-center rounded-full transition-all ${isActive ? 'bg-brand-400 w-14 h-14 -my-4 shadow-lg' : 'w-10 h-8'}`}>
                                        <span className={`material-icons ${isActive ? 'text-gray-900 text-2xl' : 'text-gray-700 text-xl'}`}>{icon}</span>
                                    </div>
                                    {!isActive && <span className="text-gray-600 text-[11px] font-bold mt-0.5">{label}</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Ride Status Overlay */}
            {activeRide && (
                <div className="absolute inset-0 z-[200]">
                    <RideStatusOverlay
                        ride={activeRide}
                        onCancel={handleCancelRide}
                        onChat={() => {
                            if (activeRide.driver) onStartChat(activeRide.driver);
                        }}
                        settings={settings}
                        currentUser={currentUser}
                    />
                </div>
            )}
        </div>
    );
};
