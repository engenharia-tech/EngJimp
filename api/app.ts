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

// API Route for Gemini
app.post("/api/gemini", async (req, res) => {
  try {
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Gemini API Key is not configured." });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    res.json({ success: true, text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ success: false, error: String(error) });
  }
});

// API Route for sending email
app.post("/api/send-email", async (req, res) => {
  console.log("[Email API] Received request on", process.env.VERCEL ? 'Vercel' : 'Local');
  try {
    const { subject, body, to: bodyTo } = req.body;
    
    if (!subject || !body) {
      return res.status(400).json({ success: false, error: "Assunto ou corpo do e-mail ausente." });
    }
    
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const from = process.env.EMAIL_FROM || user;
    const to = bodyTo || process.env.EMAIL_TO;

    console.log(`[Email API] Config: Host=${host}, Port=${port}, User=${user}, To=${to}`);

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

    // Skip verify on Vercel to save time
    if (!process.env.VERCEL) {
      await transporter.verify();
    }
    
    await transporter.sendMail({
      from: `"JIMPNEXUS" <${from}>`,
      to,
      subject,
      text: body.replace(/<br>/g, '\n').replace(/<p>/g, '').replace(/<\/p>/g, '\n'),
      html: body.includes('<br>') || body.includes('<p>') ? body : undefined
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Email API] Error details:", error);
    let errorMessage = "Erro ao enviar e-mail.";
    if (error.code === 'EAUTH') errorMessage = "Erro de Autenticação: Verifique usuário e senha.";
    if (error.code === 'ECONNREFUSED') errorMessage = "Conexão recusada: Verifique Host e Porta.";
    if (error.code === 'ETIMEDOUT') errorMessage = "Tempo limite esgotado: O servidor SMTP não respondeu.";
    
    return res.status(500).json({ 
      success: false, 
      error: errorMessage,
      details: error.message || String(error),
      code: error.code
    });
  }
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(500).json({ success: false, error: "Erro interno." });
});

export default app;
