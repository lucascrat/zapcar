
const WAHA_API_URL = "https://waha-waha.mxntxp.easypanel.host";
let SESSION_NAME = "default";

export interface WahaMessage {
    id: string;
    from: string;
    to: string;
    body: string;
    timestamp: number;
    fromMe: boolean;
    _data?: any;
}

export const WahaService = {
    setApiKey: (key: string) => {
        localStorage.setItem('WAHA_API_KEY', key);
    },

    getApiKey: () => localStorage.getItem('WAHA_API_KEY') || '01Deus02@',

    setSessionName: (name: string) => {
        SESSION_NAME = name;
    },

    /**
     * Envia mensagem de texto
     */
    sendText: async (chatId: string, text: string) => {
        const send = async (id: string) => {
            const response = await fetch(`${WAHA_API_URL}/api/sendText`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': localStorage.getItem('WAHA_API_KEY') || '01Deus02@'
                },
                body: JSON.stringify({
                    session: SESSION_NAME,
                    chatId: id,
                    text: text,
                }),
            });
            if (!response.ok) {
                const err = await response.text();
                throw new Error(err); // Throw to trigger retry
            }
            return await response.json();
        };

        try {
            // Try standard format first
            const formattedId = chatId.includes('@c.us') ? chatId : `${chatId}@c.us`;
            return await send(formattedId);
        } catch (error) {
            console.warn("WAHA Send Standard Failed, retrying with raw/alternative...", error);
            try {
                // Retry with raw ID (sometimes works for some engines)
                const rawId = chatId.replace('@c.us', '');
                return await send(rawId);
            } catch (retryError) {
                console.error("WAHA Send Error (Final):", retryError);
                return null;
            }
        }
    },

    /**
     * Busca mensagens recentes (Polling)
     * Nota: Depende da implementação do WAHA ter este endpoint exposto ou similar.
     * Muitos WAHA implementations usam /api/messages?limit=X
     */
    getMessages: async (limit: number = 20): Promise<WahaMessage[]> => {
        try {
            // 1. Fetch active chats first (to get who sent messages)
            // Endpoint /api/{session}/chats exists and works
            const chatsUrl = `${WAHA_API_URL}/api/${SESSION_NAME}/chats`;

            const chatsResp = await fetch(chatsUrl, {
                headers: { 'X-Api-Key': localStorage.getItem('WAHA_API_KEY') || '01Deus02@' }
            });

            if (!chatsResp.ok) return [];
            const chats = await chatsResp.json();

            let allMessages: WahaMessage[] = [];

            // 2. For the top 5 active chats, fetch messages
            // This is a workaround because WAHA doesn't support global polling
            for (const chat of chats.slice(0, 5)) {
                const msgsUrl = `${WAHA_API_URL}/api/messages?chatId=${chat.id._serialized || chat.id}&limit=5&session=${SESSION_NAME}`;
                const msgResp = await fetch(msgsUrl, {
                    headers: { 'X-Api-Key': localStorage.getItem('WAHA_API_KEY') || '01Deus02@' }
                });
                if (msgResp.ok) {
                    const msgs = await msgResp.json();
                    allMessages = [...allMessages, ...msgs];
                }
            }

            return allMessages;

        } catch (error) {
            console.error("WAHA Fetch Error:", error);
            return [];
        }
    },

    /**
     * Verifica status da sessão
     */
    checkSession: async () => {
        try {
            const response = await fetch(`${WAHA_API_URL}/api/sessions/${SESSION_NAME}/status`, {
                headers: {
                    'X-Api-Key': localStorage.getItem('WAHA_API_KEY') || '01Deus02@'
                }
            });
            return await response.json();
        } catch (error) {
            return { status: 'unknown' };
        }
    },

    /**
     * Lista todas as sessões
     */
    getSessions: async () => {
        try {
            const response = await fetch(`${WAHA_API_URL}/api/sessions?all=true`, {
                headers: {
                    'X-Api-Key': localStorage.getItem('WAHA_API_KEY') || '01Deus02@'
                }
            });
            return await response.json();
        } catch (error) {
            return [];
        }
    },

    /**
     * Inicia uma nova sessão
     */
    startSession: async (sessionName: string) => {
        try {
            const response = await fetch(`${WAHA_API_URL}/api/sessions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': localStorage.getItem('WAHA_API_KEY') || '01Deus02@'
                },
                body: JSON.stringify({
                    name: sessionName,
                    config: {
                        webhooks: [] // Sem webhooks para não conflitar
                    }
                })
            });
            return await response.json();
        } catch (error) {
            console.error("WAHA Start Session Error:", error);
            return null;
        }
    },

    /**
     * Obtém a imagem do QR Code/Tela da sessão
     */
    getSessionScreen: async (sessionName: string) => {
        try {
            const response = await fetch(`${WAHA_API_URL}/api/sessions/${sessionName}/screenshot?session=${sessionName}`, {
                method: 'GET',
                headers: {
                    'X-Api-Key': localStorage.getItem('WAHA_API_KEY') || '01Deus02@'
                }
            });
            if (!response.ok) return null;
            // Retorna o blob da imagem
            return await response.blob();
        } catch (error) {
            console.error("WAHA Screenshot Error:", error);
            return null;
        }
    }
};
