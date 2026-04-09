import { GoogleGenAI, ThinkingLevel } from "@google/genai";

/**
 * Client-side library to interact with the Gemini API directly.
 * The platform provides the API key in process.env.GEMINI_API_KEY.
 */
export const askGemini = async (prompt: string): Promise<string> => {
  try {
    // Try multiple ways to get the API key
    // 1. Injected by Vite define
    // 2. Vite's native import.meta.env (if prefixed with VITE_)
    // 3. Global process.env (if available)
    const apiKey = 
      process.env.GEMINI_API_KEY || 
      (import.meta as any).env?.VITE_GEMINI_API_KEY || 
      (import.meta as any).env?.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error("Gemini API Key is missing.");
      throw new Error("Chave da API Gemini não encontrada. Certifique-se de que a variável GEMINI_API_KEY está configurada e que você fez um novo Deploy na Vercel após configurá-la.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW
        }
      }
    });

    return response.text || '';
  } catch (error) {
    console.error("askGemini Error:", error);
    throw error;
  }
};
