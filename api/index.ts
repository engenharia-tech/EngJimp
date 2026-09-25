import express from "express";
import nodemailer from "nodemailer";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes, randomUUID } from "crypto";

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

// GET /api/branding — dados PUBLICOS da tela de login (logo + nome da empresa).
// Publico de proposito: substitui a leitura anonima da tabela `settings`
// inteira (M2 da auditoria), que entregava email_to/email_from/templates/
// hourly_cost para quem NAO esta logado. Aqui so saem logo e nome.
app.get("/api/branding", async (req, res) => {
  const admin = getSupabaseAdmin();
  if (!admin) return res.json({ logoUrl: null, companyName: "JIMPNexus" });
  try {
    const { data } = await admin.from("settings").select("logo_url, company_name").limit(1);
    const row = data && data[0];
    const clean = (v: any) => (v && v !== "null") ? String(v) : null;
    return res.json({
      logoUrl: clean(row?.logo_url),
      companyName: clean(row?.company_name) || "JIMPNexus",
    });
  } catch {
    return res.json({ logoUrl: null, companyName: "JIMPNexus" });
  }
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

    // Allow-list de destinatarios (residuo do C3): so dominios da empresa +
    // enderecos configurados em settings. Fecha o phishing externo.
    const adminForRecips = getSupabaseAdmin();
    const configured = adminForRecips ? await configuredRecipients(adminForRecips) : new Set<string>();
    const recipients = String(to).split(",").map((s) => s.trim()).filter(Boolean);
    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: "Nenhum destinatário válido." });
    }
    const blocked = recipients.filter((r) => !recipientAllowed(r, configured));
    if (blocked.length > 0) {
      console.warn("[Email API] Destinatário bloqueado:", blocked.join(", "));
      return res.status(403).json({ success: false, error: `Destinatário não permitido: ${blocked.join(", ")}. Apenas endereços da empresa.` });
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
  const claims = verifyBearerToken(req);
  if (!claims) {
    return res.status(401).json({ success: false, error: "Nao autorizado." });
  }
  // Anti abuso de cota: por usuario e por IP (janela de 1 min).
  const ip = clientIp(req);
  if ((await rlHit(`gemini:user:${claims.sub}`, 60)) > 30) return tooMany(res, 60);
  if ((await rlHit(`gemini:ip:${ip}`, 60)) > 120) return tooMany(res, 60);
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
    okr_admin: user.okr_admin ? "true" : undefined, // admin de OKR (lê/escreve todos)
    iat: now,
    exp: now + 24 * 3600,            // 24h
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

// Identidade do DONO (Edson). Salario e um dado que SO ele pode ver/editar —
// nem outros GESTORES. Centralizado aqui para nao espalhar o hardcode.
const EDSON_EMAIL = "efariaseng0@gmail.com";
// Pelo ID (claim `sub`), que o usuário não consegue mudar. Antes comparava e-mail/
// username do token — e qualquer logado podia trocar o próprio e-mail para este
// pelo /api/users/save e, no login seguinte, "virar" o Edson (salários, OKR de todos).
const EDSON_ID = "1e570c78-7278-4e8d-a90e-a820c11bb07a";
function claimsAreEdson(claims: any): boolean {
  return !!claims && String(claims.sub || "") === EDSON_ID;
}
// Escapa curingas do ILIKE (% e _) para comparar um texto EXATO sem distinguir maiúsculas.
const ilikeExact = (s: string) => String(s).replace(/[\\%_]/g, (c) => "\\" + c);
// uuid só na forma canônica (minúsculo, com hífens). O banco converte QUALQUER grafia
// (MAIÚSCULA, sem hífen, entre chaves) para o mesmo uuid — comparar o texto do cliente
// com EDSON_ID deixava passar o id do Edson escrito de outro jeito.
const canonUuid = (v: any): string | null => {
  const s = String(v ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
};
// O cargo que vale é o do CADASTRO agora, não o gravado no crachá (que dura 24 h):
// um admin rebaixado deixava de ser admin só quando o crachá vencia.
// Falha na leitura LANÇA (a rota responde 503): "não consegui conferir" não pode
// virar "não é admin" — o admin recebia "salvo" e a senha/cargo eram ignorados.
const currentRole = async (admin: any, sub: any): Promise<string | null> => {
  const id = canonUuid(sub); if (!id) return null;
  const { data, error } = await admin.from("users").select("role").eq("id", id).limit(1);
  if (error) throw new Error("Nao consegui conferir o seu cargo. Tente de novo.");
  if (!data || !data.length) return null;
  return String((data[0] as any).role || "");
};

// ---- Rate limiting (anti brute-force). Serverless nao guarda estado em
// memoria entre invocacoes, entao a contagem fica no banco (funcoes
// rate_limit_* via service_role). Fail-open: se a funcao ainda nao existe
// (migracao 006 nao rodada) ou o banco falha, NAO travamos o usuario legitimo.
function clientIp(req: express.Request): string {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : (xff || req.socket.remoteAddress || "");
  return String(raw).split(",")[0].trim() || "unknown";
}
async function rlHit(bucket: string, windowSeconds: number): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  const { data, error } = await admin.rpc("rate_limit_hit", { p_bucket: bucket, p_window_seconds: windowSeconds });
  if (error) { console.warn("[rate_limit_hit]", error.message); return 0; } // fail-open
  return Number(data) || 0;
}
async function rlCount(bucket: string, windowSeconds: number): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  const { data, error } = await admin.rpc("rate_limit_count", { p_bucket: bucket, p_window_seconds: windowSeconds });
  if (error) { console.warn("[rate_limit_count]", error.message); return 0; } // fail-open
  return Number(data) || 0;
}
async function rlReset(bucket: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try { await admin.rpc("rate_limit_reset", { p_bucket: bucket }); } catch { /* best-effort */ }
}
function tooMany(res: express.Response, retryAfterSeconds: number) {
  return res.status(429).set("Retry-After", String(retryAfterSeconds))
    .json({ success: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
}

// ---- Allow-list de destinatarios de e-mail (residuo do C3). /api/send-email
// exige token, mas ainda aceitava `to` livre: um logado poderia mandar e-mail
// com o dominio da empresa (SPF/DKIM valido) para uma vitima EXTERNA (phishing).
// Restringe a: dominios da empresa + os enderecos configurados em `settings`.
const ALLOWED_EMAIL_DOMAINS = ["joinvilleimplementos.com.br", "furgoesjoinville.com.br", "jimp.com.br"];
async function configuredRecipients(admin: any): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const { data } = await admin.from("settings").select("email_to, interruption_email_to, email_from").limit(1);
    const row = data && data[0];
    for (const f of ["email_to", "interruption_email_to", "email_from"]) {
      const v = row?.[f];
      if (v) String(v).split(",").forEach((a: string) => { const t = a.trim().toLowerCase(); if (t) set.add(t); });
    }
  } catch { /* sem settings: fica so o dominio */ }
  return set;
}
function recipientAllowed(addr: string, configured: Set<string>): boolean {
  const a = String(addr || "").trim().toLowerCase();
  if (!a || !a.includes("@")) return false;
  if (configured.has(a)) return true;
  return ALLOWED_EMAIL_DOMAINS.includes(a.split("@")[1] || "");
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

  // Anti brute-force. Por IP: trava um atacante martelando varias contas.
  // Por usuario: so conta FALHAS e zera no sucesso — nao trava quem acerta.
  const ip = clientIp(req);
  const unameKey = String(username).trim().toLowerCase();
  // IP alto de proposito: os 12 podem estar atras do MESMO IP do escritorio.
  // A trava real e a de FALHAS por usuario (nao afeta quem acerta a senha).
  if ((await rlHit(`login:ip:${ip}`, 900)) > 100) return tooMany(res, 900);
  if ((await rlCount(`login:fail:${unameKey}`, 900)) >= 8) return tooMany(res, 900);

  const { data, error } = await admin.rpc("verify_login", {
    p_username: String(username).trim(),
    p_password: String(password),
  });
  if (error) {
    console.error("[auth/login]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao autenticar." });
  }
  const user = Array.isArray(data) ? data[0] : data;
  if (!user) {
    await rlHit(`login:fail:${unameKey}`, 900); // registra a falha
    return res.status(401).json({ success: false, error: "Usuario ou senha invalidos." });
  }
  await rlReset(`login:fail:${unameKey}`); // sucesso limpa as falhas do usuario
  // Cracha de sessao: so emitimos para quem NAO precisa criar senha (quem
  // precisa vai para a tela de criar senha, sem sessao valida ainda).
  const token = user.must_set_password ? null : signSupabaseJwt(user);
  // Sanitiza: o payload de login NUNCA leva salary/senha/hash para o navegador
  // (C2). So o Edson ve salario, e por uma porta propria (/api/users/salaries).
  const safeUser = {
    id: user.id, username: user.username, name: user.name, surname: user.surname,
    email: user.email, phone: user.phone, role: user.role,
    must_set_password: user.must_set_password,
    okr_enabled: user.okr_enabled, okr_only: user.okr_only, sector: user.sector,
    okr_admin: user.okr_admin,
  };
  return res.json({ success: true, user: safeUser, token });
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

  // Anti abuso: pedir codigo tem efeito colateral (marca must_set_password e
  // dispara e-mail), entao limita por IP e por usuario, independente de sucesso.
  const ip = clientIp(req);
  if ((await rlHit(`reqcode:ip:${ip}`, 3600)) > 30) return tooMany(res, 3600);
  if ((await rlHit(`reqcode:user:${uname.toLowerCase()}`, 3600)) > 4) return tooMany(res, 3600);

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

  // Anti brute-force do codigo (6 digitos = 1M combinacoes). Por IP e por
  // usuario (so falhas, zera no sucesso). Depois de N erros, trava a janela.
  const ip = clientIp(req);
  const unameKey = String(username).trim().toLowerCase();
  if ((await rlHit(`setpw:ip:${ip}`, 900)) > 60) return tooMany(res, 900);
  if ((await rlCount(`setpw:fail:${unameKey}`, 900)) >= 6) return tooMany(res, 900);

  const { data, error } = await admin.rpc("set_password_with_code", {
    p_username: String(username).trim(),
    p_code: String(code),
    p_new_password: String(newPassword),
  });
  if (error) {
    console.error("[auth/set-password]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao salvar a senha." });
  }
  if (data !== true) {
    await rlHit(`setpw:fail:${unameKey}`, 900); // registra a tentativa errada do codigo
    return res.status(400).json({ success: false, error: "Codigo invalido ou expirado." });
  }
  await rlReset(`setpw:fail:${unameKey}`); // sucesso limpa as falhas
  return res.json({ success: true });
});

