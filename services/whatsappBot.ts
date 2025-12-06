
import { WahaService, WahaMessage } from './wahaService';
import { parseRideRequest } from './geminiService';
import { fetchOnlineDrivers, fetchUserProfile } from './supabaseClient';
import { UserProfile } from '../types';

// State Management
interface RequestState {
    clientPhone: string;
    origin?: string;
    destination?: string;
    vehicleType?: 'car' | 'motorcycle';
    status: 'finding_driver' | 'waiting_driver_response';
    currentDriverPhone?: string;
    // New fields for confirmation
    currentDriverName?: string;
    currentDriverVehicle?: string;
    currentDriverPlate?: string;
    triedDrivers: Set<string>; // To avoid looping same driver
    timestamp: number;
}

// Maps
const activeRequests = new Map<string, RequestState>(); // Key: Client Phone
const driverToClientMap = new Map<string, string>(); // Key: Driver Phone -> Client Phone

let isRunning = false;
let lastCheckTimestamp = Math.floor(Date.now() / 1000);
let pollInterval: any = null;

// Helper: Format phone from DB ((88) 99999-9999) to WAHA (558899999999)
const formatPhoneToWaha = (phone: string): string => {
    const clean = phone.replace(/\D/g, '');
    if (clean.startsWith('55')) return clean;
    return `55${clean}`;
};

