import express from "express";
import nodemailer from "nodemailer";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    success: true, 
    env: process.env.VERCEL ? 'vercel' : 'local',
    node: process.version
  });
});

// Endpoint to get client IP
app.get("/api/ip", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const clientIp = typeof ip === "string" ? ip.split(",")[0].trim() : Array.isArray(ip) ? ip[0] : ip;
  res.json({ ip: clientIp });
});

// API Route for sending email
app.post("/api/send-email", async (req, res) => {
  console.log("[Email API] Received request on", process.env.VERCEL ? 'Vercel' : 'Local');
  // Exige cracha valido: sem isto, o endpoint era um relay ABERTO (qualquer um
  // enviava e-mail em nome da empresa). Agora so um usuario logado usa.
  if (!verifyBearerToken(req)) {
    return res.status(401).json({ success: false, error: "Nao autorizado." });
  }
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
  // Exige cracha valido: sem isto qualquer um queimava a cota do Gemini e
  // usava o servidor como proxy anonimo de LLM.
  if (!verifyBearerToken(req)) {
    return res.status(401).json({ success: false, error: "Nao autorizado." });
  }
  try {
    const { prompt, model, audio } = req.body;
    if (!prompt && !audio) {
      return res.status(400).json({ success: false, error: "Prompt or audio is required." });
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

    // Robust generator trying multiple compatible models if the primary one is unreleased or not accessible
    const modelsToTry = [targetModel, "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"];
    const uniqueModels = Array.from(new Set(modelsToTry));
    let lastError: any = null;
    let success = false;

    // Construct the parts array for multimodal input
    const parts: any[] = [];
    if (audio) {
      let sanitizedMimeType = audio.mimeType || "audio/webm";
      if (sanitizedMimeType.includes(";")) {
        sanitizedMimeType = sanitizedMimeType.split(";")[0];
      }
      parts.push({
        inlineData: {
          mimeType: sanitizedMimeType,
          data: audio.data
        }
      });
    }
    parts.push({
      text: prompt || "O arquivo de áudio acima é a pergunta/mensagem de voz do usuário. Por favor, ouça-o cuidadosa e atenciosamente, decodifique/entenda a pergunta e responda em formato texto de maneira clara e prestativa em português."
    });

    const sdkContents = [
      {
        role: "user",
        parts
      }
    ];

    for (const currentModel of uniqueModels) {
      if (success) break;
      try {
        console.log(`[Gemini API Server] Attempting generation with model: ${currentModel}`);
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        const response = await ai.models.generateContent({
          model: currentModel,
          contents: sdkContents,
        });

        if (response && response.text) {
          text = response.text;
          success = true;
          console.log(`[Gemini API Server] Generation successful with model (SDK): ${currentModel}`);
          break;
        }
      } catch (sdkError: any) {
        console.warn(`[Gemini API SDK failed for ${currentModel}]:`, sdkError.message || sdkError);
        lastError = sdkError;

        const sdkErrStr = (sdkError.message || String(sdkError)).toLowerCase();
        if (sdkErrStr.includes("quota") || sdkErrStr.includes("429") || sdkErrStr.includes("resource_exhausted") || sdkErrStr.includes("exhausted")) {
          console.log("[Gemini API Server] Quota exceeded detected in SDK. Breaking early to avoid useless slow retries.");
          break; // Break the model loop immediately
        }

        // Attempt direct REST fetch for this model before trying next model
        try {
          console.log(`[Gemini API Server] Attempting REST fallback for model: ${currentModel}`);
          const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${apiKey}`;
          const restResponse = await fetch(restUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "aistudio-build"
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts }]
            })
          });

          if (restResponse.ok) {
            const restData: any = await restResponse.json();
            const restText = restData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (restText) {
              text = restText;
              success = true;
              console.log(`[Gemini API Server] Generation successful with model (REST): ${currentModel}`);
              break;
            }
          } else {
            const errText = await restResponse.text();
            console.warn(`[Gemini API REST failed for ${currentModel}]: Status ${restResponse.status}, Error: ${errText}`);
            if (restResponse.status === 429 || errText.toLowerCase().includes("quota") || errText.toLowerCase().includes("exhausted")) {
              lastError = new Error(errText || "RESOURCE_EXHAUSTED");
              break; // Break the model loop immediately
            }
          }
        } catch (restError: any) {
          console.warn(`[Gemini API REST exception for ${currentModel}]:`, restError.message || restError);
          const restErrStr = (restError.message || String(restError)).toLowerCase();
          if (restErrStr.includes("quota") || restErrStr.includes("429") || restErrStr.includes("resource_exhausted") || restErrStr.includes("exhausted")) {
            lastError = restError;
            break;
          }
        }
      }
    }

    if (!success) {
      throw lastError || new Error("Todos os modelos e fallbacks falharam na geração.");
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

// ============================================================
// AUTENTICACAO (Etapa 2) — mediada pelo servidor com a chave de
// SERVICO. O navegador nunca toca na tabela users para logar.
// As funcoes verify_login / request_password_code /
// set_password_with_code so tem EXECUTE para o service_role.
// ============================================================

// Cliente Supabase com a chave de servico (lazy, so no servidor).
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const isValidEmail = (e?: string | null): e is string =>
  !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());

// Assina um JWT (HS256) com o JWT Secret do Supabase. O banco (PostgREST)
// valida esse token e a RLS le suas claims. Sem lib externa — HMAC nativo.
function b64url(input: string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function signSupabaseJwt(user: any): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    role: "authenticated",           // papel Postgres que a RLS enxerga
    aud: "authenticated",
    iss: "supabase",
    sub: user.id,                    // auth.uid()
    app_role: user.role,             // cargo do app (GESTOR, PROJETISTA, ...)
    email: user.email || undefined,
    username: user.username,
    iat: now,
    exp: now + 12 * 3600,            // 12h (uma jornada)
  }));
  const sig = b64url(createHmac("sha256", secret).update(`${header}.${payload}`).digest() as any);
  return `${header}.${payload}.${sig}`;
}

// Verifica o cracha (JWT) enviado pelo cliente: assinatura HS256 com o
// SUPABASE_JWT_SECRET + expiracao. Retorna as claims ou null. Usado para
// proteger endpoints que NAO devem ser publicos (e-mail, Gemini).
function verifyBearerToken(req: express.Request): any | null {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  const auth = String(req.headers.authorization || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${h}.${p}`).digest())
    .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  // comparacao de tempo constante
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null; // expirado
    return payload;
  } catch {
    return null;
  }
}

// Envia e-mail simples com as credenciais EMAIL_* (mesma config do /api/send-email).
async function sendPlainMail(to: string, subject: string, text: string): Promise<void> {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT || "465");
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  const from = process.env.EMAIL_FROM || user;
  if (!host || !user || !pass) throw new Error("EMAIL_* nao configurado no servidor.");
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    tls: { rejectUnauthorized: false }, // alinha com /api/send-email (cert do mail server)
  });
  await transporter.sendMail({ from: `"JIMPNexus KPI" <${from}>`, to, subject, text });
}