// ---- A senha de quem JÁ está logado (perfil e tela de bloqueio). Quem é vem do
// crachá (sub), nunca do corpo; a conferência é feita NO BANCO, pelas funções
// kpi_senha_confere / kpi_trocar_propria_senha (só service_role, mesma regra do
// verify_login). Antes o navegador comparava com `user.password`, que o login
// deixa vazio: o perfil nunca salvava e a tela de bloqueio nunca destravava.
// As duas rotas dividem o limite de erros: 6 senhas erradas em 15 min travam.
const PW_JANELA = 900;
async function pwGuard(req: express.Request, res: express.Response): Promise<{ admin: any; id: string } | null> {
  const claims = verifyBearerToken(req);
  const id = claims ? canonUuid(claims.sub) : null;
  if (!id) { res.status(401).json({ success: false, error: "Sessao expirada. Entre de novo." }); return null; }
  const admin = getSupabaseAdmin();
  if (!admin) { res.status(503).json({ success: false, error: "Servidor nao configurado." }); return null; }
  if ((await rlHit(`pw:ip:${clientIp(req)}`, PW_JANELA)) > 60) { tooMany(res, PW_JANELA); return null; }
  // A tentativa é CONTADA antes de conferir a senha (acertar zera). Conferir antes e
  // contar depois deixava 60 pedidos simultâneos testarem 60 senhas (todos liam 0).
  if ((await rlHit(`pw:fail:${id}`, PW_JANELA)) > 6) { tooMany(res, PW_JANELA); return null; }
  return { admin, id };
}

