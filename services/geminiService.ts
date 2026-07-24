import { GoogleGenAI } from "@google/genai";

// Helper to get AI client with dynamic key
const getAiClient = () => {
  const apiKey = localStorage.getItem('GEMINI_API_KEY') || process.env.API_KEY || "";
  return new GoogleGenAI({ apiKey });
}

export const generateSmartReply = async (
  conversationHistory: string[],
  driverName: string
): Promise<string> => {
  try {
    const ai = getAiClient();
    const modelId = "gemini-2.5-flash";

    const prompt = `
      Você é um motorista de transporte urbano chamado ${driverName}.
      Aqui estão as últimas mensagens de uma conversa com um cliente:
      ${conversationHistory.join('\n')}
      
      Gere uma resposta curta, educada e profissional (máximo 15 palavras) para o cliente.
      Se o cliente perguntar preço, diga que depende do taxímetro.
      Se pedir localização, diga que está a caminho.
      Mantenha um tom prestativo.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });

    return response.text || "Olá, como posso ajudar?";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Olá, estou dirigindo no momento.";
  }
};

export const analyzeImage = async (base64Image: string): Promise<string> => {
  try {
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: "Descreva esta imagem brevemente para um motorista de trânsito (ex: ponto de referência)." }
        ]
      }
    });
    return response.text || "Imagem recebida.";
  } catch (error) {
    console.error("Gemini Analyze Error", error);
    return "Imagem recebida.";
  }
}

export const analyzeAudio = async (base64Audio: string): Promise<string> => {
  try {
    const base64Data = base64Audio.replace(/^data:.*?;base64,/, "");
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: "audio/ogg", data: base64Data } }, // WhatsApp uses OGG Opus
          { text: "Ouça este áudio com atenção. Transcreva EXATAMENTE o que foi dito. Se for um pedido de corrida, extraia 'origin', 'destination', 'vehicleType'. Se for conversa, responda adequadamente. Retorne apenas o texto da resposta ou resumo." }
        ]
      }
    });
    return response.text || "";
  } catch (error) {
    console.error("Gemini Audio Error", error);
    return "";
  }
}

// New function for Humanized Responses
export const generateHumanizedResponse = async (context: string): Promise<string> => {
  try {
    const ai = getAiClient();
    const prompt = `
            Você é a atendente virtual da ChegoJá. Aja como uma pessoa muito simpática, solícita e humana.
            Baseado neste contexto: "${context}"
            
            Gere uma resposta curta (máximo 2 frases) para o cliente no WhatsApp.
            Use emojis. Seja informal mas profissional (ex: "Claro! Já estou vendo isso pra você 🚗").
            Não peça informações que já foram dadas.
        `;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    return response.text || "Certo! Já te respondo.";
  } catch (e) {
    return "Certo! Um momento.";
  }
}

export interface RideRequestAnalysis {
  intent: 'ride_request' | 'status_check' | 'cancel' | 'other' | 'provide_info';
  origin?: string;
  destination?: string;
  vehicleType?: 'car' | 'motorcycle' | null;
  missingFields: string[]; // 'origin', 'destination', 'vehicleType'
  confidence: number;
}

export const parseRideRequest = async (message: string, currentContext?: any): Promise<RideRequestAnalysis> => {
  try {
    const ai = getAiClient();
    const prompt = `
      Você é a atendente virtual do app "ChegoJá". Analise a mensagem do cliente.
      
      Aqui está o histórico e o estado atual da conversa:
      ${JSON.stringify(currentContext || {})}

      Mensagem Atual do Cliente: "${message}"
      
      Objetivo: Entender a intenção e extrair dados, considerando o que já foi dito no histórico.
      
      Regras:
      1. Se o cliente disser apenas um endereço e o contexto histórico pedir origem/destino, assuma que é a resposta.
      2. Se o cliente disser "Moto" ou "Carro", é o tipo de veículo.
      3. Identifique o que FALTA para completar o pedido em "missingFields".
      
      Responda APENAS JSON:
      {
        "intent": "ride_request" | "status_check" | "cancel" | "other" | "provide_info",
        "origin": "endereço completo ou null",
        "destination": "endereço completo ou null",
        "vehicleType": "car" | "motorcycle" | null,
        "missingFields": ["origin"?, "destination"?, "vehicleType"?],
        "confidence": 0.9
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "{}";
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Gemini Parse Error", error);
    return { intent: 'other', confidence: 0, missingFields: [] };
  }
};