// POST /api/auth/login — valida via funcao do banco (hash ou, na transicao, texto puro).
app.post("/api/auth/login", async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor de autenticacao nao configurado." });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ success: false, error: "Usuario e senha sao obrigatorios." });

  const { data, error } = await admin.rpc("verify_login", {
    p_username: String(username).trim(),
    p_password: String(password),
  });
  if (error) {
    console.error("[auth/login]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao autenticar." });
  }
  const user = Array.isArray(data) ? data[0] : data;
  if (!user) return res.status(401).json({ success: false, error: "Usuario ou senha invalidos." });
  // Cracha de sessao: so emitimos para quem NAO precisa criar senha (quem
  // precisa vai para a tela de criar senha, sem sessao valida ainda).
  const token = user.must_set_password ? null : signSupabaseJwt(user);
  return res.json({ success: true, user, token });
});

// POST /api/auth/request-code — gera e ENVIA por e-mail o codigo para criar senha.
// Resposta neutra (nao revela se o usuario existe). Se o usuario nao tem e-mail
// valido, NAO gera codigo (para nao trava-lo) e retorna delivered:"no_email".
app.post("/api/auth/request-code", async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor de autenticacao nao configurado." });
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ success: false, error: "Usuario obrigatorio." });
  const uname = String(username).trim();

  const { data: rows } = await admin.from("users").select("email,name").ilike("username", uname).limit(1);
  const u = rows && rows[0];
  const email = u?.email?.trim();
  if (!u || !isValidEmail(email)) {
    return res.json({ success: true, delivered: "no_email" });
  }

  const { data: code, error } = await admin.rpc("request_password_code", { p_username: uname, p_hours: 24 });
  if (error || !code) {
    console.error("[auth/request-code]", error?.message);
    return res.status(500).json({ success: false, error: "Erro ao gerar o codigo." });
  }
  try {
    await sendPlainMail(email, "JIMPNexus KPI — codigo para criar sua senha",
`${u.name || ""},

Use o codigo abaixo para criar a sua senha no JIMPNexus KPI:

    Codigo: ${code}

O codigo vale 24 horas e serve uma unica vez.
Se nao foi voce que pediu, ignore este e-mail.

-- JIMPNexus KPI (mensagem automatica, nao responda)`);
  } catch (e: any) {
    console.error("[auth/request-code] falha ao enviar e-mail:", e.message);
    // Desfaz a marcacao para nao deixar o usuario preso sem ter recebido o codigo.
    await admin.from("users")
      .update({ must_set_password: false, reset_code_hash: null, reset_code_expires: null })
      .ilike("username", uname);
    return res.status(500).json({ success: false, error: "Nao consegui enviar o e-mail com o codigo. Tente novamente." });
  }
  return res.json({ success: true, delivered: "email" });
});

// POST /api/auth/set-password — valida o codigo, grava a senha com hash, apaga o texto puro.
app.post("/api/auth/set-password", async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor de autenticacao nao configurado." });
  const { username, code, newPassword } = req.body || {};
  if (!username || !code || !newPassword) return res.status(400).json({ success: false, error: "Dados incompletos." });
  if (String(newPassword).length < 6) return res.status(400).json({ success: false, error: "A senha deve ter ao menos 6 caracteres." });

  const { data, error } = await admin.rpc("set_password_with_code", {
    p_username: String(username).trim(),
    p_code: String(code),
    p_new_password: String(newPassword),
  });
  if (error) {
    console.error("[auth/set-password]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao salvar a senha." });
  }
  if (data !== true) return res.status(400).json({ success: false, error: "Codigo invalido ou expirado." });
  return res.json({ success: true });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(500).json({ success: false, error: "Erro interno." });
});

export default app;