// POST /api/auth/change-password { currentPassword, newPassword } — troca a PRÓPRIA senha.
app.post("/api/auth/change-password", async (req, res) => {
  const g = await pwGuard(req, res);
  if (!g) return;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: "Informe a senha atual e a nova." });
  if (String(newPassword).length < 6) return res.status(400).json({ success: false, error: "A senha nova deve ter ao menos 6 caracteres." });

  const { data, error } = await g.admin.rpc("kpi_trocar_propria_senha", {
    p_user: g.id, p_atual: String(currentPassword), p_nova: String(newPassword),
  });
  if (error) {
    console.error("[auth/change-password]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao trocar a senha." });
  }
  if (data === "ATUAL_ERRADA") {
    return res.status(400).json({ success: false, error: "A senha atual está incorreta." });   // já contada no pwGuard
  }
  if (data === "CURTA") return res.status(400).json({ success: false, error: "A senha nova deve ter ao menos 6 caracteres." });
  if (data !== "OK") return res.status(404).json({ success: false, error: "Usuário não encontrado." });
  await rlReset(`pw:fail:${g.id}`);
  return res.json({ success: true });
});

// POST /api/auth/confirm-password { password } — a tela de bloqueio confere a senha.
app.post("/api/auth/confirm-password", async (req, res) => {
  const g = await pwGuard(req, res);
  if (!g) return;
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ success: false, error: "Informe a senha." });

  const { data, error } = await g.admin.rpc("kpi_senha_confere", { p_user: g.id, p_senha: String(password) });
  if (error) {
    console.error("[auth/confirm-password]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao conferir a senha." });
  }
  if (data !== true) {
    return res.status(400).json({ success: false, error: "Senha incorreta." });   // já contada no pwGuard
  }
  await rlReset(`pw:fail:${g.id}`);
  return res.json({ success: true });
});

