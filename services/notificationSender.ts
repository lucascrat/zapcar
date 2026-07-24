import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

const FCM_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-notification`;

export interface NotificationResult {
    success: boolean;
    sent?: number;
    failed?: number;
    total?: number;
    error?: string;
}

/**
 * Send notification via Supabase Edge Function
 */
export async function sendNotification(
    title: string,
    body: string,
    targetType: 'all' | 'drivers' | 'clients' | 'driver' | 'client' | 'user' | 'drivers-car' | 'drivers-motorcycle',
    {
        targetUserId,
        imageUrl,
        sound,
        data,
        location
    }: {
        targetUserId?: string,
        imageUrl?: string,
        sound?: string,
        data?: Record<string, string>,
        location?: { lat: number, lng: number }
    } = {}
): Promise<NotificationResult> {
    try {
        const response = await fetch(FCM_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                title,
                body,
                targetType,
                targetUserId,
                imageUrl,
                sound,
                data,
                location
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('FCM Function Error:', response.status, errorText);

            let errorMessage = `Erro ${response.status}: ${errorText || response.statusText}`;

            // Tratamento especial para erro de boot do worker (comum no Supabase)
            if (errorText.includes('InvalidWorkerCreation') || errorText.includes('worker boot error')) {
                errorMessage = "Erro no Servidor de Notificações (Worker Boot Error). Por favor, tente novamente em alguns instantes ou solicite o re-deploy da função 'send-notification'.";
            }

            return {
                success: false,
                error: errorMessage
            };
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error sending notification:', error);
        return {
            success: false,
            error: error instanceof Error ? `Falha de Conexão: ${error.message}` : 'Erro de rede desconhecido',
        };
    }
}

