
import { WahaService, WahaMessage } from './wahaService';
import { parseRideRequest, analyzeAudio } from './geminiService';
import { fetchOnlineDrivers, fetchAppSettings, sendMessage, supabase } from './supabaseClient';
import { GoogleMapsService } from './googleMapsService';
import { Message, UserRole, DriverStatus } from '../types';

// Constants
const BOT_ID = '11111111-1111-1111-1111-111111111111'; // Fixed UUID for the Bot
const BOT_NAME = 'ATENDENTE-CHEGOJA';
const BOT_AVATAR = '/logo.png'; // Public path to logo

// Extended State Management with History
interface ConversationState {
    clientPhone: string;
    origin?: string;
    destination?: string;
    vehicleType?: 'car' | 'motorcycle' | null;

    // Price Info
    distanceKm?: number;
    durationMins?: number;
    estimatedPrice?: number;

    // Status Flow
    status: 'IDLE' | 'COLLECTING_INFO' | 'CONFIRM_PRICE' | 'FINDING_DRIVER' | 'WAITING_DRIVER_RESPONSE' | 'RIDE_IN_PROGRESS';

    // Driver Search
    currentDriverId?: string; // UUID of the driver in App
    currentDriverName?: string;
    currentDriverModel?: string; // Explicit Model
    currentDriverColor?: string; // Explicit Color
    currentDriverVehicle?: string; // "Model (Color)" - Kept for fallback
    currentDriverPlate?: string;
    currentDriverLat?: number;
    currentDriverLng?: number;

    triedDrivers: Set<string>; // Set of Driver IDs
    timestamp: number;
    lastOfferTimestamp?: number; // Timestamp when the last driver was offered the ride

    // Conversation Memory
    history: { role: 'user' | 'model', content: string }[];
}

// Maps
const activeConversations = new Map<string, ConversationState>(); // Key: Client Phone
const driverToClientMap = new Map<string, string>(); // Key: Driver ID -> Client Phone

let isRunning = false;
let lastCheckTimestamp = Math.floor(Date.now() / 1000);
let pollInterval: any = null;
let realtimeSubscription: any = null;

// Helper: Format phone
const formatPhoneToWaha = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');
    if (clean.startsWith('55')) return clean;
    return `55${clean}`;
};

// Helper: Calculate Price
const calculatePrice = async (distanceKm: number, durationMins: number, vehicleType: 'car' | 'motorcycle'): Promise<number> => {
    try {
        const settings = await fetchAppSettings();

        // Calculate Price based on current time
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

        if (vehicleType === 'motorcycle') {
            base = settings.moto_base_price;
            perKm = settings.moto_price_km;
            perMin = settings.moto_price_min;
            startDistLimit = settings.moto_start_distance_limit || 0;
        }

        // Apply Dynamic Pricing
        const isNight = (nightStart < nightEnd)
            ? (currentTime >= nightStart && currentTime <= nightEnd)
            : (currentTime >= nightStart || currentTime <= nightEnd);

        const isDawn = (dawnStart < dawnEnd)
            ? (currentTime >= dawnStart && currentTime <= dawnEnd)
            : (currentTime >= dawnStart || currentTime <= dawnEnd);

        if (isDawn) {
            if (vehicleType === 'car') {
                base = settings.dawn_car_base_price ?? base;
                perKm = settings.dawn_car_price_km ?? perKm;
                perMin = settings.dawn_car_price_min ?? perMin;
            } else {
                base = settings.dawn_moto_base_price ?? base;
                perKm = settings.dawn_moto_price_km ?? perKm;
                perMin = settings.dawn_moto_price_min ?? perMin;
            }
        } else if (isNight) {
            if (vehicleType === 'car') {
                base = settings.night_car_base_price ?? base;
                perKm = settings.night_car_price_km ?? perKm;
                perMin = settings.night_car_price_min ?? perMin;
            } else {
                base = settings.night_moto_base_price ?? base;
                perKm = settings.night_moto_price_km ?? perKm;
                perMin = settings.night_moto_price_min ?? perMin;
            }
        }

        const chargeableDistance = Math.max(0, distanceKm - startDistLimit);
        const total = base + (chargeableDistance * perKm) + (durationMins * perMin);

        let minPrice = 8.0;
        if (vehicleType === 'motorcycle') minPrice = 5.0;

        return Math.max(total, minPrice);
    } catch (e) {
        console.error("Error calculating price", e);
        return 10.0; // Fallback
    }
};

