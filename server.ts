import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// API Route for Gemini (Server-side only)
app.post("/api/gemini", async (req, res) => {
  try {
    const { prompt } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Gemini API Key is not configured on the server." });
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
  try {
    const { subject, body, to: bodyTo } = req.body;
    
    // Explicitly read from process.env for Vercel/Local compatibility
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const from = process.env.EMAIL_FROM || user;
    const to = bodyTo || process.env.EMAIL_TO;

    console.log(`[Email API] Attempting send: To=${to}, Host=${host}, Port=${port}, User=${user}`);
    
    if (!host || !user || !pass || !to) {
      const missing = [];
      if (!host) missing.push("EMAIL_HOST");
      if (!user) missing.push("EMAIL_USER");
      if (!pass) missing.push("EMAIL_PASS");
      if (!to) missing.push("EMAIL_TO");
      
      const errorMsg = `Configuração incompleta. Faltando: ${missing.join(", ")}. Certifique-se de configurar estas variáveis no menu Settings > Secrets do AI Studio ou no Dashboard da Vercel.`;
      console.warn(`[Email API] ${errorMsg}`);
      return res.status(400).json({ success: false, error: errorMsg });
    }

    const isSecure = port === 465;
    console.log(`[Email API] Using secure=${isSecure} for port=${port}`);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: false
      }
    });

    console.log(`[Email API] Verifying connection...`);
    await transporter.verify();
    
    console.log(`[Email API] Sending...`);
    await transporter.sendMail({
      from: `"JIMPNEXUS" <${from}>`,
      to,
      subject,
      text: body.replace(/<br>/g, '\n').replace(/<p>/g, '').replace(/<\/p>/g, '\n'),
      html: body.includes('<br>') || body.includes('<p>') ? body : undefined
    });

    console.log("[Email API] Success!");
    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Email API] Error details:", error);
    
    let errorMessage = "Erro ao enviar e-mail.";
    if (error.code === 'EAUTH' || (error.message && error.message.includes("535"))) {
      errorMessage = "Erro de Autenticação: Usuário ou senha incorretos. Se usar Gmail, use uma 'Senha de App'.";
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = "Conexão recusada: O servidor SMTP não respondeu. Verifique o Host e a Porta.";
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = "Timeout: O servidor SMTP demorou muito para responder.";
    } else if (error.message) {
      errorMessage = `Erro do Servidor SMTP: ${error.message}`;
    }
    
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
  console.error("Global Error Handler:", err);
  res.status(500).json({
    success: false,
    error: "Erro interno do servidor.",
    details: err.message || String(err)
  });
});

// Vite middleware for development or Static serving for production
async function setupVite() {
  // In Vercel, we don't need to serve static files from Express if vercel.json handles it,
  // but keeping it for local production builds and general compatibility.
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Only run setupVite and listen if not in Vercel environment
// Vercel will handle the routing and serving via vercel.json and /api/index.ts
if (!process.env.VERCEL) {
  setupVite().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

// Export for Vercel
export default app;
