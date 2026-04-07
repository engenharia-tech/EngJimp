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
  const { prompt } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API Key is not configured on the server." });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    res.json({ text: response.text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: String(error) });
  }
});

// API Route for sending email
app.post("/api/send-email", async (req, res) => {
  try {
    const { subject, body, to: bodyTo } = req.body;
    
    // Read all SMTP configurations from environment variables
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const from = process.env.EMAIL_FROM || user;
    
    // Use recipient from body if provided, otherwise fallback to env var
    const to = bodyTo || process.env.EMAIL_TO;

    // Debug log (without password)
    console.log(`[Email API] Request: To=${to}, Subject=${subject}, BodyLength=${body?.length}`);
    console.log(`[Email API] Config: Host=${host}, Port=${port}, User=${user}, From=${from}`);
    
    // Basic validation: Ensure essential credentials are set
    if (!host || !user || !pass || !to) {
      const missing = [];
      if (!host) missing.push("EMAIL_HOST");
      if (!user) missing.push("EMAIL_USER");
      if (!pass) missing.push("EMAIL_PASS");
      if (!to) missing.push("EMAIL_TO (env or body)");
      
      console.warn(`[Email API] Incomplete configuration. Missing: ${missing.join(", ")}`);
      return res.status(500).json({ 
        success: false, 
        error: `Configuração de e-mail incompleta no servidor. Faltando: ${missing.join(", ")}` 
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
      tls: {
        rejectUnauthorized: false
      }
    });

    // Verify connection configuration
    console.log(`[Email API] Verifying SMTP connection...`);
    await transporter.verify();
    console.log(`[Email API] SMTP connection verified!`);

    console.log(`[Email API] Sending email...`);
    await transporter.sendMail({
      from: `"JIMPNEXUS" <${from}>`,
      to: to,
      subject,
      text: body.replace(/<br>/g, '\n').replace(/<p>/g, '').replace(/<\/p>/g, '\n'),
      html: body.includes('<br>') || body.includes('<p>') ? body : undefined // Support HTML if tags are present
    });
    console.log("[Email API] Email sent successfully!");
    res.json({ success: true });
  } catch (error: any) {
    console.error("[Email API] Error sending email:", error);
    let errorMessage = "Falha ao enviar e-mail.";
    
    // Specific hint for common errors
    if (error.message && typeof error.message === 'string') {
      if (error.message.includes("535")) {
        errorMessage = "Erro de Autenticação (535): Usuário ou senha incorretos. Se estiver usando Gmail, você DEVE usar uma 'Senha de App'.";
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = `Não foi possível conectar ao servidor SMTP. Verifique o Host e a Porta.`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = "Tempo limite de conexão esgotado (Timeout). O servidor SMTP demorou muito para responder.";
      }
    }
    
    res.status(500).json({ 
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
// Vercel will handle the routing and serving via vercel.json
if (!process.env.VERCEL) {
  setupVite().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

// Export for Vercel
export default app;
