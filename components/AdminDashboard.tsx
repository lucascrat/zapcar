
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase, PROFILE_SAFE_COLUMNS, fetchAllDriversForAdmin, fetchAllDriversWithStats, deleteDriver, updateDriverStatus, updateDriverVehicle, updateDriverPassword, fetchAppSettings, updateAppSettings, approveDriver, fetchMessages, subscribeToMessages, subscribeToProfiles, fetchBingoSettings, updateBingoSettings, drawBingoNumber, drawSpecificBingoNumber, resetBingo, fetchBingoRanking, subscribeToBingo, sendBroadcast, addSubscriptionDays, fetchBanners, addBanner, deleteBanner, updateBannerOrder, uploadBannerImage, fetchAllCoupons, createCoupon, deleteCoupon, createDispatchRide, cleanupDuplicateUsers, fetchDuplicateUsers, fetchStoreProducts, createStoreProduct, updateStoreProduct, deleteStoreProduct, uploadStoreProductImage, updateUserProfile, fetchAllRides } from '../services/supabaseClient';
import { UserProfile, DriverStatus, CallRecord, AppSettings, Message, BingoSettings, BingoRankingUser, AdminTab, Banner, Coupon, StoreProduct, Ride } from '../types';
import { AdminWalletManager } from './AdminWalletManager';
import { soundService } from '../services/soundService';
import { checkSubscriptionStatus } from '../services/paymentService';
import { ChatWindow } from './ChatWindow'; // Importar ChatWindow
import { PlansManager } from './PlansManager'; // Importar PlansManager
import { RideCalculator } from './RideCalculator'; // Importar RideCalculator
import { sendNotification } from '../services/notificationSender'; // FCM Push Notifications

import { WhatsappBot } from '../services/whatsappBot'; // Importar Bot WhatsApp
import { WahaService } from '../services/wahaService'; // Importar WahaService
import { getDirections } from '../services/mapboxService';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import mapboxgl from 'mapbox-gl';

