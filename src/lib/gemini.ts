/**
 * Client-side library to interact with the server-side Gemini API.
 * This keeps the API key secure on the server.
 */
export const askGemini = async (prompt: string): Promise<string> => {
  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Erro ao chamar o Gemini no servidor.');
    }

    const data = await response.json();
    return data.text;
  } catch (error) {
    console.error("askGemini Error:", error);
    throw error;
  }
};
