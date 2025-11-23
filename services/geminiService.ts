import { GoogleGenAI } from "@google/genai";

// Initialize the client
// Note: In a real production app, API calls should be proxied through a backend to protect the key.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSmartReply = async (
  conversationHistory: string[],
  driverName: string
): Promise<string> => {
  try {
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
    return "";
  }
};

export const analyzeImage = async (base64Image: string): Promise<string> => {
  try {
    // Ensure we send only the base64 data, not the data URI prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

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