// Helper: Ensure Bot Profile Exists
const ensureBotProfile = async () => {
    const { error } = await supabase
        .from('profiles')
        .upsert({
            id: BOT_ID,
            username: BOT_NAME,
            avatar_url: BOT_AVATAR,
            role: UserRole.ADMIN, // Admin role gives authority
            status: DriverStatus.AVAILABLE,
            is_approved: true
        });

    if (error) console.error("Error creating/updating Bot Profile:", error);
    else console.log("🤖 Perfil do Bot (Atendente) verificado.");
};

// Helper: Persistence
const saveState = () => {
    if (typeof window === 'undefined') return; // Server-side safety
    try {
        const serializable = Array.from(activeConversations.entries());
        localStorage.setItem('BOT_STATE', JSON.stringify(serializable));
    } catch (e) {
        console.error("Error saving bot state", e);
    }
};

const loadState = () => {
    if (typeof window === 'undefined') return;
    try {
        const raw = localStorage.getItem('BOT_STATE');
        if (raw) {
            const parsed = JSON.parse(raw);
            activeConversations.clear();
            parsed.forEach(([k, v]: [string, ConversationState]) => activeConversations.set(k, v));

            // Rebuild fallback map just in case
            driverToClientMap.clear();
            for (const [phone, state] of activeConversations.entries()) {
                if (state.currentDriverId) {
                    driverToClientMap.set(state.currentDriverId, phone);
                }
            }
            console.log(`[Bot] 💾 Estado restaurado: ${activeConversations.size} conversas.`);
        }
    } catch (e) {
        console.error("Error loading bot state", e);
    }
};