export const WhatsappBot = {
    isRunning: () => isRunning,

    start: () => {
        if (isRunning) return;
        isRunning = true;
        // Look back 10 minutes to catch recent messages
        lastCheckTimestamp = Math.floor(Date.now() / 1000) - 600;
        console.log(`🤖 Bot WhatsApp Iniciado... (Timestamp: ${lastCheckTimestamp})`);

        pollInterval = setInterval(WhatsappBot.poll, 5000); // Poll every 5s
    },

    stop: () => {
        isRunning = false;
        if (pollInterval) clearInterval(pollInterval);
        console.log("🛑 Bot WhatsApp Parado.");
    },

    poll: async () => {
        if (!isRunning) return;

        console.log("[Bot] Polling messages...");
        const messages = await WahaService.getMessages(50);
        if (!messages || messages.length === 0) {
            console.log("[Bot] No messages found.");
            return;
        }

        // Filter new messages
        const newMessages = messages.filter(m => m.timestamp > lastCheckTimestamp && !m.fromMe);
        console.log(`[Bot] Found ${messages.length} total, ${newMessages.length} new messages.`);

        if (newMessages.length > 0) {
            // Update timestamp to the latest message
            lastCheckTimestamp = Math.max(...newMessages.map(m => m.timestamp));

            for (const msg of newMessages) {
                console.log(`[Bot] Processing message from ${msg.from}: ${msg.body}`);
                await WhatsappBot.handleMessage(msg);
            }
        }
    },

    handleMessage: async (msg: WahaMessage) => {
        const senderPhone = msg.from.split('@')[0]; // 558899999999
        let body = msg.body.trim();

        // 1. Check if it's a Driver Replying
        if (driverToClientMap.has(senderPhone)) {
            await WhatsappBot.handleDriverReply(senderPhone, body);
            return;
        }

        // 2. Check if it's an existing Client Request (maybe cancelling?)
        if (activeRequests.has(senderPhone)) {
            const req = activeRequests.get(senderPhone);
            // Cancel word detection
            if (body.toLowerCase().includes('cancel')) {
                activeRequests.delete(senderPhone);
                // Release driver if waiting
                if (req?.currentDriverPhone) {
                    driverToClientMap.delete(req.currentDriverPhone);
                    await WahaService.sendText(req.currentDriverPhone, "🚫 A corrida foi cancelada pelo cliente.");
                }
                await WahaService.sendText(msg.from, "Solicitação cancelada.");
            } else {
                await WahaService.sendText(msg.from, "Já estamos procurando seu motorista! Aguarde... (Digite 'cancelar' para desistir)");
            }
            return;
        }

        // 3. New Request - Analyze with Gemini
        const analysis = await parseRideRequest(body);

        if (analysis.intent === 'ride_request') {
            await WahaService.sendText(msg.from, `Entendi! Você quer um ${analysis.vehicleType === 'motorcycle' ? 'moto' : 'carro'} para ir de ${analysis.origin || 'sua localização'} para ${analysis.destination || 'destino'}. \n\n🔎 Procurando motorista...`);

            const request: RequestState = {
                clientPhone: senderPhone,
                origin: analysis.origin,
                destination: analysis.destination,
                vehicleType: analysis.vehicleType,
                status: 'finding_driver',
                triedDrivers: new Set(),
                timestamp: Date.now()
            };

            activeRequests.set(senderPhone, request);
            await WhatsappBot.findDriver(request);

        } else {
            // Default greeting or help
            await WahaService.sendText(msg.from, "Olá! Sou o assistente virtual do ChegoJá. \nPara pedir uma corrida, diga algo como: 'Quero uma moto para o Centro' ou 'Preciso de um carro para o Shopping'.");
        }
    },

    findDriver: async (request: RequestState) => {
        const drivers = await fetchOnlineDrivers();

        // Filter drivers
        const candidates = drivers.filter(d => {
            // Check vehicle type match
            if (request.vehicleType && d.vehicle_type !== request.vehicleType) return false;
            // Check if already tried
            const driverPhoneClean = formatPhoneToWaha(d.phone || '');
            if (request.triedDrivers.has(driverPhoneClean)) return false;
            return true;
        });

        if (candidates.length === 0) {
            await WahaService.sendText(request.clientPhone, "😔 Desculpe, não encontramos motoristas disponíveis no momento. Tente novamente em alguns minutos.");
            activeRequests.delete(request.clientPhone);
            return;
        }

        // Pick first candidate
        const driver = candidates[0];
        const driverPhoneWaha = formatPhoneToWaha(driver.phone || '');

        // Update State with Driver Info
        request.status = 'waiting_driver_response';
        request.currentDriverPhone = driverPhoneWaha;
        request.currentDriverName = driver.username;
        request.currentDriverVehicle = `${driver.vehicle_model || 'Veículo'} (${driver.vehicle_color || ''})`;
        request.currentDriverPlate = driver.vehicle_plate || '';

        request.triedDrivers.add(driverPhoneWaha);

        driverToClientMap.set(driverPhoneWaha, request.clientPhone);

        // Send Request to Driver
        const msg = `🔔 *NOVA CORRIDA*\n\n📍 *Origem:* ${request.origin || 'A combinar'}\n🏁 *Destino:* ${request.destination || 'A combinar'}\n💰 *Valor:* Taxímetro\n\nResponda *SIM* para aceitar ou *NÃO* para recusar.`;
        await WahaService.sendText(driverPhoneWaha, msg);
    },

    handleDriverReply: async (driverPhone: string, text: string) => {
        const clientPhone = driverToClientMap.get(driverPhone);
        if (!clientPhone) return;

        const request = activeRequests.get(clientPhone);
        if (!request) {
            driverToClientMap.delete(driverPhone);
            return;
        }

        const cleanText = text.toLowerCase().trim();

        if (cleanText === 'sim' || cleanText === 'aceito' || cleanText === 's') {
            // Accepted!
            const driverInfo = `${request.currentDriverName || 'Motorista'} \n🚗 ${request.currentDriverVehicle || 'Carro'} - ${request.currentDriverPlate || ''}`;

            await WahaService.sendText(clientPhone, `✅ *Motorista Encontrado!*\n\n${driverInfo}\n\nO motorista está a caminho. Aguarde no local.`);
            await WahaService.sendText(driverPhone, `🚀 *Corrida Confirmada!*\n\nVá buscar o passageiro.\nContato: https://wa.me/${clientPhone.replace(/\D/g, '')}`);

            // Cleanup
            activeRequests.delete(clientPhone);
            driverToClientMap.delete(driverPhone);

        } else if (cleanText === 'não' || cleanText === 'nao' || cleanText === 'recuso' || cleanText === 'n') {
            // Rejected
            await WahaService.sendText(driverPhone, "Ok, corrida recusada.");
            driverToClientMap.delete(driverPhone);

            // Try next driver
            request.status = 'finding_driver';
            request.currentDriverPhone = undefined;
            // Clear current driver info
            request.currentDriverName = undefined;
            await WhatsappBot.findDriver(request);
        } else {
            // Invalid response
            await WahaService.sendText(driverPhone, "Por favor, responda apenas *SIM* ou *NÃO*.");
        }
    }
};