// ============================================================
// GESTAO DE USUARIOS (mediada pelo servidor) — C1 da auditoria.
// Escritas em `users` param de sair do navegador. O servidor confere o
// CARGO no cracha (JWT) e escreve via service_role. Assim, um projetista
// nao pode mais mudar o proprio cargo p/ CEO nem sobrescrever a senha de
// ninguem falando direto com o banco.
// ============================================================
const ADMIN_ROLES = ["GESTOR", "CEO", "COORDENADOR"];

// POST /api/users/save { mode: 'create'|'update', user }
app.post("/api/users/save", async (req, res) => {
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });

  const { mode, user } = req.body || {};
  if (!user || !user.username) return res.status(400).json({ success: false, error: "Dados incompletos." });
  let isAdmin = false;
  try { isAdmin = ADMIN_ROLES.includes(String(await currentRole(admin, claims.sub))); }
  catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }

  // O id vem do cliente: só vale na forma canônica (o banco aceitaria o id do Edson em
  // MAIÚSCULAS, sem hífen ou entre chaves, e a trava abaixo compararia texto com texto).
  if (user.id !== undefined && user.id !== null && user.id !== "") {
    const idN = canonUuid(user.id);
    if (!idN) return res.status(400).json({ success: false, error: "id invalido." });
    user.id = idN;
  }
  const isSelf = !!user.id && user.id === canonUuid(claims.sub);

  // E-mail e username são identidade: ninguém pode assumir os de outra pessoa
  // (sem distinguir maiúsculas). O banco também barra (índices únicos lower() e
  // CHECK sem espaço). Espaço/TAB/quebra de linha escondido não passa: um e-mail com
  // TAB no fim casava com o do Edson depois do trim() e escapava do índice.
  const emailNorm = String(user.email || "").replace(/\s+/g, "");
  const usernameNorm = String(user.username || "").trim();
  if (!usernameNorm) return res.json({ success: false, message: "Informe o nome de usuário." });
  if (/\s/.test(usernameNorm)) return res.json({ success: false, message: "Nome de usuário não pode ter espaço." });
  // Só caractere visível (o banco também exige): invisíveis como U+200B/U+FEFF
  // faziam "o e-mail do Edson" com um sobrando no fim passar pelo índice único.
  if (!/^[!-~]+$/.test(usernameNorm)) return res.json({ success: false, message: "O nome de usuário só pode ter letras sem acento, números e símbolos (sem espaço)." });
  if (emailNorm && !/^[!-~]+$/.test(emailNorm)) return res.json({ success: false, message: "O e-mail tem um caractere inválido (acento ou caractere invisível)." });
  user.email = emailNorm || null;
  user.username = usernameNorm;
  // A conta do Edson (dono do sistema) só ele mesmo altera; e ninguém cria outra
  // conta com o id dele (o id é a identidade de dono em todo o sistema).
  if (user.id === EDSON_ID && (mode === "create" || !claimsAreEdson(claims))) {
    return res.status(403).json({ success: false, error: "Só o próprio Edson altera a conta dele." });
  }
  // Consulta que FALHA não pode passar como "não está em uso" (antes passava).
  const inUse = async (col: "email" | "username", val: string, exceptId?: string) => {
    let q = admin.from("users").select("id").ilike(col, ilikeExact(val.trim()));
    if (exceptId) q = q.neq("id", exceptId);
    const { data, error } = await q.limit(1);
    if (error) throw new Error("Não consegui conferir se o " + (col === "email" ? "e-mail" : "nome de usuário") + " já existe. Tente de novo.");
    return !!(data && data.length);
  };
  // O OKR de cada um é achado pelo login (owner_key). Um login que já é a chave do
  // OKR de OUTRA pessoa não pode ser tomado: quem o pegasse ganharia o OKR dela.
  const okrKeyTaken = async (key: string, exceptKey?: string) => {
    if (!key || key === exceptKey) return false;
    const { data, error } = await admin.from("okr_state").select("owner_key").eq("owner_key", key).limit(1);
    if (error) throw new Error("Não consegui conferir o nome de usuário. Tente de novo.");
    return !!(data && data.length);
  };
  try {
    if (emailNorm && (await inUse("email", emailNorm, mode === "create" ? undefined : user.id))) {
      return res.json({ success: false, message: "Este e-mail já pertence a outro usuário." });
    }
  } catch (e: any) { return res.json({ success: false, message: e.message }); }

  if (mode === "create") {
    if (!isAdmin) return res.status(403).json({ success: false, error: "Sem permissao para criar usuarios." });
    try {
      if (await inUse("username", user.username)) return res.json({ success: false, message: "Nome de usuário já existe." });
      if (await okrKeyTaken(user.username.toLowerCase())) return res.json({ success: false, message: "Esse nome de usuário está ligado ao OKR de outra pessoa." });
    } catch (e: any) { return res.json({ success: false, message: e.message }); }
    // Salario so e gravado se quem cria for o Edson. Um admin comum nem
    // enxerga salario (cliente recebe 0), entao nunca escreve esse campo.
    const { error } = await admin.from("users").insert([{
      id: user.id || randomUUID(), name: user.name, surname: user.surname, email: user.email, phone: user.phone,
      username: user.username, password: user.password, role: user.role,
      salary: claimsAreEdson(claims) ? (Number(user.salary) || 0) : 0,
      okr_enabled: !!(user.okrEnabled || user.okrOnly), // "somente OKR" implica ter OKR
      okr_only: !!user.okrOnly,
      sector: user.sector || null,
    }]);
    if (error) return res.json({ success: false, message: `Erro DB: ${error.message}` });
    return res.json({ success: true });
  }

  // Meu Perfil: SÓ o contato da própria pessoa. O perfil manda o usuário que o
  // navegador guardou no login (até 12 h de idade); pelo caminho de 'update', um
  // admin que trocasse só o telefone regravava cargo, OKR, setor e até o login com
  // esses valores velhos — desfazendo calado o que alguém mudou no meio do dia.
  if (mode === "profile") {
    if (!isSelf) return res.status(403).json({ success: false, error: "O perfil só altera o próprio usuário." });
    const nome = String(user.name || "").trim();
    if (!nome) return res.json({ success: false, message: "Informe o seu nome." });
    const { error: pErr } = await admin.from("users")
      .update({ name: nome, surname: String(user.surname || "").trim(), email: user.email, phone: user.phone || null })
      .eq("id", user.id);
    if (pErr) {
      if ((pErr as any).code === "23505") return res.json({ success: false, message: "Este e-mail já pertence a outro usuário." });
      return res.json({ success: false, message: `Erro DB: ${pErr.message}` });
    }
    return res.json({ success: true });
  }

  // update
  if (!user.id) return res.status(400).json({ success: false, error: "id ausente." });
  if (!String(user.name || "").trim()) return res.json({ success: false, message: "Informe o nome." });
  if (!isAdmin && !isSelf) return res.status(403).json({ success: false, error: "Sem permissao." });
  // Todos podem editar dados de contato; SO admin muda username/role/salary/senha.
  const patch: any = { name: user.name, surname: user.surname, email: user.email, phone: user.phone };
  let renameTo = "";
  if (isAdmin) {
    // Renomear para um username que já existe (mesmo mudando maiúsculas, ex.: "EDSON") é recusado.
    try {
      if (await inUse("username", user.username, user.id)) return res.json({ success: false, message: "Nome de usuário já existe." });
      const { data: cur, error: curErr } = await admin.from("users").select("username").eq("id", user.id).limit(1);
      if (curErr) return res.json({ success: false, message: "Não consegui ler o usuário. Tente de novo." });
      if (!cur || !cur.length) return res.json({ success: false, message: "Usuário não encontrado." });
      const oldName = String((cur[0] as any).username || "").trim();
      if (oldName !== user.username) {
        // O login do Edson é fixo: o OKR e a governança dele são lidos pela chave 'edson'.
        if (user.id === EDSON_ID && oldName.toLowerCase() !== user.username.toLowerCase()) {
          return res.json({ success: false, message: "O login do Edson é fixo (o OKR e a governança dependem dele)." });
        }
        if (await okrKeyTaken(user.username.toLowerCase(), oldName.toLowerCase())) return res.json({ success: false, message: "Esse nome de usuário está ligado ao OKR de outra pessoa." });
        renameTo = user.username;
      }
    } catch (e: any) { return res.json({ success: false, message: e.message }); }
    patch.role = user.role;
    // A PRÓPRIA senha só muda por /api/auth/change-password, que confere a atual.
    if (user.password && !isSelf) patch.password = user.password;
    patch.okr_enabled = !!(user.okrEnabled || user.okrOnly); // "somente OKR" implica ter OKR
    patch.okr_only = !!user.okrOnly;
    patch.sector = user.sector || null;
  }
  // Salario: leitura E escrita restritas ao Edson. Sem esta guarda, um admin
  // comum editando um usuario ZERARIA o salario real (o cliente dele tem 0).
  if (claimsAreEdson(claims) && user.salary !== undefined && user.salary !== null) {
    patch.salary = Number(user.salary) || 0;
  }
  // Troca de login + a chave do OKR dele numa transação só (kpi_rename_login): antes
  // eram duas chamadas, e se a segunda falhasse a pessoa perdia o próprio OKR.
  if (renameTo) {
    const { error: rnErr } = await admin.rpc("kpi_rename_login", { p_user: user.id, p_new: renameTo });
    if (rnErr) {
      const m = String(rnErr.message || "");
      if (/OKR_CHAVE_OCUPADA/.test(m)) return res.json({ success: false, message: "Esse nome de usuário está ligado ao OKR de outra pessoa." });
      if ((rnErr as any).code === "23505") return res.json({ success: false, message: "Nome de usuário já existe." });
      return res.json({ success: false, message: `Não consegui trocar o login: ${m}` });
    }
  }
  const { error } = await admin.from("users").update(patch).eq("id", user.id);
  if (error) {
    if ((error as any).code === "23505") return res.json({ success: false, message: "E-mail ou nome de usuário já pertence a outra pessoa." });
    return res.json({ success: false, message: `Erro DB: ${error.message}${renameTo ? " (o login novo já foi gravado)" : ""}` });
  }
  if (isSelf && user.password) {
    return res.json({ success: true, message: "Os dados foram salvos, mas a SUA senha não muda por aqui: troque em Meu Perfil, que confere a senha atual." });
  }
  return res.json({ success: true });
});

