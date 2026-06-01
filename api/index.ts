import express from "express";
import nodemailer from "nodemailer";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    success: true, 
    env: process.env.VERCEL ? 'vercel' : 'local',
    node: process.version
  });
});

// API Route for sending email
app.post("/api/send-email", async (req, res) => {
  console.log("[Email API] Received request on", process.env.VERCEL ? 'Vercel' : 'Local');
  try {
    const { subject, body, to: bodyTo, fromName } = req.body;
    console.log(`[Email API] Request Body: Subject="${subject}", BodyLength=${body?.length}, To=${bodyTo}, FromName=${fromName}`);
    
    if (!subject || !body) {
      return res.status(400).json({ success: false, error: "Assunto ou corpo do e-mail ausente." });
    }
    
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const from = process.env.EMAIL_FROM || user;
    const to = bodyTo || process.env.EMAIL_TO;

    console.log(`[Email API] Config Check: Host=${host}, Port=${port}, User=${user}, Pass=${pass ? '***' : 'MISSING'}, To=${to}`);

    if (!host || !user || !pass || !to) {
      console.warn("[Email API] Missing configuration");
      return res.status(400).json({ 
        success: false, 
        error: "Configuração de e-mail incompleta no servidor. Verifique as variáveis de ambiente." 
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      tls: { rejectUnauthorized: false }
    });

    // Strip out quotes from fromName to avoid header corruption
    const cleanFromName = fromName ? fromName.replace(/["']/g, '') : "JIMPNEXUS";

    const mailPromise = transporter.sendMail({
      from: `"${cleanFromName}" <${from}>`,
      to,
      subject,
      text: body.replace(/<br>/g, '\n').replace(/<p>/g, '').replace(/<\/p>/g, '\n'),
      html: body.includes('<br>') || body.includes('<p>') ? body : undefined
    });

    // Hard timeout of 9 seconds for the whole operation on Vercel
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("TIMEOUT_LIMIT")), 9000)
    );

    await Promise.race([mailPromise, timeoutPromise]);

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Email API] Error details:", error);
    let errorMessage = "Erro ao enviar e-mail.";
    
    if (error.message === "TIMEOUT_LIMIT") {
      errorMessage = "O servidor de e-mail demorou demais para responder (Limite da Vercel).";
    } else if (error.code === 'EAUTH') {
      errorMessage = "Erro de Autenticação: Verifique usuário e senha.";
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = "Conexão recusada: Verifique Host e Porta.";
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = "Tempo limite esgotado: O servidor SMTP não respondeu.";
    }
    
    return res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: error.message || String(error),
      code: error.code
    });
  }
});

// API Route for Gemini analysis and chat
app.post("/api/gemini/generate", async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt) {
      return res.status(400).json({ success: false, error: "Prompt is missing." });
    }

    const rawApiKey = process.env.GEMINI_API_KEY;
    if (!rawApiKey) {
      return res.status(400).json({ 
        success: false, 
        error: "Gemini API Key is not configured on the server." 
      });
    }

    const apiKey = rawApiKey.trim();
    const targetModel = model || "gemini-3.5-flash";
    let text = "";

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const response = await ai.models.generateContent({
        model: targetModel,
        contents: prompt,
      });

      text = response.text || '';
    } catch (sdkError: any) {
      console.warn("[Gemini API SDK failed, trying direct REST fallback]:", sdkError);
      
      const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;
      const restResponse = await fetch(restUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "aistudio-build"
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!restResponse.ok) {
        const errText = await restResponse.text();
        throw new Error(`SDK Error: ${sdkError.message}. REST Fallback Error (Status ${restResponse.status}): ${errText}`);
      }

      const restData: any = await restResponse.json();
      text = restData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    return res.json({ success: true, text });
  } catch (error: any) {
    console.error("[Gemini API Server Error]:", error);
    const errorStr = (error.message || String(error)).toLowerCase();
    const isQuotaExceeded = errorStr.includes("quota") || 
                            errorStr.includes("limit") || 
                            errorStr.includes("429") || 
                            errorStr.includes("resource_exhausted") || 
                            errorStr.includes("exhausted");
    
    let userFriendlyError = "Erro ao processar a pergunta com o Gemini.";
    if (isQuotaExceeded) {
      userFriendlyError = "⚠️ Limite de Cota do Gemini Excedido (Quota Exceeded). No plano gratuito do Google AI Studio, há um limite diário e por minuto de requisições. Para resolver isso e usar sem interrupções, você pode configurar uma chave de API própria no menu superior de Configurações (ícone de engrenagem) em 'Secrets', ou aguardar alguns instantes antes de reenviar sua mensagem.";
    }

    return res.status(isQuotaExceeded ? 429 : 500).json({ 
      success: false, 
      error: userFriendlyError,
      details: error.message || String(error)
    });
  }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(500).json({ success: false, error: "Erro interno." });
});

export default app;
