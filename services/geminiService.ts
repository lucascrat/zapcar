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
    // Ensure we send only the base64 data, not the data URI prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          },
          {
            text: "Descreva esta imagem brevemente para um motorista de trânsito (ex: ponto de referência)."
          }
        ]
      }
    });
    return response.text || "Imagem recebida.";
  } catch (error) {
    console.error("Gemini Analyze Error", error);
    return "Imagem recebida.";
  }
}

export interface RideRequestAnalysis {
  intent: 'ride_request' | 'status_check' | 'cancel' | 'other';
  origin?: string;
  destination?: string;
  vehicleType?: 'car' | 'motorcycle';
  confidence: number;
}

export const parseRideRequest = async (message: string): Promise<RideRequestAnalysis> => {
  try {
    const prompt = `
      Analise a seguinte mensagem de WhatsApp de um cliente e extraia as informações de solicitação de corrida.
      Mensagem: "${message}"
      
      Responda APENAS com um JSON no seguinte formato, sem markdown:
      {
        "intent": "ride_request" | "status_check" | "cancel" | "other",
        "origin": "endereço de origem ou null se não informado",
        "destination": "endereço de destino ou null se não informado",
        "vehicleType": "car" | "motorcycle" (se o cliente mencionar moto/mototaxi, senão assuma car),
        "confidence": 0.0 a 1.0
      }
    `;

    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const text = response.text || "{}";
    // Clean markdown if present
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Gemini Parse Error", error);
    return { intent: 'other', confidence: 0 };
  }
};