// POST /api/settings/save { row } — grava as configuracoes. Escrita mediada
// pelo servidor (mesma logica do C1): a policy de escrita direta em `settings`
// e removida (migracao 007), entao QUALQUER logado (ate projetista) nao pode
// mais mudar custo/hora, destinatarios de e-mail ou templates falando direto
// com o banco. So admin (ou o Edson) grava, via service_role.
const SETTINGS_WRITABLE = new Set([
  "hourly_cost", "use_automatic_cost", "company_name", "email_to", "email_from",
  "interruption_email_to", "interruption_email_template", "completion_email_template",
  "workday_start", "workday_end", "workdays", "lunch_start", "lunch_end",
  "language", "auto_lock_timeout", "logo_url",
  "nexus_hidden_users",
]);
app.post("/api/settings/save", async (req, res) => {
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  let roleOk = false;
  try { roleOk = ADMIN_ROLES.includes(String(await currentRole(admin, claims.sub))); }
  catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
  if (!(roleOk || claimsAreEdson(claims))) {
    return res.status(403).json({ success: false, error: "Sem permissao para alterar configuracoes." });
  }

  const incoming = (req.body && req.body.row) || {};
  const row: any = {};
  for (const k of Object.keys(incoming)) if (SETTINGS_WRITABLE.has(k)) row[k] = incoming[k];
  if (Object.keys(row).length === 0) return res.json({ success: true }); // nada a gravar

  const { data: existing, error: selErr } = await admin.from("settings").select("id").limit(1);
  if (selErr) return res.json({ success: false, message: selErr.message });
  if (existing && existing.length > 0) {
    const { error } = await admin.from("settings").update(row).eq("id", (existing[0] as any).id);
    if (error) return res.json({ success: false, message: error.message });
  } else {
    const { error } = await admin.from("settings").insert([row]);
    if (error) return res.json({ success: false, message: error.message });
  }
  return res.json({ success: true });
});