export const WhatsappBot = {
    isRunning: () => isRunning,

    start: async () => {
        if (isRunning) return;
        isRunning = true;

        await ensureBotProfile();

        loadState(); // Restore state

        lastCheckTimestamp = Math.floor(Date.now() / 1000) - 30;

        console.log(`🤖 Bot Híbrido Iniciado...`);

        // 1. Poll WhatsApp for Client Messages
        pollInterval = setInterval(WhatsappBot.pollWhatsApp, 5000);

        // 2. Listen to Internal Chat for Driver Replies
        WhatsappBot.subscribeToDriverMessages();
    },

    stop: () => {
        isRunning = false;
        if (pollInterval) clearInterval(pollInterval);
        if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
        saveState(); // Save on stop
        console.log("🛑 Bot Parado.");
    },

    pollWhatsApp: async () => {
        if (!isRunning) return;

        // Periodic Save (Safety Net)
        if (Math.random() < 0.1) saveState();

        // New: Monitor Timeouts (10 seconds)
        await WhatsappBot.monitorTimeouts();

        const messages = await WahaService.getMessages(20);
        if (!messages || messages.length === 0) return;

        const newMessages = messages.filter(m => m.timestamp > lastCheckTimestamp && !m.fromMe);
        if (newMessages.length > 0) {
            lastCheckTimestamp = Math.max(...newMessages.map(m => m.timestamp));
            for (const msg of newMessages) {
                await WhatsappBot.handleClientMessage(msg);
            }
        }
    },

    monitorTimeouts: async () => {
        const now = Date.now();
        const TIMEOUT_MS = 10000; // 10 seconds

        // 1. Monitor Bot Internal Conversations
        for (const [phone, state] of activeConversations.entries()) {
            if (state.status === 'WAITING_DRIVER_RESPONSE' && state.lastOfferTimestamp) {
                if (now - state.lastOfferTimestamp > TIMEOUT_MS) {
                    console.log(`[Bot] ⏰ Timeout do motorista ${state.currentDriverName} para o cliente ${phone}`);

                    if (state.currentDriverId) {
                        try {
                            await sendMessage({
                                sender_id: BOT_ID,
                                receiver_id: state.currentDriverId,
                                content: "⏰ Tempo esgotado! A corrida foi passada para outro motorista.",
                                media_type: 'text',
                                created_at: new Date().toISOString(),
                                is_read: false
                            });
                        } catch (e) {
                            console.error("Error sending internal timeout message", e);
                        }
                        driverToClientMap.delete(state.currentDriverId);
                    }

                    state.status = 'FINDING_DRIVER';
                    state.currentDriverId = undefined;
                    state.lastOfferTimestamp = undefined;

                    await WhatsappBot.findDriver(state);
                }
            }
        }

        // 2. Monitor General App Rides (Dispatch/Client App)
        try {
            const { data: pendingRides, error } = await supabase
                .from('rides')
                .select('id, driver_id, status, last_driver_offered_at, is_broadcast, origin_address, vehicle_type, estimated_price, client_id')
                .in('status', ['searching', 'accepted'])
                .eq('is_broadcast', false);

            if (pendingRides && pendingRides.length > 0) {
                for (const ride of pendingRides) {
                    let shouldRotate = false;

                    if (ride.status === 'accepted') {
                        if (ride.last_driver_offered_at) {
                            const offeredAt = new Date(ride.last_driver_offered_at).getTime();
                            if (now - offeredAt > TIMEOUT_MS) {
                                shouldRotate = true;
                            }
                        } else {
                            await supabase.from('rides').update({ last_driver_offered_at: new Date().toISOString() }).eq('id', ride.id);
                        }
                    } else if (ride.status === 'searching' && !ride.driver_id) {
                        shouldRotate = true;
                    }

                    if (shouldRotate) {
                        const { findAndAssignNextDriver } = await import('./supabaseClient');
                        const success = await findAndAssignNextDriver(ride.id, ride.driver_id || '00000000-0000-0000-0000-000000000000');

                        if (success) {
                            const { data: updatedRide } = await supabase.from('rides').select('*, driver:driver_id(*)').eq('id', ride.id).single();
                            if (updatedRide && updatedRide.driver_id) {
                                const { sendNotification } = await import('./notificationSender');
                                sendNotification(
                                    "Nova Corrida Disponível! 🚗",
                                    `Origem: ${updatedRide.origin_address}\nValor: R$ ${updatedRide.estimated_price?.toFixed(2)}`,
                                    'user',
                                    { targetUserId: updatedRide.driver_id, sound: 'ubb' }
                                ).catch(e => console.error("Push Rotate Error", e));

                                if (updatedRide.client_id === BOT_ID || updatedRide.client_id === '11111111-1111-1111-1111-111111111111') {
                                    await sendMessage({
                                        sender_id: BOT_ID,
                                        receiver_id: updatedRide.driver_id,
                                        content: `🔔 *NOVA CORRIDA CHEGOJÁ*\n\n📍 *Origem:* ${updatedRide.origin_address}\n💰 *Valor:* R$ ${updatedRide.estimated_price?.toFixed(2)}\n\nDeseja aceitar?\nResponda *SIM* ou *NÃO*`,
                                        media_type: 'text',
                                        created_at: new Date().toISOString(),
                                        is_read: false
                                    });
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[RideMonitor] Critical Error:", err);
        }
    },

    subscribeToDriverMessages: () => {
        realtimeSubscription = supabase
            .channel('bot-messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `receiver_id=eq.${BOT_ID}`
            }, (payload) => {
                const newMsg = payload.new as Message;
                WhatsappBot.handleDriverReply(newMsg);
            })
            .subscribe((status) => {
                console.log(`[Bot] Realtime Status: ${status}`);
            });
    },

    handleClientMessage: async (msg: WahaMessage) => {
        const senderPhone = msg.from.split('@')[0];
        let body = msg.body.trim();

        // Initialize State if not exists
        let state = activeConversations.get(senderPhone);
        if (!state) {
            state = {
                clientPhone: senderPhone,
                status: 'COLLECTING_INFO',
                triedDrivers: new Set(),
                timestamp: Date.now(),
                history: []
            };
            activeConversations.set(senderPhone, state);

            // Greeter
            if (!body.toLowerCase().includes('sim') && !body.toLowerCase().includes('nao')) {
                const greeting = "Oii! Sou a atendente virtual da *ChegoJá*. 🚗\n\nPra onde você quer ir hoje?";
                state.history.push({ role: 'model', content: greeting });

                // Initial Human Reply (Voice + Text if first interaction)
                await WahaService.sendText(msg.from, greeting);
                const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent("Oii! Pra onde você quer ir hoje?")}&tl=pt-BR&client=tw-ob`;
                await WahaService.sendVoice(msg.from, ttsUrl);
            }
        }

        // 0. Detect Audio Input
        const isAudio = msg._data?.mimetype?.includes('audio') || msg._data?.type === 'ptt' || msg._data?.type === 'audio';

        if (isAudio) {
            await WahaService.sendText(msg.from, "🎧 Ouvindo...");
            const base64 = await WahaService.downloadMedia(msg); // Pass entire message
            if (base64) {
                const transcription = await analyzeAudio(base64);
                if (transcription) {
                    console.log(`[Bot] Transcrição: ${transcription}`);
                    body = transcription; // Use transcription as body
                } else {
                    await WahaService.sendText(msg.from, "Não consegui entender o áudio. Pode escrever?");
                    return;
                }
            } else {
                await WahaService.sendText(msg.from, "Tive um probleminha para ouvir seu áudio. 🎧 Pode tentar digitar ou enviar novamente?");
                return;
            }
        }

        // Add to History
        state.history.push({ role: 'user', content: body });

        // helper to reply
        // helper to reply
        const sendHumanReply = async (text: string, forceVoice: boolean = false) => {
            state!.history.push({ role: 'model', content: text });
            await WahaService.sendText(msg.from, text);

            // Send voice if User sent Audio OR forceVoice is requested (Professional Mode)
            if (isAudio || forceVoice) {
                try {
                    // Clean text for TTS: Remove Markdown (*, _), Emojis (basic regex), and pauses
                    const safeText = text
                        .replace(/[*_]/g, '') // Remove bold/italic
                        //.replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove emojis (optional, existing regex below matches words)
                        .replace(/\n/g, '. ') // Pause on newlines
                        .replace(/[^\w\s\u00C0-\u00FF,\.\?!]/g, '') // Keep words, spaces, accents, punctuation
                        .substring(0, 200); // Limit for Google TTS

                    if (safeText.length > 2) {
                        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(safeText)}&tl=pt-BR&client=tw-ob`;
                        await WahaService.sendVoice(msg.from, ttsUrl);
                    }
                } catch (e) {
                    console.error("TTS Error", e);
                }
            }
        };

        // 2. Call / Voice Request Detection
        if (body.toLowerCase().includes('ligar') || body.toLowerCase().includes('ligação') || body.toLowerCase().includes('atender')) {
            await sendHumanReply("Agora não posso atender ligações, sou uma assistente virtual! 🤖 Mas pode mandar áudio que eu escuto e te respondo! 🎧", true);
            return;
        }

        // Analyze Intent (passing history for context)
        const analysis = await parseRideRequest(body, {
            intent: state.status,
            history: state.history,
            hasOrigin: !!state.origin,
            hasDestination: !!state.destination,
            hasVehicle: !!state.vehicleType
        });

        // Detect Cancel
        if (analysis.intent === 'cancel' || body.toLowerCase().includes('cancelar')) {
            if (state.currentDriverId) {
                await sendMessage({
                    sender_id: BOT_ID,
                    receiver_id: state.currentDriverId,
                    content: "🚫 A corrida foi cancelada pelo cliente.",
                    media_type: 'text',
                    created_at: new Date().toISOString(),
                    is_read: false
                });
                driverToClientMap.delete(state.currentDriverId);
            }
            activeConversations.delete(senderPhone);
            await sendHumanReply("Tudo bem, cancelei sua solicitação. Se precisar, estou por aqui! 👋", true);
            return;
        }

        // Update State
        if (analysis.origin) state.origin = analysis.origin;
        if (analysis.destination) state.destination = analysis.destination;
        if (analysis.vehicleType) state.vehicleType = analysis.vehicleType;

        saveState(); // Save state update

        // A. Verify Missing Info
        if (state.status === 'COLLECTING_INFO' || state.status === 'IDLE') {
            const missing = [];
            if (!state.origin) missing.push("📍 Onde te busco?");
            if (!state.destination) missing.push("🏁 Pra onde vai?");
            if (!state.vehicleType) missing.push("🚗 Carro ou Moto?");

            if (missing.length > 0) {
                state.status = 'COLLECTING_INFO';
                const question = `Certo! ${missing[0]}`;
                await sendHumanReply(question, isAudio || missing.length > 1);
                return;
            }
            state.status = 'CONFIRM_PRICE';
        }

        // B. Calculate Price & Confirm
        if (state.status === 'CONFIRM_PRICE' && !state.estimatedPrice) {
            await WahaService.sendText(msg.from, "🔎 Só um instante, calculando o valor...");

            const route = await GoogleMapsService.calculateRoute(state.origin!, state.destination!);

            if (!route) {
                state.distanceKm = 5;
                state.durationMins = 10;
            } else {
                state.distanceKm = route.distanceKm;
                state.durationMins = route.durationMins;
                state.origin = route.startAddress;
                state.destination = route.endAddress;
            }

            const price = await calculatePrice(state.distanceKm!, state.durationMins!, state.vehicleType!);
            state.estimatedPrice = price;

            const msgConfirm = `✅ *Cotação da Corrida*\n\n` +
                `📍 De: ${state.origin}\n` +
                `🏁 Para: ${state.destination}\n` +
                `📏 Distância: ${state.distanceKm!.toFixed(1)} km\n` +
                `⏱️ Tempo: ~${state.durationMins} min\n` +
                `🚘 Veículo: ${state.vehicleType === 'motorcycle' ? 'Moto' : 'Carro'}\n\n` +
                `💰 *Valor Estimado: R$ ${price.toFixed(2)}*\n\n` +
                `Podemos confirmar? (Responda SIM)`;

            await sendHumanReply(msgConfirm, true);
            return;
        }

        // C. Handle Confirmation
        if (state.status === 'CONFIRM_PRICE') {
            if (analysis.intent === 'ride_request' || body.toLowerCase().match(/sim|aceito|concordo|s|pode|pode ser/)) {
                state.status = 'FINDING_DRIVER';
                await sendHumanReply("Maravilha! Estou procurando um motorista pra você agora, rapidinho... 🕐", true);
                await WhatsappBot.findDriver(state);
            } else {
                await sendHumanReply("Entendi. Se quiser confirmar, é só dizer SIM. Ou me diga se mudou o endereço.");
            }
        }
    },

    findDriver: async (state: ConversationState) => {
        console.log(`[Bot] 🕵️ Buscando motoristas para ${state.clientPhone}...`);

        const drivers = await fetchOnlineDrivers();
        console.log(`[Bot] 📂 Total de motoristas online: ${drivers.length}`);

        const candidates = drivers.filter(d => {
            const reqType = state.vehicleType?.toLowerCase();
            const drvType = d.vehicle_type?.toLowerCase();

            // 1. Filter by Vehicle Type
            if (reqType && drvType !== reqType) return false;

            // 2. Check if already rejected
            if (state.triedDrivers.has(d.id)) return false;

            return true;
        });

        if (candidates.length === 0) {
            await WahaService.sendText(state.clientPhone, `😔 Poxa, não encontrei nenhum motorista de *${state.vehicleType === 'motorcycle' ? 'Moto' : 'Carro'}* livre agora. Tente em alguns instantes!`);
            // Do not delete conversation, let user retry
            return;
        }

        // Pick Candidate
        const driver = candidates[0];

        // Store Driver Data in State for Retrieval
        state.status = 'WAITING_DRIVER_RESPONSE';
        state.currentDriverId = driver.id;
        state.currentDriverName = driver.username;
        state.currentDriverModel = driver.vehicle_model || 'Veículo';
        state.currentDriverColor = driver.vehicle_color || 'Cor não inf.';
        state.currentDriverVehicle = `${driver.vehicle_model || 'Veículo'} (${driver.vehicle_color || 'Cor não inf.'})`;
        state.currentDriverPlate = driver.vehicle_plate || 'Sem Placa';
        state.currentDriverLat = driver.lat;
        state.currentDriverLng = driver.lng;

        state.triedDrivers.add(driver.id);
        state.lastOfferTimestamp = Date.now(); // Record offer time
        driverToClientMap.set(driver.id, state.clientPhone);

        saveState(); // Persist Waiting State

        // Send Offer via Internal Chat
        console.log(`[Bot] 📤 Enviando oferta interna para ${driver.username} (${driver.id})...`);

        const offerMsg = `🔔 *NOVA CORRIDA CHEGOJÁ*\n\n` +
            `📍 *Origem:* ${state.origin}\n` +
            `🏁 *Destino:* ${state.destination}\n` +
            `📏 *Distância:* ${state.distanceKm?.toFixed(1)} km\n` +
            `💰 *Valor:* R$ ${state.estimatedPrice?.toFixed(2)}\n\n` +
            `Deseja aceitar?\nResponda *SIM* ou *NÃO*`;

        await sendMessage({
            sender_id: BOT_ID,
            receiver_id: driver.id,
            content: offerMsg,
            media_type: 'text',
            created_at: new Date().toISOString(),
            is_read: false
        });
    },

    handleDriverReply: async (msg: Message) => {
        const driverId = msg.sender_id;
        const text = msg.content;

        console.log(`[Bot] 📩 Recebida do Motorista (${driverId}): ${text}`);

        // Robust Search: Iterate active conversations to find who is waiting for this driver
        let clientPhone: string | null = null;
        let state: ConversationState | null = null;

        for (const [phone, currentState] of activeConversations.entries()) {
            if (currentState.currentDriverId === driverId && currentState.status === 'WAITING_DRIVER_RESPONSE') {
                clientPhone = phone;
                state = currentState;
                break;
            }
        }

        if (!state || !clientPhone) {
            console.warn(`[Bot] ⚠️ Nenhuma conversa ativa aguardando resposta deste motorista.`);
            // Check if using map (legacy check)
            const mapPhone = driverToClientMap.get(driverId);
            if (mapPhone) console.log(`[Bot] (Debug) Map tinha: ${mapPhone}, mas state não encontrado ou status diferente.`);
            return;
        }

        const clean = text.toLowerCase().trim();

        if (clean.match(/sim|aceito|s|ok|quero/)) {
            console.log(`[Bot] ✅ Motorista ACEITOU a corrida!`);

            // ACCEPTED
            state.status = 'RIDE_IN_PROGRESS';

            const locationLink = state.currentDriverLat ? `https://www.google.com/maps/search/?api=1&query=${state.currentDriverLat},${state.currentDriverLng}` : "Mapa indísponível";

            // Whatsapp to Client (Humanized) - WITH DETAILS - SEPARATED
            const clientMsg = `✅ *Motorista Encontrado!*\n\n` +
                `👤 *Motorista:* ${state.currentDriverName}\n` +
                `🚗 *Modelo:* ${state.currentDriverModel}\n` +
                `🎨 *Cor:* ${state.currentDriverColor}\n` +
                `🔢 *Placa:* ${state.currentDriverPlate}\n\n` +
                `📍 *Acompanhe a chegada:* ${locationLink}\n\n` +
                `O motorista está a caminho!`;

            await WahaService.sendText(clientPhone, clientMsg);

            // Send Voice Update
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent("Motorista encontrado! Ele está a caminho.")}&tl=pt-BR&client=tw-ob`;
            await WahaService.sendVoice(clientPhone, ttsUrl);

            // Internal Chat to Driver
            await sendMessage({
                sender_id: BOT_ID,
                receiver_id: driverId,
                content: `🚀 *Corrida Confirmada!*\n\nPassageiro aguardando no local.\nContato: https://wa.me/${clientPhone.replace(/\D/g, '')}`,
                media_type: 'text',
                created_at: new Date().toISOString(),
                is_read: false
            });

            // Cleanup
            activeConversations.delete(clientPhone);
            driverToClientMap.delete(driverId);

        } else if (clean.match(/nao|não|recuso|n/)) {
            console.log(`[Bot] ❌ Motorista RECUSOU a corrida.`);
            // REJECTED
            await sendMessage({
                sender_id: BOT_ID,
                receiver_id: driverId,
                content: "Ok, recusado. Buscando outro...",
                media_type: 'text',
                created_at: new Date().toISOString(),
                is_read: false
            });

            driverToClientMap.delete(driverId);
            state.status = 'FINDING_DRIVER';
            state.currentDriverId = undefined; // Reset current driver

            // Retry Finding
            await WhatsappBot.findDriver(state);

        } else {
            await sendMessage({
                sender_id: BOT_ID,
                receiver_id: driverId,
                content: "Por favor, responda apenas SIM ou NÃO.",
                media_type: 'text',
                created_at: new Date().toISOString(),
                is_read: false
            });
        }
    }
};
