import { GoogleGenAI } from "@google/genai";

/**
 * Client-side library to interact with the Gemini API directly.
 * The platform provides the API key in process.env.GEMINI_API_KEY.
 */
export const askGemini = async (prompt: string): Promise<string> => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error("Gemini API Key is not available in the environment.");
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