// ========================= OKR =========================
// POST /api/okr/share — gera (ou reusa) o token do link publico DO PROPRIO OKR.
// Cada usuario logado compartilha o SEU (owner_key = username minusculo), para
// mandar o link so-leitura ao gestor. O Edson compartilha o dele ('edson').
app.post("/api/okr/share", async (req, res) => {
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });

  // "O seu OKR" = o nome de usuário ATUAL do cadastro (pelo id do crachá), não o
  // nome gravado no crachá, que dura 24 h e pode ter ficado para trás de uma troca.
  const { data: me, error: meErr } = await admin.from("users").select("username").eq("id", String(claims.sub || "")).limit(1);
  if (meErr) return res.status(500).json({ success: false, error: "Nao consegui conferir o usuario." });
  const self = String((me && me[0] && (me[0] as any).username) || "").trim().toLowerCase();
  const requested = String((req.body && (req.body as any).ownerKey) || "").trim().toLowerCase();
  const ownerKey = requested || self;
  if (!ownerKey) return res.status(400).json({ success: false, error: "Usuario invalido." });
  // Cada um compartilha o SEU OKR; o Edson pode compartilhar o de qualquer um.
  if (ownerKey !== self && !claimsAreEdson(claims)) {
    return res.status(403).json({ success: false, error: "Sem permissao para compartilhar este OKR." });
  }

  const { data: row } = await admin.from("okr_state").select("share_token").eq("owner_key", ownerKey).limit(1);
  if (!row || !row[0]) return res.json({ success: false, message: "OKR ainda nao criado." });
  let token = (row[0] as any).share_token;
  if (!token) {
    token = randomBytes(16).toString("hex");
    const { error } = await admin.from("okr_state").update({ share_token: token }).eq("owner_key", ownerKey);
    if (error) return res.json({ success: false, message: error.message });
  }
  return res.json({ success: true, token });
});

