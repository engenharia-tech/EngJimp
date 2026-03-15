import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for sending email
  app.post("/api/send-email", async (req, res) => {
    const { subject, body, config } = req.body;

    const host = config?.emailHost || process.env.EMAIL_HOST || "smtp.gmail.com";
    const port = parseInt(config?.emailPort || process.env.EMAIL_PORT || "587");
    const user = config?.emailUser || process.env.EMAIL_USER;
    const pass = config?.emailPass || process.env.EMAIL_PASS;
    const from = config?.emailFrom || process.env.EMAIL_FROM || user;
    const to = config?.emailTo || process.env.EMAIL_TO;

    if (!user || !pass) {
      console.warn("Email credentials not configured. Skipping email send.");
      return res.status(200).json({ success: true, message: "Email simulation: Credentials missing." });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        // Do not fail on invalid certs (common with custom SMTP servers)
        rejectUnauthorized: false
      }
    });

    try {
      console.log(`Attempting to send email to ${to} via ${host}:${port}...`);
      await transporter.sendMail({
        from: from || user,
        to,
        subject,
        text: body,
      });
      console.log("Email sent successfully!");
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ success: false, error: String(error) });
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
