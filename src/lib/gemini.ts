import { GoogleGenAI } from "@google/genai";

/**
 * Client-side library to interact with the Gemini API directly.
 * The platform provides the API key in process.env.GEMINI_API_KEY.
 */
export const askGemini = async (prompt: string): Promise<string> => {
  try {
    // process.env.GEMINI_API_KEY is injected by Vite's define in vite.config.ts
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error("Gemini API Key is missing. Please set GEMINI_API_KEY or VITE_GEMINI_API_KEY in the environment variables.");
      throw new Error("Chave da API Gemini não encontrada. Configure a chave nas configurações do projeto.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || '';
  } catch (error) {
    console.error("askGemini Error:", error);
    throw error;
  }
};