// GET /api/okr/public?token=... — leitura PUBLICA (sem login) do OKR. So leitura.
app.get("/api/okr/public", async (req, res) => {
  const token = String((req.query && (req.query as any).token) || "").trim();
  if (!token) return res.status(400).json({ success: false, error: "token ausente." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  const { data, error } = await admin.from("okr_state").select("data").eq("share_token", token).limit(1);
  if (error) return res.status(500).json({ success: false, error: "Erro ao ler." });
  if (!data || data.length === 0) return res.status(404).json({ success: false, error: "Link invalido." });
  return res.json({ success: true, data: (data[0] as any).data });
});

// POST /api/users/delete { id } — so admin, nao pode excluir a si mesmo
app.post("/api/users/delete", async (req, res) => {
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  try { if (!ADMIN_ROLES.includes(String(await currentRole(admin, claims.sub)))) return res.status(403).json({ success: false, error: "Sem permissao." }); }
  catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }

  const id = canonUuid((req.body || {}).id);
  if (!id) return res.status(400).json({ success: false, error: "id ausente ou invalido." });
  if (id === canonUuid(claims.sub)) return res.status(400).json({ success: false, error: "Nao e possivel excluir o proprio usuario." });
  // O Edson (dono do sistema) não pode ser excluído por ninguém.
  if (id === EDSON_ID) return res.status(403).json({ success: false, error: "A conta do Edson nao pode ser excluida." });

  // Sem saber o login não dá para arquivar o OKR dele: não exclui (antes excluía e
  // o OKR ficava sem dono, calado).
  const { data: cur, error: curErr } = await admin.from("users").select("username").eq("id", id).limit(1);
  if (curErr) return res.json({ success: false, message: "Nao consegui ler o usuario. Nada foi excluido; tente de novo." });
  const oldKey = String((cur && cur[0] && (cur[0] as any).username) || "").trim().toLowerCase();
  await admin.from("projects").update({ user_id: null }).eq("user_id", id);
  await admin.from("innovations").update({ author_id: null }).eq("author_id", id);
  const { data, error } = await admin.from("users").delete().eq("id", id).select();
  if (error) return res.json({ success: false, message: `Erro ao excluir: ${error.message}` });
  if (!data || data.length === 0) return res.json({ success: false, message: "Usuario nao encontrado." });
  // O OKR de quem saiu é ARQUIVADO (chave 'excluido:...'), não apagado: fica guardado
  // e o login fica livre — antes, recriar a pessoa com o mesmo login era recusado.
  if (oldKey) {
    const { error: arqErr } = await admin.from("okr_state").update({ owner_key: `excluido:${id}:${oldKey}` }).eq("owner_key", oldKey);
    if (arqErr) return res.json({ success: true, message: `Usuario excluido, mas o OKR dele nao foi arquivado: ${arqErr.message}` });
  }
  return res.json({ success: true });
});

// ============================================================
// CUSTO / SALARIO (C2 da auditoria). O salario individual NUNCA mais sai do
// banco para o navegador de ninguem — nem via select('*'). Duas portas:
//  - /api/labor/hourly-cost: devolve SO a media agregada (custo/hora) que o
//    app inteiro precisa para custear projetos. Nao revela salario de ninguem.
//  - /api/users/salaries: devolve os salarios individuais, SO para o Edson.
// ============================================================

// GET /api/labor/hourly-cost — media (custo/hora) para o custo automatico.
app.get("/api/labor/hourly-cost", async (req, res) => {
  if (!verifyBearerToken(req)) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  const { data, error } = await admin.from("users").select("role,salary");
  if (error) {
    console.error("[labor/hourly-cost]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao calcular." });
  }
  const relevant = (data || []).filter(
    (u: any) => u.role !== "CEO" && u.role !== "PROCESSOS" && Number(u.salary) > 0
  );
  const total = relevant.reduce((acc: number, u: any) => acc + Number(u.salary || 0), 0);
  const n = relevant.length || 1;
  const hourlyRate = total / n / 220; // media mensal / 220h
  return res.json({ success: true, hourlyRate });
});

// GET /api/users/salaries — salarios individuais. SO o Edson (dono) ve.
app.get("/api/users/salaries", async (req, res) => {
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  if (!claimsAreEdson(claims)) return res.status(403).json({ success: false, error: "Sem permissao." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  const { data, error } = await admin.from("users").select("id,salary");
  if (error) {
    console.error("[users/salaries]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao ler." });
  }
  const salaries: Record<string, number> = {};
  (data || []).forEach((u: any) => { salaries[u.id] = Number(u.salary) || 0; });
  return res.json({ success: true, salaries });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(500).json({ success: false, error: "Erro interno." });
});

export default app;