interface AdminDashboardProps {
    currentUser: UserProfile;
    onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser, onLogout }) => {
    const [drivers, setDrivers] = useState<(UserProfile & { monthly_rides?: number })[]>([]);
    const [selectedDriver, setSelectedDriver] = useState<(UserProfile & { monthly_rides?: number }) | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<DriverStatus | 'all' | 'pending'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<AdminTab>('details');
    const [showCalculator, setShowCalculator] = useState(false);

    // Mobile Responsive State
    const [showDetailMobile, setShowDetailMobile] = useState(false);

    const loadCoupons = async () => {
        setIsCouponsLoading(true);
        const data = await fetchAllCoupons();
        setCoupons(data);
        setIsCouponsLoading(false);
    };

    const handleCreateCoupon = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!couponForm.discount_value || !couponForm.total_quantity) return;

        setIsCreatingCoupon(true);
        const success = await createCoupon(couponForm, couponFile || undefined);
        if (success) {
            alert("Cupom criado com sucesso!");
            setCouponForm({ discount_value: 0, vehicle_type: 'all', total_quantity: 0 });
            setCouponFile(null);
            loadCoupons();
        } else {
            alert("Erro ao criar cupom.");
        }
        setIsCreatingCoupon(false);
    };

    const handleDeleteCoupon = async (id: string) => {
        if (!window.confirm("Deseja excluir este cupom?")) return;
        const result = await deleteCoupon(id);
        if (result.ok) {
            loadCoupons();
        } else {
            alert('Erro ao excluir cupom: ' + (result.errorMsg || 'Verifique o console (F12).'));
        }
    };

    // Store Functions
    const loadProducts = async () => {
        setIsStoreLoading(true);
        const data = await fetchStoreProducts();
        setProducts(data);
        setIsStoreLoading(false);
    };

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProduct?.name || !editingProduct?.price_coins) return;

        setIsSavingProduct(true);
        try {
            let imageUrl = editingProduct.image_url;

            if (productFile) {
                const uploadedUrl = await uploadStoreProductImage(productFile);
                if (uploadedUrl) imageUrl = uploadedUrl;
            }

            const productData = {
                ...editingProduct,
                image_url: imageUrl,
                active: editingProduct.active ?? true,
                stock: editingProduct.stock ?? 999
            };

            let error = null;
            if (editingProduct.id) {
                error = await updateStoreProduct(editingProduct.id, productData);
            } else {
                error = await createStoreProduct(productData);
            }

            if (!error) {
                alert("Produto salvo com sucesso!");
                setEditingProduct(null);
                setProductFile(null);
                loadProducts();
            } else {
                alert("Erro ao salvar produto: " + error);
            }
        } catch (err) {
            console.error(err);
            alert("Erro inesperado ao salvar produto.");
        } finally {
            setIsSavingProduct(false);
        }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!window.confirm("Deseja excluir este produto?")) return;
        const error = await deleteStoreProduct(id);
        if (!error) {
            loadProducts();
        } else {
            alert("Erro ao excluir: " + error);
        }
    };

    // Chat State inside Admin
    const [driverMessages, setDriverMessages] = useState<Message[]>([]);

    // Vehicle Form State
    const [vehicleForm, setVehicleForm] = useState({
        model: '',
        plate: '',
        color: '',
        type: 'car' as 'car' | 'motorcycle',
        phone: '',
        pix_key: '',
        cpf: '',
        email: '',
        address_street: '',
        address_number: '',
        address_neighborhood: '',
        address_city: '',
        address_zip: '',
        whatsapp: ''
    });
    const [isSavingVehicle, setIsSavingVehicle] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [driverName, setDriverName] = useState('');

    // Settings State
    const [appSettings, setAppSettings] = useState<AppSettings>({
        car_base_price: 0, car_price_km: 0, car_price_min: 0, car_start_distance_limit: 0,
        moto_base_price: 0, moto_price_km: 0, moto_price_min: 0, moto_start_distance_limit: 0,
        night_car_base_price: 0, night_car_price_km: 0, night_car_price_min: 0,
        night_moto_base_price: 0, night_moto_price_km: 0, night_moto_price_min: 0,
        dawn_car_base_price: 0, dawn_car_price_km: 0, dawn_car_price_min: 0,
        dawn_moto_base_price: 0, dawn_moto_price_km: 0, dawn_moto_price_min: 0,
        night_start_time: '19:00', night_end_time: '23:59',
        dawn_start_time: '00:00', dawn_end_time: '05:00',
        marquee_text: '',
        car_name: 'Mob Comum',
        car_description: 'Viagem econômica',
        car_icon_url: '',
        moto_name: 'Mob Moto',
        moto_description: 'Rapidez e agilidade',
        moto_icon_url: ''
    });
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // Broadcast State
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [broadcastTarget, setBroadcastTarget] = useState<'driver' | 'client' | 'all'>('all');
    const [broadcastImageUrl, setBroadcastImageUrl] = useState('');
    const [broadcastSound, setBroadcastSound] = useState('default');
    const [sendPush, setSendPush] = useState(true);
    const [sendInApp, setSendInApp] = useState(true);
    const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

    // Duplicates Cleaning State
    const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
    const [duplicateCount, setDuplicateCount] = useState(0);

    const checkDuplicates = async () => {
        const dups = await fetchDuplicateUsers();
        const total = dups.reduce((acc, curr) => acc + (curr.count - 1), 0);
        setDuplicateCount(total);
    };

    const handleCleanupDuplicates = async () => {
        if (!confirm(`Existem aproximadamente ${duplicateCount} registros duplicados. Deseja removê-los e manter apenas os mais antigos?`)) return;

        setIsCleaningDuplicates(true);
        const result = await cleanupDuplicateUsers();
        if (result.success) {
            alert(`Limpeza concluída! ${result.removedCount} registros duplicados foram removidos.`);
            checkDuplicates();
            loadDrivers();
        } else {
            alert("Erro ao realizar a limpeza.");
        }
        setIsCleaningDuplicates(false);
    };

    // BINGO STATE
    const [bingoSettings, setBingoSettings] = useState<BingoSettings | null>(null);
    const [bingoRanking, setBingoRanking] = useState<BingoRankingUser[]>([]);
    const [bingoLoading, setBingoLoading] = useState(false);

    // Banner State
    const [banners, setBanners] = useState<Banner[]>([]);
    const [isBannersLoading, setIsBannersLoading] = useState(false);
    const [newBannerUrl, setNewBannerUrl] = useState('');
    const [newBannerLink, setNewBannerLink] = useState('');
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [isUploadingBanner, setIsUploadingBanner] = useState(false);

    // Coupons State
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [isCouponsLoading, setIsCouponsLoading] = useState(false);
    const [couponForm, setCouponForm] = useState<Partial<Coupon>>({
        discount_value: 0,
        vehicle_type: 'all',
        total_quantity: 0
    });
    const [couponFile, setCouponFile] = useState<File | null>(null);
    const [isCreatingCoupon, setIsCreatingCoupon] = useState(false);

    // Central de Despacho State
    const [dispatchClientName, setDispatchClientName] = useState('');
    const [dispatchClientPhone, setDispatchClientPhone] = useState('');
    const [dispatchOriginAddress, setDispatchOriginAddress] = useState('');
    const [dispatchOriginCoords, setDispatchOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [dispatchDestAddress, setDispatchDestAddress] = useState('');
    const [dispatchDestCoords, setDispatchDestCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [dispatchVehicleType, setDispatchVehicleType] = useState<'car' | 'motorcycle'>('car');
    const [isDispatchLoading, setIsDispatchLoading] = useState(false);
    const [dispatchResult, setDispatchResult] = useState<{ success: boolean; message: string } | null>(null);
    const [dispatchPrice, setDispatchPrice] = useState<{ price: number; distanceKm: number; durationMin: number } | null>(null);
    const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);
    const [availableDrivers, setAvailableDrivers] = useState<UserProfile[]>([]);
    const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
    const [dispatchHistory, setDispatchHistory] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);

    // Refs for dispatch autocomplete


    // Bot State
    const [botRunning, setBotRunning] = useState(WhatsappBot.isRunning());
    const [wahaApiKey, setWahaApiKey] = useState(WahaService.getApiKey());
    const [geminiApiKey, setGeminiApiKey] = useState(localStorage.getItem('GEMINI_API_KEY') || '');
    const [wahaSession, setWahaSession] = useState('default');
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [newSessionName, setNewSessionName] = useState('');
    const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
    const [isCreatingSession, setIsCreatingSession] = useState(false);

    // Audio Simulation State
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);

    // Call Simulation States
    const [isCalling, setIsCalling] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

    // Google Map Refs
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null); // Google Map Instance
    const markerRef = useRef<any>(null); // Google Marker Instance
    const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

    // Store State
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [isStoreLoading, setIsStoreLoading] = useState(false);
    const [isSavingProduct, setIsSavingProduct] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Partial<StoreProduct> | null>(null);
    const [productFile, setProductFile] = useState<File | null>(null);

    // Rides State
    const [allRides, setAllRides] = useState<Ride[]>([]);
    const [isRidesLoading, setIsRidesLoading] = useState(false);
    const [rideFilter, setRideFilter] = useState<'all' | 'completed' | 'cancelled' | 'pending'>('all');

    useEffect(() => {
        loadDrivers();
        loadSettings();
        loadBingoData();
        loadBanners();
        loadCoupons();
        checkDuplicates();
        loadProducts();
        loadAllRides();

        // Subscription Realtime para Settings
        const settingsSub = supabase
            .channel('admin_settings_sync')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'app_settings' }, (payload) => {
                console.log('[Admin Realtime] Settings atualizado:', payload.new);
                setAppSettings(payload.new as AppSettings);
            })
            .subscribe();

        // Subscription Realtime para status dos motoristas (online/em corrida/ocupado/offline)
        // Atualiza a lista em tempo real sem precisar recarregar a página nem
        // refazer a query de estatísticas (monthly_rides) inteira a cada evento -
        // só corrige o campo que mudou no motorista já carregado.
        const driversStatusSub = supabase
            .channel('admin_drivers_status')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'profiles', filter: 'role=eq.driver' }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const removedId = (payload.old as any)?.id;
                    if (removedId) setDrivers(prev => prev.filter(d => d.id !== removedId));
                    return;
                }
                const updated = payload.new as UserProfile;
                if (!updated?.id) return;
                setDrivers(prev => {
                    const idx = prev.findIndex(d => d.id === updated.id);
                    if (idx === -1) {
                        // Motorista novo (acabou de se cadastrar) - entra na lista já,
                        // monthly_rides real chega no próximo loadDrivers()
                        return [{ ...updated, monthly_rides: 0 }, ...prev];
                    }
                    const next = [...prev];
                    next[idx] = { ...next[idx], ...updated };
                    return next;
                });
                // Mantém o painel de detalhe (à direita) em sincronia também,
                // se o motorista atualizado for o que está aberto no momento.
                setSelectedDriver(prev => (prev && prev.id === updated.id) ? { ...prev, ...updated } : prev);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(settingsSub);
            supabase.removeChannel(driversStatusSub);
            soundService.stopAdminCallSound();
        };
    }, []);

    const loadDrivers = async () => {
        const data = await fetchAllDriversWithStats();
        setDrivers(data);
        setIsLoading(false);
    };

    const loadAllRides = async () => {
        setIsRidesLoading(true);
        const data = await fetchAllRides();
        setAllRides(data);
        setIsRidesLoading(false);
    };

    // Sync vehicle form when selected driver changes & Generate Mock History & Load Messages
    useEffect(() => {
        if (selectedDriver) {
            setVehicleForm({
                model: selectedDriver.vehicle_model || '',
                plate: selectedDriver.vehicle_plate || '',
                color: selectedDriver.vehicle_color || '',
                type: selectedDriver.vehicle_type || 'car',
                phone: selectedDriver.phone || '',
                pix_key: selectedDriver.pix_key || '',
                cpf: selectedDriver.cpf || '',
                email: selectedDriver.email || '',
                address_street: selectedDriver.address_street || '',
                address_number: selectedDriver.address_number || '',
                address_neighborhood: selectedDriver.address_neighborhood || '',
                address_city: selectedDriver.address_city || '',
                address_zip: selectedDriver.address_zip || '',
                whatsapp: selectedDriver.whatsapp || ''
            });
            setDriverName(selectedDriver.username || '');
            setNewPassword(''); // Reset password field
            setIsPlayingAudio(false);

            // If we clicked on a driver, assume we want to see details first, unless we specifically went to chat from a notification (logic to be added later)
            // For now, if driver changes, default to details
            if (activeTab === 'chat') {
                loadDriverMessages(selectedDriver.id);
            } else {
                setActiveTab('details');
            }

            // Reset call state on driver switch
            setIsCalling(false);
            setCallDuration(0);
            soundService.stopAdminCallSound();

            // Initialize mock location if none exists
            if (selectedDriver.lat && selectedDriver.lng) {
                setDriverLocation({ lat: selectedDriver.lat, lng: selectedDriver.lng });
            } else {
                // Default to São Paulo center with slight random offset
                setDriverLocation({
                    lat: -23.5505 + (Math.random() * 0.01 - 0.005),
                    lng: -46.6333 + (Math.random() * 0.01 - 0.005)
                });
            }

            // Generate Mock Call History
            const mockHistory: CallRecord[] = Array.from({ length: 8 }).map((_, i) => {
                const isMissed = Math.random() > 0.8;
                return {
                    id: `call-${i}-${Date.now()}`,
                    direction: (Math.random() > 0.5 ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
                    status: (isMissed ? 'missed' : 'completed') as 'completed' | 'missed' | 'rejected',
                    timestamp: new Date(Date.now() - Math.floor(Math.random() * 10 * 24 * 60 * 60 * 1000)).toISOString(),
                    duration: isMissed ? 0 : Math.floor(Math.random() * 600) + 20,
                    clientName: `Cliente ${Math.floor(Math.random() * 1000)}`
                };
            }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            setCallHistory(mockHistory);
        }
    }, [selectedDriver?.id]);

    // Load Messages when entering Chat Tab
    useEffect(() => {
        if (activeTab === 'chat' && selectedDriver) {
            loadDriverMessages(selectedDriver.id);

            // Subscribe to new messages
            // DEDUPLICATED LISTENER: Check ID before adding
            const sub = subscribeToMessages(currentUser.id, (newMsg) => {
                if (selectedDriver && (newMsg.sender_id === selectedDriver.id || newMsg.receiver_id === selectedDriver.id)) {
                    setDriverMessages(prev => {
                        if (prev.some(m => m.id === newMsg.id)) return prev;
                        return [...prev, newMsg];
                    });
                    if (newMsg.sender_id === selectedDriver.id) {
                        soundService.playReceived();
                    }
                }
            });

            return () => {
                sub.unsubscribe();
            }
        }
    }, [activeTab, selectedDriver, currentUser.id]);

    // Bingo Sub
    useEffect(() => {
        if (activeTab === 'bingo') {
            loadBingoData();
            const sub = subscribeToBingo(() => {
                loadBingoData();
            });
            return () => { sub.unsubscribe(); }
        }
    }, [activeTab]);

    // Load drivers and history when central tab is active
    useEffect(() => {
        if (activeTab === 'central') {
            loadAvailableDrivers(dispatchVehicleType);
            loadDispatchHistory();

            // Subscribe to realtime updates for dispatch rides
            const centralClientId = '11111111-1111-1111-1111-111111111111';
            const dispatchSub = supabase
                .channel('dispatch-rides')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'chegoja',
                    table: 'rides',
                    filter: `client_id=eq.${centralClientId}`
                }, (payload) => {
                    console.log('[Central] Atualização de corrida:', payload);
                    loadDispatchHistory();
                    loadAvailableDrivers(dispatchVehicleType);
                })
                .subscribe();

            return () => {
                dispatchSub.unsubscribe();
            };
        }
    }, [activeTab, dispatchVehicleType, drivers]);

    // Calculate dispatch price when both addresses have coords
    const calculateDispatchPrice = async () => {
        if (!dispatchOriginCoords || !dispatchDestCoords || !appSettings) return;

        setIsCalculatingPrice(true);
        setDispatchPrice(null);

        try {
            const route = await getDirections(
                [dispatchOriginCoords.lng, dispatchOriginCoords.lat],
                [dispatchDestCoords.lng, dispatchDestCoords.lat]
            );

            if (route) {
                        const distanceMeters = route.distanceMeters;
                        const durationSeconds = route.durationSeconds;

                        const distanceKm = distanceMeters / 1000;
                        const durationMin = durationSeconds / 60;

                        // Calculate Price based on vehicle type and time
                        const now = new Date();
                        const currentTime = now.getHours() * 60 + now.getMinutes();

                        const parseTime = (timeStr?: string) => {
                            if (!timeStr) return 0;
                            const [h, m] = timeStr.split(':').map(Number);
                            return h * 60 + m;
                        };

                        const nightStart = parseTime(appSettings.night_start_time || '19:00');
                        const nightEnd = parseTime(appSettings.night_end_time || '23:59');
                        const dawnStart = parseTime(appSettings.dawn_start_time || '00:00');
                        const dawnEnd = parseTime(appSettings.dawn_end_time || '05:00');

                        let base = appSettings.car_base_price;
                        let perKm = appSettings.car_price_km;
                        let perMin = appSettings.car_price_per_minute || 0;
                        let minFare = appSettings.car_price_min || 0;
                        let startDistLimit = appSettings.car_start_distance_limit || 0;

                        if (dispatchVehicleType === 'motorcycle') {
                            base = appSettings.moto_base_price;
                            perKm = appSettings.moto_price_km;
                            perMin = appSettings.moto_price_per_minute || 0;
                            minFare = appSettings.moto_price_min || 0;
                            startDistLimit = appSettings.moto_start_distance_limit || 0;
                        }

                        // Apply Dynamic Pricing
                        const isNight = (nightStart < nightEnd)
                            ? (currentTime >= nightStart && currentTime <= nightEnd)
                            : (currentTime >= nightStart || currentTime <= nightEnd);

                        const isDawn = (dawnStart < dawnEnd)
                            ? (currentTime >= dawnStart && currentTime <= dawnEnd)
                            : (currentTime >= dawnStart || currentTime <= dawnEnd);

                        if (isDawn) {
                            if (dispatchVehicleType === 'car') {
                                base = appSettings.dawn_car_base_price ?? base;
                                perKm = appSettings.dawn_car_price_km ?? perKm;
                                minFare = appSettings.dawn_car_price_min ?? minFare;
                                // Note: Dynamic pricing for 'per minute' is not yet supported in DB schema, using standard rate.
                            } else {
                                base = appSettings.dawn_moto_base_price ?? base;
                                perKm = appSettings.dawn_moto_price_km ?? perKm;
                                minFare = appSettings.dawn_moto_price_min ?? minFare;
                            }
                        } else if (isNight) {
                            if (dispatchVehicleType === 'car') {
                                base = appSettings.night_car_base_price ?? base;
                                perKm = appSettings.night_car_price_km ?? perKm;
                                minFare = appSettings.night_car_price_min ?? minFare;
                            } else {
                                base = appSettings.night_moto_base_price ?? base;
                                perKm = appSettings.night_moto_price_km ?? perKm;
                                minFare = appSettings.night_moto_price_min ?? minFare;
                            }
                        }

                        const chargeableDistance = Math.max(0, distanceKm - startDistLimit);
                        const total = base + (chargeableDistance * perKm) + (durationMin * perMin);
                        const finalPrice = Math.max(minFare, total);

                        setDispatchPrice({
                            price: finalPrice,
                            distanceKm,
                            durationMin
                        });
            } else {
                console.error("Directions request failed: rota não encontrada");
                alert("Não foi possível calcular a rota. Verifique os endereços.");
            }
            setIsCalculatingPrice(false);
        } catch (error) {
            console.error("Erro ao calcular preço:", error);
            setIsCalculatingPrice(false);
        }
    };

    // Load available drivers by vehicle type - fetch from database for real-time data
    const loadAvailableDrivers = async (vehicleType: 'car' | 'motorcycle') => {
        setIsLoadingDrivers(true);
        try {
            // Fetch directly from database for accurate real-time status
            const { data, error } = await supabase
                .from('profiles')
                .select(PROFILE_SAFE_COLUMNS)
                .eq('role', 'driver')
                .eq('status', 'available')
                .eq('is_approved', true)
                .eq('vehicle_type', vehicleType);

            if (error) {
                console.error("Erro ao buscar motoristas:", error);
                setAvailableDrivers([]);
            } else {
                setAvailableDrivers(data as UserProfile[]);
            }
            setSelectedDriverId(null); // Reset selection when changing type
        } catch (error) {
            console.error("Erro ao carregar motoristas:", error);
            setAvailableDrivers([]);
        }
        setIsLoadingDrivers(false);
    };

    // Load dispatch history (rides from central)
    const loadDispatchHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const { data, error } = await supabase
                .from('rides')
                .select('*, driver:driver_id(*)')
                .eq('client_id', '11111111-1111-1111-1111-111111111111')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) {
                console.error("Erro ao carregar histórico:", error);
            } else {
                setDispatchHistory(data || []);
            }
        } catch (error) {
            console.error("Erro ao carregar histórico:", error);
        }
        setIsLoadingHistory(false);
    };

    // Cancel dispatch ride
    const cancelDispatchRide = async (rideId: string, driverId?: string) => {
        if (!window.confirm("Deseja realmente cancelar esta corrida?")) return;

        try {
            // Update ride status to cancelled
            const { error: rideError } = await supabase
                .from('rides')
                .update({ status: 'cancelled' })
                .eq('id', rideId);

            if (rideError) {
                alert("Erro ao cancelar corrida.");
                return;
            }

            // Set driver back to available if provided
            if (driverId) {
                await supabase
                    .from('profiles')
                    .update({ status: 'available' })
                    .eq('id', driverId);
            }

            alert("Corrida cancelada com sucesso!");
            loadDispatchHistory();
            loadAvailableDrivers(dispatchVehicleType);
        } catch (error) {
            console.error("Erro ao cancelar:", error);
            alert("Erro ao cancelar corrida.");
        }
    };

    const loadDriverMessages = async (driverId: string) => {
        const msgs = await fetchMessages(currentUser.id, driverId);
        setDriverMessages(msgs);
    };

    const toggleCall = () => {
        if (isCalling) {
            setIsCalling(false);
            soundService.stopAdminCallSound();
        } else {
            setIsCalling(true);
            // Play loop sound
            soundService.playAdminCallSound();
        }
    };

    // Timer for active call
    useEffect(() => {
        let interval: any;
        if (isCalling) {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        } else {
            setCallDuration(0);
        }
        return () => clearInterval(interval);
    }, [isCalling]);

    // Mapbox Map Initialization & Update logic
    useEffect(() => {
        // Only init if tab is map and we have a container
        if (activeTab === 'map' && mapContainerRef.current && driverLocation) {
            if (!mapInstanceRef.current) {
                const map: mapboxgl.Map = new mapboxgl.Map({
                    container: mapContainerRef.current,
                    style: 'mapbox://styles/mapbox/streets-v12',
                    center: [driverLocation.lng, driverLocation.lat],
                    zoom: 15,
                });
                mapInstanceRef.current = map;

                const carCustom = appSettings?.car_icon_url;
                const motoCustom = appSettings?.moto_icon_url;
                const iconUrl = selectedDriver?.vehicle_type === 'motorcycle'
                    ? (motoCustom || 'https://cdn-icons-png.flaticon.com/512/3097/3097136.png') // Moto
                    : (carCustom || 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png'); // Car

                const el = document.createElement('img');
                el.src = iconUrl;
                el.style.width = '40px';
                el.style.height = '40px';

                const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
                    `<div style="color:black"><b>${selectedDriver?.username}</b><br>Status: ${selectedDriver?.status}</div>`
                );

                const marker = new mapboxgl.Marker({ element: el })
                    .setLngLat([driverLocation.lng, driverLocation.lat])
                    .setPopup(popup)
                    .addTo(map);

                markerRef.current = marker;
                marker.togglePopup();
            }
        }

        return () => {
            // Optional: Clean up listeners if needed
        };
    }, [activeTab, selectedDriver]);

    // Update Marker Icon when Settings Change
    useEffect(() => {
        if (!markerRef.current || !selectedDriver) return;

        const carCustom = appSettings?.car_icon_url;
        const motoCustom = appSettings?.moto_icon_url;
        const iconUrl = selectedDriver.vehicle_type === 'motorcycle'
            ? (motoCustom || 'https://cdn-icons-png.flaticon.com/512/3097/3097136.png')
            : (carCustom || 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png');

        const el = (markerRef.current as mapboxgl.Marker).getElement();
        const img = el.tagName === 'IMG' ? (el as HTMLImageElement) : el.querySelector('img');
        if (img) img.src = iconUrl;
    }, [appSettings, selectedDriver]);

    // Real-time location update (From DB)
    useEffect(() => {
        if (activeTab === 'map' && selectedDriver && drivers.length > 0) {
            const updatedDriver = drivers.find(d => d.id === selectedDriver.id);

            if (updatedDriver && updatedDriver.lat && updatedDriver.lng) {
                const newLat = updatedDriver.lat;
                const newLng = updatedDriver.lng;

                setDriverLocation({ lat: newLat, lng: newLng });

                // Update Mapbox Marker Position
                if (markerRef.current) {
                    (markerRef.current as mapboxgl.Marker).setLngLat([newLng, newLat]);
                    if (mapInstanceRef.current) {
                        (mapInstanceRef.current as mapboxgl.Map).panTo([newLng, newLat]);
                    }
                }
            }
        }
    }, [drivers, activeTab, selectedDriver]);

    // loadDrivers already defined near useEffect

    const loadSettings = async () => {
        const settings = await fetchAppSettings();
        setAppSettings(settings);
    };

    const loadBingoData = async () => {
        setBingoLoading(true);
        const settings = await fetchBingoSettings();
        setBingoSettings(settings);
        const rank = await fetchBingoRanking();
        setBingoRanking(rank);
        setBingoLoading(false);
    };

    const loadBanners = async () => {
        setIsBannersLoading(true);
        console.log('[Admin] Carregando banners...');
        const data = await fetchBanners();
        console.log('[Admin] Banners recebidos:', data);
        setBanners(data);
        setIsBannersLoading(false);
    };

    const handleAddBanner = async () => {
        // Check if we have either a URL or a file
        if (!newBannerUrl.trim() && !bannerFile) {
            alert("Selecione um arquivo ou informe uma URL da imagem.");
            return;
        }

        setIsUploadingBanner(true);
        let imageUrl = newBannerUrl.trim();

        // If file is selected, upload it first
        if (bannerFile) {
            const uploadedUrl = await uploadBannerImage(bannerFile);
            if (!uploadedUrl) {
                alert("Erro ao fazer upload da imagem. Tente novamente.");
                setIsUploadingBanner(false);
                return;
            }
            imageUrl = uploadedUrl;
        }

        const ok = await addBanner(imageUrl, newBannerLink, banners.length);
        if (ok) {
            setNewBannerUrl('');
            setNewBannerLink('');
            setBannerFile(null);
            // Reset file input
            const fileInput = document.getElementById('banner-file-input') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
            loadBanners();
        }
        setIsUploadingBanner(false);
    };

    const handleDeleteBanner = async (id: string) => {
        if (confirm("Deletar este banner?")) {
            const ok = await deleteBanner(id);
            if (ok) loadBanners();
        }
    };

    const handleIconUpload = async (file: File, type: 'car' | 'moto') => {
        setIsSavingSettings(true);
        try {
            // Reusing the upload service which is robust
            const publicUrl = await uploadBannerImage(file);
            if (publicUrl) {
                setAppSettings(prev => ({
                    ...prev,
                    [type === 'car' ? 'car_icon_url' : 'moto_icon_url']: publicUrl
                }));
            } else {
                alert("Erro ao enviar imagem. Verifique o console.");
            }
        } catch (error) {
            console.error('Icon upload error:', error);
            alert("Erro durante o upload.");
        } finally {
            setIsSavingSettings(false);
        }
    };

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        console.log('[Admin] Salvando configurações:', appSettings);

        try {
            const error = await updateAppSettings(appSettings);

            if (error) {
                alert(`Erro ao salvar: ${error}`);
                console.error('[Admin] Erro:', error);
            } else {
                alert("✅ Configurações atualizadas com sucesso!");
                console.log('[Admin] Salvo com sucesso!');
                // Recarrega as configurações para confirmar
                await loadSettings();
            }
        } catch (e) {
            alert(`Erro inesperado: ${e}`);
            console.error('[Admin] Exception:', e);
        }

        setIsSavingSettings(false);
    };

    const handleSendBroadcast = async () => {
        if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
            alert("Por favor, preencha o título e a mensagem.");
            return;
        }

        if (!sendPush && !sendInApp) {
            alert("Selecione pelo menos uma forma de envio (Push ou In-App).");
            return;
        }

        setIsSendingBroadcast(true);

        try {
            let successInApp = true;
            let pushResults: { success: boolean, count: number, error?: string } = { success: true, count: 0 };

            // 1. Send in-app broadcast (Mural)
            if (sendInApp) {
                successInApp = await sendBroadcast(broadcastTitle, broadcastMessage, broadcastTarget);
            }

            // 2. Send FCM push notifications via Edge Function
            if (sendPush) {
                const fcmResult = await sendNotification(
                    broadcastTitle.trim(),
                    broadcastMessage.trim(),
                    broadcastTarget,
                    {
                        imageUrl: broadcastImageUrl.trim() || undefined,
                        sound: broadcastSound.trim() || 'default'
                    }
                );

                pushResults = {
                    success: fcmResult.success,
                    count: fcmResult.sent || 0,
                    error: fcmResult.error || ''
                };
            }

            if (successInApp || pushResults.success) {
                let statusMsg = "Notificação processada!\n";
                if (sendInApp) statusMsg += `\n✓ Mural do App: ${successInApp ? 'Enviado' : 'Erro'}`;
                if (sendPush) {
                    statusMsg += `\n✓ Push (FCM): ${pushResults.success ? (pushResults.count + ' enviados') : 'Erro (' + (pushResults.error || 'Falha na resposta') + ')'}`;
                }

                alert(statusMsg);

                if (successInApp) {
                    setBroadcastTitle('');
                    setBroadcastMessage('');
                    setBroadcastImageUrl('');
                }
            } else {
                alert("Erro ao enviar notificações.");
            }
        } catch (error) {
            console.error('Error in handleSendBroadcast:', error);
            alert("Erro crítico ao processar envio.");
        }

        setIsSendingBroadcast(false);
    };

    const handleSaveBingoSettings = async () => {
        if (!bingoSettings) return;
        await updateBingoSettings(bingoSettings);
        alert("Bingo atualizado!");
    };

    const handleDrawNumber = async () => {
        const num = await drawBingoNumber();
        if (!num) alert("Todos os números já foram sorteados!");
    };

    const handleManualDraw = async (num: number) => {
        if (!bingoSettings) return;
        if (bingoSettings.drawn_numbers.includes(num)) {
            alert(`Número ${num} já foi sorteado!`);
            return;
        }
        if (confirm(`Sortear o número ${num}?`)) {
            await drawSpecificBingoNumber(num);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Tem certeza que deseja remover este motorista permanentemente?")) {
            const success = await deleteDriver(id);
            if (success) {
                setDrivers(prev => prev.filter(d => d.id !== id));
                if (selectedDriver?.id === id) {
                    setSelectedDriver(null);
                    setShowDetailMobile(false);
                }
            } else {
                alert("Erro ao deletar motorista.");
            }
        }
    };

    const handleApprove = async (id: string) => {
        if (confirm("Deseja aprovar este motorista? Ele terá acesso imediato ao aplicativo.")) {
            const success = await approveDriver(id);
            if (success) {
                setDrivers(prev => prev.map(d => d.id === id ? { ...d, is_approved: true } : d));
                if (selectedDriver?.id === id) {
                    setSelectedDriver(prev => prev ? { ...prev, is_approved: true } : null);
                }

                // Enviar notificação push para o motorista aprovado
                sendNotification(
                    "Cadastro Aprovado! ✅",
                    "Seja bem-vindo ao ChegoJá! Você já pode ficar online e receber corridas.",
                    'user',
                    { targetUserId: id, sound: 'default' }
                ).catch(err => console.error("Erro ao notificar aprovação:", err));

                alert("Motorista aprovado com sucesso!");
            } else {
                alert("Erro ao aprovar motorista.");
            }
        }
    };

    const handleStatusChange = async (status: DriverStatus) => {
        if (!selectedDriver) return;

        const success = await updateDriverStatus(selectedDriver.id, status);
        if (success) {
            setDrivers(prev => prev.map(d => d.id === selectedDriver.id ? { ...d, status } : d));
            setSelectedDriver(prev => prev ? { ...prev, status } : null);
        }
    };

    const handleUpdateVehicle = async () => {
        if (!selectedDriver) return;
        setIsSavingVehicle(true);
        try {
            const vehicleSuccess = await updateDriverVehicle(selectedDriver.id, {
                vehicle_model: vehicleForm.model,
                vehicle_plate: vehicleForm.plate,
                vehicle_color: vehicleForm.color,
                vehicle_type: vehicleForm.type,
                phone: vehicleForm.phone,
                pix_key: vehicleForm.pix_key,
                cpf: vehicleForm.cpf,
                email: vehicleForm.email,
                address_street: vehicleForm.address_street,
                address_number: vehicleForm.address_number,
                address_neighborhood: vehicleForm.address_neighborhood,
                address_city: vehicleForm.address_city,
                address_zip: vehicleForm.address_zip,
                whatsapp: vehicleForm.whatsapp
            });
            let passwordSuccess = true;
            if (newPassword.trim()) {
                passwordSuccess = await updateDriverPassword(selectedDriver.id, newPassword);
            }
            let nameSuccess = true;
            if (driverName.trim() && driverName.trim() !== selectedDriver.username) {
                nameSuccess = await updateUserProfile(selectedDriver.id, { username: driverName.trim() });
            }
            if (vehicleSuccess && passwordSuccess && nameSuccess) {
                setDrivers(prev => prev.map(d => d.id === selectedDriver.id ? {
                    ...d,
                    username: driverName.trim() || d.username,
                    vehicle_model: vehicleForm.model,
                    vehicle_plate: vehicleForm.plate,
                    vehicle_color: vehicleForm.color,
                    vehicle_type: vehicleForm.type,
                    phone: vehicleForm.phone,
                    pix_key: vehicleForm.pix_key,
                    cpf: vehicleForm.cpf,
                    email: vehicleForm.email,
                    address_street: vehicleForm.address_street,
                    address_number: vehicleForm.address_number,
                    address_neighborhood: vehicleForm.address_neighborhood,
                    address_city: vehicleForm.address_city,
                    address_zip: vehicleForm.address_zip,
                    whatsapp: vehicleForm.whatsapp
                } : d));
                setSelectedDriver(prev => prev ? {
                    ...prev,
                    username: driverName.trim() || prev.username,
                    vehicle_model: vehicleForm.model,
                    vehicle_plate: vehicleForm.plate,
                    vehicle_color: vehicleForm.color,
                    vehicle_type: vehicleForm.type,
                    phone: vehicleForm.phone,
                    pix_key: vehicleForm.pix_key,
                    cpf: vehicleForm.cpf,
                    email: vehicleForm.email,
                    address_street: vehicleForm.address_street,
                    address_number: vehicleForm.address_number,
                    address_neighborhood: vehicleForm.address_neighborhood,
                    address_city: vehicleForm.address_city,
                    address_zip: vehicleForm.address_zip,
                    whatsapp: vehicleForm.whatsapp
                } : null);
                alert("Dados atualizados com sucesso!");
                setNewPassword('');
            } else {
                alert("Erro ao atualizar alguns dados.");
            }
        } catch (err) {
            console.error(err);
            alert("Erro inesperado ao salvar dados do motorista.");
        } finally {
            setIsSavingVehicle(false);
        }
    };

    // Funcao para adicionar dias de assinatura
    const handleAddDays = async (days: number) => {
        if (!selectedDriver) return;
        if (confirm(`Deseja adicionar ${days} dias de acesso para ${selectedDriver.username}?`)) {
            const success = await addSubscriptionDays(selectedDriver.id, days);
            if (success) {
                alert("Assinatura atualizada com sucesso!");

                // Enviar notificação push para o motorista
                sendNotification(
                    "Assinatura Renovada! 💎",
                    `Seu tempo de acesso foi estendido em ${days} dia(s). Boas corridas!`,
                    'user',
                    { targetUserId: selectedDriver.id, sound: 'default' }
                ).catch(err => console.error("Erro ao notificar assinatura:", err));

                // Reload driver data
                const data = await fetchAllDriversWithStats();
                setDrivers(data);
                const updated = data.find(d => d.id === selectedDriver.id);
                if (updated) setSelectedDriver(updated);
            } else {
                alert("Erro ao atualizar assinatura.");
            }
        }
    }

    const handleRemoveAccess = async () => {
        if (!selectedDriver) return;
        if (confirm(`Bloquear acesso de ${selectedDriver.username}? A assinatura será zerada.`)) {
            // Passando 0 dias para a função que implementa a lógica de "zerar"
            const success = await addSubscriptionDays(selectedDriver.id, 0);
            if (success) {
                alert("Acesso bloqueado com sucesso!");
                const data = await fetchAllDriversWithStats();
                setDrivers(data);
                const updated = data.find(d => d.id === selectedDriver.id);
                if (updated) setSelectedDriver(updated);
            } else {
                alert("Erro ao bloquear acesso.");
            }
        }
    }

    const [page, setPage] = useState(1);
    const pageSize = 20;
    // status='busy' é usado tanto pra "motorista realmente em corrida" quanto pro
    // botão LIVRE/OCUPADO que o próprio motorista aperta pra pausar sem ficar
    // offline (App.tsx handleStatusToggle) - sem essa distinção, motorista que só
    // pausou aparece como "Em Corrida" no painel. Só é "Em Corrida" de verdade se
    // ele tiver uma corrida com status ativo (não finalizada/cancelada) atribuída.
    const ACTIVE_RIDE_STATUSES = new Set(['accepted', 'en_route', 'arrived', 'started', 'waiting_payment']);
    const driversWithActiveRide = useMemo(() => {
        const set = new Set<string>();
        for (const r of allRides) {
            if (r.driver_id && ACTIVE_RIDE_STATUSES.has(r.status)) set.add(r.driver_id);
        }
        return set;
    }, [allRides]);
    const getDriverStatusLabel = (driver: UserProfile): 'Disponível' | 'Em Corrida' | 'Pausado' | 'Offline' => {
        if (driver.status === 'available') return 'Disponível';
        if (driver.status === 'busy') return driversWithActiveRide.has(driver.id) ? 'Em Corrida' : 'Pausado';
        return 'Offline';
    };

    const filteredDrivers = drivers.filter(d => {
        const matchesSearch = d.username.toLowerCase().includes(searchTerm.toLowerCase());
        if (filterStatus === 'pending') {
            return matchesSearch && d.is_approved === false;
        }
        const matchesStatus = filterStatus === 'all' || d.status === filterStatus;
        return matchesSearch && matchesStatus;
    }).sort((a, b) => {
        // Always show unapproved drivers first
        if (a.is_approved === false && b.is_approved !== false) return -1;
        if (a.is_approved !== false && b.is_approved === false) return 1;
        return 0;
    });
    const totalPages = Math.max(1, Math.ceil(filteredDrivers.length / pageSize));
    const paginatedDrivers = filteredDrivers.slice((page - 1) * pageSize, page * pageSize);

    const pendingCount = drivers.filter(d => !d.is_approved).length;

    const formatDuration = (sec: number) => {
        const min = Math.floor(sec / 60);
        const s = sec % 60;
        return `${min}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleDriverClick = (driver: UserProfile) => {
        setSelectedDriver(driver);
        setShowDetailMobile(true);
    };

    const handleBackToList = () => {
        setShowDetailMobile(false);
        setActiveTab(null);
        setSelectedDriver(null);
    };

    // Helper local para preview de vídeo (Sincronizado com BingoUserView)
    const getYoutubeId = (url: string) => {
        if (!url) return null;
        const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|live\/|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regExp);
        return match ? match[1] : null;
    };

    const adminVideoId = getYoutubeId(bingoSettings?.youtube_link || '');

    // Sub status helper
    const getSubStatus = (driver: UserProfile) => {
        if (!driver.is_approved) return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' };
        const status = checkSubscriptionStatus(driver.subscription_expires_at);
        if (status.isValid) {
            return { label: `${status.daysLeft} dias`, color: 'bg-green-100 text-green-800' };
        }
        return { label: 'Vencido', color: 'bg-red-100 text-red-800' };
    };

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden relative flex-col">
            {/* AdMob Banner */}
            {/* AdMob Banner Removed */}
            <div className="flex flex-1 overflow-hidden">
                {/* CALCULATOR OVERLAY */}
                {showCalculator && (
                    <RideCalculator currentUser={currentUser} onClose={() => setShowCalculator(false)} />
                )}

                {/* Sidebar List */}
                <div className={`w-full md:w-80 bg-white border-r border-gray-200 flex flex-col z-10 shadow-lg ${showDetailMobile ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-4 border-b border-gray-100 shrink-0">
                        <div className="flex items-center justify-between mb-4">
                            <h1 className="text-xl font-bold text-gray-800">Admin Painel</h1>
                            <button onClick={onLogout} className="text-gray-400 hover:text-red-500">
                                <span className="material-icons">logout</span>
                            </button>
                        </div>

                        <div className="relative mb-3">
                            <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                            <input
                                type="text"
                                placeholder="Buscar motorista..."
                                className="w-full pl-9 p-2 bg-gray-100 rounded-lg text-sm outline-none focus:ring-2 ring-whatsapp-green/50 text-gray-900"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-1 mb-2">
                            <button
                                onClick={() => setFilterStatus('all')}
                                className={`px-3 py-1.5 text-xs rounded-full capitalize border transition whitespace-nowrap ${filterStatus === 'all' ? 'bg-whatsapp-green text-white border-whatsapp-green shadow-sm' : 'bg-white text-gray-600 border-gray-300'
                                    }`}
                            >
                                Todos
                            </button>
                            <button
                                onClick={() => setFilterStatus('pending')}
                                className={`px-3 py-1.5 text-xs rounded-full capitalize border transition whitespace-nowrap flex items-center gap-1 ${filterStatus === 'pending' ? 'bg-yellow-500 text-white border-yellow-500 shadow-sm' : 'bg-white text-gray-600 border-gray-300'
                                    }`}
                            >
                                Pendentes
                                {pendingCount > 0 && (
                                    <span className="bg-red-500 text-white text-[9px] px-1 rounded-full">{pendingCount}</span>
                                )}
                            </button>
                        </div>

                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {/* MENU DE ABAS DE AÇÃO RÁPIDA */}
                        <div className="grid grid-cols-2 gap-2 p-4 pb-2">
                            {/* BOTÃO MOTORISTAS DEDICADO */}
                            <button
                                onClick={() => { setActiveTab('drivers'); setSelectedDriver(null); setShowDetailMobile(false); }}
                                className="col-span-2 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-2 shadow-sm transition-all"
                            >
                                <span className="material-icons text-sm">group</span> Todos os Motoristas
                            </button>

                            {/* BOTÃO APROVAÇÕES DEDICADO */}
                            <button
                                onClick={() => { setActiveTab('approvals'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-2 py-3 bg-yellow-50 hover:bg-yellow-100 rounded-lg text-xs font-bold text-yellow-700 flex items-center justify-center gap-2 border border-yellow-200 relative"
                            >
                                <span className="material-icons text-sm">how_to_reg</span> Aprovação de Motoristas
                                {pendingCount > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm animate-bounce">
                                        {pendingCount}
                                    </span>
                                )}
                            </button>

                            <button
                                onClick={() => { setActiveTab('settings'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 flex items-center justify-center gap-2"
                            >
                                <span className="material-icons text-sm">settings</span> Ajustes
                            </button>
                            <button
                                onClick={() => { setActiveTab('bingo'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="py-2 bg-purple-100 hover:bg-purple-200 rounded-lg text-xs font-medium text-purple-700 flex items-center justify-center gap-2"
                            >
                                <span className="material-icons text-sm">casino</span> Bingo
                            </button>
                            <button
                                onClick={() => { setActiveTab('plans'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="py-2 bg-green-100 hover:bg-green-200 rounded-lg text-xs font-medium text-green-700 flex items-center justify-center gap-2"
                            >
                                <span className="material-icons text-sm">monetization_on</span> Planos
                            </button>
                            <button
                                onClick={() => setShowCalculator(true)}
                                className="py-2 bg-blue-100 hover:bg-blue-200 rounded-lg text-xs font-medium text-blue-700 flex items-center justify-center gap-2"
                            >
                                <span className="material-icons text-sm">calculate</span> Simular
                            </button>
                            <button
                                onClick={() => { setActiveTab('notifications'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-2 py-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-bold text-blue-700 flex items-center justify-center gap-2 border border-blue-200"
                            >
                                <span className="material-icons text-sm">campaign</span> Enviar Notificações
                            </button>
                            <button
                                onClick={() => { setActiveTab('bot'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-2 py-3 bg-teal-50 hover:bg-teal-100 rounded-lg text-xs font-bold text-teal-700 flex items-center justify-center gap-2 border border-teal-200"
                            >
                                <span className="material-icons text-sm">smart_toy</span> Bot WhatsApp
                            </button>
                            <button
                                onClick={() => { setActiveTab('banners'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-1 py-3 bg-orange-50 hover:bg-orange-100 rounded-lg text-xs font-bold text-orange-700 flex items-center justify-center gap-2 border border-orange-200"
                            >
                                <span className="material-icons text-sm">image</span> Banners
                            </button>
                            <button
                                onClick={() => { setActiveTab('coupons'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-1 py-3 bg-pink-50 hover:bg-pink-100 rounded-lg text-xs font-bold text-pink-700 flex items-center justify-center gap-2 border border-pink-200"
                            >
                                <span className="material-icons text-sm">confirmation_number</span> Cupons
                            </button>
                            <button
                                onClick={() => { setActiveTab('central'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-2 py-3 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-bold text-red-700 flex items-center justify-center gap-2 border border-red-200"
                            >
                                <span className="material-icons text-sm">phone_in_talk</span> Central de Despacho
                            </button>
                            <button
                                onClick={() => { setActiveTab('wallets'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-2 py-3 bg-green-50 hover:bg-green-100 rounded-lg text-xs font-bold text-green-700 flex items-center justify-center gap-2 border border-green-200"
                            >
                                <span className="material-icons text-sm">payments</span> Financeiro / Carteiras
                            </button>

                            <button
                                onClick={() => { setActiveTab('store'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-2 py-3 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-bold text-blue-700 flex items-center justify-center gap-2 border border-blue-200"
                            >
                                <span className="material-icons text-sm">store</span> Loja / Produtos
                            </button>

                            <button
                                onClick={() => { setActiveTab('taximeter'); setSelectedDriver(null); setShowDetailMobile(true); }}
                                className="col-span-2 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 rounded-lg text-xs font-bold text-indigo-800 flex items-center justify-center gap-2 border border-indigo-200 shadow-sm transition-all"
                            >
                                <span className="material-icons text-sm text-indigo-600">local_taxi</span> Gerenciador de Taxímetro
                            </button>

                            <button
                                onClick={() => { setActiveTab('rides'); setSelectedDriver(null); setShowDetailMobile(true); loadAllRides(); }}
                                className="col-span-2 py-4 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                            >
                                <span className="material-icons text-xl">dataset</span> CENTRAL DE CORRIDAS
                            </button>

                            {/* BOTÃO LIMPEZA DE DUPLICADOS */}
                            <button
                                onClick={handleCleanupDuplicates}
                                disabled={isCleaningDuplicates || duplicateCount === 0}
                                className={`col-span-2 py-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 border transition-all ${duplicateCount > 0
                                    ? 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200 shadow-sm'
                                    : 'bg-gray-50 text-gray-400 border-gray-200 opacity-60 cursor-not-allowed'
                                    }`}
                            >
                                <span className={`material-icons text-sm ${isCleaningDuplicates ? 'animate-spin' : ''}`}>
                                    {isCleaningDuplicates ? 'sync' : 'cleaning_services'}
                                </span>
                                {isCleaningDuplicates ? 'Limpando...' : `Limpar ${duplicateCount} Duplicados`}
                            </button>
                        </div>
                        {isLoading ? (
                            <div className="p-8 text-center text-gray-400 animate-pulse">Carregando...</div>
                        ) : filteredDrivers.length > 0 ? (
                            paginatedDrivers.map(driver => {
                                const subInfo = getSubStatus(driver);
                                return (
                                    <div
                                        key={driver.id}
                                        onClick={() => handleDriverClick(driver)}
                                        className={`p-4 flex items-center cursor-pointer border-b border-gray-50 hover:bg-gray-50 transition relative ${selectedDriver?.id === driver.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                                    >
                                        {!driver.is_approved && (
                                            <div className="absolute top-0 right-0 bg-yellow-400 text-xs font-bold px-2 py-0.5 rounded-bl-lg text-white shadow-sm">
                                                PENDENTE
                                            </div>
                                        )}

                                        <div className="relative w-12 h-12 mr-4 group shrink-0">
                                            <img src={driver.avatar_url || 'https://via.placeholder.com/40'} alt={driver.username} className={`w-full h-full rounded-full object-cover shadow-sm ${!driver.is_approved ? 'grayscale opacity-70' : ''}`} />
                                            <span
                                                className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${driver.status === 'available' ? 'bg-green-500' : driver.status === 'busy' ? 'bg-red-500' : 'bg-gray-400'
                                                    }`}></span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1">
                                                <h3 className="text-sm font-semibold text-gray-800 truncate">{driver.username}</h3>
                                                <span
                                                    className={`material-icons text-xs ${driver.vehicle_type === 'motorcycle' ? 'text-orange-400' : 'text-blue-400'}`}
                                                    title={driver.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                                                >
                                                    {driver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center mt-1">
                                                <p className="text-xs text-gray-500">ID: {driver.id.slice(0, 4)}...</p>
                                                <div className="flex flex-col items-end">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${subInfo.color}`}>{subInfo.label}</span>
                                                    {driver.monthly_rides !== undefined && (
                                                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mt-1">
                                                            {driver.monthly_rides} Corridas (Mês)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <span className="material-icons text-gray-300 text-sm">chevron_right</span>
                                    </div>
                                )
                            })
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-gray-50/50">
                                <span className="material-icons text-7xl text-gray-200 mb-4">settings_suggest</span>
                                <h3 className="text-xl font-bold text-gray-400">Selecione um motorista ou use o menu rápido</h3>
                                <p className="text-gray-400 max-w-xs mt-2">Use as ações rápidas ao lado para gerenciar globais do sistema ChegoJá</p>
                            </div>
                        )}
                        {/* Pagination Controls */}
                        {filteredDrivers.length > pageSize && (
                            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-3 flex items-center justify-between">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold"
                                    disabled={page <= 1}
                                >
                                    Anterior
                                </button>
                                <div className="text-xs text-gray-600 font-bold">
                                    Página {page} de {totalPages}
                                </div>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold"
                                    disabled={page >= totalPages}
                                >
                                    Próxima
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content (Detail View) */}
                <div className={`flex-1 bg-gray-50 overflow-y-auto custom-scrollbar ${showDetailMobile ? 'block absolute inset-0 z-20 bg-white' : 'hidden md:block static'}`}>

                    {/* TELA DE APROVAÇÕES (NOVA) */}
                    {activeTab === 'approvals' && !selectedDriver ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>

                            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <span className="material-icons text-yellow-600">how_to_reg</span> Aprovação de Motoristas
                                <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">{pendingCount} Pendentes</span>
                            </h2>

                            {pendingCount === 0 ? (
                                <div className="bg-white p-12 rounded-xl text-center shadow-sm border border-gray-200">
                                    <span className="material-icons text-6xl text-green-100 mb-4">check_circle</span>
                                    <h3 className="text-xl font-medium text-gray-800">Tudo em dia!</h3>
                                    <p className="text-gray-500">Não há motoristas aguardando aprovação no momento.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {drivers.filter(d => !d.is_approved).map(pendingDriver => (
                                        <div key={pendingDriver.id} className="bg-white rounded-xl shadow border border-yellow-200 overflow-hidden flex flex-col">
                                            <div className="p-4 flex items-start gap-4">
                                                <img src={pendingDriver.avatar_url || 'https://via.placeholder.com/80'} className="w-16 h-16 rounded-full object-cover border-2 border-yellow-400" alt="" />
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-lg text-gray-800">{pendingDriver.username}</h3>
                                                    <p className="text-xs text-gray-500 mb-2">Registrado em: {new Date(pendingDriver.created_at || '').toLocaleDateString()}</p>

                                                    <div className="bg-gray-50 p-2 rounded text-sm space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-icons text-xs text-gray-400">directions_car</span>
                                                            <span className="font-medium">{pendingDriver.vehicle_model || 'Não info.'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-icons text-xs text-gray-400">pin</span>
                                                            <span className="font-mono bg-yellow-100 px-1 rounded text-yellow-800 font-bold">{pendingDriver.vehicle_plate || 'SEM PLACA'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-icons text-xs text-gray-400">palette</span>
                                                            <span>{pendingDriver.vehicle_color || 'Cor não info.'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="bg-gray-50 p-3 flex gap-2 mt-auto">
                                                <button
                                                    onClick={() => handleApprove(pendingDriver.id)}
                                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 transition"
                                                >
                                                    <span className="material-icons text-sm">check</span> Aprovar
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(pendingDriver.id)}
                                                    className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 py-2 rounded-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition"
                                                >
                                                    <span className="material-icons text-sm">close</span> Rejeitar
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedDriver(pendingDriver); setActiveTab('chat'); }}
                                                    className="px-3 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg flex items-center justify-center"
                                                    title="Conversar"
                                                >
                                                    <span className="material-icons text-sm">chat</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'notifications' && !selectedDriver ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <span className="material-icons text-blue-600">campaign</span> Enviar Notificação Global
                            </h2>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Título da Notificação</label>
                                            <input
                                                type="text"
                                                value={broadcastTitle}
                                                onChange={e => setBroadcastTitle(e.target.value)}
                                                placeholder="Ex: Novo Sorteio!"
                                                className="w-full p-2 border rounded text-gray-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">URL da Imagem (Opcional)</label>
                                            <input
                                                type="text"
                                                value={broadcastImageUrl}
                                                onChange={e => setBroadcastImageUrl(e.target.value)}
                                                placeholder="https://exemplo.com/imagem.jpg"
                                                className="w-full p-2 border rounded text-gray-900"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
                                        <textarea
                                            value={broadcastMessage}
                                            onChange={e => setBroadcastMessage(e.target.value)}
                                            placeholder="Descreva a novidade aqui..."
                                            className="w-full p-2 border rounded text-gray-900 h-24"
                                        ></textarea>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-gray-50 rounded-lg">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Enviar Para:</label>
                                            <div className="flex flex-col gap-2">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" name="target" value="all" checked={broadcastTarget === 'all'} onChange={() => setBroadcastTarget('all')} className="form-radio text-blue-600" />
                                                    <span className="text-sm">Todos</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" name="target" value="driver" checked={broadcastTarget === 'driver'} onChange={() => setBroadcastTarget('driver')} className="form-radio text-blue-600" />
                                                    <span className="text-sm">Apenas Motoristas</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" name="target" value="client" checked={broadcastTarget === 'client'} onChange={() => setBroadcastTarget('client')} className="form-radio text-blue-600" />
                                                    <span className="text-sm">Apenas Clientes</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Canais de Envio:</label>
                                            <div className="flex flex-col gap-2">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={sendPush}
                                                        onChange={e => setSendPush(e.target.checked)}
                                                        className="form-checkbox h-4 w-4 text-orange-500 rounded"
                                                    />
                                                    <span className="text-sm flex items-center gap-1">
                                                        <span className="material-icons text-xs text-orange-500">notifications_active</span>
                                                        Push Notification (FCM)
                                                    </span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={sendInApp}
                                                        onChange={e => setSendInApp(e.target.checked)}
                                                        className="form-checkbox h-4 w-4 text-blue-500 rounded"
                                                    />
                                                    <span className="text-sm flex items-center gap-1">
                                                        <span className="material-icons text-xs text-blue-500">mms</span>
                                                        Mural do App (In-App)
                                                    </span>
                                                </label>

                                                <div className="mt-2">
                                                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Som do Push</label>
                                                    <select
                                                        value={broadcastSound}
                                                        onChange={e => setBroadcastSound(e.target.value)}
                                                        className="w-full text-xs p-1 border rounded bg-white text-gray-600"
                                                    >
                                                        <option value="default">Padrão do Sistema</option>
                                                        <option value="ubb">🔔 ChegoJá Especial (Efeito Shopee)</option>
                                                        <option value="silent">Silencioso</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                                        <button
                                            onClick={handleSendBroadcast}
                                            disabled={isSendingBroadcast}
                                            className={`font-bold py-3 px-8 rounded-xl shadow-lg flex items-center gap-2 transition transform active:scale-95 ${isSendingBroadcast
                                                ? 'bg-gray-400 cursor-not-allowed text-white'
                                                : 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white'
                                                }`}
                                        >
                                            {isSendingBroadcast ? 'Processando envio...' : 'Disparar Notificação'}
                                            {!isSendingBroadcast && <span className="material-icons text-sm">send</span>}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'store' && !selectedDriver ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>

                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                    <span className="material-icons text-blue-600">store</span> Gerenciamento da Loja
                                </h2>
                                {!editingProduct && (
                                    <button
                                        onClick={() => setEditingProduct({ name: '', price_coins: 0, stock: 999, active: true })}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition-all"
                                    >
                                        <span className="material-icons text-sm">add</span> Novo Produto
                                    </button>
                                )}
                            </div>

                            {isStoreLoading ? (
                                <div className="p-12 text-center text-gray-400">
                                    <span className="material-icons animate-spin text-4xl mb-2">sync</span>
                                    <p>Carregando produtos...</p>
                                </div>
                            ) : editingProduct ? (
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-lg font-bold text-gray-800">
                                            {editingProduct.id ? 'Editar Produto' : 'Novo Produto'}
                                        </h3>
                                        <button onClick={() => { setEditingProduct(null); setProductFile(null); }} className="text-gray-400 hover:text-gray-600">
                                            <span className="material-icons">close</span>
                                        </button>
                                    </div>

                                    <form onSubmit={handleSaveProduct} className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nome do Produto</label>
                                                <input
                                                    type="text"
                                                    value={editingProduct.name || ''}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-blue-500/20 outline-none text-gray-900"
                                                    required
                                                    placeholder="Ex: Camiseta ChegoJá"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Preço em Moedas</label>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-2.5 material-icons text-yellow-500 text-sm">toll</span>
                                                    <input
                                                        type="number"
                                                        value={editingProduct.price_coins || ''}
                                                        onChange={(e) => setEditingProduct({ ...editingProduct, price_coins: parseInt(e.target.value) })}
                                                        className="w-full pl-9 p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-blue-500/20 outline-none text-gray-900"
                                                        required
                                                        min="1"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Estoque Disponível</label>
                                                <input
                                                    type="number"
                                                    value={editingProduct.stock || 0}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, stock: parseInt(e.target.value) })}
                                                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-blue-500/20 outline-none text-gray-900"
                                                    required
                                                    min="0"
                                                />
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Descrição</label>
                                                <textarea
                                                    value={editingProduct.description || ''}
                                                    onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                                                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-blue-500/20 outline-none text-gray-900 min-h-[100px]"
                                                    placeholder="Descreva os detalhes do produto..."
                                                />
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Imagem do Produto</label>
                                                <div className="flex items-center gap-4 mt-1">
                                                    <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
                                                        {productFile ? (
                                                            <img src={URL.createObjectURL(productFile)} alt="Preview" className="w-full h-full object-cover" />
                                                        ) : editingProduct.image_url ? (
                                                            <img src={editingProduct.image_url} alt="Produto" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="material-icons text-gray-300 text-3xl">image</span>
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={(e) => setProductFile(e.target.files?.[0] || null)}
                                                            className="hidden"
                                                            id="product-image-upload"
                                                        />
                                                        <label
                                                            htmlFor="product-image-upload"
                                                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                                                        >
                                                            <span className="material-icons text-sm">cloud_upload</span>
                                                            Selecionar Foto
                                                        </label>
                                                        <p className="text-[10px] text-gray-500 mt-2 italic">Recomendado: 500x500px, PNG ou JPG.</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-50 rounded-lg border border-gray-100">
                                                    <input
                                                        type="checkbox"
                                                        checked={editingProduct.active ?? true}
                                                        onChange={(e) => setEditingProduct({ ...editingProduct, active: e.target.checked })}
                                                        className="w-4 h-4 text-blue-600 rounded"
                                                    />
                                                    <span className="text-sm font-medium text-gray-700">Produto Ativo (Visível para os clientes)</span>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                                            <button
                                                type="submit"
                                                disabled={isSavingProduct}
                                                className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 ${isSavingProduct
                                                    ? 'bg-gray-400 cursor-not-allowed text-white'
                                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                                                    }`}
                                            >
                                                {isSavingProduct ? (
                                                    <><span className="material-icons animate-spin text-sm">sync</span> Salvando...</>
                                                ) : (
                                                    <><span className="material-icons text-sm">save</span> Salvar Produto</>
                                                )}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setEditingProduct(null); setProductFile(null); }}
                                                className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-all"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {products.length === 0 ? (
                                        <div className="col-span-full bg-white p-12 rounded-xl text-center shadow-sm border border-gray-200">
                                            <span className="material-icons text-6xl text-gray-100 mb-4">shopping_bag</span>
                                            <h3 className="text-xl font-medium text-gray-800">Nenhum produto cadastrado</h3>
                                            <p className="text-gray-500 mb-6">Comece adicionando itens para os clientes trocarem por moedas.</p>
                                            <button
                                                onClick={() => setEditingProduct({ name: '', price_coins: 0, stock: 999, active: true })}
                                                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold"
                                            >
                                                Adicionar Primeiro Produto
                                            </button>
                                        </div>
                                    ) : (
                                        products.map((product) => (
                                            <div key={product.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col group hover:shadow-md transition-all">
                                                <div className="relative h-40 bg-gray-50 overflow-hidden">
                                                    {product.image_url ? (
                                                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                            <span className="material-icons text-5xl">image</span>
                                                        </div>
                                                    )}
                                                    {!product.active && (
                                                        <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase shadow-sm">
                                                            Inativo
                                                        </div>
                                                    )}
                                                    <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1">
                                                        <span className="material-icons text-[10px] text-yellow-400">toll</span>
                                                        {product.price_coins} moedas
                                                    </div>
                                                </div>
                                                <div className="p-4 flex-1 flex flex-col">
                                                    <h4 className="font-bold text-gray-800 mb-1 truncate">{product.name}</h4>
                                                    <p className="text-xs text-gray-500 line-clamp-2 mb-3 h-8">{product.description || 'Sem descrição.'}</p>

                                                    <div className="flex items-center justify-between text-xs mb-4">
                                                        <span className={`px-2 py-1 rounded-full font-bold ${product.stock > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                                            Estoque: {product.stock}
                                                        </span>
                                                        <span className="text-gray-400">ID: {product.id.slice(0, 4)}</span>
                                                    </div>

                                                    <div className="flex gap-2 mt-auto">
                                                        <button
                                                            onClick={() => setEditingProduct(product)}
                                                            className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 py-2 rounded-lg text-xs font-bold transition-colors"
                                                        >
                                                            Editar
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteProduct(product.id)}
                                                            className="px-3 bg-red-50 hover:bg-red-100 text-red-600 py-2 rounded-lg transition-colors"
                                                            title="Excluir"
                                                        >
                                                            <span className="material-icons text-sm">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'wallets' && !selectedDriver ? (
                        <div className="h-full flex flex-col">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <AdminWalletManager />
                        </div>
                    ) : activeTab === 'bot' && !selectedDriver ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <span className="material-icons text-teal-600">smart_toy</span> Bot WhatsApp (IA)
                            </h2>

                            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 text-center">
                                <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 ${botRunning ? 'bg-green-100 animate-pulse' : 'bg-gray-100'}`}>
                                    <span className={`material-icons text-5xl ${botRunning ? 'text-green-600' : 'text-gray-400'}`}>
                                        {botRunning ? 'settings_input_antenna' : 'power_off'}
                                    </span>
                                </div>

                                <h3 className="text-xl font-bold text-gray-800 mb-2">
                                    {botRunning ? 'O Bot está Ativo' : 'O Bot está Parado'}
                                </h3>
                                <p className="text-gray-500 mb-8 max-w-md mx-auto">
                                    {botRunning
                                        ? 'O sistema está monitorando mensagens do WhatsApp, interpretando pedidos com IA e despachando corridas para motoristas online.'
                                        : 'Inicie o bot para automatizar o atendimento via WhatsApp usando a IA do Gemini.'}
                                </p>

                                <button
                                    onClick={() => {
                                        if (botRunning) {
                                            WhatsappBot.stop();
                                            setBotRunning(false);
                                        } else {
                                            WhatsappBot.start();
                                            setBotRunning(true);
                                        }
                                    }}
                                    className={`px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition transform active:scale-95 flex items-center justify-center gap-3 mx-auto ${botRunning
                                        ? 'bg-red-500 hover:bg-red-600 text-white'
                                        : 'bg-green-600 hover:bg-green-700 text-white'
                                        }`}
                                >
                                    <span className="material-icons">{botRunning ? 'stop' : 'play_arrow'}</span>
                                    {botRunning ? 'Parar Bot' : 'Iniciar Bot'}
                                </button>

                                <div className="mt-8 p-4 bg-gray-50 rounded text-left text-xs text-gray-500">
                                    <div className="mb-4">
                                        <label className="block text-gray-700 font-bold mb-1">WAHA API Key (Opcional)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="password"
                                                value={wahaApiKey}
                                                onChange={(e) => {
                                                    setWahaApiKey(e.target.value);
                                                    WahaService.setApiKey(e.target.value);
                                                }}
                                                placeholder="Insira a chave da API se necessário"
                                                className="flex-1 p-2 border rounded text-gray-900"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1">Se o servidor retornar 401 Unauthorized, insira a chave aqui.</p>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block text-gray-700 font-bold mb-1">Gemini API Key (Obrigatório)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="password"
                                                value={geminiApiKey}
                                                onChange={(e) => {
                                                    setGeminiApiKey(e.target.value);
                                                    localStorage.setItem('GEMINI_API_KEY', e.target.value);
                                                }}
                                                placeholder="Sua chave do Google AI Studio"
                                                className="flex-1 p-2 border rounded text-gray-900"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-1">Obtenha em: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-500 underline">Google AI Studio</a></p>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block text-gray-700 font-bold mb-1">Nome da Sessão</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={wahaSession}
                                                onChange={(e) => {
                                                    setWahaSession(e.target.value);
                                                    WahaService.setSessionName(e.target.value);
                                                }}
                                                className="flex-1 p-2 border rounded text-gray-900"
                                            />
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const sessions = await WahaService.getSessions();
                                                        alert(`Sessões encontradas: ${JSON.stringify(sessions, null, 2)}`);
                                                    } catch (e) {
                                                        alert('Erro ao listar sessões. Verifique a API Key.');
                                                    }
                                                }}
                                                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-2 rounded font-bold text-xs"
                                            >
                                                Listar Sessões
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={async () => {
                                            setIsTestingConnection(true);
                                            try {
                                                const res = await WahaService.checkSession();
                                                alert(`Status da Conexão: ${JSON.stringify(res)}`);
                                            } catch (e) {
                                                alert(`Erro ao conectar: ${e}`);
                                            }
                                            setIsTestingConnection(false);
                                        }}
                                        disabled={isTestingConnection}
                                        className="mb-4 w-full bg-blue-100 text-blue-700 py-2 rounded font-bold hover:bg-blue-200"
                                    >
                                        {isTestingConnection ? 'Testando...' : 'Testar Conexão'}
                                    </button>

                                    <div className="border-t pt-4 mt-4">
                                        <h4 className="font-bold text-gray-700 mb-2">Criar Nova Sessão</h4>
                                        <div className="flex gap-2 mb-2">
                                            <input
                                                type="text"
                                                value={newSessionName}
                                                onChange={(e) => setNewSessionName(e.target.value)}
                                                placeholder="Nome da nova sessão (ex: chegoja)"
                                                className="flex-1 p-2 border rounded text-gray-900"
                                            />
                                            <button
                                                onClick={async () => {
                                                    if (!newSessionName) return alert('Digite um nome para a sessão');
                                                    setIsCreatingSession(true);
                                                    try {
                                                        const res = await WahaService.startSession(newSessionName);
                                                        if (res && res.name) {
                                                            alert(`Sessão '${res.name}' criada! Aguarde o QR Code...`);
                                                            setWahaSession(res.name);
                                                            WahaService.setSessionName(res.name);

                                                            // Wait a bit for session to start then get QR
                                                            setTimeout(async () => {
                                                                const blob = await WahaService.getSessionScreen(res.name);
                                                                if (blob) {
                                                                    const url = URL.createObjectURL(blob);
                                                                    setQrCodeUrl(url);
                                                                } else {
                                                                    alert('Não foi possível obter o QR Code. Tente novamente.');
                                                                }
                                                            }, 2000);
                                                        } else {
                                                            alert('Erro ao criar sessão. Verifique se o nome já existe.');
                                                        }
                                                    } catch (e) {
                                                        alert(`Erro: ${e}`);
                                                    }
                                                    setIsCreatingSession(false);
                                                }}
                                                disabled={isCreatingSession}
                                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-bold"
                                            >
                                                {isCreatingSession ? 'Criando...' : 'Criar'}
                                            </button>
                                        </div>
                                        {qrCodeUrl && (
                                            <div className="mt-4 text-center">
                                                <p className="mb-2 font-bold text-gray-700">Escaneie o QR Code no WhatsApp:</p>
                                                <img src={qrCodeUrl} alt="QR Code" className="mx-auto border rounded shadow-lg max-w-[250px]" />
                                                <button
                                                    onClick={() => setQrCodeUrl(null)}
                                                    className="mt-2 text-sm text-red-500 underline"
                                                >
                                                    Fechar QR Code
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between mb-4 p-4 bg-gray-50 rounded shadow-sm border">
                                        <div>
                                            <h4 className="font-bold text-gray-700">Controle do Robô</h4>
                                            <p className="text-xs text-gray-500">Ative para iniciar o atendimento automático.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                if (botRunning) {
                                                    WhatsappBot.stop();
                                                    setBotRunning(false);
                                                } else {
                                                    WhatsappBot.start();
                                                    setBotRunning(true);
                                                }
                                            }}
                                            className={`px-4 py-2 rounded font-bold text-white shadow transition-colors ${botRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
                                        >
                                            {botRunning ? 'PARAR BOT' : 'INICIAR BOT'}
                                        </button>
                                    </div>

                                    <p className="mt-4"><strong>Status:</strong> {botRunning ? '🟢 Conectado e Rodando' : '🔴 Parado'}</p>
                                    <p><strong>API:</strong> https://waha-waha.mxntxp.easypanel.host</p>
                                    <p><strong>IA:</strong> Gemini 2.5 Flash</p>
                                </div>
                            </div>
                        </div >
                    ) : activeTab === 'plans' ? (
                        <PlansManager onClose={handleBackToList} />
                    ) : activeTab === 'bingo' && !selectedDriver ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <div className="bg-purple-900 text-white p-6 rounded-2xl shadow-lg mb-8 relative overflow-hidden">
                                <div className="relative z-10 flex justify-between items-center">
                                    <h2 className="text-3xl font-bold flex items-center gap-3">
                                        <span className="material-icons text-4xl">casino</span> Gerenciar Bingo
                                    </h2>
                                    <button onClick={() => { if (confirm('Resetar jogo?')) resetBingo() }} className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-sm font-bold">
                                        Resetar Jogo
                                    </button>
                                </div>
                                <div className="absolute right-0 top-0 h-full w-1/3 bg-white/10 transform skew-x-12"></div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Game Control */}
                                <div className="space-y-6">
                                    <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
                                        <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Controle do Sorteio</h3>

                                        <div className="flex justify-center mb-6">
                                            <button
                                                onClick={handleDrawNumber}
                                                className="w-40 h-40 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white font-bold text-xl shadow-xl active:scale-95 transition flex flex-col items-center justify-center gap-2 border-4 border-purple-200"
                                            >
                                                <span className="material-icons text-4xl">refresh</span>
                                                SORTEAR
                                            </button>
                                        </div>

                                        {/* GRID DE SORTEIO MANUAL */}
                                        <div className="mt-4 border-t pt-4">
                                            <h4 className="text-xs text-gray-400 font-bold uppercase mb-2 text-center">Seleção Manual</h4>
                                            <div className="grid grid-cols-10 gap-1 text-[10px]">
                                                {Array.from({ length: 75 }, (_, i) => i + 1).map(num => {
                                                    const isDrawn = bingoSettings?.drawn_numbers.includes(num);
                                                    return (
                                                        <button
                                                            key={num}
                                                            onClick={() => handleManualDraw(num)}
                                                            disabled={isDrawn}
                                                            className={`
                                                    aspect-square rounded flex items-center justify-center font-bold border
                                                    ${isDrawn
                                                                    ? 'bg-gray-200 text-gray-400 border-gray-200 cursor-not-allowed'
                                                                    : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-100'
                                                                }
                                                `}
                                                        >
                                                            {num}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <h4 className="text-sm text-gray-500 uppercase font-bold mb-2">Números Sorteados ({bingoSettings?.drawn_numbers.length})</h4>
                                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded-lg">
                                                {bingoSettings?.drawn_numbers.slice().reverse().map((n, i) => (
                                                    <div key={i} className="w-8 h-8 rounded-full bg-purple-100 text-purple-800 font-bold flex items-center justify-center border border-purple-200 text-sm">
                                                        {n}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Configurar Premio */}
                                    <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
                                        <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Configurar Prêmio</h3>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Link da Imagem</label>
                                                <input type="text" value={bingoSettings?.prize_image} onChange={e => setBingoSettings(s => s ? { ...s, prize_image: e.target.value } : null)} className="w-full p-2 border rounded text-sm text-gray-800" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Descrição</label>
                                                <input type="text" value={bingoSettings?.prize_description} onChange={e => setBingoSettings(s => s ? { ...s, prize_description: e.target.value } : null)} className="w-full p-2 border rounded text-sm text-gray-800" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Link do YouTube</label>
                                                <input type="text" value={bingoSettings?.youtube_link} onChange={e => setBingoSettings(s => s ? { ...s, youtube_link: e.target.value } : null)} className="w-full p-2 border rounded text-sm text-gray-800" />
                                            </div>

                                            {/* VIDEO PREVIEW */}
                                            {adminVideoId && (
                                                <div className="mt-2 rounded-lg overflow-hidden bg-black border border-gray-300">
                                                    <p className="text-[10px] text-gray-500 bg-gray-100 p-1 text-center">Preview (Verifique se funciona)</p>
                                                    <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                                                        <iframe
                                                            className="absolute top-0 left-0 w-full h-full"
                                                            src={`https://www.youtube.com/embed/${adminVideoId}?rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`}
                                                            title="YouTube video player"
                                                            frameBorder="0"
                                                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                                            allowFullScreen
                                                            referrerPolicy="strict-origin-when-cross-origin"
                                                        ></iframe>
                                                    </div>
                                                </div>
                                            )}

                                            <button onClick={handleSaveBingoSettings} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">Salvar Dados</button>
                                        </div>
                                    </div>
                                </div>

                                {/* Ranking */}
                                <div className="bg-white p-6 rounded-xl shadow border border-gray-200">
                                    <h3 className="font-bold text-gray-700 mb-4 border-b pb-2">Top 10 Jogadores</h3>
                                    <div className="overflow-y-auto max-h-[500px]">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-gray-50 text-gray-500">
                                                <tr>
                                                    <th className="p-2">#</th>
                                                    <th className="p-2">Usuário</th>
                                                    <th className="p-2 text-center">Acertos</th>
                                                    <th className="p-2 text-center">Faltam</th>
                                                    <th className="p-2 text-center">Ação</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {bingoRanking.map((user, idx) => (
                                                    <tr key={idx} className={`border-b border-gray-100 ${idx < 3 ? 'bg-yellow-50' : ''}`}>
                                                        <td className="p-2 font-bold text-gray-400">{idx + 1}</td>
                                                        <td className="p-2 font-medium flex items-center gap-2">
                                                            <img src={user.avatar_url} className="w-6 h-6 rounded-full" alt="" />
                                                            {user.username}
                                                        </td>
                                                        <td className="p-2 text-center font-bold text-green-600">{user.hits}</td>
                                                        <td className="p-2 text-center font-mono text-gray-500">{user.missing}</td>
                                                        <td className="p-2 text-center">
                                                            <button
                                                                onClick={() => handleDriverClick({ id: user.user_id, username: user.username, role: 'client' } as UserProfile)}
                                                                className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs hover:bg-blue-200"
                                                            >
                                                                Chat
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {bingoRanking.length === 0 && (
                                                    <tr><td colSpan={5} className="p-4 text-center text-gray-400">Nenhum jogador ainda.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'taximeter' && !selectedDriver ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>

                            <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-6 rounded-2xl shadow-lg mb-8 relative overflow-hidden">
                                <div className="relative z-10">
                                    <h2 className="text-3xl font-bold flex items-center gap-3">
                                        <span className="material-icons text-4xl">local_taxi</span> Gerenciador de Taxímetro
                                    </h2>
                                    <p className="text-indigo-100 mt-2">Configure as taxas oficiais de corrida para Carros e Motos.</p>
                                </div>
                                <div className="absolute right-0 top-0 h-full w-1/3 bg-white/10 transform skew-x-12"></div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Taxa Carro */}
                                <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-t-blue-500 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-6 text-blue-700 font-bold text-lg">
                                        <span className="material-icons">directions_car</span> Taxa Carro
                                    </div>
                                    <div className="space-y-5">
                                        <div className="relative">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bandeirada (R$)</label>
                                            <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 focus-within:ring-2 ring-blue-500 transition-all">
                                                <span className="pl-3 text-gray-400 font-bold">R$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={appSettings.car_base_price}
                                                    onChange={e => setAppSettings({ ...appSettings, car_base_price: parseFloat(e.target.value) })}
                                                    className="w-full p-3 bg-transparent border-none outline-none text-gray-800 font-bold"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preço/KM</label>
                                                <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                                                    <span className="pl-2 text-[10px] text-gray-400">R$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={appSettings.car_price_km}
                                                        onChange={e => setAppSettings({ ...appSettings, car_price_km: parseFloat(e.target.value) })}
                                                        className="w-full p-2 bg-transparent border-none outline-none text-gray-800 font-bold text-sm"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preço/MIN</label>
                                                <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                                                    <span className="pl-2 text-[10px] text-gray-400">R$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={appSettings.car_price_min}
                                                        onChange={e => setAppSettings({ ...appSettings, car_price_min: parseFloat(e.target.value) })}
                                                        className="w-full p-2 bg-transparent border-none outline-none text-gray-800 font-bold text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-50">
                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Distância para começar a cobrar</label>
                                            <div className="flex items-center bg-blue-50 rounded-lg border border-blue-100 p-1">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={appSettings.car_start_distance_limit}
                                                    onChange={e => setAppSettings({ ...appSettings, car_start_distance_limit: parseFloat(e.target.value) })}
                                                    className="w-full p-2 bg-transparent border-none outline-none text-blue-900 font-bold text-center"
                                                />
                                                <span className="pr-3 text-blue-400 font-bold text-sm">KM</span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-2 italic text-center">O passageiro só paga KM rodado APÓS rodar essa distância.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Taxa Moto */}
                                <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-t-orange-500 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-6 text-orange-700 font-bold text-lg">
                                        <span className="material-icons">two_wheeler</span> Taxa Moto
                                    </div>
                                    <div className="space-y-5">
                                        <div className="relative">
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bandeirada (R$)</label>
                                            <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200 focus-within:ring-2 ring-orange-500 transition-all">
                                                <span className="pl-3 text-gray-400 font-bold">R$</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={appSettings.moto_base_price}
                                                    onChange={e => setAppSettings({ ...appSettings, moto_base_price: parseFloat(e.target.value) })}
                                                    className="w-full p-3 bg-transparent border-none outline-none text-gray-800 font-bold"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preço/KM</label>
                                                <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                                                    <span className="pl-2 text-[10px] text-gray-400">R$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={appSettings.moto_price_km}
                                                        onChange={e => setAppSettings({ ...appSettings, moto_price_km: parseFloat(e.target.value) })}
                                                        className="w-full p-2 bg-transparent border-none outline-none text-gray-800 font-bold text-sm"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preço/MIN</label>
                                                <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                                                    <span className="pl-2 text-[10px] text-gray-400">R$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={appSettings.moto_price_min}
                                                        onChange={e => setAppSettings({ ...appSettings, moto_price_min: parseFloat(e.target.value) })}
                                                        className="w-full p-2 bg-transparent border-none outline-none text-gray-800 font-bold text-sm"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-50">
                                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Distância para começar a cobrar</label>
                                            <div className="flex items-center bg-orange-50 rounded-lg border border-orange-100 p-1">
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={appSettings.moto_start_distance_limit}
                                                    onChange={e => setAppSettings({ ...appSettings, moto_start_distance_limit: parseFloat(e.target.value) })}
                                                    className="w-full p-2 bg-transparent border-none outline-none text-orange-900 font-bold text-center"
                                                />
                                                <span className="pr-3 text-orange-400 font-bold text-sm">KM</span>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-2 italic text-center">O passageiro só paga KM rodado APÓS rodar essa distância.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-12 bg-white p-8 rounded-2xl shadow-lg flex items-center justify-between border border-blue-50">
                                <div>
                                    <h3 className="font-bold text-gray-800">Pronto para Aplicar?</h3>
                                    <p className="text-sm text-gray-500">As novas tarifas valerão imediatamente para o Web e Android.</p>
                                </div>
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={isSavingSettings}
                                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-xl transition transform active:scale-95 flex items-center gap-2 group"
                                >
                                    {isSavingSettings ? 'Salvando...' : 'Salvar Tarifas'}
                                    <span className="material-icons group-hover:rotate-12 transition-transform">save</span>
                                </button>
                            </div>
                        </div>
                    ) : activeTab === 'settings' && !selectedDriver ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <span className="material-icons">settings</span> Configurações do Aplicativo
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Car Rates */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <div className="flex items-center gap-2 mb-4 text-blue-600 font-bold border-b pb-2">
                                        <span className="material-icons">directions_car</span> Tarifas Carro
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Bandeirada (R$)</label>
                                            <input type="number" step="0.10" value={appSettings.car_base_price} onChange={e => setAppSettings({ ...appSettings, car_base_price: parseFloat(e.target.value) })} className="w-full p-2 border rounded text-gray-900" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Preço por KM (R$)</label>
                                                <input type="number" step="0.10" value={appSettings.car_price_km} onChange={e => setAppSettings({ ...appSettings, car_price_km: parseFloat(e.target.value) })} className="w-full p-2 border rounded text-gray-900" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Preço por Minuto (R$)</label>
                                                <input type="number" step="0.10" value={appSettings.car_price_per_minute ?? 0} onChange={e => setAppSettings({ ...appSettings, car_price_per_minute: parseFloat(e.target.value) })} className="w-full p-2 border rounded text-gray-900" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Preço Mínimo da Corrida (R$)</label>
                                            <input type="number" step="0.10" value={appSettings.car_price_min} onChange={e => setAppSettings({ ...appSettings, car_price_min: parseFloat(e.target.value) })} className="w-full p-2 border rounded text-gray-900" />
                                            <p className="text-xs text-gray-400 mt-1">Valor mínimo cobrado, mesmo em corridas curtas.</p>
                                        </div>
                                        <div className="pt-2 border-t border-gray-100">
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Distância Inicial (Inclusa na Bandeirada)</label>
                                            <div className="flex items-center">
                                                <input type="number" step="0.10" value={appSettings.car_start_distance_limit} onChange={e => setAppSettings({ ...appSettings, car_start_distance_limit: parseFloat(e.target.value) })} className="flex-1 p-2 border rounded text-gray-900" />
                                                <span className="ml-2 text-sm text-gray-500">km</span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">Ex: Se colocar 2, só cobra por KM após 2km rodados.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Moto Rates */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                    <div className="flex items-center gap-2 mb-4 text-orange-600 font-bold border-b pb-2">
                                        <span className="material-icons">two_wheeler</span> Tarifas Moto
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Bandeirada (R$)</label>
                                            <input type="number" step="0.10" value={appSettings.moto_base_price} onChange={e => setAppSettings({ ...appSettings, moto_base_price: parseFloat(e.target.value) })} className="w-full p-2 border rounded text-gray-900" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Preço por KM (R$)</label>
                                                <input type="number" step="0.10" value={appSettings.moto_price_km} onChange={e => setAppSettings({ ...appSettings, moto_price_km: parseFloat(e.target.value) })} className="w-full p-2 border rounded text-gray-900" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Preço por Minuto (R$)</label>
                                                <input type="number" step="0.10" value={appSettings.moto_price_per_minute ?? 0} onChange={e => setAppSettings({ ...appSettings, moto_price_per_minute: parseFloat(e.target.value) })} className="w-full p-2 border rounded text-gray-900" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Preço Mínimo da Corrida (R$)</label>
                                            <input type="number" step="0.10" value={appSettings.moto_price_min} onChange={e => setAppSettings({ ...appSettings, moto_price_min: parseFloat(e.target.value) })} className="w-full p-2 border rounded text-gray-900" />
                                            <p className="text-xs text-gray-400 mt-1">Valor mínimo cobrado, mesmo em corridas curtas.</p>
                                        </div>
                                        <div className="pt-2 border-t border-gray-100">
                                            <label className="block text-sm font-bold text-gray-700 mb-1">Distância Inicial (Inclusa na Bandeirada)</label>
                                            <div className="flex items-center">
                                                <input type="number" step="0.10" value={appSettings.moto_start_distance_limit} onChange={e => setAppSettings({ ...appSettings, moto_start_distance_limit: parseFloat(e.target.value) })} className="flex-1 p-2 border rounded text-gray-900" />
                                                <span className="ml-2 text-sm text-gray-500">km</span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-1">Ex: Se colocar 2, só cobra por KM após 2km rodados.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Night Rates */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-200">
                                    <div className="flex items-center justify-between mb-4 border-b pb-2">
                                        <div className="flex items-center gap-2 text-indigo-700 font-bold">
                                            <span className="material-icons">nights_stay</span> Tarifa Noturna
                                        </div>
                                        <div className="flex gap-2">
                                            <input type="time" value={appSettings.night_start_time} onChange={e => setAppSettings({ ...appSettings, night_start_time: e.target.value })} className="text-xs p-1 border rounded bg-gray-50 text-gray-700" />
                                            <span className="text-xs text-gray-400 self-center font-bold">até</span>
                                            <input type="time" value={appSettings.night_end_time} onChange={e => setAppSettings({ ...appSettings, night_end_time: e.target.value })} className="text-xs p-1 border rounded bg-gray-50 text-gray-700" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-bold text-blue-600 uppercase border-b border-blue-100 pb-1">Carro</p>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Bandeirada</label>
                                                <input type="number" step="0.10" value={appSettings.night_car_base_price} onChange={e => setAppSettings({ ...appSettings, night_car_base_price: parseFloat(e.target.value) })} className="w-full text-sm p-1.5 border rounded bg-gray-50 font-bold text-gray-800" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Preço por KM</label>
                                                <input type="number" step="0.10" value={appSettings.night_car_price_km} onChange={e => setAppSettings({ ...appSettings, night_car_price_km: parseFloat(e.target.value) })} className="w-full text-sm p-1.5 border rounded bg-gray-50 font-bold text-gray-800" />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-bold text-orange-600 uppercase border-b border-orange-100 pb-1">Moto</p>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Bandeirada</label>
                                                <input type="number" step="0.10" value={appSettings.night_moto_base_price} onChange={e => setAppSettings({ ...appSettings, night_moto_base_price: parseFloat(e.target.value) })} className="w-full text-sm p-1.5 border rounded bg-gray-50 font-bold text-gray-800" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Preço por KM</label>
                                                <input type="number" step="0.10" value={appSettings.night_moto_price_km} onChange={e => setAppSettings({ ...appSettings, night_moto_price_km: parseFloat(e.target.value) })} className="w-full text-sm p-1.5 border rounded bg-gray-50 font-bold text-gray-800" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Dawn Rates */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-200">
                                    <div className="flex items-center justify-between mb-4 border-b pb-2">
                                        <div className="flex items-center gap-2 text-blue-800 font-bold">
                                            <span className="material-icons">brightness_3</span> Tarifa Madrugada
                                        </div>
                                        <div className="flex gap-2">
                                            <input type="time" value={appSettings.dawn_start_time} onChange={e => setAppSettings({ ...appSettings, dawn_start_time: e.target.value })} className="text-xs p-1 border rounded bg-gray-50 text-gray-700" />
                                            <span className="text-xs text-gray-400 self-center font-bold">até</span>
                                            <input type="time" value={appSettings.dawn_end_time} onChange={e => setAppSettings({ ...appSettings, dawn_end_time: e.target.value })} className="text-xs p-1 border rounded bg-gray-50 text-gray-700" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-bold text-blue-600 uppercase border-b border-blue-100 pb-1">Carro</p>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Bandeirada</label>
                                                <input type="number" step="0.10" value={appSettings.dawn_car_base_price} onChange={e => setAppSettings({ ...appSettings, dawn_car_base_price: parseFloat(e.target.value) })} className="w-full text-sm p-1.5 border rounded bg-gray-50 font-bold text-gray-800" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Preço por KM</label>
                                                <input type="number" step="0.10" value={appSettings.dawn_car_price_km} onChange={e => setAppSettings({ ...appSettings, dawn_car_price_km: parseFloat(e.target.value) })} className="w-full text-sm p-1.5 border rounded bg-gray-50 font-bold text-gray-800" />
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-bold text-orange-600 uppercase border-b border-orange-100 pb-1">Moto</p>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Bandeirada</label>
                                                <input type="number" step="0.10" value={appSettings.dawn_moto_base_price} onChange={e => setAppSettings({ ...appSettings, dawn_moto_base_price: parseFloat(e.target.value) })} className="w-full text-sm p-1.5 border rounded bg-gray-50 font-bold text-gray-800" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-gray-500 mb-0.5">Preço por KM</label>
                                                <input type="number" step="0.10" value={appSettings.dawn_moto_price_km} onChange={e => setAppSettings({ ...appSettings, dawn_moto_price_km: parseFloat(e.target.value) })} className="w-full text-sm p-1.5 border rounded bg-gray-50 font-bold text-gray-800" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Marquee Banner Settings (NOVO) */}
                                <div className="md:col-span-2 bg-gradient-to-r from-purple-900 to-indigo-900 p-6 rounded-xl shadow-lg border border-purple-700 text-white">
                                    <div className="flex items-center gap-2 mb-4 text-yellow-300 font-bold border-b border-white/20 pb-2">
                                        <span className="material-icons">campaign</span> Tarjeta de Avisos (Letreiro)
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-200 mb-2">Texto do Letreiro (passa no topo do app)</label>
                                        <textarea
                                            rows={2}
                                            value={appSettings.marquee_text}
                                            onChange={e => setAppSettings({ ...appSettings, marquee_text: e.target.value })}
                                            className="w-full p-3 border border-white/20 rounded-lg bg-black/30 text-white placeholder-gray-400 focus:ring-2 ring-yellow-400 outline-none"
                                            placeholder="Digite o texto promocional aqui..."
                                        />
                                        <p className="text-xs text-gray-400 mt-2">Dica: Use emojis para chamar atenção. O texto se repete automaticamente.</p>
                                    </div>
                                </div>

                                {/* Ícones do Mapa (Customização) */}
                                <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-lg border border-gray-200 mt-0">
                                    <div className="flex items-center gap-2 mb-4 text-gray-800 font-bold border-b pb-2">
                                        <span className="material-icons text-blue-500">map</span> Personalização de Ícones (Mapa)
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        {/* Carro */}
                                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                                <span className="material-icons text-green-600">directions_car</span> Personalização do Carro
                                            </label>

                                            {/* Nome do Veículo */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Nome do Veículo</label>
                                                <input
                                                    type="text"
                                                    value={appSettings.car_name || ''}
                                                    onChange={e => setAppSettings({ ...appSettings, car_name: e.target.value })}
                                                    className="w-full p-2 border rounded text-gray-900 text-sm"
                                                    placeholder="Ex: Mob Comum, Carro Executivo..."
                                                />
                                            </div>

                                            {/* Descrição */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
                                                <input
                                                    type="text"
                                                    value={appSettings.car_description || ''}
                                                    onChange={e => setAppSettings({ ...appSettings, car_description: e.target.value })}
                                                    className="w-full p-2 border rounded text-gray-900 text-sm"
                                                    placeholder="Ex: Viagem econômica, Conforto e segurança..."
                                                />
                                            </div>

                                            {/* Ícone */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-2">Ícone</label>
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center border shadow-sm">
                                                        {appSettings.car_icon_url ? (
                                                            <img src={appSettings.car_icon_url} className="w-10 h-10 object-contain" alt="Carro" />
                                                        ) : (
                                                            <span className="material-icons text-green-500 text-4xl">directions_car</span>
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 cursor-pointer"
                                                            onChange={(e) => {
                                                                if (e.target.files?.[0]) handleIconUpload(e.target.files[0], 'car');
                                                            }}
                                                            disabled={isSavingSettings}
                                                        />
                                                        <p className="text-[10px] text-gray-400 mt-2">
                                                            <strong>Ideal:</strong> PNG Transparente, 64x64px ou 128x128px.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Moto */}
                                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                                <span className="material-icons text-orange-600">two_wheeler</span> Personalização da Moto
                                            </label>

                                            {/* Nome do Veículo */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Nome do Veículo</label>
                                                <input
                                                    type="text"
                                                    value={appSettings.moto_name || ''}
                                                    onChange={e => setAppSettings({ ...appSettings, moto_name: e.target.value })}
                                                    className="w-full p-2 border rounded text-gray-900 text-sm"
                                                    placeholder="Ex: Mob Moto, Moto Express..."
                                                />
                                            </div>

                                            {/* Descrição */}
                                            <div className="mb-3">
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Descrição</label>
                                                <input
                                                    type="text"
                                                    value={appSettings.moto_description || ''}
                                                    onChange={e => setAppSettings({ ...appSettings, moto_description: e.target.value })}
                                                    className="w-full p-2 border rounded text-gray-900 text-sm"
                                                    placeholder="Ex: Rapidez e agilidade, Entrega rápida..."
                                                />
                                            </div>

                                            {/* Ícone */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-2">Ícone</label>
                                                <div className="flex items-center gap-4">
                                                    <div className="w-16 h-16 bg-white rounded-lg flex items-center justify-center border shadow-sm">
                                                        {appSettings.moto_icon_url ? (
                                                            <img src={appSettings.moto_icon_url} className="w-10 h-10 object-contain" alt="Moto" />
                                                        ) : (
                                                            <span className="material-icons text-orange-500 text-4xl">two_wheeler</span>
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
                                                            onChange={(e) => {
                                                                if (e.target.files?.[0]) handleIconUpload(e.target.files[0], 'moto');
                                                            }}
                                                            disabled={isSavingSettings}
                                                        />
                                                        <p className="text-[10px] text-gray-400 mt-2">
                                                            <strong>Ideal:</strong> PNG Transparente, 64x64px ou 128x128px.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex justify-end">
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={isSavingSettings}
                                    className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold shadow-md hover:bg-green-700 flex items-center gap-2"
                                >
                                    {isSavingSettings ? 'Salvando...' : 'Salvar Alterações'}
                                    <span className="material-icons">save</span>
                                </button>
                            </div>
                        </div>
                    ) : selectedDriver ? (
                        <div className="h-full flex flex-col">
                            {/* ... rest of selected driver detail view ... */}
                            {/* Mobile Back Button Header */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>

                            {/* Cover */}
                            <div className={`shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 relative ${activeTab === 'chat' ? 'h-16' : 'h-32 md:h-40'}`}>
                                <div className={`absolute left-6 md:left-8 ${activeTab === 'chat' ? 'top-2 flex items-center gap-3' : '-bottom-10 md:-bottom-12'}`}>
                                    <div className={`${activeTab === 'chat' ? 'w-12 h-12 border-2' : 'w-20 h-20 md:w-24 md:h-24 border-4'} rounded-full border-white bg-white overflow-hidden shadow-md`}>
                                        <img src={selectedDriver.avatar_url} alt={selectedDriver.username} className={`w-full h-full object-cover ${!selectedDriver.is_approved ? 'grayscale' : ''}`} />
                                    </div>
                                    {activeTab === 'chat' && (
                                        <h2 className="text-white font-bold text-lg">{selectedDriver.username}</h2>
                                    )}
                                </div>
                                {activeTab !== 'chat' && (
                                    <div className="absolute top-4 right-4 flex gap-2">
                                        <button onClick={() => handleDelete(selectedDriver.id)} className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-lg backdrop-blur-sm transition" title="Deletar Motorista">
                                            <span className="material-icons">delete</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Info and Tabs - Only show if NOT chat, or minimize header */}
                            {activeTab !== 'chat' && (
                                <div className="pt-12 md:pt-16 px-6 md:px-8 pb-2 shrink-0 bg-white">
                                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-4">
                                        <div>
                                            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                                                {selectedDriver.username}
                                                <span
                                                    className={`material-icons text-lg ${selectedDriver.vehicle_type === 'motorcycle' ? 'text-orange-500' : 'text-blue-500'}`}
                                                    title={selectedDriver.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                                                >
                                                    {selectedDriver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                                                </span>
                                            </h2>
                                            {!selectedDriver.is_approved ? (
                                                <div className="mt-2 inline-flex items-center gap-2 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-bold border border-yellow-200">
                                                    <span className="material-icons text-sm">warning</span>
                                                    Aprovação Pendente
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${selectedDriver.status === 'available' ? 'bg-green-100 text-green-800' :
                                                        selectedDriver.status === 'busy' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {getDriverStatusLabel(selectedDriver)}
                                                    </span>
                                                    <span className="text-gray-400 text-sm">•</span>
                                                    <span className="text-gray-500 text-sm">Motorista Aprovado</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
                                            {!selectedDriver.is_approved && (
                                                <button
                                                    onClick={() => handleApprove(selectedDriver.id)}
                                                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 shadow-md animate-pulse"
                                                >
                                                    <span className="material-icons text-sm">check_circle</span>
                                                    <span className="text-sm font-bold">APROVAR AGORA</span>
                                                </button>
                                            )}

                                            <button
                                                onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition whitespace-nowrap ${isPlayingAudio ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                            >
                                                <span className="material-icons text-sm">{isPlayingAudio ? 'pause' : 'mic'}</span>
                                                <span className="text-sm font-medium">Monitorar</span>
                                            </button>

                                            <button
                                                onClick={toggleCall}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition whitespace-nowrap shadow-md ${isCalling
                                                    ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-200'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                                    }`}
                                            >
                                                <span className={`material-icons text-sm ${isCalling ? 'animate-bounce' : ''}`}>
                                                    {isCalling ? 'call_end' : 'call'}
                                                </span>
                                                <span className="text-sm font-medium">
                                                    {isCalling ? `Em Chamada (${formatDuration(callDuration)})` : 'Ligar'}
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex border-b border-gray-200 mt-2 overflow-x-auto hide-scrollbar">
                                        <button
                                            onClick={() => setActiveTab('details')}
                                            className={`px-4 md:px-6 py-3 font-medium text-sm transition whitespace-nowrap ${activeTab === 'details' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Detalhes
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('chat')}
                                            className="px-4 md:px-6 py-3 font-medium text-sm transition whitespace-nowrap flex items-center gap-2 text-gray-500 hover:text-gray-700"
                                        >
                                            Chat
                                            <span className="bg-whatsapp-green text-white text-[10px] px-1.5 py-0.5 rounded-full">New</span>
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('map')}
                                            className={`px-4 md:px-6 py-3 font-medium text-sm transition whitespace-nowrap ${activeTab === 'map' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Mapa
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('history')}
                                            className={`px-4 md:px-6 py-3 font-medium text-sm transition whitespace-nowrap ${activeTab === 'history' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            Chamadas
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Tab Content - Full Height for Chat */}
                            <div className={`flex-1 ${activeTab === 'chat' ? 'bg-[#0b141a]' : 'bg-gray-50 p-4 md:p-8'} overflow-y-auto relative`}>

                                {activeTab === 'chat' && (
                                    <div className="h-full flex flex-col">
                                        {/* Custom Header within Chat Tab to switch back */}
                                        <div className="bg-gray-100 p-2 flex justify-between items-center text-xs text-gray-500 border-b">
                                            <span>Falando com <b>{selectedDriver.username}</b></span>
                                            <button onClick={() => setActiveTab('details')} className="underline">Voltar aos Detalhes</button>
                                        </div>
                                        <ChatWindow
                                            currentUser={currentUser}
                                            chatPartner={selectedDriver}
                                            messages={driverMessages}
                                            onSendMessage={(msg) => setDriverMessages(prev => [...prev, msg])}
                                        />
                                    </div>
                                )}

                                {activeTab === 'details' && (
                                    <div className="animate-fade-in max-w-4xl mx-auto">
                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">

                                            {/* Core Details */}
                                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Informações Básicas</h3>
                                                <div className="space-y-4">
                                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                        <span className="text-gray-600 text-sm">ID</span>
                                                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{selectedDriver.id}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                        <span className="text-gray-600 text-sm">Usuário</span>
                                                        <span className="font-medium text-gray-800">{selectedDriver.username}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center py-2 border-b border-gray-50">
                                                        <span className="text-gray-600 text-sm">Registrado em</span>
                                                        <span className="text-sm text-gray-800">
                                                            {selectedDriver.created_at
                                                                ? new Date(selectedDriver.created_at).toLocaleDateString('pt-BR')
                                                                : 'N/A'
                                                            }
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status Management */}
                                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
                                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Gerenciar Status</h3>
                                                <div className="space-y-2">
                                                    {Object.values(DriverStatus).map((status) => (
                                                        <button
                                                            key={status}
                                                            onClick={() => handleStatusChange(status)}
                                                            disabled={selectedDriver.status === status}
                                                            className={`w-full p-3 rounded-lg border text-left flex items-center transition ${selectedDriver.status === status
                                                                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 relative z-10'
                                                                : 'border-gray-200 hover:border-gray-300 bg-white'
                                                                } ${selectedDriver.status === status ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                                                        >
                                                            <div className={`w-3 h-3 rounded-full mr-3 shrink-0 ${status === DriverStatus.AVAILABLE ? 'bg-green-500' :
                                                                status === DriverStatus.BUSY ? 'bg-red-500' : 'bg-gray-500'
                                                                }`}></div>
                                                            <span className="flex-1 font-medium text-gray-700 capitalize text-sm">
                                                                {status === DriverStatus.AVAILABLE ? 'Disponível' : status === DriverStatus.BUSY ? 'Ocupado' : 'Offline'}
                                                            </span>
                                                            {selectedDriver.status === status && <span className="material-icons text-blue-500 text-sm">check_circle</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Subscription Management (NOVO) */}
                                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 xl:col-span-2">
                                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                    <span className="material-icons text-sm text-yellow-600">monetization_on</span>
                                                    Gerenciar Assinatura (Plano)
                                                </h3>

                                                <div className="flex flex-col md:flex-row gap-6 items-center">
                                                    <div className="flex-1 text-center md:text-left w-full">
                                                        {(() => {
                                                            const sub = checkSubscriptionStatus(selectedDriver.subscription_expires_at);
                                                            return (
                                                                <div className={`p-4 rounded-lg border-l-4 ${sub.isValid ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                                                                    <div className="text-sm font-bold text-gray-600 mb-1">Status Atual</div>
                                                                    <div className={`text-2xl font-bold ${sub.isValid ? 'text-green-700' : 'text-red-700'}`}>
                                                                        {sub.isValid ? 'ATIVO' : 'VENCIDO'}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        {sub.isValid
                                                                            ? `Vence em: ${new Date(selectedDriver.subscription_expires_at || '').toLocaleDateString()} (${sub.daysLeft} dias restantes)`
                                                                            : 'Motorista sem acesso ao app.'}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="flex gap-2 flex-wrap justify-center w-full md:w-auto">
                                                        <button onClick={() => handleAddDays(1)} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200">+1 Dia</button>
                                                        <button onClick={() => handleAddDays(7)} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200">+7 Dias</button>
                                                        <button onClick={() => handleAddDays(30)} className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold border border-blue-200">+30 Dias</button>
                                                        <button onClick={handleRemoveAccess} className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold border border-red-200 flex items-center gap-1">
                                                            <span className="material-icons text-xs">block</span> Remover Acesso
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Vehicle Form & Password Reset */}
                                            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 xl:col-span-2">
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Dados do Veículo & Acesso</h3>
                                                    <span className="material-icons text-gray-300">directions_car</span>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="md:col-span-2">
                                                        <label className="block text-xs text-gray-500 mb-1">Nome do Motorista</label>
                                                        <input
                                                            type="text"
                                                            value={driverName}
                                                            onChange={e => setDriverName(e.target.value)}
                                                            placeholder="Nome completo"
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none bg-white text-gray-900"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Tipo de Veículo</label>
                                                        <select
                                                            value={vehicleForm.type}
                                                            onChange={e => setVehicleForm({ ...vehicleForm, type: e.target.value as any })}
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none bg-white text-gray-900"
                                                        >
                                                            <option value="car">Carro</option>
                                                            <option value="motorcycle">Moto</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Modelo</label>
                                                        <input
                                                            type="text"
                                                            value={vehicleForm.model}
                                                            onChange={e => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                                                            placeholder="Ex: Toyota Corolla"
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Placa</label>
                                                        <input
                                                            type="text"
                                                            value={vehicleForm.plate}
                                                            onChange={e => setVehicleForm({ ...vehicleForm, plate: e.target.value })}
                                                            placeholder="ABC-1234"
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none uppercase text-gray-900"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Cor</label>
                                                        <input
                                                            type="text"
                                                            value={vehicleForm.color}
                                                            onChange={e => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                                                            placeholder="Ex: Prata"
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">Telefone Principal</label>
                                                        <input
                                                            type="text"
                                                            value={vehicleForm.phone}
                                                            onChange={e => setVehicleForm({ ...vehicleForm, phone: e.target.value })}
                                                            placeholder="5588999999999"
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-500 mb-1">WhatsApp</label>
                                                        <input
                                                            type="text"
                                                            value={vehicleForm.whatsapp}
                                                            onChange={e => setVehicleForm({ ...vehicleForm, whatsapp: e.target.value })}
                                                            placeholder="5588999999999"
                                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                        />
                                                    </div>

                                                    {/* NOVO: Dados de Saque e PIX */}
                                                    <div className="md:col-span-2 border-t pt-4 mt-2">
                                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Dados de Recebimento (PIX)</h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">Chave PIX</label>
                                                                <input
                                                                    type="text"
                                                                    value={vehicleForm.pix_key}
                                                                    onChange={e => setVehicleForm({ ...vehicleForm, pix_key: e.target.value })}
                                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                                    placeholder="CPF, E-mail, Celular ou Aleatória"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">CPF</label>
                                                                <input
                                                                    type="text"
                                                                    value={vehicleForm.cpf}
                                                                    onChange={e => setVehicleForm({ ...vehicleForm, cpf: e.target.value })}
                                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                                    placeholder="000.000.000-00"
                                                                />
                                                            </div>
                                                            <div className="md:col-span-2">
                                                                <label className="block text-xs text-gray-500 mb-1">E-mail para Contato</label>
                                                                <input
                                                                    type="email"
                                                                    value={vehicleForm.email}
                                                                    onChange={e => setVehicleForm({ ...vehicleForm, email: e.target.value })}
                                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                                    placeholder="email@exemplo.com"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* NOVO: Endereço */}
                                                    <div className="md:col-span-2 border-t pt-4 mt-2">
                                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Endereço do Motorista</h4>
                                                        <div className="grid grid-cols-3 gap-4">
                                                            <div className="col-span-2">
                                                                <label className="block text-xs text-gray-500 mb-1">Logradouro (Rua/Av)</label>
                                                                <input
                                                                    type="text"
                                                                    value={vehicleForm.address_street}
                                                                    onChange={e => setVehicleForm({ ...vehicleForm, address_street: e.target.value })}
                                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">Número</label>
                                                                <input
                                                                    type="text"
                                                                    value={vehicleForm.address_number}
                                                                    onChange={e => setVehicleForm({ ...vehicleForm, address_number: e.target.value })}
                                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">Bairro</label>
                                                                <input
                                                                    type="text"
                                                                    value={vehicleForm.address_neighborhood}
                                                                    onChange={e => setVehicleForm({ ...vehicleForm, address_neighborhood: e.target.value })}
                                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">Cidade</label>
                                                                <input
                                                                    type="text"
                                                                    value={vehicleForm.address_city}
                                                                    onChange={e => setVehicleForm({ ...vehicleForm, address_city: e.target.value })}
                                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs text-gray-500 mb-1">CEP</label>
                                                                <input
                                                                    type="text"
                                                                    value={vehicleForm.address_zip}
                                                                    onChange={e => setVehicleForm({ ...vehicleForm, address_zip: e.target.value })}
                                                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 ring-whatsapp-green/20 outline-none text-gray-900"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Password Field - HIGHLIGHTED */}
                                                    <div className="md:col-span-2 border-t pt-4 mt-2 bg-yellow-50 p-4 rounded-lg border-yellow-200">
                                                        <label className="block text-xs font-bold text-yellow-800 mb-1 flex items-center gap-1">
                                                            <span className="material-icons text-sm">lock_reset</span> Redefinir Senha do Motorista
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                value={newPassword}
                                                                onChange={e => setNewPassword(e.target.value)}
                                                                placeholder="Digite a Nova Senha aqui..."
                                                                className="flex-1 p-2 border border-yellow-300 rounded-lg text-sm focus:ring-2 ring-yellow-500/20 outline-none text-gray-900 bg-white"
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-yellow-700 mt-1">
                                                            Deixe em branco se não quiser alterar. O motorista usará esta senha no próximo login.
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="mt-4 text-right">
                                                    <button
                                                        onClick={handleUpdateVehicle}
                                                        disabled={isSavingVehicle}
                                                        className="bg-whatsapp-green text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-600 transition flex items-center gap-2 ml-auto shadow-sm"
                                                    >
                                                        {isSavingVehicle ? 'Salvando...' : 'Salvar Alterações'}
                                                        {!isSavingVehicle && <span className="material-icons text-sm">save</span>}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'map' && (
                                    <div className="h-full w-full rounded-xl overflow-hidden shadow-sm border border-gray-300 bg-gray-200 relative">
                                        <div ref={mapContainerRef} className="absolute inset-0 z-0"></div>
                                        <div className="absolute top-4 right-4 z-[400] bg-white p-2 rounded-lg shadow-lg">
                                            <div className="text-xs text-gray-500 mb-1">Atualizado há instantes</div>
                                            <div className="font-mono text-sm">Lat: {driverLocation?.lat.toFixed(4)}</div>
                                            <div className="font-mono text-sm">Lng: {driverLocation?.lng.toFixed(4)}</div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'history' && (
                                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
                                        <table className="w-full text-left min-w-[500px]">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Tipo</th>
                                                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Cliente</th>
                                                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Duração</th>
                                                    <th className="p-4 text-xs font-bold text-gray-500 uppercase">Horário</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {callHistory.map(call => (
                                                    <tr key={call.id} className="hover:bg-gray-50 transition">
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`material-icons text-sm ${call.status === 'missed' ? 'text-red-500' :
                                                                    call.direction === 'incoming' ? 'text-green-500' : 'text-blue-500'
                                                                    }`}>
                                                                    {call.status === 'missed' ? 'call_missed' :
                                                                        call.direction === 'incoming' ? 'call_received' : 'call_made'}
                                                                </span>
                                                                <span className="text-sm text-gray-700 capitalize">{call.status === 'missed' ? 'Perdida' : call.direction === 'incoming' ? 'Recebida' : 'Efetuada'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-sm text-gray-800">{call.clientName}</td>
                                                        <td className="p-4 text-sm text-gray-600 font-mono">{call.duration > 0 ? formatDuration(call.duration) : '--'}</td>
                                                        <td className="p-4 text-sm text-gray-500">{new Date(call.timestamp).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'banners' ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <span className="material-icons text-orange-600">image</span> Gerenciar Banners da Dashboard
                            </h2>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                                <h3 className="font-bold text-gray-700 mb-4">Adicionar Novo Banner</h3>

                                {/* Resolution Tip */}
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                                    <div className="flex items-start gap-2">
                                        <span className="material-icons text-orange-600 text-sm mt-0.5">lightbulb</span>
                                        <div>
                                            <p className="text-xs font-bold text-orange-800">Dica de Resolução Recomendada:</p>
                                            <p className="text-xs text-orange-700">
                                                📐 <strong>1200 x 400 pixels</strong> (proporção 3:1) - Ideal para banners horizontais<br />
                                                📱 Formato: <strong>JPG, PNG ou WebP</strong> (máx. 2MB)<br />
                                                🎨 Use imagens de alta qualidade para melhor visualização no app
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* File Upload */}
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">📁 Enviar Arquivo Local</label>
                                        <input
                                            id="banner-file-input"
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/jpg"
                                            className="w-full p-2 border rounded-lg text-sm text-gray-900 bg-gray-50 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-100 file:text-orange-700 hover:file:bg-orange-200 cursor-pointer"
                                            onChange={e => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    // Check file size (max 2MB)
                                                    if (file.size > 2 * 1024 * 1024) {
                                                        alert("Arquivo muito grande! Máximo 2MB.");
                                                        e.target.value = '';
                                                        return;
                                                    }
                                                    setBannerFile(file);
                                                    setNewBannerUrl(''); // Clear URL if file is selected
                                                }
                                            }}
                                            disabled={isUploadingBanner}
                                        />
                                        {bannerFile && (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-green-600">
                                                <span className="material-icons text-sm">check_circle</span>
                                                Arquivo selecionado: {bannerFile.name}
                                            </div>
                                        )}
                                    </div>

                                    {/* OR Divider */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 border-t border-gray-200"></div>
                                        <span className="text-xs text-gray-400 font-medium">OU</span>
                                        <div className="flex-1 border-t border-gray-200"></div>
                                    </div>

                                    {/* URL Input */}
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">🔗 URL da Imagem (Link Externo)</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border rounded-lg text-sm text-gray-900"
                                            placeholder="https://exemplo.com/imagem.jpg"
                                            value={newBannerUrl}
                                            onChange={e => {
                                                setNewBannerUrl(e.target.value);
                                                if (e.target.value) {
                                                    setBannerFile(null); // Clear file if URL is entered
                                                    const fileInput = document.getElementById('banner-file-input') as HTMLInputElement;
                                                    if (fileInput) fileInput.value = '';
                                                }
                                            }}
                                            disabled={isUploadingBanner}
                                        />
                                    </div>

                                    {/* Link URL */}
                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">🎯 URL de Destino (Opcional)</label>
                                        <input
                                            type="text"
                                            className="w-full p-2 border rounded-lg text-sm text-gray-900"
                                            placeholder="https://exemplo.com/promocao"
                                            value={newBannerLink}
                                            onChange={e => setNewBannerLink(e.target.value)}
                                            disabled={isUploadingBanner}
                                        />
                                        <p className="text-[10px] text-gray-400 mt-1">Link que abrirá quando o cliente clicar no banner</p>
                                    </div>

                                    {/* Submit Button */}
                                    <button
                                        onClick={handleAddBanner}
                                        disabled={isUploadingBanner || (!newBannerUrl.trim() && !bannerFile)}
                                        className={`w-full py-3 font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 ${isUploadingBanner || (!newBannerUrl.trim() && !bannerFile)
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                                            }`}
                                    >
                                        {isUploadingBanner ? (
                                            <>
                                                <span className="material-icons animate-spin text-sm">refresh</span>
                                                Enviando...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-icons text-sm">add_photo_alternate</span>
                                                Adicionar Banner
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-700">Banners Ativos</h3>
                                {isBannersLoading ? (
                                    <div className="text-center py-8">Carregando Banners...</div>
                                ) : banners.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">Nenhum banner cadastrado.</div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {banners.map(banner => (
                                            <div key={banner.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                                                <img src={banner.image_url} className="w-full h-32 object-cover" alt="Banner" />
                                                <div className="p-3 flex justify-between items-center">
                                                    <div className="truncate pr-4 flex-1">
                                                        <p className="text-xs text-gray-500 truncate">{banner.link_url || 'Sem link'}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteBanner(banner.id)}
                                                        className="text-red-500 hover:bg-red-50 p-2 rounded-lg"
                                                    >
                                                        <span className="material-icons text-sm">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'coupons' ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <span className="material-icons text-pink-600">confirmation_number</span> Gerenciar Cupons de Desconto
                            </h2>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                                <h3 className="font-bold text-gray-700 mb-4">Criar Novo Cupom</h3>
                                <form onSubmit={handleCreateCoupon} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Valor do Desconto (R$)</label>
                                            <input
                                                type="number"
                                                required
                                                className="w-full p-2 border rounded-lg text-sm"
                                                value={couponForm.discount_value}
                                                onChange={e => setCouponForm({ ...couponForm, discount_value: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Quantidade Total</label>
                                            <input
                                                type="number"
                                                required
                                                className="w-full p-2 border rounded-lg text-sm"
                                                value={couponForm.total_quantity}
                                                onChange={e => setCouponForm({ ...couponForm, total_quantity: parseInt(e.target.value) })}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Tipo de Veículo Aplicável</label>
                                        <select
                                            className="w-full p-2 border rounded-lg text-sm"
                                            value={couponForm.vehicle_type}
                                            onChange={e => setCouponForm({ ...couponForm, vehicle_type: e.target.value as any })}
                                        >
                                            <option value="all">Todos</option>
                                            <option value="car">Carro</option>
                                            <option value="motorcycle">Moto</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-gray-500 mb-1">Imagem do Cupom (Opcional)</label>
                                        <input
                                            type="file"
                                            className="w-full p-2 border rounded-lg text-sm"
                                            onChange={e => setCouponFile(e.target.files?.[0] || null)}
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isCreatingCoupon}
                                        className="w-full bg-pink-600 hover:bg-pink-700 text-white py-3 rounded-lg font-bold shadow-lg transition active:scale-95 disabled:bg-gray-400"
                                    >
                                        {isCreatingCoupon ? 'Criando...' : 'Criar Cupom'}
                                    </button>
                                </form>
                            </div>

                            <div className="space-y-4">
                                <h3 className="font-bold text-gray-700">Cupons Ativos</h3>
                                {isCouponsLoading ? (
                                    <div className="text-center py-8">Carregando Cupons...</div>
                                ) : coupons.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">Nenhum cupom cadastrado.</div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {coupons.map(coupon => (
                                            <div key={coupon.id} className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col">
                                                <div className="h-24 bg-gray-100 relative">
                                                    <img src={coupon.image_url || 'https://via.placeholder.com/400x150?text=Cupom'} className="w-full h-full object-cover" />
                                                    <div className="absolute top-2 right-2 bg-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                                                        R$ {coupon.discount_value} OFF
                                                    </div>
                                                </div>
                                                <div className="p-3 flex justify-between items-center">
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-800">Uso: {coupon.used_quantity}/{coupon.total_quantity}</p>
                                                        <p className="text-[10px] text-gray-500 capitalize">Tipo: {coupon.vehicle_type === 'all' ? 'Todos' : coupon.vehicle_type}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteCoupon(coupon.id)}
                                                        className="text-red-500 hover:bg-red-50 p-2 rounded-lg"
                                                    >
                                                        <span className="material-icons text-sm">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'central' ? (
                        <div className="max-w-4xl mx-auto p-4 md:p-8">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <span className="material-icons text-red-600">phone_in_talk</span> Central de Despacho
                            </h2>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8">
                                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                                    <span className="material-icons text-sm text-gray-500">person_add</span>
                                    Dados do Cliente
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <input
                                        type="text"
                                        placeholder="Nome do Cliente *"
                                        value={dispatchClientName}
                                        onChange={(e) => setDispatchClientName(e.target.value)}
                                        className="w-full p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 ring-red-500/50 text-gray-900 placeholder-gray-500"
                                    />
                                    <input
                                        type="tel"
                                        placeholder="Telefone (opcional)"
                                        value={dispatchClientPhone}
                                        onChange={(e) => setDispatchClientPhone(e.target.value)}
                                        className="w-full p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 ring-red-500/50 text-gray-900 placeholder-gray-500"
                                    />
                                </div>

                                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                                    <span className="material-icons text-sm text-green-600">place</span>
                                    Origem (Endereço de Busca)
                                </h3>
                                <div className="relative mb-6">
                                    <span className="material-icons absolute left-3 top-3 text-green-600 z-10">my_location</span>
                                    <AddressAutocompleteInput
                                        value={dispatchOriginAddress}
                                        onChangeText={(text) => { setDispatchOriginAddress(text); setDispatchOriginCoords(null); setDispatchPrice(null); }}
                                        onSelectPlace={(place) => { setDispatchOriginAddress(place.address); setDispatchOriginCoords({ lat: place.lat, lng: place.lng }); setDispatchPrice(null); }}
                                        placeholder="Digite o endereço de busca..."
                                        variant="light"
                                        inputClassName="w-full pl-10 p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 ring-green-500/50 text-gray-900 placeholder-gray-500"
                                    />
                                    {dispatchOriginCoords && (
                                        <span className="absolute right-3 top-3 text-green-500 text-xs">✓</span>
                                    )}
                                </div>

                                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                                    <span className="material-icons text-sm text-blue-600">flag</span>
                                    Destino (Endereço de Entrega)
                                </h3>
                                <div className="relative mb-6">
                                    <span className="material-icons absolute left-3 top-3 text-red-500 z-10">location_on</span>
                                    <AddressAutocompleteInput
                                        value={dispatchDestAddress}
                                        onChangeText={(text) => { setDispatchDestAddress(text); setDispatchDestCoords(null); setDispatchPrice(null); }}
                                        onSelectPlace={(place) => { setDispatchDestAddress(place.address); setDispatchDestCoords({ lat: place.lat, lng: place.lng }); setDispatchPrice(null); }}
                                        placeholder="Digite o endereço de destino..."
                                        variant="light"
                                        inputClassName="w-full pl-10 p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 ring-blue-500/50 text-gray-900 placeholder-gray-500"
                                    />
                                    {dispatchDestCoords && (
                                        <span className="absolute right-3 top-3 text-green-500 text-xs">✓</span>
                                    )}
                                </div>

                                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                                    <span className="material-icons text-sm text-orange-600">directions_car</span>
                                    Tipo de Veículo
                                </h3>
                                <div className="flex gap-4 mb-6">
                                    <button
                                        onClick={() => setDispatchVehicleType('car')}
                                        className={`flex-1 p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition ${dispatchVehicleType === 'car' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                    >
                                        <span className="material-icons text-3xl">directions_car</span>
                                        <span className="font-bold">Carro</span>
                                    </button>
                                    <button
                                        onClick={() => setDispatchVehicleType('motorcycle')}
                                        className={`flex-1 p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition ${dispatchVehicleType === 'motorcycle' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                    >
                                        <span className="material-icons text-3xl">two_wheeler</span>
                                        <span className="font-bold">Moto</span>
                                    </button>
                                </div>

                                {/* Driver Selection */}
                                <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                                    <span className="material-icons text-sm text-purple-600">person</span>
                                    Motoristas Disponíveis ({availableDrivers.length})
                                </h3>
                                {isLoadingDrivers ? (
                                    <div className="text-center py-4 text-gray-400">Carregando motoristas...</div>
                                ) : availableDrivers.length === 0 ? (
                                    <div className="text-center py-6 bg-gray-50 rounded-xl border border-dashed border-gray-300 mb-6">
                                        <span className="material-icons text-4xl text-gray-300 mb-2">no_accounts</span>
                                        <p className="text-gray-500">Nenhum motorista online para {dispatchVehicleType === 'car' ? 'Carro' : 'Moto'}</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6 max-h-[200px] overflow-y-auto">
                                        {availableDrivers.map(d => (
                                            <div
                                                key={d.id}
                                                onClick={() => setSelectedDriverId(selectedDriverId === d.id ? null : d.id)}
                                                className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${selectedDriverId === d.id
                                                    ? 'border-purple-500 bg-purple-50'
                                                    : 'border-gray-200 hover:bg-gray-50'
                                                    }`}
                                            >
                                                <img
                                                    src={d.avatar_url || 'https://via.placeholder.com/40'}
                                                    alt={d.username}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-gray-800 truncate">{d.username}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {d.vehicle_model} - {d.vehicle_plate}
                                                    </p>
                                                </div>
                                                {selectedDriverId === d.id && (
                                                    <span className="material-icons text-purple-600">check_circle</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-gray-400 mb-6">
                                    {selectedDriverId ? '✓ Motorista selecionado' : 'Selecione um motorista ou deixe em branco para automático'}
                                </p>

                                {/* Calculate Price Button */}
                                <button
                                    onClick={() => {
                                        setDispatchPrice(null);
                                        calculateDispatchPrice();
                                    }}
                                    disabled={!dispatchOriginCoords || !dispatchDestCoords || isCalculatingPrice}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isCalculatingPrice ? (
                                        <>
                                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                            Calculando...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-icons">calculate</span>
                                            Calcular Valor da Corrida
                                        </>
                                    )}
                                </button>

                                {/* Price Display Card */}
                                {dispatchPrice && (
                                    <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6 rounded-xl mb-6 shadow-lg animate-fade-in">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-green-100 text-xs uppercase tracking-wider mb-1">Valor Estimado</p>
                                                <div className="text-4xl font-bold">
                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dispatchPrice.price)}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold">{dispatchPrice.distanceKm.toFixed(1)} km</p>
                                                <p className="text-green-100 text-sm">{Math.ceil(dispatchPrice.durationMin)} min</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {dispatchResult && (
                                    <div className={`p-4 rounded-lg mb-6 ${dispatchResult.success ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
                                        <div className="flex items-center gap-2">
                                            <span className="material-icons">{dispatchResult.success ? 'check_circle' : 'error'}</span>
                                            <span className="font-bold">{dispatchResult.message}</span>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={async () => {
                                        if (!dispatchClientName.trim()) {
                                            alert('Por favor, informe o nome do cliente.');
                                            return;
                                        }
                                        if (!dispatchOriginCoords || !dispatchDestCoords) {
                                            alert('Por favor, selecione os endereços da lista de sugestões.');
                                            return;
                                        }
                                        if (!dispatchPrice) {
                                            alert('Por favor, calcule o valor da corrida primeiro.');
                                            return;
                                        }

                                        setIsDispatchLoading(true);
                                        setDispatchResult(null);

                                        const result = await createDispatchRide({
                                            clientName: dispatchClientName,
                                            clientPhone: dispatchClientPhone || undefined,
                                            originAddress: dispatchOriginAddress,
                                            originLat: dispatchOriginCoords.lat,
                                            originLng: dispatchOriginCoords.lng,
                                            destinationAddress: dispatchDestAddress,
                                            destinationLat: dispatchDestCoords.lat,
                                            destinationLng: dispatchDestCoords.lng,
                                            vehicleType: dispatchVehicleType,
                                            estimatedPrice: dispatchPrice.price,
                                            selectedDriverId: selectedDriverId || undefined
                                        });

                                        if (result.ride) {
                                            setDispatchResult({
                                                success: true,
                                                message: `Corrida despachada com sucesso para ${result.ride.driver?.username || 'motorista'}!`
                                            });

                                            // Enviar notificação push para o motorista selecionado/automático
                                            if (result.ride.driver_id) {
                                                sendNotification(
                                                    "Nova Corrida (Central) ☎️",
                                                    `Você recebeu uma corrida da central!\nOrigem: ${dispatchOriginAddress}`,
                                                    'user',
                                                    {
                                                        targetUserId: result.ride.driver_id,
                                                        sound: 'ubb', // Som especial
                                                        data: {
                                                            type: 'new_ride',
                                                            ride_id: result.ride.id
                                                        }
                                                    }
                                                ).catch(err => console.error("Erro ao notificar despacho:", err));
                                            }

                                            // Limpar formulário
                                            setDispatchClientName('');
                                            setDispatchClientPhone('');
                                            setDispatchOriginAddress('');
                                            setDispatchDestAddress('');
                                            setDispatchOriginCoords(null);
                                            setDispatchDestCoords(null);
                                            setDispatchPrice(null);
                                            setSelectedDriverId(null);
                                            // Refresh data
                                            loadDispatchHistory();
                                            loadAvailableDrivers(dispatchVehicleType);
                                        } else {
                                            setDispatchResult({
                                                success: false,
                                                message: result.message || 'Erro desconhecido ao despachar corrida.'
                                            });
                                        }

                                        setIsDispatchLoading(false);
                                    }}
                                    disabled={isDispatchLoading}
                                    className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isDispatchLoading ? (
                                        <>
                                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                            Buscando motorista...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-icons">send</span>
                                            Despachar Corrida
                                        </>
                                    )}
                                </button>

                                <p className="text-xs text-gray-400 text-center mt-4">
                                    {selectedDriverId
                                        ? 'A corrida será enviada para o motorista selecionado'
                                        : 'O sistema irá automaticamente encontrar um motorista online'}
                                </p>
                            </div>

                            {/* Dispatch History */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                        <span className="material-icons text-sm text-gray-500">history</span>
                                        Histórico de Corridas Despachadas
                                    </h3>
                                    <button
                                        onClick={loadDispatchHistory}
                                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                    >
                                        <span className="material-icons text-xs">refresh</span>
                                        Atualizar
                                    </button>
                                </div>

                                {isLoadingHistory ? (
                                    <div className="text-center py-8 text-gray-400">Carregando histórico...</div>
                                ) : dispatchHistory.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <span className="material-icons text-4xl text-gray-300 mb-2">inbox</span>
                                        <p>Nenhuma corrida despachada ainda</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                                        {dispatchHistory.map(ride => (
                                            <div key={ride.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${ride.status === 'finished' ? 'bg-green-100 text-green-700' :
                                                            ride.status === 'accepted' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                                                ride.status === 'en_route' || ride.status === 'arrived' || ride.status === 'started' || ride.status === 'waiting_payment' ? 'bg-orange-100 text-orange-700' :
                                                                    ride.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                                                        'bg-gray-100 text-gray-600'
                                                            }`}>
                                                            {ride.status === 'finished' ? '✓ Finalizada' :
                                                                ride.status === 'accepted' ? '📤 Enviada' :
                                                                    ride.status === 'en_route' ? '🚗 A Caminho' :
                                                                        ride.status === 'arrived' ? '📍 No Local' :
                                                                            ride.status === 'started' ? '🚗 Em Corrida' :
                                                                                ride.status === 'waiting_payment' ? '💰 Aguardando Pagamento' :
                                                                                    ride.status === 'cancelled' ? '✗ Cancelada' :
                                                                                        ride.status}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                            {new Date(ride.created_at).toLocaleString('pt-BR', {
                                                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                                                            })}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm font-bold text-gray-800 truncate">
                                                        {ride.driver?.username || 'Motorista'}
                                                    </p>
                                                    <p className="text-xs text-gray-500 truncate">
                                                        {ride.origin_address?.split('(Cliente:')[0]}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        → {ride.destination_address}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-lg font-bold text-green-600">
                                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ride.estimated_price || 0)}
                                                    </p>
                                                    {(ride.status === 'accepted' || ride.status === 'in_progress') && (
                                                        <button
                                                            onClick={() => cancelDispatchRide(ride.id, ride.driver_id)}
                                                            className="text-xs text-red-500 hover:text-red-700 mt-1 flex items-center gap-1"
                                                        >
                                                            <span className="material-icons text-xs">cancel</span>
                                                            Cancelar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'wallets' ? (
                        <div className="h-full">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <AdminWalletManager />
                        </div>
                    ) : activeTab === 'drivers' && !selectedDriver ? (
                        <div className="flex flex-col p-4 md:p-8 bg-white min-h-screen">
                            {/* Mobile Back Button */}
                            <div className="md:hidden bg-white p-2 border-b flex items-center shadow-sm mb-4 sticky top-0 z-10">
                                <button onClick={handleBackToList} className="p-2 mr-2 rounded-full hover:bg-gray-100 flex items-center gap-2">
                                    <span className="material-icons text-gray-600">arrow_back</span>
                                    <span className="font-bold text-gray-700">Voltar ao Menu</span>
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <span className="material-icons text-blue-600">group</span> Gestão de Motoristas
                                <span className="text-sm font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{drivers.length} Cadastrados</span>
                            </h2>

                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-50 border-b border-gray-100">
                                            <tr>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Motorista</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Status</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Veículo</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Assinatura</th>
                                                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right whitespace-nowrap">Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {drivers.map(driver => {
                                                const sub = checkSubscriptionStatus(driver.subscription_expires_at);
                                                return (
                                                    <tr key={driver.id} className="hover:bg-gray-50 transition-colors group">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <img src={driver.avatar_url || 'https://via.placeholder.com/40'} className="w-10 h-10 rounded-full object-cover shadow-sm" alt="" />
                                                                <div>
                                                                    <div className="font-bold text-gray-800 truncate max-w-[120px] md:max-w-none">{driver.username}</div>
                                                                    <div className="text-[10px] text-gray-400">{driver.phone || 'Sem telefone'}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col gap-1">
                                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full w-fit uppercase ${driver.status === 'available' ? 'bg-green-100 text-green-700' :
                                                                    driver.status === 'busy' ? (driversWithActiveRide.has(driver.id) ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700') :
                                                                        'bg-gray-100 text-gray-500'
                                                                    }`}>
                                                                    {getDriverStatusLabel(driver)}
                                                                </span>
                                                                {!driver.is_approved && (
                                                                    <span className="text-[10px] text-yellow-600 font-bold italic">Aguardando Aprovação</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="text-xs">
                                                                <div className="font-bold text-gray-700 truncate max-w-[150px]">{driver.vehicle_model || 'Não info.'}</div>
                                                                <div className="text-gray-400 bg-gray-100 px-1 rounded inline-block font-mono mt-1 uppercase text-[10px]">{driver.vehicle_plate || 'SEM PLACA'}</div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            {sub.isValid ? (
                                                                <div className="text-xs text-green-600 font-bold flex items-center gap-1">
                                                                    <span className="material-icons text-xs">verified</span>
                                                                    {sub.daysLeft} dias
                                                                </div>
                                                            ) : (
                                                                <div className="text-xs text-red-500 font-bold flex items-center gap-1">
                                                                    <span className="material-icons text-xs">error_outline</span>
                                                                    Expirado
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <button
                                                                onClick={() => { setSelectedDriver(driver); setActiveTab('details'); }}
                                                                className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all shadow-sm"
                                                                title="Ver Detalhes"
                                                            >
                                                                <span className="material-icons text-sm">visibility</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'rides' ? (
                        <div className="max-w-6xl mx-auto md:p-8 p-0">
                            {/* Mobile Header - Sticky */}
                            <div className="md:hidden bg-white/80 backdrop-blur-md p-4 border-b flex items-center justify-between shadow-sm sticky top-0 z-30">
                                <button onClick={handleBackToList} className="p-2 -ml-2 rounded-full hover:bg-gray-100 flex items-center gap-2 transition active:scale-90">
                                    <span className="material-icons text-gray-800">arrow_back</span>
                                    <span className="font-bold text-gray-800">Voltar ao Menu</span>
                                </button>
                                <button onClick={loadAllRides} className="p-2 rounded-full hover:bg-gray-100 text-indigo-600 transition active:rotate-180">
                                    <span className={`material-icons ${isRidesLoading ? 'animate-spin' : ''}`}>refresh</span>
                                </button>
                            </div>

                            {/* Desktop Header */}
                            <div className="hidden md:flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 px-4 md:px-0">
                                <div>
                                    <h2 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                                        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                                            <span className="material-icons text-white text-2xl">assessment</span>
                                        </div>
                                        Central de Corridas
                                    </h2>
                                    <p className="text-gray-500 font-medium mt-1">Visão analítica de toda a operação de hoje</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={loadAllRides}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition shadow-sm"
                                    >
                                        <span className={`material-icons text-sm ${isRidesLoading ? 'animate-spin' : ''}`}>refresh</span>
                                        Atualizar
                                    </button>
                                </div>
                            </div>

                            {/* Filters Bar - Responsive */}
                            <div className="px-4 mb-6 md:px-0 overflow-x-auto no-scrollbar py-2">
                                <div className="flex gap-2 min-w-max">
                                    <button
                                        onClick={() => setRideFilter('all')}
                                        className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all shadow-sm flex items-center gap-2 ${rideFilter === 'all' ? 'bg-indigo-600 text-white shadow-indigo-200 ring-4 ring-indigo-50' : 'bg-white text-gray-600 border border-gray-100 hover:border-indigo-200'}`}
                                    >
                                        Todas <span className={`px-2 py-0.5 rounded-full text-[10px] ${rideFilter === 'all' ? 'bg-white/20' : 'bg-gray-100'}`}>{allRides.length}</span>
                                    </button>
                                    <button
                                        onClick={() => setRideFilter('completed')}
                                        className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all shadow-sm flex items-center gap-2 ${rideFilter === 'completed' ? 'bg-emerald-600 text-white shadow-emerald-200 ring-4 ring-emerald-50' : 'bg-white text-gray-600 border border-gray-100 hover:border-emerald-200'}`}
                                    >
                                        Concluídas <span className={`px-2 py-0.5 rounded-full text-[10px] ${rideFilter === 'completed' ? 'bg-white/20' : 'bg-gray-100'}`}>{allRides.filter(r => r.status === 'finished').length}</span>
                                    </button>
                                    <button
                                        onClick={() => setRideFilter('pending')}
                                        className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all shadow-sm flex items-center gap-2 ${rideFilter === 'pending' ? 'bg-amber-500 text-white shadow-amber-200 ring-4 ring-amber-50' : 'bg-white text-gray-600 border border-gray-100 hover:border-amber-200'}`}
                                    >
                                        Ativas <span className={`px-2 py-0.5 rounded-full text-[10px] ${rideFilter === 'pending' ? 'bg-white/20' : 'bg-gray-100'}`}>{allRides.filter(r => ['searching', 'accepted', 'en_route', 'arrived', 'started', 'waiting_payment'].includes(r.status)).length}</span>
                                    </button>
                                    <button
                                        onClick={() => setRideFilter('cancelled')}
                                        className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all shadow-sm flex items-center gap-2 ${rideFilter === 'cancelled' ? 'bg-rose-600 text-white shadow-rose-200 ring-4 ring-rose-50' : 'bg-white text-gray-600 border border-gray-100 hover:border-rose-200'}`}
                                    >
                                        Canceladas <span className={`px-2 py-0.5 rounded-full text-[10px] ${rideFilter === 'cancelled' ? 'bg-white/20' : 'bg-gray-100'}`}>{allRides.filter(r => r.status === 'cancelled').length}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Dashboard Metrics - Premium Design */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-8 px-4 md:px-0">
                                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 p-5 rounded-3xl shadow-xl shadow-indigo-100 relative overflow-hidden group">
                                    <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition duration-500">
                                        <span className="material-icons text-8xl text-white">payments</span>
                                    </div>
                                    <p className="text-[10px] text-indigo-100 font-black uppercase tracking-widest mb-1">Faturamento</p>
                                    <p className="text-xl md:text-2xl font-black text-white">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                            allRides.filter(r => r.status === 'finished').reduce((acc, curr) => acc + (curr.final_price || curr.estimated_price || 0), 0)
                                        )}
                                    </p>
                                </div>
                                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden group">
                                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition duration-500">
                                        <span className="material-icons text-8xl text-emerald-600">map</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Km Rodados</p>
                                    <p className="text-xl md:text-2xl font-black text-gray-800">
                                        {allRides.filter(r => r.status === 'finished').reduce((acc, curr) => acc + (curr.distance_km || 0), 0).toFixed(1)} <span className="text-sm font-medium text-gray-400">km</span>
                                    </p>
                                </div>
                                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden group">
                                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition duration-500">
                                        <span className="material-icons text-8xl text-amber-500">schedule</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Média Duração</p>
                                    <p className="text-xl md:text-2xl font-black text-gray-800">
                                        {Math.round(allRides.filter(r => r.status === 'finished').length > 0
                                            ? allRides.filter(r => r.status === 'finished').reduce((acc, curr) => acc + (curr.estimated_time || 0), 0) / allRides.filter(r => r.status === 'finished').length
                                            : 0)} <span className="text-sm font-medium text-gray-400">min</span>
                                    </p>
                                </div>
                                <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/50 relative overflow-hidden group">
                                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition duration-500">
                                        <span className="material-icons text-8xl text-indigo-600">verified</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Taxa de Êxito</p>
                                    <p className="text-xl md:text-2xl font-black text-indigo-600">
                                        {allRides.length > 0
                                            ? Math.round((allRides.filter(r => r.status === 'finished').length / allRides.length) * 100)
                                            : 0}%
                                    </p>
                                </div>
                            </div>

                            {isRidesLoading ? (
                                <div className="text-center py-20">
                                    <div className="w-16 h-16 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6 shadow-xl shadow-indigo-100"></div>
                                    <p className="text-gray-500 font-black text-lg">Atualizando Sistema...</p>
                                </div>
                            ) : (
                                <div className="px-4 md:px-0">
                                    {/* Desktop Table View */}
                                    <div className="hidden md:block bg-white rounded-[2.5rem] shadow-2xl shadow-gray-200 border border-gray-100 overflow-hidden mb-12">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Horário</th>
                                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Envolvidos</th>
                                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status Corrente</th>
                                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Trajeto</th>
                                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Faturamento</th>
                                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Ação</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {allRides
                                                    .filter(r => {
                                                        if (rideFilter === 'all') return true;
                                                        if (rideFilter === 'completed') return r.status === 'finished';
                                                        if (rideFilter === 'cancelled') return r.status === 'cancelled';
                                                        if (rideFilter === 'pending') return ['searching', 'accepted', 'en_route', 'arrived', 'started', 'waiting_payment'].includes(r.status);
                                                        return true;
                                                    })
                                                    .map(ride => (
                                                        <tr key={ride.id} className="hover:bg-indigo-50/30 transition-colors group">
                                                            <td className="p-6">
                                                                <div className="bg-gray-100 px-3 py-1.5 rounded-xl inline-block">
                                                                    <p className="text-sm font-black text-gray-800">
                                                                        {new Date(ride.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                                    </p>
                                                                </div>
                                                            </td>
                                                            <td className="p-6">
                                                                <div className="flex flex-col gap-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border-2 border-white shadow-sm overflow-hidden ring-2 ring-gray-50">
                                                                            {ride.client?.avatar_url ? <img src={ride.client.avatar_url} className="w-full h-full object-cover" /> : <span className="text-[10px] font-bold">CL</span>}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <p className="text-xs font-black text-gray-800 truncate">{ride.client?.username || 'Cliente'}</p>
                                                                            <p className="text-[10px] text-gray-400 font-medium">Passageiro</p>
                                                                        </div>
                                                                    </div>
                                                                    {ride.driver && (
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center border-2 border-white shadow-sm overflow-hidden ring-2 ring-indigo-50">
                                                                                {ride.driver.avatar_url ? <img src={ride.driver.avatar_url} className="w-full h-full object-cover" /> : <span className="text-[10px] font-bold">DR</span>}
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <p className="text-xs font-black text-gray-800 truncate">{ride.driver.username}</p>
                                                                                <p className="text-[10px] text-indigo-400 font-bold uppercase">{ride.vehicle_type === 'car' ? '🚗' : '🏍️'} {ride.driver.vehicle_plate}</p>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="p-6">
                                                                <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-tighter ring-4 ${ride.status === 'finished' ? 'bg-emerald-100 text-emerald-700 ring-emerald-50' :
                                                                    ride.status === 'cancelled' ? 'bg-rose-100 text-rose-700 ring-rose-50' :
                                                                        ride.status === 'searching' ? 'bg-blue-100 text-blue-700 ring-blue-50' :
                                                                            'bg-amber-100 text-amber-700 ring-amber-50'
                                                                    }`}>
                                                                    {ride.status === 'finished' ? 'Finalizada' :
                                                                        ride.status === 'cancelled' ? 'Cancelada' :
                                                                            ride.status === 'searching' ? 'Buscando' :
                                                                                ride.status === 'accepted' ? 'Aceita' :
                                                                                    ride.status === 'en_route' ? 'Em Caminho' :
                                                                                        ride.status === 'arrived' ? 'No Local' :
                                                                                            ride.status === 'started' ? 'Em Curso' :
                                                                                                'Pgto Pendente'}
                                                                </span>
                                                            </td>
                                                            <td className="p-6 max-w-[250px]">
                                                                <div className="flex flex-col gap-2 relative">
                                                                    <div className="absolute left-1.5 top-2 bottom-2 w-0.5 bg-gray-100"></div>
                                                                    <div className="flex items-start gap-3 relative">
                                                                        <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-50 mt-1 shrink-0"></div>
                                                                        <p className="text-[11px] text-gray-600 line-clamp-1 italic">{ride.origin_address || 'Endereço de Origem'}</p>
                                                                    </div>
                                                                    <div className="flex items-start gap-3 relative">
                                                                        <div className="w-3 h-3 rounded-full bg-rose-500 ring-4 ring-rose-50 mt-1 shrink-0"></div>
                                                                        <p className="text-[11px] text-gray-900 font-bold line-clamp-1">{ride.destination_address || 'Destino Livre'}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-6 text-right">
                                                                <p className="text-lg font-black text-gray-900">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ride.final_price || ride.estimated_price || 0)}
                                                                </p>
                                                                <p className="text-[10px] text-gray-400 font-bold uppercase">{ride.payment_method || 'A Definir'}</p>
                                                            </td>
                                                            <td className="p-6">
                                                                <button
                                                                    onClick={() => {
                                                                        if (ride.driver) {
                                                                            handleDriverClick(ride.driver);
                                                                            setShowDetailMobile(true);
                                                                        }
                                                                    }}
                                                                    className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-sm hover:shadow-indigo-200"
                                                                >
                                                                    <span className="material-icons text-xl">person_search</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Card View */}
                                    <div className="md:hidden flex flex-col gap-4 pb-20">
                                        {allRides
                                            .filter(r => {
                                                if (rideFilter === 'all') return true;
                                                if (rideFilter === 'completed') return r.status === 'finished';
                                                if (rideFilter === 'cancelled') return r.status === 'cancelled';
                                                if (rideFilter === 'pending') return ['searching', 'accepted', 'en_route', 'arrived', 'started', 'waiting_payment'].includes(r.status);
                                                return true;
                                            })
                                            .map(ride => (
                                                <div key={ride.id} className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 flex flex-col gap-4 relative overflow-hidden active:scale-[0.98] transition">
                                                    {/* Status Indicator Bar */}
                                                    <div className={`absolute top-0 left-0 right-0 h-1.5 ${ride.status === 'finished' ? 'bg-emerald-500' : ride.status === 'cancelled' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>

                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center shadow-inner overflow-hidden border border-gray-100">
                                                                {ride.client?.avatar_url ? <img src={ride.client.avatar_url} className="w-full h-full object-cover" /> : <span className="text-xs font-black text-gray-400">CL</span>}
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-black text-gray-900">{ride.client?.username || 'Cliente'}</h4>
                                                                <p className="text-[10px] text-gray-400 font-bold">{new Date(ride.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {ride.client?.phone || 'Central'}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-lg font-black text-gray-900">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ride.final_price || ride.estimated_price || 0)}</p>
                                                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${ride.status === 'finished' ? 'bg-emerald-100 text-emerald-700' : ride.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                                                {ride.status === 'finished' ? 'OK' : ride.status === 'cancelled' ? 'X' : '...'}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2 py-2 bg-gray-50/50 rounded-2xl p-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                                                            <p className="text-[11px] text-gray-500 truncate italic">{ride.origin_address}</p>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></div>
                                                            <p className="text-[11px] text-gray-900 font-bold truncate">{ride.destination_address || 'Destino livre'}</p>
                                                        </div>
                                                    </div>

                                                    {ride.driver ? (
                                                        <div className="flex items-center justify-between bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm overflow-hidden border border-indigo-100">
                                                                    {ride.driver.avatar_url ? <img src={ride.driver.avatar_url} className="w-full h-full object-cover" /> : <span className="text-[10px] font-bold text-indigo-300">DR</span>}
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] font-black text-indigo-900 leading-tight">{ride.driver.username}</p>
                                                                    <p className="text-[9px] text-indigo-400 font-bold uppercase">{ride.vehicle_type === 'car' ? 'Carro' : 'Moto'} • {ride.driver.vehicle_plate}</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    handleDriverClick(ride.driver!);
                                                                    setShowDetailMobile(true);
                                                                }}
                                                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black shadow-lg shadow-indigo-100"
                                                            >
                                                                PERFIL
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="bg-gray-100 p-3 rounded-2xl text-center">
                                                            <p className="text-[10px] font-black text-gray-400 italic">Buscando motorista disponível...</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                    </div>

                                    {allRides.length === 0 && (
                                        <div className="text-center py-32 md:py-48 px-8">
                                            <div className="relative inline-block mb-8">
                                                <div className="w-32 h-32 bg-indigo-50 rounded-[3rem] rotate-12 absolute -inset-4 animate-pulse"></div>
                                                <span className="material-icons text-7xl text-indigo-200 relative">no_crash</span>
                                            </div>
                                            <h3 className="text-2xl font-black text-gray-800">Calmaria no Sistema</h3>
                                            <p className="text-gray-400 font-medium max-w-sm mx-auto mt-2">Nenhuma atividade registrada hoje até o momento. Que tal conferir os motoristas online?</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-gray-50/50">
                            <span className="material-icons text-7xl text-gray-200 mb-4">directions_car</span>
                            <h3 className="text-xl font-bold text-gray-400">Selecione um motorista ou use o menu rápido</h3>
                            <p className="text-gray-400 max-w-xs mt-2">Gerencie motoristas, corridas e configurações do sistema.</p>
                        </div>
                    )}

                </div >
            </div >
        </div >
    );
}
