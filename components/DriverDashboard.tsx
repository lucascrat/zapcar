
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, AppSettings, DriverStatus, Message } from '../types';
import { fetchAppSettings, updateDriverStatus, fetchAdminContact, fetchMessages, subscribeToMessages, markMessagesAsRead, fetchOnlineDrivers, uploadFile, updateUserProfile } from '../services/supabaseClient';
import { acceptRideSequential, rejectRideSequential } from '../services/sequentialNotifications';
import { AdMobService } from '../services/adMobService';
import { AppMap } from './AppMap';
import { ChatWindow } from './ChatWindow';
import { DriverHistory } from './DriverHistory';
import { DriverRewardsScreen } from './DriverRewardsScreen';
import { soundService } from '../services/soundService';

interface DriverDashboardProps {
    currentUser: UserProfile;
    onOpenProfile: (tab?: 'profile' | 'pix' | 'withdraw') => void;
    onOpenPlans: () => void;
    onOpenBingo: () => void;
    onOpenCalculator: () => void;
    onLogout: () => void;
    onUpdateUser: (user: UserProfile) => void;
}

export const DriverDashboard: React.FC<DriverDashboardProps> = ({
    currentUser,
    onOpenProfile,
    onOpenPlans,
    onOpenBingo,
    onOpenCalculator,
    onLogout,
    onUpdateUser
}) => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [showMenu, setShowMenu] = useState(false);
    const [showChat, setShowChat] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showRewards, setShowRewards] = useState(false);
    const [chatContact, setChatContact] = useState<UserProfile | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const showChatRef = useRef(false);
    useEffect(() => { showChatRef.current = showChat; }, [showChat]);

    // Bloqueio por falta de foto de perfil: perfil sem foto não pode usar o app.
    const [uploadingRequiredPhoto, setUploadingRequiredPhoto] = useState(false);
    const requiredPhotoInputRef = useRef<HTMLInputElement>(null);
    const missingProfilePhoto = !currentUser.avatar_url || currentUser.avatar_url.includes('ui-avatars.com');

    // Aviso de PIX não cadastrado (não bloqueia o app, só lembra 1x por sessão)
    const [showPixReminder, setShowPixReminder] = useState(false);
    useEffect(() => {
        if (!currentUser.pix_key && !missingProfilePhoto) {
            setShowPixReminder(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRequiredPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingRequiredPhoto(true);
        try {
            const url = await uploadFile(file, 'images');
            if (!url) {
                alert('Erro ao enviar a foto. Tente novamente.');
                return;
            }
            const success = await updateUserProfile(currentUser.id, { avatar_url: url });
            if (success) {
                onUpdateUser({ ...currentUser, avatar_url: url });
            } else {
                alert('Erro ao salvar a foto. Tente novamente.');
            }
        } catch (err) {
            console.error('[RequiredPhoto] Erro:', err);
            alert('Erro ao enviar a foto. Tente novamente.');
        } finally {
            setUploadingRequiredPhoto(false);
        }
    };

    // Taximeter States
    const [taximeterActive, setTaximeterActive] = useState(false);
    const [taximeterRunning, setTaximeterRunning] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [distance, setDistance] = useState(0);
    const [fare, setFare] = useState(0);
    const [lastPos, setLastPos] = useState<{ lat: number, lng: number } | null>(null);

    // GPS
    const [driverLocation, setDriverLocation] = useState<{ lat: number, lng: number } | null>(() =>
        currentUser.lat && currentUser.lng ? { lat: currentUser.lat, lng: currentUser.lng } : null
    );
    const [onlineDrivers, setOnlineDrivers] = useState<UserProfile[]>([]);

    const watchIdRef = useRef<number | null>(null);
    const timerRef = useRef<any>(null);
    const gpsRef = useRef<number | null>(null);

    // Day earnings (mock - would come from backend in production)
    const [dayEarnings, setDayEarnings] = useState(currentUser.financial_balance || 0);

    useEffect(() => {
        fetchAppSettings().then(setSettings);
        let unsubChat: (() => void) | undefined;
        loadAdminContact().then(cleanup => { unsubChat = cleanup; });
        startGpsWatcher();
        fetchOnlineDrivers().then(drivers => {
            setOnlineDrivers(drivers.filter(d => d.id !== currentUser.id));
        });

        return () => {
            if (gpsRef.current) navigator.geolocation.clearWatch(gpsRef.current);
            unsubChat?.();
        };
    }, []);

    // Abre o chat de suporte ao tocar na notificação push de nova mensagem
    // (disparado pelo pushService quando o usuário toca a notificação do sistema).
    useEffect(() => {
        const handleOpenChat = () => {
            setShowChat(true);
            setShowMenu(false);
            if (chatContact) markMessagesAsRead(currentUser.id, chatContact.id);
            setUnreadChatCount(0);
        };
        window.addEventListener('openChat', handleOpenChat);
        return () => window.removeEventListener('openChat', handleOpenChat);
    }, [chatContact, currentUser.id]);

    const [gpsError, setGpsError] = useState<string | null>(null);

    const startGpsWatcher = () => {
        if ('geolocation' in navigator) {
            gpsRef.current = navigator.geolocation.watchPosition(
                (pos) => {
                    setDriverLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    if (gpsError) setGpsError(null); // Limpar erro quando GPS funcionar
                },
                (err) => {
                    console.warn('[GPS] Erro:', err.code, err.message);
                    const errorMessages: Record<number, string> = {
                        1: 'Permissão de localização negada. Ative o GPS nas configurações.',
                        2: 'GPS indisponível. Verifique se o GPS está ativado.',
                        3: 'Tempo esgotado ao obter localização. Tente em área aberta.'
                    };
                    setGpsError(errorMessages[err.code] || 'Erro desconhecido no GPS.');
                    if (window.Android?.showToast) {
                        window.Android.showToast(errorMessages[err.code] || 'Erro no GPS');
                    }
                },
                { enableHighAccuracy: true, maximumAge: 5000 }
            );
        } else {
            setGpsError('Seu navegador não suporta geolocalização.');
        }
    };

    const loadAdminContact = async () => {
        const admin = await fetchAdminContact();
        if (admin) {
            setChatContact(admin);
            const msgs = await fetchMessages(currentUser.id, admin.id);
            setMessages(msgs);
            setUnreadChatCount(msgs.filter(m => m.receiver_id === currentUser.id && !m.is_read).length);

            // Notificação em tempo real: se o admin responder com o chat fechado,
            // o motorista precisa saber sem precisar abrir o menu pra checar.
            const sub = subscribeToMessages(currentUser.id, (newMsg) => {
                if (newMsg.sender_id !== admin.id && newMsg.receiver_id !== admin.id) return;

                setMessages(prev => {
                    if (prev.some(m => m.id === newMsg.id)) return prev;
                    return [...prev, newMsg];
                });

                const isReply = newMsg.receiver_id === currentUser.id;
                if (isReply) {
                    if (showChatRef.current) {
                        markMessagesAsRead(currentUser.id, admin.id);
                    } else {
                        setUnreadChatCount(prev => prev + 1);
                        soundService.playMessageAlert();
                    }
                }
            });

            return () => sub.unsubscribe();
        }
    };

    // Timer for Taximeter
    useEffect(() => {
        if (taximeterRunning) {
            timerRef.current = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [taximeterRunning]);

    // GPS for Taximeter distance
    useEffect(() => {
        if (taximeterRunning && 'geolocation' in navigator) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude, speed } = position.coords;
                    if (lastPos) {
                        const dist = calculateDistance(lastPos.lat, lastPos.lng, latitude, longitude);
                        if ((speed && speed > 1) || dist > 0.010) {
                            setDistance(prev => prev + dist);
                        }
                    }
                    setLastPos({ lat: latitude, lng: longitude });
                },
                (err) => console.warn("GPS Error", err),
                { enableHighAccuracy: true, maximumAge: 0 }
            );
        } else {
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
            setLastPos(null);
        }
        return () => {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, [taximeterRunning, lastPos]);

    // AdMob Banner Handling
    useEffect(() => {
        if (!taximeterActive) {
            AdMobService.showBanner();
        } else {
            AdMobService.hideBanner();
        }

        return () => {
            AdMobService.hideBanner();
        };
    }, [taximeterActive]);

    // Fare Calculation
    useEffect(() => {
        if (!settings) return;

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

        let base = settings.car_base_price;
        let perKm = settings.car_price_km;
        let perMin = settings.car_price_min;
        let startDistLimit = settings.car_start_distance_limit || 0;

        if (currentUser.vehicle_type === 'motorcycle') {
            base = settings.moto_base_price;
            perKm = settings.moto_price_km;
            perMin = settings.moto_price_min;
            startDistLimit = settings.moto_start_distance_limit || 0;
        }

        const isNight = (nightStart < nightEnd)
            ? (currentTime >= nightStart && currentTime <= nightEnd)
            : (currentTime >= nightStart || currentTime <= nightEnd);

        const isDawn = (dawnStart < dawnEnd)
            ? (currentTime >= dawnStart && currentTime <= dawnEnd)
            : (currentTime >= dawnStart || currentTime <= dawnEnd);

        if (isDawn) {
            if (currentUser.vehicle_type !== 'motorcycle') {
                base = settings.dawn_car_base_price ?? base;
                perKm = settings.dawn_car_price_km ?? perKm;
                perMin = settings.dawn_car_price_min ?? perMin;
            } else {
                base = settings.dawn_moto_base_price ?? base;
                perKm = settings.dawn_moto_price_km ?? perKm;
                perMin = settings.dawn_moto_price_min ?? perMin;
            }
        } else if (isNight) {
            if (currentUser.vehicle_type !== 'motorcycle') {
                base = settings.night_car_base_price ?? base;
                perKm = settings.night_car_price_km ?? perKm;
                perMin = settings.night_car_price_min ?? perMin;
            } else {
                base = settings.night_moto_base_price ?? base;
                perKm = settings.night_moto_price_km ?? perKm;
                perMin = settings.night_moto_price_min ?? perMin;
            }
        }

        const timeInMin = elapsedTime / 60;
        const chargeableDistance = Math.max(0, distance - startDistLimit);
        const total = base + (chargeableDistance * perKm) + (timeInMin * perMin);

        setFare(Math.max(base, total));
    }, [elapsedTime, distance, settings, currentUser.vehicle_type]);

    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const formatTime = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleStatusToggle = async () => {
        if (!currentUser.is_approved) return;
        const newStatus = currentUser.status === DriverStatus.AVAILABLE
            ? DriverStatus.BUSY
            : DriverStatus.AVAILABLE;

        const success = await updateDriverStatus(currentUser.id, newStatus);
        if (success) {
            const updated = { ...currentUser, status: newStatus };
            onUpdateUser(updated);

            // Banner visibility based on status
            if (newStatus === DriverStatus.AVAILABLE) {
                // When available/online, we might want to hide it to favor the map
                // but usually banners are kept unless in ride.
                // Keeping original logic that user had (hide when online, show when offline)
                AdMobService.hideBanner();
            } else {
                AdMobService.showBanner();
            }
        }
    };

    const handlePanicButton = async () => {
        // Tocar som de alerta
        soundService.playReceived();

        // Enviar alerta para a central via banco de dados
        try {
            const { supabase } = await import('../services/supabaseClient');
            await supabase.from('broadcasts').insert({
                title: 'ALERTA DE PÂNICO',
                message: `Motorista ${currentUser.username} acionou botão de pânico! Localização: ${driverLocation?.lat?.toFixed(6)}, ${driverLocation?.lng?.toFixed(6)}`,
                target_role: 'admin'
            });

            if (window.Android?.showToast) {
                window.Android.showToast('Alerta de pânico enviado para a central!');
            }
        } catch (err) {
            console.error('[Panic] Erro ao enviar alerta:', err);
            if (window.Android?.showToast) {
                window.Android.showToast('Erro ao enviar alerta. Ligue 190.');
            }
        }

        console.log('[PANIC] Botão de pânico acionado', {
            driver: currentUser.id,
            location: driverLocation,
            timestamp: new Date().toISOString()
        });
    };

    const handleStartTaximeter = () => {
        setTaximeterActive(true);
        setTaximeterRunning(true);
        setElapsedTime(0);
        setDistance(0);
        if (settings) {
            setFare(currentUser.vehicle_type === 'motorcycle' ? settings.moto_base_price : settings.car_base_price);
        }
    };

    const handleStopTaximeter = () => {
        setTaximeterRunning(false);
    };

    const handleFinishRide = () => {
        setTaximeterActive(false);
        setTaximeterRunning(false);
        // Add to day earnings
        setDayEarnings(prev => prev + fare);
        setElapsedTime(0);
        setDistance(0);
        setFare(0);
    };

    const isOnline = currentUser.status === DriverStatus.AVAILABLE;

    return (
        <div className="h-[100dvh] w-full flex flex-col bg-[#0a0f14] relative overflow-hidden">
            {/* BLOQUEIO: perfil sem foto de rosto não pode usar o app */}
            {missingProfilePhoto && (
                <div className="fixed inset-0 z-[500] bg-[#0a0f14] flex flex-col items-center justify-center px-6 text-center">
                    <input
                        type="file"
                        ref={requiredPhotoInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleRequiredPhotoChange}
                    />
                    <div className="w-24 h-24 rounded-full bg-red-500/10 border-2 border-red-500/40 flex items-center justify-center mb-6">
                        <span className="material-icons text-red-400 text-5xl">no_accounts</span>
                    </div>
                    <h2 className="text-white text-xl font-black mb-2">Foto de perfil obrigatória</h2>
                    <p className="text-gray-400 text-sm max-w-xs mb-1">
                        Por favor, coloque sua foto do rosto. Perfis sem foto ficam bloqueados e não podem ficar online nem receber corridas.
                    </p>
                    <p className="text-gray-500 text-xs max-w-xs mb-8">
                        Escolha uma foto sua recente, com o rosto bem visível.
                    </p>
                    <button
                        onClick={() => requiredPhotoInputRef.current?.click()}
                        disabled={uploadingRequiredPhoto}
                        className="w-full max-w-xs h-14 bg-whatsapp-green text-black font-black uppercase tracking-wide rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-60"
                    >
                        {uploadingRequiredPhoto ? (
                            <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        ) : (
                            <>
                                <span className="material-icons">add_a_photo</span>
                                Enviar minha foto
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* AVISO: PIX não cadastrado (não bloqueia, só lembra) */}
            {!missingProfilePhoto && showPixReminder && (
                <div className="fixed inset-0 z-[490] bg-black/80 flex items-center justify-center px-6">
                    <div className="w-full max-w-xs bg-[#152232] border border-white/10 rounded-2xl p-6 text-center shadow-2xl">
                        <div className="w-16 h-16 rounded-full bg-teal-500/10 border-2 border-teal-500/40 flex items-center justify-center mx-auto mb-4">
                            <span className="material-icons text-teal-400 text-3xl">pix</span>
                        </div>
                        <h3 className="text-white font-black text-lg mb-2">Cadastre sua chave PIX</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            Você ainda não tem uma chave PIX cadastrada. Cadastre agora para poder receber seus pagamentos e saques.
                        </p>
                        <button
                            onClick={() => { setShowPixReminder(false); onOpenProfile('pix'); }}
                            className="w-full h-12 bg-teal-500 text-white font-black uppercase tracking-wide rounded-xl active:scale-95 transition mb-2"
                        >
                            Cadastrar PIX
                        </button>
                        <button
                            onClick={() => setShowPixReminder(false)}
                            className="w-full h-10 text-gray-400 text-sm font-semibold"
                        >
                            Depois
                        </button>
                    </div>
                </div>
            )}

            {/* History Overlay */}
            {showHistory && (
                <DriverHistory
                    currentUser={currentUser}
                    onClose={() => setShowHistory(false)}
                />
            )}

            {/* Chat Overlay */}
            {showChat && chatContact && (
                <div className="absolute inset-0 z-[100] bg-whatsapp-dark">
                    <div className="h-full flex flex-col">
                        <div className="h-14 px-4 flex items-center gap-3 bg-whatsapp-panel border-b border-white/10 shrink-0">
                            <button onClick={() => setShowChat(false)} className="text-gray-400 hover:text-white">
                                <span className="material-icons">arrow_back</span>
                            </button>
                            <img src={chatContact.avatar_url || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full" />
                            <div>
                                <p className="text-white font-bold">{chatContact.username}</p>
                                <p className="text-xs text-gray-400">Suporte</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <ChatWindow
                                currentUser={currentUser}
                                chatPartner={chatContact}
                                messages={messages}
                                onSendMessage={(msg) => setMessages(p => [...p, msg])}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Header - Earnings Display */}
            <div className="shrink-0 bg-gradient-to-r from-[#1a2530] to-[#0f1a24] px-3 md:px-4 py-2 md:py-3 flex items-center justify-between border-b border-white/5 z-20">
                <div className="flex items-center gap-3">
                    <div className="relative" onClick={() => onOpenProfile()}>
                        <img
                            src={currentUser.avatar_url || 'https://via.placeholder.com/40'}
                            className="w-11 h-11 rounded-full border-2 border-green-500/50 object-cover cursor-pointer"
                        />
                        <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#1a2530] ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                    </div>
                    <div>
                        <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Ganhos do Dia</p>
                        <p className="text-xl md:text-2xl font-black text-green-500">R$ {dayEarnings.toFixed(2)}</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="relative w-9 h-9 md:w-10 md:h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition"
                >
                    <span className="material-icons">menu</span>
                    {unreadChatCount > 0 && (
                        <span className="absolute top-0 right-0 w-3 h-3 rounded-full bg-red-500 border-2 border-[#0f1a24] animate-pulse"></span>
                    )}
                </button>
            </div>

            {/* Menu Dropdown */}
            {showMenu && (
                <>
                    {/* Backdrop com blur — z-[60] garante que fica acima do FAB (z-40) */}
                    <div
                        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm animate-fade-in"
                        onClick={() => setShowMenu(false)}
                    ></div>

                    {/* Menu Container Premium — z-[70] acima do backdrop */}
                    <div className="absolute top-16 right-3 left-3 md:left-auto md:right-4 md:w-72 z-[70] animate-slide-down">
                        {/* Header do Menu com Avatar */}
                        <div className="bg-gradient-to-br from-[#1a2a38] via-[#152232] to-[#0d1a28] rounded-t-3xl p-4 border border-white/10 border-b-0">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <img
                                        src={currentUser.avatar_url || 'https://via.placeholder.com/56'}
                                        className="w-14 h-14 rounded-2xl border-2 border-green-500/40 object-cover shadow-lg"
                                    />
                                    <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#1a2a38] ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-bold text-lg truncate">{currentUser.username || 'Motorista'}</p>
                                    <p className="text-gray-400 text-xs flex items-center gap-1">
                                        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                        {isOnline ? 'Disponível' : 'Offline'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowMenu(false)}
                                    className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition"
                                >
                                    <span className="material-icons text-lg">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Menu Items Container — max-h + overflow-y para "Sair" aparecer */}
                        <div className="bg-gradient-to-b from-[#152232] to-[#0f1a28] rounded-b-3xl border border-white/10 border-t-0 overflow-y-auto shadow-2xl" style={{ maxHeight: 'calc(100dvh - 120px)' }}>
                            {/* Seção Principal */}
                            <div className="p-2">
                                <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold">Ações Rápidas</p>

                                <button
                                    onClick={() => {
                                        setShowChat(true);
                                        setShowMenu(false);
                                        if (chatContact) markMessagesAsRead(currentUser.id, chatContact.id);
                                        setUnreadChatCount(0);
                                    }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gradient-to-r hover:from-green-500/10 hover:to-transparent rounded-2xl transition-all group"
                                >
                                    <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-green-400">chat</span>
                                        {unreadChatCount > 0 && (
                                            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#152232]">
                                                {unreadChatCount > 9 ? '9+' : unreadChatCount}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-white font-semibold text-sm">Chat / Suporte</p>
                                        <p className="text-gray-500 text-[10px]">
                                            {unreadChatCount > 0 ? `${unreadChatCount} mensagem(ns) nova(s)` : 'Fale com a central'}
                                        </p>
                                    </div>
                                    <span className="material-icons text-gray-600 text-sm">chevron_right</span>
                                </button>

                                <button
                                    onClick={() => { setShowHistory(true); setShowMenu(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gradient-to-r hover:from-orange-500/10 hover:to-transparent rounded-2xl transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-orange-400">history</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-white font-semibold text-sm">Histórico</p>
                                        <p className="text-gray-500 text-[10px]">Suas corridas anteriores</p>
                                    </div>
                                    <span className="material-icons text-gray-600 text-sm">chevron_right</span>
                                </button>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mx-4"></div>

                            {/* Seção de Conta */}
                            <div className="p-2">
                                <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold">Minha Conta</p>

                                <button
                                    onClick={() => { onOpenProfile(); setShowMenu(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gradient-to-r hover:from-teal-500/10 hover:to-transparent rounded-2xl transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-teal-400">account_balance_wallet</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-white font-semibold text-sm">Meus Dados / PIX</p>
                                        <p className="text-gray-500 text-[10px]">Perfil e pagamentos</p>
                                    </div>
                                    <span className="material-icons text-gray-600 text-sm">chevron_right</span>
                                </button>

                                <button
                                    onClick={() => { onOpenPlans(); setShowMenu(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gradient-to-r hover:from-yellow-500/10 hover:to-transparent rounded-2xl transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-yellow-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-yellow-400">workspace_premium</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-white font-semibold text-sm">Meus Planos</p>
                                        <p className="text-gray-500 text-[10px]">Assinaturas e benefícios</p>
                                    </div>
                                    <span className="material-icons text-gray-600 text-sm">chevron_right</span>
                                </button>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mx-4"></div>

                            {/* Seção de Ferramentas */}
                            <div className="p-2">
                                <p className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-widest font-bold">Ferramentas</p>

                                <button
                                    onClick={() => { onOpenCalculator(); setShowMenu(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gradient-to-r hover:from-accent-500/10 hover:to-transparent rounded-2xl transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-500/20 to-accent-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-accent-400">calculate</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-white font-semibold text-sm">Simular Corrida</p>
                                        <p className="text-gray-500 text-[10px]">Calcule o valor</p>
                                    </div>
                                    <span className="material-icons text-gray-600 text-sm">chevron_right</span>
                                </button>

                                <button
                                    onClick={() => { onOpenBingo(); setShowMenu(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gradient-to-r hover:from-pink-500/10 hover:to-transparent rounded-2xl transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-pink-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-pink-400">casino</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-white font-semibold text-sm">Bingo</p>
                                        <p className="text-gray-500 text-[10px]">Jogue e ganhe prêmios</p>
                                    </div>
                                    <span className="material-icons text-gray-600 text-sm">chevron_right</span>
                                </button>

                                <button
                                    onClick={() => { setShowRewards(true); setShowMenu(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gradient-to-r hover:from-yellow-500/10 hover:to-transparent rounded-2xl transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-yellow-400">emoji_events</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-white font-semibold text-sm flex items-center gap-2">
                                            Premiações &amp; Ranking
                                            <span className="text-[8px] bg-yellow-500 text-black font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide">Novo</span>
                                        </p>
                                        <p className="text-gray-500 text-[10px]">Top 10 motoristas da semana</p>
                                    </div>
                                    <span className="material-icons text-gray-600 text-sm">chevron_right</span>
                                </button>

                                <button
                                    onClick={() => { soundService.requestPermission(); setShowMenu(false); }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-gradient-to-r hover:from-cyan-500/10 hover:to-transparent rounded-2xl transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-cyan-400">notifications_active</span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-white font-semibold text-sm">Ativar Sons</p>
                                        <p className="text-gray-500 text-[10px]">Notificações sonoras</p>
                                    </div>
                                    <span className="material-icons text-gray-600 text-sm">chevron_right</span>
                                </button>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mx-4"></div>

                            {/* Logout */}
                            <div className="p-3">
                                <button
                                    onClick={onLogout}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 rounded-2xl transition-all text-red-400 font-semibold text-sm"
                                >
                                    <span className="material-icons text-lg">logout</span>
                                    Sair da Conta
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Map */}
            <div className="flex-1 relative">
                <AppMap
                    drivers={onlineDrivers}
                    userLocation={driverLocation || undefined}
                    followCamera={true}
                    settings={settings}
                    userVehicleType={currentUser.vehicle_type}
                />

                {/* Floating Status Toggle */}
                <div className="absolute top-3 md:top-4 left-1/2 -translate-x-1/2 z-10">
                    <button
                        onClick={handleStatusToggle}
                        disabled={!currentUser.is_approved}
                        className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full text-sm font-bold shadow-xl transition-all flex items-center gap-2 ${!currentUser.is_approved
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : isOnline
                                ? 'bg-green-500 text-white hover:bg-green-400'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                    >
                        <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-white animate-pulse' : 'bg-gray-500'}`}></span>
                        {isOnline ? 'Você está Online' : 'Você está Offline'}
                    </button>
                </div>

                {/* Panic Button - Always visible, but quiet until pressed */}
                <button
                    onClick={handlePanicButton}
                    className="absolute top-3 md:top-4 right-3 md:right-4 z-10 w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-red-600 text-white/80 hover:text-white backdrop-blur-sm border border-white/10 shadow-lg flex items-center justify-center active:scale-95 transition-colors"
                    title="Botão do Pânico"
                >
                    <span className="material-icons text-lg md:text-xl">warning</span>
                </button>

                {/* Taximeter FAB - Start Ride */}
                {!taximeterActive && (
                    <div className="absolute bottom-32 right-4 z-[40] flex flex-col items-center gap-2">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${isOnline ? 'bg-accent-500 text-accent-ink' : 'bg-gray-800 text-gray-500'}`}>
                            Taxímetro
                        </span>
                        <button
                            onClick={handleStartTaximeter}
                            disabled={!isOnline}
                            className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all active:scale-90 ${isOnline
                                ? 'bg-gradient-to-br from-accent-600 to-accent-500 text-white border border-white/20'
                                : 'bg-gray-800 text-gray-600 cursor-not-allowed border border-white/5 opacity-50'
                                }`}
                        >
                            <span className="material-icons text-3xl">local_taxi</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Taximeter Section - Aggressively tightened for small screens */}
            {taximeterActive ? (
                <div className="shrink-0 bg-[#0b141a] border-t border-white/10 p-2 pb-safe z-[50] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
                    <div className="bg-[#121b24] rounded-xl border border-white/10 overflow-hidden mb-2">
                        <div className="bg-accent-500/10 py-1 flex justify-center border-b border-white/5">
                            <span className="text-[9px] text-accent-400 uppercase tracking-widest font-black flex items-center gap-1">
                                <span className="material-icons text-[10px] text-yellow-500 animate-pulse">local_taxi</span>
                                Taxímetro Ativo
                            </span>
                        </div>

                        <div className="p-3 text-center">
                            <p className="text-gray-500 text-[8px] uppercase tracking-widest font-bold mb-0.5">Valor da Corrida</p>
                            <div className="flex items-center justify-center gap-1.5">
                                <span className="text-green-500 text-xl font-black">R$</span>
                                <span className="text-4xl font-black text-white tracking-tighter">
                                    {fare.toFixed(2)}
                                </span>
                            </div>

                            <div className="flex justify-center gap-6 mt-2 pt-2 border-t border-white/5">
                                <div className="flex flex-col items-center">
                                    <p className="text-gray-500 text-[8px] uppercase font-black tracking-widest">KM</p>
                                    <p className="text-lg text-teal-400 font-black">{distance.toFixed(2)}</p>
                                </div>
                                <div className="bg-white/5 h-8 w-[1px]"></div>
                                <div className="flex flex-col items-center">
                                    <p className="text-gray-500 text-[8px] uppercase font-black tracking-widest">Tempo</p>
                                    <p className="text-lg text-yellow-400 font-black">{formatTime(elapsedTime)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Taximeter Controls - Smaller Buttons */}
                    <div className="flex gap-2">
                        {taximeterRunning ? (
                            <button
                                onClick={handleStopTaximeter}
                                className="flex-1 bg-yellow-500 text-black font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-xl active:scale-95 transition text-xs uppercase tracking-widest"
                            >
                                <span className="material-icons text-lg">pause</span>
                                Pausar
                            </button>
                        ) : (
                            <button
                                onClick={() => setTaximeterRunning(true)}
                                className="flex-1 bg-green-500 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-xl active:scale-95 transition text-xs uppercase tracking-widest"
                            >
                                <span className="material-icons text-lg">play_arrow</span>
                                Iniciar
                            </button>
                        )}
                        <button
                            onClick={handleFinishRide}
                            className="flex-1 bg-accent-500 text-accent-ink font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-xl active:scale-95 transition text-xs uppercase tracking-widest"
                        >
                            <span className="material-icons text-lg">check_circle</span>
                            Finalizar
                        </button>
                    </div>
                </div>
            ) : (
                /* Empty space for AdMob Banner at the bottom */
                <div className="shrink-0 pb-safe z-10 h-[50px]">
                    {/* The banner will be positioned here by AdMobService.showBanner */}
                </div>
            )}

            {/* ── Tela de Premiações ────────────────────────── */}
            {showRewards && (
                <DriverRewardsScreen
                    currentUser={currentUser}
                    onClose={() => setShowRewards(false)}
                />
            )}
        </div>
    );
};

// ========================================
// 🆕 FUNÇÕES AUXILIARES PARA SISTEMA SEQUENCIAL
// ========================================

/**
 * Aceitar corrida usando sistema sequencial
 * Use esta função quando o motorista aceitar uma corrida
 */
export const handleAcceptRideSequential = async (
    rideId: string,
    driverId: string,
    onSuccess?: () => void,
    onError?: (error: string) => void
): Promise<boolean> => {
    try {
        console.log(`[DriverDashboard] Motorista ${driverId} aceitando corrida ${rideId}`);

        const success = await acceptRideSequential(rideId, driverId);

        if (success) {
            console.log('[DriverDashboard] ✅ Corrida aceita com sucesso!');
            soundService.playSent(); // Som de sucesso
            onSuccess?.();
            return true;
        } else {
            console.error('[DriverDashboard] ❌ Falha ao aceitar corrida');
            onError?.('Não foi possível aceitar a corrida. Outro motorista pode tê-la aceitado.');
            return false;
        }
    } catch (error: any) {
        console.error('[DriverDashboard] Exception ao aceitar:', error);
        onError?.(error.message || 'Erro desconhecido');
        return false;
    }
};

/**
 * Rejeitar corrida usando sistema sequencial
 * Próximo motorista será notificado automaticamente
 */
export const handleRejectRideSequential = async (
    rideId: string,
    driverId: string,
    onSuccess?: () => void,
    onError?: (error: string) => void
): Promise<boolean> => {
    try {
        console.log(`[DriverDashboard] Motorista ${driverId} rejeitando corrida ${rideId}`);

        const success = await rejectRideSequential(rideId, driverId);

        if (success) {
            console.log('[DriverDashboard] ✅ Corrida rejeitada. Próximo motorista será notificado.');
            soundService.stopRingtone(); // Som de recusa (para toque)
            onSuccess?.();
            return true;
        } else {
            console.error('[DriverDashboard] ❌ Falha ao rejeitar corrida');
            onError?.('Não foi possível rejeitar a corrida.');
            return false;
        }
    } catch (error: any) {
        console.error('[DriverDashboard] Exception ao rejeitar:', error);
        onError?.(error.message || 'Erro desconhecido');
        return false;
    }
};
