import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
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
    const { subject, body, to: bodyTo } = req.body;

    // Read all SMTP configurations from environment variables
    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const from = process.env.EMAIL_FROM || user;
    
    // Use recipient from body if provided, otherwise fallback to env var
    const to = bodyTo || process.env.EMAIL_TO;

    // Basic validation: Ensure essential credentials are set
    if (!host || !user || !pass || !to) {
      console.warn("Email configuration is incomplete. Please set all required environment variables (EMAIL_HOST, EMAIL_USER, EMAIL_PASS, EMAIL_TO).");
      return res.status(500).json({ 
        success: false, 
        error: "Configuração de e-mail incompleta no servidor. Verifique os Secrets (EMAIL_HOST, EMAIL_USER, EMAIL_PASS)." 
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
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        rejectUnauthorized: false
      }
    });

    try {
      console.log(`Attempting to send email to ${to} via ${host}:${port}...`);
      await transporter.sendMail({
        from: from,
        to: to,
        subject,
        text: body,
        html: body.includes('<br>') || body.includes('<p>') ? body : undefined // Support HTML if tags are present
      });
      console.log("Email sent successfully!");
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending email:", error);
      let errorMessage = String(error);
      
      // Specific hint for common 535 error
      if (errorMessage.includes("535")) {
        errorMessage = "Erro de Autenticação (535): Usuário ou senha incorretos. Se estiver usando Gmail, você DEVE usar uma 'Senha de App'.";
      }
      
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
