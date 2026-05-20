/**
 * Client-side proxy utility to interact with the server-side Gemini endpoint.
 * This keeps API keys safely hidden from the browser.
 */
export const askGemini = async (prompt: string): Promise<string> => {
  try {
    const response = await fetch("/api/gemini/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        model: "gemini-3.5-flash",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to query Gemini server-side.");
    }

    const data = await response.json();
    if (data.success) {
      return data.text || '';
    } else {
      throw new Error(data.error || "Gemini API error occurred on server.");
    }
  } catch (error) {
    console.error("askGemini Client Proxy Error:", error);
    throw error;
  }
};
