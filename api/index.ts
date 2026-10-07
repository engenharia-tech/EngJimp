import express from "express";
import nodemailer from "nodemailer";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
// Agenda (29/09): só TIPOS aqui em cima (somem na compilação). As funções de
// ./_agenda.ts são carregadas na hora pelas rotas da agenda (agendaMod, bloco AGENDA).
import type { AgendaEmail, AgendaPessoa } from "./_agenda.js";

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
  const mailClaims = verifyBearerToken(req);
  if (!mailClaims) {
    return res.status(401).json({ success: false, error: "Nao autorizado." });
  }
  // Quem manda é lido do CADASTRO pelo id do crachá: o nome do remetente sai daqui,
  // nunca do pedido. O admin de visualização do OKR só olha: não envia e-mail.
  const adm = getSupabaseAdmin();
  if (!adm) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  let sender: { name: string; role: string; isEdson: boolean; somenteOkr: boolean };
  try {
    const sid = canonUuid(mailClaims.sub);
    if (!sid) return res.status(401).json({ success: false, error: "Nao autorizado." });
    if (await isViewerDb(adm, sid)) return res.status(403).json({ success: false, error: "Usuario de visualizacao nao envia e-mail." });
    const { data: me, error: meErr } = await adm.from("users").select("name, surname, role, okr_only").eq("id", sid).limit(1);
    if (meErr) throw new Error("Nao consegui conferir o seu cadastro. Tente de novo.");
    const r = me && (me[0] as any);
    if (!r) return res.status(401).json({ success: false, error: "Nao autorizado." });
    sender = {
      name: `${r.name || ""} ${r.surname || ""}`.trim(), role: String(r.role || ""), isEdson: sid === EDSON_ID,
      somenteOkr: sid !== EDSON_ID && (!!r.okr_only || ehRepresentante(r.role)),
    };
  } catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
  try {
    const { subject, body, to: bodyTo, kind } = req.body || {};
    console.log(`[Email API] Request: sub=${mailClaims.sub}, kind=${kind || "-"}, Subject="${subject}", BodyLength=${body?.length}, To=${bodyTo}`);

    // "Somente OKR" (inclui o REPRESENTANTE, 06/10/2026) não registra parada nem conclui projeto: não manda o aviso
    // de parada/conclusão — o assunto e o corpo são livres e iriam pela conta oficial ao Edson, ao Matheus e ao
    // Comercial com o nome dele (decisão do Edson, 06/10: o representante é "Somente OKR"). Vale também para o envio
    // SEM tipo (o aviso de conclusão antigo do rastreador, que ele não abre): ali o `to` aceita as mesmas listas de
    // confiança, e a trava só por tipo deixava a porta aberta. Fica só o 'test' (Configurações, pelo ADMIN_ROLES).
    if (sender.somenteOkr && kind !== "test") {
      return res.status(403).json({ success: false, error: "Quem é \"Somente OKR\" não envia aviso de parada nem de conclusão." });
    }

    if (!subject || !body) {
      return res.status(400).json({ success: false, error: "Assunto ou corpo do e-mail ausente." });
    }

    const host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const from = process.env.EMAIL_FROM || user;

    // PARA QUEM: a notificação (interrupção/conclusão) vai para a lista do SERVIDOR
    // e o `to` do pedido é ignorado. Fora dela, o `to` só pode ter endereços que
    // alguém com poder já escolheu (listas de notificação, Configurações, EMAIL_TO);
    // o teste de Configurações (só admin) também alcança os domínios da empresa.
    // Antes qualquer logado mandava, pela conta oficial, para qualquer endereço da
    // empresa com o nome de remetente que quisesse — phishing interno.
    let to: string;
    let recipients: string[];
    if (kind === "interruption" || kind === "completion") {
      recipients = NOTIFY_RECIPIENTS[kind];
      to = recipients.join(",");
    } else {
      to = String(bodyTo || process.env.EMAIL_TO || "");
      recipients = to.split(",").map((s) => s.trim()).filter(Boolean);
      if (recipients.length === 0) {
        return res.status(400).json({ success: false, error: "Nenhum destinatário válido." });
      }
      const trusted = new Set<string>([
        ...NOTIFY_RECIPIENTS.interruption, ...NOTIFY_RECIPIENTS.completion,
        ...String(process.env.EMAIL_TO || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
        ...(await configuredRecipients(adm)),
      ]);
      const podeTestar = kind === "test" && (ADMIN_ROLES.includes(sender.role) || sender.isEdson);
      if (kind === "test" && !podeTestar) {
        return res.status(403).json({ success: false, error: "Só quem edita as Configurações envia o e-mail de teste." });
      }
      const blocked = recipients.filter((r) => {
        const a = r.toLowerCase();
        return !(trusted.has(a) || (podeTestar && recipientAllowed(a, new Set())));
      });
      if (blocked.length > 0) {
        console.warn("[Email API] Destinatário bloqueado:", blocked.join(", "), "sub:", mailClaims.sub);
        return res.status(403).json({ success: false, error: `Destinatário não permitido: ${blocked.join(", ")}.` });
      }
    }

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

    // O nome do remetente é FIXO pelo servidor: a conclusão sai como o sistema; o
    // resto leva o nome de quem mandou, lido do cadastro. O `fromName` do pedido é
    // ignorado — era por ele que um logado assinava como "TI" ou "Diretoria".
    const nomeRemetente = kind === "completion" ? "JIMPNexus KPI" : `${sender.name || "Usuario"} - JIMPNEXUS`;
    const cleanFromName = nomeRemetente.replace(/["'\r\n<>]/g, "");

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

// Os modelos do Gemini: o padrão e os de reserva, na ordem em que se tenta. UMA lista para o assistente (logo abaixo)
// e para a comparação de iniciativas parecidas do OKR (bloco OKR PARECIDOS, 07/10/2026).
const GEMINI_MODELO_PADRAO = "gemini-3.5-flash";
const GEMINI_MODELOS_RESERVA = ["gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"];

// API Route for Gemini analysis and chat
app.post("/api/gemini/generate", async (req, res) => {
  // Exige cracha valido: sem isto qualquer um queimava a cota do Gemini e
  // usava o servidor como proxy anonimo de LLM.
  const claims = verifyBearerToken(req);
  if (!claims) {
    return res.status(401).json({ success: false, error: "Nao autorizado." });
  }
  // O admin de visualização do OKR não usa o assistente (ele lê dados de engenharia).
  {
    const adm = getSupabaseAdmin();
    if (!adm) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
    try {
      if (await isViewerDb(adm, claims.sub)) return res.status(403).json({ success: false, error: "Usuario de visualizacao nao usa o assistente." });
      // O REPRESENTANTE (06/10/2026) também não: é de fora da fábrica, e a tela dele não tem o assistente.
      if (ehRepresentante(await currentRole(adm, claims.sub))) return res.status(403).json({ success: false, error: "O representante nao usa o assistente." });
    }
    catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
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
    const targetModel = model || GEMINI_MODELO_PADRAO;
    let text = "";

    // Robust generator trying multiple compatible models if the primary one is unreleased or not accessible
    const modelsToTry = [targetModel, ...GEMINI_MODELOS_RESERVA];
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
// O usuário DIGITADO no login vira a chave de comparação: sem acento, sem diferença de
// maiúsculas, sem espaço nas pontas nem caractere invisível — "Patrícia", "PATRICIA" e
// " patricia " são o mesmo usuário. O login gravado só tem ASCII visível (CHECK do
// banco) e é único sem distinguir maiúsculas, então isso nunca confunde duas pessoas.
// A trava de tentativas usa a MESMA chave: variar acento/maiúscula não abre balde novo.
const loginKey = (v: any): string =>
  String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, "").trim().toLowerCase();
// uuid só na forma canônica (minúsculo, com hífens). O banco converte QUALQUER grafia
// (MAIÚSCULA, sem hífen, entre chaves) para o mesmo uuid — comparar o texto do cliente
// com EDSON_ID deixava passar o id do Edson escrito de outro jeito.
const canonUuid = (v: any): string | null => {
  const s = String(v ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s) ? s : null;
};

// ---- DESLIGADO (migração 022, 30/09/2026) — decisão do Edson, 30/09: quem sai da empresa é
// DESLIGADO, não excluído ("preciso que as informações criadas por ele continuem registradas").
// users.desligado_em = o ÚLTIMO dia trabalhado (inclusive): nesse dia a pessoa ainda entra; do dia
// seguinte em diante (dia de Joinville) o servidor a trata como sem acesso em todas as rotas que
// leem o cadastro — o crachá dura 24 h e não é revogado. O Edson nunca é desligado (pelo id).
// O dia de Joinville (AAAA-MM-DD), qualquer que seja o fuso da máquina (a Vercel roda em UTC).
function diaJoinville(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => (p.find((x) => x.type === t) || { value: "" }).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}
const hojeJoinville = (): string => diaJoinville(new Date());
const usuarioDesligado = (r: any, hoje: string = hojeJoinville()): boolean =>
  !!r && !!r.desligado_em && String(r.desligado_em).slice(0, 10) < hoje;
// A regra usada nas rotas: o Edson (pelo id) nunca conta como desligado.
const desligadoPeloCadastro = (r: any, id: string | null): boolean => id !== EDSON_ID && usuarioDesligado(r);
// Leitura de users COM desligado_em. QUALQUER erro na leitura com a coluna (a 022 não rodou = 42703;
// cache velho do PostgREST; grant) → relê SEM ela (desligado_em = null, ninguém fica trancado para
// fora) e registra só o código do erro, uma vez por código. Se a releitura também falhar (banco fora,
// conexão) → devolve o erro, e quem chamou responde 503: "não consegui conferir" nunca vira "pode".
const avisosSemDesligado = new Set<string>();
async function lerComDesligado(consulta: (cols: string) => PromiseLike<any>, cols: string): Promise<{ data: any[] | null; error: any }> {
  const r1: any = await consulta(`${cols}, desligado_em`);
  if (!r1.error) return { data: r1.data || [], error: null };
  const code = String((r1.error && r1.error.code) || "sem-codigo");
  if (!avisosSemDesligado.has(code)) {
    avisosSemDesligado.add(code);
    console.warn("[users] leitura com desligado_em falhou; relida sem a coluna (a 022 rodou?):", code);
  }
  const r2: any = await consulta(cols);
  if (r2.error) return { data: null, error: r2.error };
  return { data: (r2.data || []).map((x: any) => ({ ...x, desligado_em: null })), error: null };
}
// UMA linha de users pelo id (ou null). Falha LANÇA com a frase de quem chamou (a rota responde 503).
async function lerUsuario(admin: any, id: string, cols: string, msgErro = "Nao consegui conferir o seu cadastro. Tente de novo."): Promise<any | null> {
  const { data, error } = await lerComDesligado((c) => admin.from("users").select(c).eq("id", id).limit(1), cols);
  if (error) throw new Error(msgErro);
  return (data && data[0]) || null;
}

// O cargo que vale é o do CADASTRO agora, não o gravado no crachá (que dura 24 h):
// um admin rebaixado deixava de ser admin só quando o crachá vencia.
// Falha na leitura LANÇA (a rota responde 503): "não consegui conferir" não pode
// virar "não é admin" — o admin recebia "salvo" e a senha/cargo eram ignorados.
// O "admin de visualização" do OKR nunca é admin aqui, qualquer que seja o cargo:
// ele só olha — o servidor escreve com a chave de serviço, por fora da trava do banco.
// Quem manda no OKR (Edson, admin de OKR) nunca é visualizador: a mesma regra de
// okr_is_viewer() no banco e de isOkrViewer na tela.
// O grupo "ADM Externo" (cargo ADM_EXTERNO) É o admin de visualização: o cargo sozinho
// já basta, mesmo que a marca okr_viewer se perca (o banco também exige as duas juntas).
const ADM_EXTERNO = "ADM_EXTERNO";
// CARGOS NOVOS (06/10/2026) — espelho de src/utils/cargos.ts (o servidor não importa de src/). Pedido do Edson:
//  · DIRETOR_INDUSTRIAL: "tem o mesmo privilégio e visualização do CEO. Mas o cargo é diferente." Toda regra do CEO
//    passa por ehVisaoCeo — as permissões (R$, Inovações, Configurações) E as restrições ("só visão macro", 01/10).
//  · REPRESENTANTE: "os vendedores… precisam escrever seus OKRs assim como os seus KPIs" — gente de fora da fábrica:
//    sempre "Somente OKR", nunca visualizador nem admin de OKR, sem assistente nem e-mail de parada/conclusão. O setor
//    dele (um por pessoa) quem põe é o BANCO (030), não o servidor.
// Comparar cargo SÓ por estes ajudantes: o próximo cargo "de diretoria" entra num lugar só.
const DIRETOR_INDUSTRIAL = "DIRETOR_INDUSTRIAL";
const REPRESENTANTE = "REPRESENTANTE";
const CARGOS_VISAO_CEO = ["CEO", DIRETOR_INDUSTRIAL];
const ehVisaoCeo = (role: any): boolean => CARGOS_VISAO_CEO.includes(String(role ?? ""));
const ehRepresentante = (role: any): boolean => String(role ?? "") === REPRESENTANTE;
// O setor de cada representante (posto pelo banco, 030): 'Representante — Nome Sobrenome'.
const PREFIXO_SETOR_REPRESENTANTE = "Representante — ";
// Os cargos que o cadastro aceita (o CHECK users_role_check do banco; os dois novos a partir da 030). Conferido ANTES
// de qualquer gravação: antes o cargo ia cru e só o banco recusava — no 'update' com troca de login, DEPOIS do
// kpi_rename_login ("o login novo já foi gravado").
const CARGOS_VALIDOS = ["GESTOR", "PROJETISTA", "CEO", "COORDENADOR", "PROCESSOS", "QUALIDADE", ADM_EXTERNO, DIRETOR_INDUSTRIAL, REPRESENTANTE];
const CARGO_DESCONHECIDO_MSG = (role: any) =>
  `Cargo desconhecido ("${String(role ?? "").replace(/[^\w .-]/g, "").slice(0, 30)}"). Nada foi gravado.`;
const ehVisualizador = (r: any, id: string) =>
  !!r && (r.okr_viewer || r.role === ADM_EXTERNO) && !r.okr_admin && id !== EDSON_ID;
// O cargo a partir da linha do cadastro (sem linha ou desligado = sem cargo: todas as rotas de admin
// dão 403 — 022, 30/09).
const papelDoCadastro = (r: any, id: string): string | null => {
  if (!r || desligadoPeloCadastro(r, id)) return null;
  if (ehVisualizador(r, id)) return "VISUALIZACAO";
  return String(r.role || "");
};
const currentRole = async (admin: any, sub: any): Promise<string | null> => {
  const id = canonUuid(sub); if (!id) return null;
  const r = await lerUsuario(admin, id, "role, okr_viewer, okr_admin", "Nao consegui conferir o seu cargo. Tente de novo.");
  return papelDoCadastro(r, id);
};
// "Admin de visualização" do OKR, lido do cadastro (mesma regra acima). Falha LANÇA.
// Quem NÃO está (mais) no cadastro também fica sem acesso: o crachá dura 24 h, e sem a
// linha a regra do visualizador daria "não é" — um visualizador excluído ganharia MAIS.
// O DESLIGADO também (022): e-mail, assistente, custo/hora e agenda recusam como a um visualizador.
const isViewerDb = async (admin: any, sub: any): Promise<boolean> => {
  const id = canonUuid(sub); if (!id) return true;
  if (id === EDSON_ID) return false;
  const r = await lerUsuario(admin, id, "role, okr_viewer, okr_admin", "Nao consegui conferir o seu acesso. Tente de novo.");
  if (!r) return true;
  if (desligadoPeloCadastro(r, id)) return true;
  return ehVisualizador(r, id);
};
// Edson ou admin de OKR, lido do CADASTRO: só eles marcam alguém como "admin de
// visualização" do OKR (a marca dá leitura do OKR de todos) e geram o link do painel.
// Desligado nunca é (022).
const isOkrMasterDb = async (admin: any, sub: any): Promise<boolean> => {
  const id = canonUuid(sub); if (!id) return false;
  if (id === EDSON_ID) return true;
  const r = await lerUsuario(admin, id, "okr_admin", "Nao consegui conferir a sua permissao no OKR. Tente de novo.");
  return !!r && !desligadoPeloCadastro(r, id) && !!r.okr_admin;
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
// DESTINOS DAS NOTIFICAÇÕES — a única lista. O navegador manda só o TIPO (`kind`)
// e o servidor escolhe para quem vai; para mudar quem recebe, é aqui.
// Conclusão de projeto -> Engenharia + Coordenação. Interrupção -> + Comercial
// (as paradas são ocasionadas pelo Comercial).
const NOTIFY_RECIPIENTS: Record<"completion" | "interruption", string[]> = {
  completion: ["edson@jimp.com.br", "matheus.p@joinvilleimplementos.com.br"],
  interruption: ["edson@jimp.com.br", "matheus.p@joinvilleimplementos.com.br", "comercial@furgoesjoinville.com.br"],
};
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
  const unameKey = loginKey(username);
  if (!unameKey) return res.status(400).json({ success: false, error: "Usuario e senha sao obrigatorios." });
  // IP alto de proposito: os 12 podem estar atras do MESMO IP do escritorio.
  // A trava real e a de FALHAS por usuario (nao afeta quem acerta a senha).
  if ((await rlHit(`login:ip:${ip}`, 900)) > 100) return tooMany(res, 900);
  // Conta ANTES de conferir (como o pwGuard): conferir e só depois contar deixava uma
  // rajada simultânea inteira passar pela trava. Acertar zera o balde.
  if ((await rlHit(`login:fail:${unameKey}`, 900)) > 8) return tooMany(res, 900);

  const { data, error } = await admin.rpc("verify_login", {
    p_username: unameKey,
    p_password: String(password),
  });
  if (error) {
    console.error("[auth/login]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao autenticar." });
  }
  const user = Array.isArray(data) ? data[0] : data;
  if (!user) {
    return res.status(401).json({ success: false, error: "Usuario ou senha invalidos." });
  }
  // "Admin de visualização" do OKR: o verify_login devolve colunas fixas, então a
  // marca é lida à parte (pelo id que acabou de provar a senha) — e, junto, o desligamento (022).
  // A conferência vem DEPOIS da senha (quem não a tem não descobre que a conta foi desligada) e
  // ANTES do crachá. Não consegui ler = 503 (antes a falha passava calada, sem a marca).
  const uid = canonUuid(user.id) || "";
  let vw: any = null;
  try { vw = await lerUsuario(admin, uid, "role, okr_viewer, okr_admin", "Nao consegui conferir o seu acesso. Tente de novo."); }
  catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
  if (desligadoPeloCadastro(vw, uid)) {
    return res.status(403).json({ success: false, error: "Este acesso foi encerrado." });
  }
  await rlReset(`login:fail:${unameKey}`); // sucesso limpa as falhas do usuario
  // Cracha de sessao: so emitimos para quem NAO precisa criar senha (quem
  // precisa vai para a tela de criar senha, sem sessao valida ainda).
  const token = user.must_set_password ? null : signSupabaseJwt(user);
  // REPRESENTANTE (06/10/2026): a tela o recebe SEMPRE como "Somente OKR", mesmo se a marca faltar no cadastro (a
  // garantia de verdade é a marca gravada — create/update daqui — e o CHECK da 030).
  const representante = ehRepresentante(user.role);
  // "Administra usuários" (032, 07/10/2026): a tela abre a Equipe a quem tem a marca. Só cargo comum pode tê-la; sem a 032
  // ou com falha na leitura = false (a tela só esconde; quem barra é o servidor, que relê a marca em cada pedido).
  let adminUsuarios = false;
  if (vw && CARGOS_COM_A_MARCA.includes(String(vw.role || ""))) {
    try { adminUsuarios = await administraUsuariosDb(admin, uid); } catch { adminUsuarios = false; }
  }
  // Sanitiza: o payload de login NUNCA leva salary/senha/hash para o navegador
  // (C2). So o Edson ve salario, e por uma porta propria (/api/users/salaries).
  const safeUser = {
    id: user.id, username: user.username, name: user.name, surname: user.surname,
    email: user.email, phone: user.phone, role: user.role,
    must_set_password: user.must_set_password,
    okr_enabled: representante ? true : user.okr_enabled, okr_only: representante ? true : user.okr_only, sector: user.sector,
    okr_admin: user.okr_admin,
    okr_viewer: ehVisualizador(vw, uid),
    admin_usuarios: adminUsuarios,
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
  const uname = loginKey(username);
  if (!uname) return res.status(400).json({ success: false, error: "Usuario obrigatorio." });

  // Anti abuso: pedir codigo tem efeito colateral (marca must_set_password e
  // dispara e-mail), entao limita por IP e por usuario, independente de sucesso.
  const ip = clientIp(req);
  if ((await rlHit(`reqcode:ip:${ip}`, 3600)) > 30) return tooMany(res, 3600);
  if ((await rlHit(`reqcode:user:${uname}`, 3600)) > 4) return tooMany(res, 3600);

  // Igualdade sem distinguir maiúsculas (ilike com % e _ escapados: sem curinga).
  const { data: rows } = await lerComDesligado((c) => admin.from("users").select(c).ilike("username", ilikeExact(uname)).limit(50), "id,username,email,name");
  // O PostgREST lê '*' como curinga no ilike (e não há como escapá-lo): o ilike só junta
  // candidatos; quem decide é a comparação exata. Dali em diante vale o login GRAVADO.
  const u = (rows || []).find((r: any) => loginKey(r.username) === uname);
  const email = u?.email?.trim();
  // Desligado (022) recebe a MESMA resposta neutra, sem código e sem e-mail: senão recriaria a senha.
  if (!u || !isValidEmail(email) || desligadoPeloCadastro(u, canonUuid(u.id))) {
    return res.json({ success: true, delivered: "no_email" });
  }

  const { data: code, error } = await admin.rpc("request_password_code", { p_username: u.username, p_hours: 24 });
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
      .eq("username", u.username);
    return res.status(500).json({ success: false, error: "Nao consegui enviar o e-mail com o codigo. Tente novamente." });
  }
  // O RASTRO (07/10, achado da crítica ao "administra usuários"): o código vai para a caixa do cadastro, e as caixas da
  // empresa quem administra é o TI — ele pedia o código de uma conta que já existe, lia, criava a senha e entrava, sem
  // registro nenhum. Cada código enviado fica no Log de Auditoria, gravado pelo SERVIDOR (o TI não o apaga nem o lê; o
  // código em si, nunca). Avisar o Edson ou reservar o código das contas altas é decisão dele (pendente). Nunca atrasa
  // além de 3 s nem barra o pedido.
  await logDoServidor(admin, { user_id: null, action: "CODIGO_SENHA_ENVIADO", entity_id: canonUuid(u.id) || String(u.id || ""),
    entity_name: String(u.username || ""), ip_address: ip,
    details: `O código para criar a senha da conta ${avisoLimpo(u.username, 60)} foi enviado ao e-mail do cadastro (${avisoLimpo(email, 120)}). Pedido feito na tela de entrada, sem login.` },
    AVISO_TI_LOG_PRAZO_MS, "[auth/request-code]");
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
  const unameKey = loginKey(username);
  if (!unameKey) return res.status(400).json({ success: false, error: "Dados incompletos." });
  if ((await rlHit(`setpw:ip:${ip}`, 900)) > 60) return tooMany(res, 900);
  if ((await rlHit(`setpw:fail:${unameKey}`, 900)) > 6) return tooMany(res, 900); // conta antes (ver login)

  // Desligado (022) não cria senha nem com um código que tenha sobrado (a tentativa já foi contada).
  let contaDoCodigo: any = null;   // para o rastro no Log (abaixo)
  {
    const { data: cand, error: candErr } = await lerComDesligado((c) => admin.from("users").select(c).ilike("username", ilikeExact(unameKey)).limit(50), "id,username");
    if (candErr) return res.status(503).json({ success: false, error: "Nao consegui conferir o usuario. Tente de novo." });
    const alvo = (cand || []).find((r: any) => loginKey(r.username) === unameKey);
    contaDoCodigo = alvo || null;
    if (alvo && desligadoPeloCadastro(alvo, canonUuid(alvo.id))) {
      return res.status(400).json({ success: false, error: "Codigo invalido ou expirado." });
    }
  }

  const { data, error } = await admin.rpc("set_password_with_code", {
    p_username: unameKey,
    p_code: String(code),
    p_new_password: String(newPassword),
  });
  if (error) {
    console.error("[auth/set-password]", error.message);
    return res.status(500).json({ success: false, error: "Erro ao salvar a senha." });
  }
  if (data !== true) {
    return res.status(400).json({ success: false, error: "Codigo invalido ou expirado." });
  }
  await rlReset(`setpw:fail:${unameKey}`); // sucesso limpa as falhas
  // O RASTRO (07/10): a senha criada com o código do e-mail fica no Log de Auditoria, gravada pelo SERVIDOR (ver o
  // request-code). Nunca a senha nem o código.
  await logDoServidor(admin, { user_id: null, action: "SENHA_CRIADA_PELO_CODIGO",
    entity_id: contaDoCodigo ? canonUuid(contaDoCodigo.id) || String(contaDoCodigo.id || "") : "",
    entity_name: String((contaDoCodigo && contaDoCodigo.username) || unameKey), ip_address: ip,
    details: `A senha da conta ${avisoLimpo((contaDoCodigo && contaDoCodigo.username) || unameKey, 60)} foi criada com o código enviado ao e-mail do cadastro. Feito na tela de entrada, sem login.` },
    AVISO_TI_LOG_PRAZO_MS, "[auth/set-password]");
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
  // Fora do cadastro ou desligado (022): o crachá ainda vale até 24 h, a senha não.
  try {
    const eu = await lerUsuario(admin, id, "id");
    if (!eu || desligadoPeloCadastro(eu, id)) { res.status(401).json({ success: false, error: "Sessao expirada. Entre de novo." }); return null; }
  } catch (e: any) { res.status(503).json({ success: false, error: e.message }); return null; }
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
// Configurações e e-mail de teste (o CEO segue: custo/hora, 30/09; o Diretor Industrial junto, 06/10 — "o mesmo privilégio").
const ADMIN_ROLES = ["GESTOR", ...CARGOS_VISAO_CEO, "COORDENADOR"];
// PESSOAS (cadastrar, editar outra pessoa, excluir, mudar setor): o CEO NÃO. Decisão do Edson, 01/10/2026:
// "ceo não pode dar cargo a ninguem e nem liberar acesso, o objetivo é visualização macro, se quiserem
// algo que peçam". Vale também para o CEO admin de OKR (a marca dá o OKR de todos, não poder sobre
// pessoas). O CEO continua editando o PRÓPRIO contato (cai no caminho do "isSelf"). O Diretor Industrial (06/10)
// é igual ao CEO aqui também: fica de fora (ehVisaoCeo).
const PESSOAS_ADMIN_ROLES = ["GESTOR", "COORDENADOR"];
const CEO_SO_VE = "O CEO e o Diretor Industrial acompanham tudo (visão macro), mas não dão cargo nem liberam acesso — peça ao Edson.";
// Setor RESERVADO (KPI dos setores, 026 — decisão do Edson, 01/10: "P&D: só eu e os CEOs"): quem entra no
// setor passa a ver os indicadores dele, então pôr ou tirar alguém de lá é só do Edson. Espelho de
// kpis_setor_reservado (SQL) e da chave kpis_setor_chave ('P&D' → 'p d').
const SETORES_RESERVADOS = ["p d"];
const setorChaveSrv = (v: unknown): string =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const setorReservado = (v: unknown): boolean => SETORES_RESERVADOS.includes(setorChaveSrv(v));
const SETOR_RESERVADO_MSG = "O setor P&D é reservado: só o Edson põe ou tira alguém dele.";
// ---- USUÁRIO TESTE (031, 06/10/2026) — pedido do Edson, 06/10: um usuário TESTE para o treinamento, e tudo dele
// (cadastro, OKR, indicadores do setor dele, agenda, Log de Auditoria) visível SÓ para o Edson e para o próprio teste —
// nem admin de OKR, nem CEO/Diretor Industrial, nem visualizador, nem GESTOR/COORDENADOR. O banco esconde pela RLS (031:
// users.usuario_teste + políticas RESTRICTIVE); o servidor escreve e lê com a service_role, que passa POR CIMA da RLS,
// então cada rota que lê ou mexe em usuário alheio confere a marca aqui:
//  · o painel público do OKR não leva o OKR do teste; o teste não gera link público (o link é permanente);
//  · a conta do teste (editar, setor, excluir, desligar) só o Edson mexe — a própria pessoa segue no Meu Perfil;
//  · o setor do teste (chave 'teste', espelho de kpis_setor_so_edson da 031) só o Edson põe ou tira alguém.
// As frases de recusa não dizem nada do teste além do necessário (nem nome, nem setor, nem registros).
const SETORES_SO_EDSON = ["teste"];
const setorSoEdson = (v: unknown): boolean => SETORES_SO_EDSON.includes(setorChaveSrv(v));
const SETOR_SO_EDSON_MSG = "Este setor é reservado: só o Edson põe ou tira alguém dele.";
const USUARIO_TESTE_SO_EDSON_MSG = "Esta conta só o Edson altera.";
// Antes da 031 a coluna não existe: 42703 (o Postgres: coluna inexistente no select) ou PGRST204 (o cache do PostgREST).
const semColunaUsuarioTeste = (e: any): boolean => !!e && (e.code === "42703" || e.code === "PGRST204");
const avisosSemUsuarioTeste = new Set<string>();
// Leitura de users COM usuario_teste. Ao contrário de lerComDesligado (que relê sem a coluna em QUALQUER erro, porque
// "desligado" só tira acesso), aqui só a coluna INEXISTENTE (a 031 não rodou = não há usuário teste) relê sem ela e dá
// usuario_teste = false. Qualquer outro erro volta como erro (quem chama responde 5xx): "não consegui conferir" nunca
// vira "não é teste" — senão o teste apareceria a todos numa falha passageira.
async function lerComUsuarioTeste(consulta: (cols: string) => PromiseLike<any>, cols: string): Promise<{ data: any[] | null; error: any }> {
  const r1: any = await consulta(`${cols}, usuario_teste`);
  if (!r1.error) return { data: (r1.data || []).map((x: any) => ({ ...x, usuario_teste: x.usuario_teste === true })), error: null };
  if (!semColunaUsuarioTeste(r1.error)) return { data: null, error: r1.error };
  const code = String(r1.error.code);
  if (!avisosSemUsuarioTeste.has(code)) {
    avisosSemUsuarioTeste.add(code);
    console.warn("[users] sem a coluna usuario_teste (a 031 rodou?); relida sem ela:", code);
  }
  const r2: any = await consulta(cols);
  if (r2.error) return { data: null, error: r2.error };
  return { data: (r2.data || []).map((x: any) => ({ ...x, usuario_teste: false })), error: null };
}
// O id é de um usuário teste? Falha LANÇA (a rota responde 503).
async function ehUsuarioTeste(admin: any, id: string): Promise<boolean> {
  const { data, error } = await lerComUsuarioTeste((c) => admin.from("users").select(c).eq("id", id).limit(1), "id");
  if (error) throw new Error("Não consegui conferir o usuário. Nada foi gravado; tente de novo.");
  return !!(data && data[0] && data[0].usuario_teste);
}
// O e-mail do usuário teste é para onde vai o código de "Criar / redefinir senha": trocado pelo Meu Perfil (sem senha),
// quem estivesse logado como teste tomava a conta (achado A6, 06/10). A própria pessoa segue mudando nome e telefone;
// o e-mail dele só o Edson troca (pela Equipe). E-mail ausente no pedido = não muda. Falha ao ler LANÇA (503).
const EMAIL_TESTE_SO_EDSON_MSG = "O e-mail desta conta só o Edson altera.";
async function testeTrocaOEmail(admin: any, id: string, email: unknown): Promise<boolean> {
  if (email === undefined) return false;
  const { data, error } = await lerComUsuarioTeste((c) => admin.from("users").select(c).eq("id", id).limit(1), "email");
  if (error) throw new Error("Não consegui conferir o usuário. Nada foi gravado; tente de novo.");
  const u = data && data[0];
  return !!(u && u.usuario_teste && String(u.email ?? "").trim().toLowerCase() !== String(email ?? "").trim().toLowerCase());
}
// As chaves de OKR (login minúsculo) dos usuários teste. Antes da 031: vazio. Falha LANÇA.
async function chavesDeUsuarioTeste(admin: any): Promise<Set<string>> {
  const { data, error } = await lerComUsuarioTeste((c) => admin.from("users").select(c), "username");
  if (error) throw new Error("Não consegui conferir o usuário. Tente de novo.");
  return new Set((data || []).filter((u: any) => u.usuario_teste).map((u: any) => String(u.username || "").trim().toLowerCase()).filter(Boolean));
}
// Setor de REPRESENTANTE (030, 06/10/2026): é só do representante dono dele — "cada representante vê só os seus
// indicadores", e quem acompanha todos é quem já vê tudo, "mais ninguém (o Vinicius NÃO)" (Edson, 06/10). O banco só
// confere quando o ALVO é representante: pôr OUTRA pessoa num setor desses abriria os indicadores do vendedor a ela.
// Comparado pela CHAVE (a do KPI: 'representante - fulano' é o mesmo setor que 'Representante — Fulano').
const CHAVE_SETOR_REPRESENTANTE = setorChaveSrv(PREFIXO_SETOR_REPRESENTANTE);   // 'representante'
const setorDeRepresentante = (v: unknown): boolean => {
  const k = setorChaveSrv(v);
  return k === CHAVE_SETOR_REPRESENTANTE || k.startsWith(CHAVE_SETOR_REPRESENTANTE + " ");
};
const SETOR_DE_REPRESENTANTE_MSG = "Os setores \"Representante — …\" são só dos representantes (o banco põe sozinho): escolha outro setor.";
// As recusas do gatilho do representante (030) chegam do banco com o código na frente (P0001): a tela mostra a frase
// limpa, sem "Erro DB:" (06/10/2026). Fora delas, null (quem chama monta a mensagem de sempre).
const erroDoRepresentanteMsg = (e: any): string | null => {
  const m = String((e && e.message) || "");
  if (/USERS_REPRESENTANTE_HOMONIMO/.test(m)) {
    const achado = /o setor "(.*)" já é de outra pessoa \(login ([^)]*)\)/.exec(m);
    return achado
      ? `O setor "${achado[1]}" já é de outra pessoa (login ${achado[2]}) — diferencie o representante pelo sobrenome.`
      : "Já existe um representante com este nome e sobrenome — diferencie pelo sobrenome.";
  }
  if (/USERS_REPRESENTANTE_SEM_029/.test(m))
    return "Os representantes só ganham login depois da migração 029 (sem ela, quem é \"Somente OKR\" ainda lê a engenharia pela API) — avise o Edson. Nada foi gravado.";
  if (/USERS_REPRESENTANTE:/.test(m)) return "O Edson nunca é representante.";
  if (/USERS_SETOR_DE_REPRESENTANTE/.test(m)) return SETOR_DE_REPRESENTANTE_MSG;
  return null;
};
// CEO e GESTOR — decisão do Edson, 25/09/2026: "qualquer GESTOR". GESTOR e COORDENADOR
// cadastram e editam (o CEO não, desde 01/10 — PESSOAS_ADMIN_ROLES), mas só um GESTOR dá ou tira CEO/GESTOR, e só
// ele troca login, e-mail ou senha — ou exclui — as contas que leem o OKR de todos
// (CEO, GESTOR, admin de OKR, admin de visualização). Antes um COORDENADOR ou CEO se
// punha como CEO pela API (okr_is_ceo() libera o OKR de todos), ou trocava o e-mail de
// um CEO ou do admin de OKR e pedia o código de "Criar / redefinir senha" no lugar dele.
// 06/10/2026: o Diretor Industrial é cargo de topo como o CEO (senão um COORDENADOR se dava o cargo pela API e
// ganhava a visão do CEO). O REPRESENTANTE não é de topo nem "conta que lê tudo", mas DAR ou TIRAR esse cargo também
// é só de GESTOR (ou do Edson): um COORDENADOR não cria representante nem o transforma em PROJETISTA (cargoSoDoGestor).
const CARGOS_DE_TOPO = [...CARGOS_VISAO_CEO, "GESTOR"];
const ehCargoDeTopo = (role: any) => CARGOS_DE_TOPO.includes(String(role ?? "").trim().toUpperCase());
const contaQueLeTudo = (r: any) => !!r && (ehCargoDeTopo(r.role) || r.role === ADM_EXTERNO || !!r.okr_admin || !!r.okr_viewer);
const cargoSoDoGestor = (role: any) => ehCargoDeTopo(role) || ehRepresentante(role);
// As contas cujo ACESSO (login, e-mail, senha, excluir) só um GESTOR ou o Edson mexe: as que leem tudo e a do
// representante (06/10/2026, "ninguém mais" acompanha os representantes — com a senha trocada, um COORDENADOR
// entraria como ele e veria os indicadores do setor dele).
const contaSoDoGestor = (r: any) => contaQueLeTudo(r) || (!!r && ehRepresentante(r.role));
const CARGO_SO_DO_GESTOR_MSG = "Só um GESTOR dá ou tira o cargo CEO, Diretor Industrial, GESTOR ou Representante.";
const REPRESENTANTE_SO_OKR_MSG = "O representante é sempre \"Somente OKR\": não pode ser admin de visualização nem admin de OKR (a marca de admin de OKR, só o Edson tira).";

// ---- ADMINISTRA USUÁRIOS (TI) — migração 032, 07/10/2026. Pedido do Edson (07/10): "a gente criou o usuário do Luiz,
// que é da TI, e eu preciso que você dê permissão para ele criar o usuário, excluir o usuário, exceto o meu … sem que
// ele possa ver os salários." É uma MARCA (users.admin_usuarios), não um cargo: GESTOR/COORDENADOR abririam a engenharia
// e o R$. Lida do CADASTRO na hora (nunca do crachá) e só vale em cargo comum, fora do visualizador e de quem está
// desligado (o CHECK da 032 garante o mesmo no banco). Quem a tem — e não é o Edson nem GESTOR/COORDENADOR, que seguem
// exatamente como antes — pode, decisões dele de 07/10, e SÓ isto:
//  · criar e editar com os cargos comuns (CARGOS_DO_TI); admin de OKR, visualizador, ADM Externo e a marca, nunca;
//  · a conta que ele cria nasce SEM senha (a digitada é ignorada; o banco sorteia o hash — users_senha_sorteada, 032) e
//    com e-mail válido: a pessoa cria a dela pelo código em "Criar / redefinir senha";
//  · numa conta que já existe NÃO troca e-mail, login nem senha (trocar e-mail ou gerar código = tomar a conta, inclusive
//    a Agenda que só a pessoa vê) e não edita as contas altas (CEO, Diretor, GESTOR, COORDENADOR, admins de OKR,
//    visualizador, quem tem a marca), o Edson nem o teste; da própria conta, só o contato (cargo, marcas e setor: Edson);
//  · definir o setor, menos o P&D (reservado) e o "Teste" (031) — as regras do representante (030) seguem;
//  · excluir e desligar todos, menos o Edson e o teste (quem tem registros: só desligar — a trava 409 continua).
// Salário, R$, custo/hora e Log de Auditoria seguem fechados para ele (o cargo dele não os abre; a marca não entra lá).
// A marca, só o Edson dá ou tira (no editar).
const CARGOS_DO_TI = ["PROJETISTA", "PROCESSOS", "QUALIDADE", REPRESENTANTE];
const CARGOS_COM_A_MARCA = ["PROJETISTA", "PROCESSOS", "QUALIDADE"];   // espelho do CHECK users_admin_usuarios_so_comuns
// Antes da 032 a coluna não existe: 42703 (Postgres) ou PGRST204 (cache do PostgREST) = ninguém tem a marca.
const semColunaAdminUsuarios = (e: any): boolean => !!e && ["42703", "PGRST204"].includes(String(e.code));
const avisosSemAdminUsuarios = new Set<string>();
const avisaSemAdminUsuarios = (e: any) => {
  const code = String(e.code);
  if (!avisosSemAdminUsuarios.has(code)) { avisosSemAdminUsuarios.add(code); console.warn("[users] sem a coluna admin_usuarios (a 032 rodou?):", code); }
};
// Quem está logado administra usuários pela marca? Sem a 032 = não. Qualquer outro erro LANÇA (a rota responde 503):
// "não consegui conferir" nunca vira "administra".
async function administraUsuariosDb(admin: any, sub: any): Promise<boolean> {
  const id = canonUuid(sub);
  if (!id || id === EDSON_ID) return false;   // o Edson manda em tudo pelo id; não usa a marca
  const { data, error } = await admin.from("users").select("admin_usuarios, role, okr_viewer, desligado_em").eq("id", id).limit(1);
  if (error) {
    if (semColunaAdminUsuarios(error)) { avisaSemAdminUsuarios(error); return false; }
    throw new Error("Não consegui conferir a sua permissão. Nada foi gravado; tente de novo.");
  }
  const r = data && data[0];
  return !!r && r.admin_usuarios === true && CARGOS_COM_A_MARCA.includes(String(r.role || "")) && !r.okr_viewer && !desligadoPeloCadastro(r, id);
}
// A marca de uma conta (o alvo): true/false, ou null sem a 032. Outro erro LANÇA.
async function marcaAdminUsuariosDe(admin: any, id: string): Promise<boolean | null> {
  const { data, error } = await admin.from("users").select("admin_usuarios").eq("id", id).limit(1);
  if (error) {
    if (semColunaAdminUsuarios(error)) { avisaSemAdminUsuarios(error); return null; }
    throw new Error("Não consegui conferir o usuário. Nada foi gravado; tente de novo.");
  }
  return !!(data && data[0] && data[0].admin_usuarios === true);
}
// A conta como o TI a vê (para decidir se edita): cargo, marcas, contato e login. Falha LANÇA.
async function contaParaTI(admin: any, id: string): Promise<any | null> {
  // (nome, setor e as marcas do OKR vão também ao aviso ao Edson — o "antes" do que o TI mudou, 07/10)
  const { data, error } = await lerComUsuarioTeste((c) => admin.from("users").select(c).eq("id", id).limit(1), "id, role, okr_admin, okr_viewer, email, username, name, surname, sector, okr_only, okr_enabled");
  if (error) throw new Error("Não consegui ler o usuário. Nada foi gravado; tente de novo.");
  const a = data && data[0];
  if (!a) return null;
  return { ...a, admin_usuarios: (await marcaAdminUsuariosDe(admin, id)) === true };
}
// As contas que o TI NÃO edita (exclui e desliga, sim): as que leem tudo, o COORDENADOR, quem tem a marca, o teste, o Edson.
const contaAltaParaTI = (a: any): boolean =>
  !a || contaQueLeTudo(a) || String(a.role || "") === "COORDENADOR" || a.admin_usuarios === true || a.usuario_teste === true || canonUuid(a.id) === EDSON_ID;
const TI_CARGO_MSG = "Você dá só os cargos Projetista, Processos, Qualidade ou Representante. Os outros, peça ao Edson.";
const TI_MARCAS_MSG = "Admin de OKR, admin de visualização e \"administra usuários\" você não dá nem tira: peça ao Edson.";
const TI_CONTA_ALTA_MSG = "Esta conta você não edita (direção, gestão, coordenação, admin do OKR, visualizador ou quem administra usuários): peça ao Edson. Desligar ou excluir, você pode.";
const TI_ACESSO_MSG = "E-mail, login e senha de uma conta que já existe você não troca: é por eles que se entra na conta. Peça ao Edson; a senha, a própria pessoa cria em \"Criar / redefinir senha\".";
const TI_SI_MESMO_MSG = "Na sua conta você muda só o contato (nome, telefone, e-mail), em Meu Perfil. Cargo, setor e marcas, só o Edson.";
const TI_EMAIL_MSG = "Informe um e-mail válido: é para ele que vai o código com que a pessoa cria a própria senha. Nada foi gravado.";
const TI_CRIADO_MSG = (login: string) =>
  `Conta criada sem senha: ${login} cria a própria em "Criar / redefinir senha", na tela de entrada, com o código que chega no e-mail cadastrado.`;
const MARCA_SO_EDSON_MSG = "A marca \"administra usuários\" só o Edson dá ou tira.";
const MARCA_SO_COMUNS_MSG = "Quem administra usuários fica num cargo comum (Projetista, Processos ou Qualidade), sem ser admin de visualização nem usuário de teste: tire a marca antes de mudar o cargo, ou dê a marca a outra pessoa. Nada foi gravado.";
const MARCA_SEM_032_MSG = "A marca \"administra usuários\" só existe depois da migração 032. Nada foi gravado.";
const MARCA_NO_EDITAR_MSG = "A marca \"administra usuários\" se dá depois de criar a conta, no editar. Nada foi gravado.";
const MARCA_ACESSO_SO_EDSON_MSG = "E-mail, login e senha de quem administra usuários só o Edson altera (trocar um deles é tomar a conta e, com ela, a marca).";
const TI_EMAIL_EMPRESA_MSG = `Use o e-mail da empresa (${ALLOWED_EMAIL_DOMAINS.join(", ")}): é para ele que vai o código com que a pessoa cria a própria senha. Só o representante, que é de fora, pode ter outro. Nada foi gravado.`;
// A mesma régua no EDITAR e no modo setor (07/10, achado da crítica): a trava do e-mail da empresa existia só no criar — o TI
// criava um REPRESENTANTE com um e-mail dele, de fora (permitido), e no editar o passava a PROJETISTA num setor comum, sem
// "Somente OKR": uma conta com engenharia e setor cujo código vai para uma caixa que nem passa pela empresa. Agora conta com
// e-mail de fora só fica com o TI enquanto for representante; o resto (e virar outro cargo), só o Edson ou um GESTOR.
const tiBarraEmailDeFora = (cargoFinal: unknown, email: unknown): boolean =>
  !ehRepresentante(cargoFinal) && !recipientAllowed(String(email || ""), new Set<string>());
const TI_EMAIL_FORA_MSG = `Esta conta não tem e-mail da empresa (${ALLOWED_EMAIL_DOMAINS.join(", ")}): você só a mantém como representante. Outro cargo, o setor ou as marcas dela, peça ao Edson (ou a um GESTOR). Nada foi gravado.`;

// ---- O AVISO AO EDSON A CADA MUDANÇA DO TI (07/10/2026) ------------------------------------------------------------------
// Decisão do Edson (07/10), pelo risco da "conta-fantoche" (o TI administra as caixas de e-mail da empresa: poderia criar
// uma caixa e uma conta comum num setor e entrar nela): "E-mail para mim a cada mudança". Toda ação de quem administra
// usuários PELA MARCA (o TI: tem a marca e não é o Edson, GESTOR nem COORDENADOR) que mexe numa pessoa — criar a conta;
// mudar nome, cargo, setor, "Somente OKR" ou "OKR habilitado"; desligar; excluir — manda UM e-mail ao Edson, DEPOIS que a
// gravação deu certo. Ação recusada não avisa (nada mudou); a própria conta do TI (o contato dele) também não — é o Meu
// Perfil de todo mundo, não o poder da marca.
//  · PARA QUEM: o e-mail de notificação do Edson (o mesmo de NOTIFY_RECIPIENTS e do alerta de uso), escolhido AQUI —
//    nada do pedido entra no destino.
//  · O QUÊ: quem fez (nome e login), o quê, a conta (nome, login, e-mail), antes → depois de nome/cargo/setor/"Somente OKR"/
//    "OKR habilitado" e o dia e a hora de Joinville. Só esses campos, copiados um a um (contaDoAviso): nunca salário, R$,
//    senha nem código.
//  · O RASTRO NO SERVIDOR (07/10, achado da crítica): ANTES de tentar o e-mail, o servidor grava no Log de Auditoria
//    (service_role, ação TI_CONTA, sem salário) o mesmo resumo do aviso. Sem isso, quando o e-mail saía, o único registro era
//    a mensagem — numa caixa de domínio que o próprio TI administra (uma regra apagava "KPI — o TI…"), e o Log da tela vem
//    do navegador, que o TI pula chamando a API direto. A linha que o servidor grava o TI não apaga, não altera e não lê
//    (audit_logs não tem política de DELETE/UPDATE para a tela, e pode_ler_auditoria não o inclui — ensaiado no banco, 07/10).
//  · COMO: pelo sendPlainMail (a conta oficial, a mesma do /api/send-email), ESPERANDO no máximo 8 s E o que ainda sobra até
//    ~8,5 s desde o começo da rota (o mínimo é 1,5 s) — na Vercel o que roda depois da resposta pode ser cortado (e a função,
//    sem o Fluid, morre aos 10 s), então o aviso sai antes da resposta e nunca a empurra para além do corte. Falhou (sem
//    EMAIL_*, recusa, prazo)? A mudança CONTINUA valendo (já foi gravada), o servidor anota no Log de Auditoria que o aviso não
//    saiu (service_role, ação AVISO_NAO_ENVIADO, sem salário) e o console.error leva só o código do erro. Nunca lança.
const AVISO_TI_PARA = "edson@jimp.com.br";
const AVISO_TI_PRAZO_MS = 8000;
const AVISO_TI_ORCAMENTO_MS = 8500;   // até aqui, desde o começo da rota, o SMTP pode esperar (o resto é do Log e da resposta)
const AVISO_TI_PRAZO_MIN_MS = 1500;
const AVISO_TI_LEITURA_PRAZO_MS = 2000;
const AVISO_TI_LOG_PRAZO_MS = 3000;
type AvisoTIAcao = "criou" | "alterou" | "desligou" | "excluiu";
// lida = o cadastro foi lido (sem ele, o aviso diz "não consegui ler" em vez de afirmar valores)
type AvisoTIConta = { id: string; lida: boolean; name: string; surname: string; username: string; email: string; role: string; sector: string; okr_only: boolean; okr_enabled: boolean };
// As colunas que o aviso lê do cadastro (nunca salary/password/código).
const AVISO_TI_COLS = "name, surname, username, email, role, sector, okr_only, okr_enabled";
// Os ÚNICOS campos que entram no aviso, um a um — nunca `...linha` (a linha gravada pode trazer salário e senha).
const contaDoAviso = (id: string, r: any): AvisoTIConta => ({
  id, lida: !!r,
  name: String(r?.name ?? ""), surname: String(r?.surname ?? ""), username: String(r?.username ?? ""), email: String(r?.email ?? ""),
  role: String(r?.role ?? ""), sector: String(r?.sector ?? ""), okr_only: r?.okr_only === true, okr_enabled: r?.okr_enabled === true,
});
const CARGO_NO_AVISO: Record<string, string> = {
  PROJETISTA: "Projetista", PROCESSOS: "Processos", QUALIDADE: "Qualidade", REPRESENTANTE: "Representante", GESTOR: "Gestor",
  COORDENADOR: "Coordenador", CEO: "CEO", DIRETOR_INDUSTRIAL: "Diretor Industrial", ADM_EXTERNO: "ADM Externo",
};
// Texto do cadastro numa linha só (sem quebra nem caractere de controle) e curto.
const avisoLimpo = (v: unknown, max = 120): string => {
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};
const avisoNome = (c: AvisoTIConta): string => avisoLimpo(`${c.name} ${c.surname}`) || "—";
const avisoCargo = (c: AvisoTIConta): string => CARGO_NO_AVISO[c.role] || avisoLimpo(c.role, 40) || "—";
const avisoSetor = (c: AvisoTIConta): string => avisoLimpo(c.sector, 60) || "sem setor";
const avisoSimNao = (b: boolean): string => (b ? "sim" : "não");
// O que conta como mudança para o aviso (o telefone sozinho não conta).
const avisoTIMudou = (a: AvisoTIConta, d: AvisoTIConta): boolean =>
  avisoNome(a) !== avisoNome(d) || a.role !== d.role || a.sector.trim() !== d.sector.trim() || a.okr_only !== d.okr_only || a.okr_enabled !== d.okr_enabled;
// "07/10/2026 às 14:32", no horário de Joinville (a Vercel roda em UTC).
const avisoQuando = (d: Date): string => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => (p.find((x) => x.type === t) || { value: "" }).value;
  return `${g("day")}/${g("month")}/${g("year")} às ${g("hour")}:${g("minute")}`;
};
const avisoDia = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : avisoLimpo(iso, 20); };

type AvisoTI = { acao: AvisoTIAcao; conta: AvisoTIConta; antes?: AvisoTIConta; ultimoDia?: string; setorPeloBanco?: boolean };
const AVISO_NAO_LI = "não consegui ler o cadastro";
// O bloco "o que mudou / como nasceu / como estava", em linhas "Rótulo: valor" — o MESMO no e-mail e no Log do servidor.
// Um lado que não foi lido diz "não consegui ler" (antes dizia "—" e afirmava "(igual)").
const avisoTIBloco = (a: AvisoTI): { titulo: string; linhas: string[] } => {
  const c = a.conta;
  const v = (k: AvisoTIConta, f: (k: AvisoTIConta) => string) => (k.lida ? f(k) : AVISO_NAO_LI);
  const campo = (rotulo: string, antes: string | undefined, depois: string) =>
    antes === undefined ? `${rotulo}: ${depois}` : antes === depois && antes !== AVISO_NAO_LI ? `${rotulo}: ${depois} (igual)` : `${rotulo}: ${antes} → ${depois}`;
  if (a.acao === "criou") {
    return { titulo: "Como a conta nasceu", linhas: [
      campo("Cargo", undefined, avisoCargo(c)),
      campo("Setor", undefined, a.setorPeloBanco ? "o próprio do representante (posto pelo banco)" : avisoSetor(c)),
      campo("Somente OKR", undefined, avisoSimNao(c.okr_only)),
      campo("OKR habilitado", undefined, avisoSimNao(c.okr_enabled))] };
  }
  if (a.acao === "alterou" && a.antes) {
    const b = a.antes;
    return { titulo: "O que mudou (antes → depois)", linhas: [
      campo("Nome", v(b, avisoNome), v(c, avisoNome)),
      campo("Cargo", v(b, avisoCargo), v(c, avisoCargo)),
      campo("Setor", v(b, avisoSetor), avisoSetor(c)),
      campo("Somente OKR", v(b, (k) => avisoSimNao(k.okr_only)), v(c, (k) => avisoSimNao(k.okr_only))),
      campo("OKR habilitado", v(b, (k) => avisoSimNao(k.okr_enabled)), v(c, (k) => avisoSimNao(k.okr_enabled)))] };
  }
  return { titulo: "Como a conta estava", linhas: [
    ...(a.acao === "desligou" ? [`Último dia trabalhado: ${avisoDia(a.ultimoDia || "")}`] : []),
    campo("Cargo", undefined, v(c, avisoCargo)),
    campo("Setor", undefined, v(c, avisoSetor)),
    campo("Somente OKR", undefined, v(c, (k) => avisoSimNao(k.okr_only))),
    campo("OKR habilitado", undefined, v(c, (k) => avisoSimNao(k.okr_enabled)))] };
};
const avisoTIMensagem = (a: AvisoTI, ator: { nome: string; login: string }, quando: string): { subject: string; text: string } => {
  const c = a.conta;
  const login = avisoLimpo(c.username, 60) || "—";
  const bloco = avisoTIBloco(a);
  const linhas = [
    "Aviso automático do KPI de Engenharia (JIMPNexus): uma mudança numa conta, feita por quem administra usuários pela marca (o TI).",
    "",
    `Quem fez: ${ator.nome || "—"} (login ${ator.login || "—"})`,
    `O que fez: ${a.acao} uma conta`,
    `Quando: ${quando} (horário de Joinville)`,
    "",
    "A conta",
    ...(c.lida ? [] : [`  (${AVISO_NAO_LI} desta conta: confira pelo id, na Equipe)`]),
    `  Nome: ${c.lida ? avisoNome(c) : "—"}`,
    `  Login: ${login}`,
    `  E-mail: ${avisoLimpo(c.email, 120) || "—"}`,
    `  Id: ${c.id}`,
    "",
    ...(a.acao === "desligou" ? ["Desligar tira o acesso e o e-mail do cadastro; o que a pessoa fez continua no nome dela.", ""] : []),
    bloco.titulo,
    ...bloco.linhas.map((l) => `  ${l}`),
    "",
    "Não reconhece esta mudança? Na Equipe do KPI você desliga a conta e tira a marca \"administra usuários\" de quem a fez (só você tira).",
    "Este aviso sai sozinho a cada conta que o TI cria, altera, desliga ou exclui. Cada um fica também no Log de Auditoria (ação TI_CONTA), gravado pelo servidor.",
  ];
  return { subject: `KPI — o TI ${a.acao} uma conta: ${login}`, text: linhas.join("\n") };
};
// A linha do Log de Auditoria que o SERVIDOR grava a cada ação do TI (F1, 07/10): o mesmo resumo, numa linha.
const avisoTIResumo = (a: AvisoTI, ator: { nome: string; login: string }, quando: string): string => {
  const c = a.conta;
  const bloco = avisoTIBloco(a);
  return `${ator.nome || "—"} (login ${ator.login || "—"}) ${a.acao} a conta ${avisoLimpo(c.username, 60) || "—"} ` +
    `(${c.lida ? avisoNome(c) : AVISO_NAO_LI}; e-mail ${avisoLimpo(c.email, 120) || "—"}; id ${c.id}) em ${quando}. ` +
    `${bloco.titulo}: ${bloco.linhas.join("; ")}.`;
};

// Uma conta para o aviso, lida do cadastro (prazo curto). Nunca lança: null = não consegui ler.
async function lerContaDoAviso(admin: any, id: string): Promise<AvisoTIConta | null> {
  try {
    const { data, error } = (await agendaComPrazo(Promise.resolve(admin.from("users").select(AVISO_TI_COLS).eq("id", id).limit(1)), AVISO_TI_LEITURA_PRAZO_MS)) as any;
    if (error || !data || !data[0]) return null;
    return contaDoAviso(id, data[0]);
  } catch { return null; }
}

// Uma linha no Log de Auditoria, gravada pelo SERVIDOR (service_role; o gatilho audit_logs_carimba_quem confia nela). Prazo
// curto; nunca lança. true = gravou.
async function logDoServidor(admin: any, linha: { user_id: string | null; action: string; entity_id: string; entity_name: string; details: string; ip_address?: string | null },
  prazoMs: number = AVISO_TI_LOG_PRAZO_MS, rotulo = "[AvisoTI]"): Promise<boolean> {
  try {
    const { error } = (await agendaComPrazo(Promise.resolve(admin.from("audit_logs").insert([{
      user_id: linha.user_id, user_name: "Sistema Nexus", action: linha.action, entity_type: "USER",
      entity_id: linha.entity_id, entity_name: linha.entity_name, details: linha.details,
      ...(linha.ip_address ? { ip_address: linha.ip_address } : {}),
    }])), prazoMs)) as any;
    if (error) { console.error(`${rotulo} não consegui gravar no Log de Auditoria (${linha.action}):`, String(error.code || "(sem código)")); return false; }
    return true;
  } catch (e: any) {
    console.error(`${rotulo} não consegui gravar no Log de Auditoria (${linha.action}):`, String((e && e.code) || "erro"));
    return false;
  }
}
// "8 s", "6,5 s"
const avisoSegundos = (ms: number): string => `${(Math.round(ms / 100) / 10).toString().replace(".", ",")} s`;

// Grava o rastro no Log (TI_CONTA) e manda o aviso (ou anota no Log que não saiu). Chamar só DEPOIS de a gravação dar certo.
// inicioRota = o Date.now() do começo da rota: o prazo do SMTP desconta o que a rota já gastou. Nunca lança.
async function avisarEdsonDoTI(admin: any, atorSub: any, a: AvisoTI, inicioRota: number = Date.now()): Promise<void> {
  const atorId = canonUuid(atorSub) || "";
  const login = avisoLimpo(a.conta.username, 60) || a.conta.id;
  try {
    let ator = { nome: "", login: "" };
    const eu = atorId ? await lerContaDoAviso(admin, atorId) : null;
    if (eu) ator = { nome: avisoNome(eu), login: avisoLimpo(eu.username, 60) };
    else ator = { nome: `(${AVISO_NAO_LI})`, login: atorId || "?" };
    const quando = avisoQuando(new Date());
    // 1) o RASTRO, antes do e-mail: se o SMTP pendurar e a função for cortada, a linha já está no Log.
    await logDoServidor(admin, { user_id: atorId || null, action: "TI_CONTA", entity_id: a.conta.id, entity_name: login, details: avisoTIResumo(a, ator, quando) });
    // 2) o e-mail, com o prazo que sobra
    const { subject, text } = avisoTIMensagem(a, ator, quando);
    const semConfig = !process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS;
    const prazo = Math.max(AVISO_TI_PRAZO_MIN_MS, Math.min(AVISO_TI_PRAZO_MS, AVISO_TI_ORCAMENTO_MS - (Date.now() - inicioRota)));
    try {
      await agendaComPrazo(sendPlainMail(AVISO_TI_PARA, subject, text), prazo);
      console.log(`[AvisoTI] aviso ao Edson enviado: o TI ${a.acao} a conta ${login}`);
      return;
    } catch (e: any) {
      // Só o código: a mensagem do SMTP pode ecoar usuário/senha da conta de envio.
      const code = String((e && (e.code || e.responseCode)) || "erro");
      const motivo = semConfig ? "o e-mail não está configurado no servidor"
        : code === "TIMEOUT" ? `o servidor de e-mail não respondeu em ${avisoSegundos(prazo)}`
        : `o servidor de e-mail recusou ou caiu (erro ${avisoLimpo(code, 20)})`;
      console.error(`[AvisoTI] o aviso ao Edson NÃO saiu (o TI ${a.acao} a conta ${login}):`, semConfig ? "sem EMAIL_*" : code);
      const details = `O e-mail automático ao Edson não saiu: ${ator.nome} (login ${ator.login}) ${a.acao} a conta ${login} (${a.conta.lida ? avisoNome(a.conta) : AVISO_NAO_LI}) em ${quando}. ` +
        `Motivo: ${motivo}. A mudança continua valendo — confira na Equipe.`;
      // o que sobra até ~9,5 s (nunca menos de 0,5 s): a linha TI_CONTA já está lá; esta só diz que o e-mail faltou
      await logDoServidor(admin, { user_id: atorId || null, action: "AVISO_NAO_ENVIADO", entity_id: a.conta.id, entity_name: login, details },
        Math.max(500, Math.min(AVISO_TI_LOG_PRAZO_MS, 9500 - (Date.now() - inicioRota))));
    }
  } catch (e: any) {
    console.error("[AvisoTI] falha inesperada no aviso:", String((e && e.code) || "erro"));
  }
}

// POST /api/users/save { mode: 'create'|'update', user }
app.post("/api/users/save", async (req, res) => {
  const inicioRota = Date.now();   // o prazo do aviso ao Edson desconta o que a rota já gastou
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });

  const { mode, user } = req.body || {};
  // SÓ O SETOR (KPI dos setores, 01/10). Decisão do Edson, 30/09: "Só o Edson e os admins de OKR mudam o
  // SETOR de qualquer pessoa" — fora o CEO, mesmo admin de OKR (01/10: "ceo não pode dar cargo a ninguem
  // e nem liberar acesso"). A tela do KPI ("Pessoas e setores") usa este caminho, que grava a coluna
  // sector e mais nada (o 'update' regravaria cargo, marcas e login com o que viesse).
  if (mode === "setor") {
    const alvo = canonUuid(user && user.id);
    if (!alvo) return res.status(400).json({ success: false, error: "id ausente ou invalido." });
    if (alvo === EDSON_ID && !claimsAreEdson(claims)) return res.status(403).json({ success: false, error: "Só o próprio Edson altera a conta dele." });
    // …e quem administra usuários (032, TI): define o setor das contas que ele edita, menos P&D e Teste (as recusas abaixo).
    let setorPeloTI = false;
    let avisaEdson = false;   // a troca sai em e-mail ao Edson (07/10): quem tem a marca, mesmo que mude o setor como admin de OKR
    try {
      if (!(await isOkrMasterDb(admin, claims.sub))) {
        setorPeloTI = await administraUsuariosDb(admin, claims.sub);
        if (!setorPeloTI) return res.status(403).json({ success: false, error: "Só o Edson e os admins de OKR mudam o setor de alguém." });
      }
      // O CEO e o Diretor Industrial (06/10) não mudam setor de ninguém, mesmo admins de OKR ("só visão macro").
      if (!claimsAreEdson(claims) && ehVisaoCeo(await currentRole(admin, claims.sub))) return res.status(403).json({ success: false, error: CEO_SO_VE });
      avisaEdson = setorPeloTI || (await administraUsuariosDb(admin, claims.sub));   // o Edson: false, sem ir ao banco
    }
    catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
    const setor = String((user && user.sector) ?? "").trim();
    if (setor.length > 60) return res.json({ success: false, message: "O nome do setor é longo demais (até 60 letras)." });
    // O setor que a tela via (sectorAntes): se outro admin o mudou no meio, recusa em vez de desfazer calado.
    // (junto, a conta como está — o "antes" do aviso ao Edson, lido ANTES de gravar: lida depois, uma leitura que desistia
    // mandava um aviso de "—" que nem dizia de quem era a troca — 07/10, achado da crítica)
    const { data: atual, error: aErr } = await lerComUsuarioTeste((c) => admin.from("users").select(c).eq("id", alvo).limit(1), AVISO_TI_COLS);   // (traz sector e role)
    if (aErr) return res.json({ success: false, message: "Não consegui ler o usuário. Tente de novo." });
    if (!atual || !atual.length) return res.json({ success: false, message: "Usuário não encontrado." });
    // O usuário teste (031): só o Edson mexe na conta dele, o setor incluído.
    if ((atual[0] as any).usuario_teste && !claimsAreEdson(claims)) return res.status(403).json({ success: false, error: USUARIO_TESTE_SO_EDSON_MSG });
    // O TI (032): o setor dele mesmo é do Edson; o das contas altas, de quem as edita (ele não).
    if (setorPeloTI) {
      if (alvo === canonUuid(claims.sub)) return res.status(403).json({ success: false, error: TI_SI_MESMO_MSG });
      try { if (contaAltaParaTI(await contaParaTI(admin, alvo))) return res.status(403).json({ success: false, error: TI_CONTA_ALTA_MSG }); }
      catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
    }
    const setorAtual = String((atual[0] as any).sector || "").trim();
    if (setor === setorAtual) return res.json({ success: true, semMudanca: true });   // já é esse: nada a gravar (a tela não registra troca)
    // O setor do REPRESENTANTE (06/10/2026) é só dele e quem o põe é o banco (030): gravar outro seria desfeito calado.
    if (ehRepresentante((atual[0] as any).role)) return res.json({ success: false, message: "O setor do representante é só dele (posto automaticamente)." });
    // …e o setor de um representante não serve para outra pessoa (06/10/2026).
    if (setorDeRepresentante(setor)) return res.json({ success: false, message: SETOR_DE_REPRESENTANTE_MSG });
    // O TI (032) não mexe no setor de conta comum com e-mail de fora da empresa (07/10, a mesma régua do criar e do editar).
    if (setorPeloTI && tiBarraEmailDeFora((atual[0] as any).role, (atual[0] as any).email)) return res.status(403).json({ success: false, error: TI_EMAIL_FORA_MSG });
    if ((setorReservado(setor) || setorReservado(setorAtual)) && !claimsAreEdson(claims)) return res.status(403).json({ success: false, error: SETOR_RESERVADO_MSG });
    // O setor do teste (031): quem entra nele passa a ver os indicadores do teste — só o Edson põe ou tira alguém.
    if ((setorSoEdson(setor) || setorSoEdson(setorAtual)) && !claimsAreEdson(claims)) return res.status(403).json({ success: false, error: SETOR_SO_EDSON_MSG });
    if (user && user.sectorAntes !== undefined && user.sectorAntes !== null && String(user.sectorAntes).trim() !== setorAtual)
      return res.status(409).json({ success: false, setorAtual, error: `O setor desta pessoa mudou enquanto a tela estava aberta (agora: "${setorAtual || "sem setor"}"). Nada foi gravado — confira e salve de novo.` });
    const { data: mudou, error: sErr } = await admin.from("users").update({ sector: setor || null }).eq("id", alvo).select("id");
    if (sErr) return res.json({ success: false, message: erroDoRepresentanteMsg(sErr) || `Erro DB: ${sErr.message}` });
    if (!mudou || !mudou.length) return res.json({ success: false, message: "Usuário não encontrado." });
    console.log(`[users/save] setor de ${alvo} → "${setor || "—"}" por ${canonUuid(claims.sub)} (KPI dos setores)`);
    if (avisaEdson) {
      const antes = contaDoAviso(alvo, atual[0]);   // lida antes de gravar (acima); o "depois" muda só o setor
      await avisarEdsonDoTI(admin, claims.sub, { acao: "alterou", antes: { ...antes, sector: setorAtual }, conta: { ...antes, sector: setor } }, inicioRota);
    }
    return res.json({ success: true });
  }
  if (!user || !user.username) return res.status(400).json({ success: false, error: "Dados incompletos." });
  let isAdmin = false;
  let isGestor = false; // só GESTOR mexe em CEO/GESTOR e nas contas que leem o OKR de todos
  let ehTI = false;     // administra usuários pela marca (032) — só quem não é admin pelo cargo; GESTOR/COORDENADOR seguem como antes
  try {
    // Desligado (022): nenhum modo — nem o próprio contato pelo Meu Perfil, que não passa pelo cargo.
    const meuId = canonUuid(claims.sub);
    const eu = meuId ? await lerUsuario(admin, meuId, "role, okr_viewer, okr_admin", "Nao consegui conferir o seu cargo. Tente de novo.") : null;
    if (meuId && desligadoPeloCadastro(eu, meuId)) return res.status(403).json({ success: false, error: "Este acesso foi encerrado." });
    const papel = meuId ? papelDoCadastro(eu, meuId) : null;
    isAdmin = PESSOAS_ADMIN_ROLES.includes(String(papel)) || claimsAreEdson(claims);   // o CEO não (01/10); o Edson pelo id
    isGestor = papel === "GESTOR" || claimsAreEdson(claims);
    if (ehVisaoCeo(papel) && !claimsAreEdson(claims) && (mode === "create" || canonUuid(user.id) !== meuId)) return res.status(403).json({ success: false, error: CEO_SO_VE });
    if (!isAdmin && mode !== "profile") ehTI = await administraUsuariosDb(admin, claims.sub);
  }
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
    if (!isAdmin && !ehTI) return res.status(403).json({ success: false, error: "Sem permissao para criar usuarios." });
    if (!CARGOS_VALIDOS.includes(String(user.role ?? ""))) return res.json({ success: false, message: CARGO_DESCONHECIDO_MSG(user.role) });
    // O TI (032): só cargo comum, nenhuma marca, e-mail válido (é por ele que a pessoa cria a senha).
    if (ehTI) {
      if (!CARGOS_DO_TI.includes(String(user.role))) return res.status(403).json({ success: false, error: TI_CARGO_MSG });
      if (!!user.okrViewer || !!user.okrAdmin || !!user.adminUsuarios) return res.status(403).json({ success: false, error: TI_MARCAS_MSG });
      if (!isValidEmail(user.email)) return res.json({ success: false, message: TI_EMAIL_MSG });
      // …e da EMPRESA (07/10, achado da crítica): com um e-mail dele, o TI pedia o código e entrava na conta que acabou de
      // criar — uma conta comum, com engenharia e o setor que ele escolhesse ("conta-fantoche"). O representante (vendedor
      // de fora, sempre "Somente OKR", setor só dele) fica de fora.
      if (!ehRepresentante(user.role) && !recipientAllowed(String(user.email), new Set<string>())) return res.json({ success: false, message: TI_EMAIL_EMPRESA_MSG });
    } else if (user.adminUsuarios === true) {
      // A marca se dá no editar, e só o Edson.
      if (!claimsAreEdson(claims)) return res.status(403).json({ success: false, error: MARCA_SO_EDSON_MSG });
      return res.json({ success: false, message: MARCA_NO_EDITAR_MSG });
    }
    if (cargoSoDoGestor(user.role) && !isGestor && !(ehTI && CARGOS_DO_TI.includes(String(user.role)))) return res.status(403).json({ success: false, error: CARGO_SO_DO_GESTOR_MSG });
    // REPRESENTANTE (06/10/2026): nasce SEMPRE "Somente OKR" (com OKR), nunca visualizador — como o ADM Externo nasce
    // visualizador. Sem isto, um representante criado sem a marca viraria usuário da engenharia.
    const novoRepresentante = ehRepresentante(user.role);
    if (novoRepresentante && (!!user.okrViewer || !!user.okrAdmin)) return res.json({ success: false, message: REPRESENTANTE_SO_OKR_MSG });
    try {
      if (await inUse("username", user.username)) return res.json({ success: false, message: "Nome de usuário já existe." });
      if (await okrKeyTaken(user.username.toLowerCase())) return res.json({ success: false, message: "Esse nome de usuário está ligado ao OKR de outra pessoa." });
    } catch (e: any) { return res.json({ success: false, message: e.message }); }
    // "Admin de visualização" do OKR: só o Edson, ou um GESTOR que seja admin de OKR, dá essa
    // marca — e o grupo ADM Externo é essa marca (quem nasce nele nasce visualizador). Um CEO
    // admin de OKR NÃO (Edson, 30/09: "só um GESTOR ou você muda quem é só visualização").
    const newViewer = !!user.okrViewer || user.role === ADM_EXTERNO;
    if (newViewer) {
      try { if (!isGestor || !(await isOkrMasterDb(admin, claims.sub))) return res.status(403).json({ success: false, error: "Só o Edson (ou um GESTOR admin de OKR) marca alguém como admin de visualização do OKR." }); }
      catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
    }
    // O SETOR é a porta do KPI dos setores (a pessoa vê e lança os indicadores do setor dela):
    // só o Edson e os admins de OKR o dão — inclusive na criação. Decisão do Edson, 30/09: "Só o
    // Edson e os admins de OKR mudam o SETOR de qualquer pessoa (inclusive na criação)".
    // O do REPRESENTANTE (06/10/2026) é só dele e quem o põe é o banco (030): o enviado é ignorado — e não barra a
    // criação por quem não dá setor (o GESTOR cria o representante sem precisar do Edson).
    const setorNovo = novoRepresentante ? "" : String(user.sector || "").trim();
    if (setorNovo) {
      if (setorDeRepresentante(setorNovo)) return res.json({ success: false, message: SETOR_DE_REPRESENTANTE_MSG });
      // …e quem administra usuários (032): menos P&D e Teste (as recusas logo abaixo valem para ele).
      try { if (!ehTI && !(await isOkrMasterDb(admin, claims.sub))) return res.status(403).json({ success: false, error: "Só o Edson e os admins de OKR definem o setor (o setor abre o KPI do setor). Crie sem setor e peça a eles." }); }
      catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
      if (setorReservado(setorNovo) && !claimsAreEdson(claims)) return res.status(403).json({ success: false, error: SETOR_RESERVADO_MSG });
      if (setorSoEdson(setorNovo) && !claimsAreEdson(claims)) return res.status(403).json({ success: false, error: SETOR_SO_EDSON_MSG });
    }
    // Salario so e gravado se quem cria for o Edson. Um admin comum nem
    // enxerga salario (cliente recebe 0), entao nunca escreve esse campo.
    // A conta que o TI cria (032) nasce SEM senha: a digitada é ignorada (nunca vai ao banco, nem em texto puro), vai
    // password vazio + must_set_password, e o banco sorteia o hash (users_senha_sorteada) — ninguém entra até a pessoa
    // criar a dela pelo código no e-mail.
    const semSenha = ehTI;
    // O id da conta nova é SEMPRE sorteado aqui, nunca o que o cliente manda (07/10, achado da crítica): excluir uma conta
    // sem registros e recriá-la com o MESMO id herdava os convites da Agenda dela (participantes e alertas guardam o id,
    // sem FK, e o disparador acha o destinatário pelo id na hora de mandar) — inclusive os compromissos do Edson.
    const idNovo = randomUUID();
    const linhaNova = {
      id: idNovo, name: user.name, surname: user.surname, email: user.email, phone: user.phone,
      username: user.username, password: semSenha ? "" : user.password, role: user.role,
      ...(semSenha ? { must_set_password: true } : {}),
      salary: claimsAreEdson(claims) ? (Number(user.salary) || 0) : 0,
      // Admin de visualização não tem OKR próprio nem é "somente OKR" (tem restrição própria). O representante é
      // sempre "Somente OKR" (newViewer é falso para ele: recusado acima).
      okr_enabled: newViewer ? false : !!(user.okrEnabled || user.okrOnly || novoRepresentante), // "somente OKR" implica ter OKR
      okr_only: newViewer ? false : !!(user.okrOnly || novoRepresentante),
      okr_viewer: newViewer,
      sector: setorNovo || null,
    };
    const { error } = await admin.from("users").insert([linhaNova]);
    if (error) return res.json({ success: false, message: erroDoRepresentanteMsg(error) || `Erro DB: ${error.message}` });
    if (setorNovo) console.log(`[users/save] setor "${setorNovo}" dado na criação de ${user.username} por ${canonUuid(claims.sub)}`);
    // O aviso ao Edson (07/10): a conta que o TI criou, como nasceu (contaDoAviso copia só os campos do aviso).
    if (ehTI) await avisarEdsonDoTI(admin, claims.sub, { acao: "criou", conta: contaDoAviso(idNovo, linhaNova), setorPeloBanco: novoRepresentante }, inicioRota);
    if (semSenha) {
      console.log(`[users/save] ${user.username} criado sem senha (administra usuários) por ${canonUuid(claims.sub)}`);
      return res.json({ success: true, id: idNovo, semSenha: true, message: TI_CRIADO_MSG(user.username) });
    }
    return res.json({ success: true, id: idNovo });
  }

  // Meu Perfil: SÓ o contato da própria pessoa. O perfil manda o usuário que o
  // navegador guardou no login (até 12 h de idade); pelo caminho de 'update', um
  // admin que trocasse só o telefone regravava cargo, OKR, setor e até o login com
  // esses valores velhos — desfazendo calado o que alguém mudou no meio do dia.
  if (mode === "profile") {
    if (!isSelf) return res.status(403).json({ success: false, error: "O perfil só altera o próprio usuário." });
    const nome = String(user.name || "").trim();
    if (!nome) return res.json({ success: false, message: "Informe o seu nome." });
    // O usuário teste (031): o e-mail dele só o Edson troca (é por onde se recupera a senha).
    if (!claimsAreEdson(claims)) {
      try { if (await testeTrocaOEmail(admin, user.id, user.email)) return res.status(403).json({ success: false, error: EMAIL_TESTE_SO_EDSON_MSG }); }
      catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
    }
    const { error: pErr } = await admin.from("users")
      .update({ name: nome, surname: String(user.surname || "").trim(), email: user.email, phone: user.phone || null })
      .eq("id", user.id);
    if (pErr) {
      if ((pErr as any).code === "23505") return res.json({ success: false, message: "Este e-mail já pertence a outro usuário." });
      return res.json({ success: false, message: erroDoRepresentanteMsg(pErr) || `Erro DB: ${pErr.message}` });
    }
    return res.json({ success: true });
  }

  // update
  if (!user.id) return res.status(400).json({ success: false, error: "id ausente." });
  if (!String(user.name || "").trim()) return res.json({ success: false, message: "Informe o nome." });
  if (!isAdmin && !isSelf && !ehTI) return res.status(403).json({ success: false, error: "Sem permissao." });
  // O usuário teste (031): a conta dele só o Edson altera — nenhum GESTOR/COORDENADOR (senão trocava a senha e entrava
  // como ele). Conferido depois do "Sem permissao." (quem não é admin não distingue a conta dele de outra qualquer) e
  // antes de qualquer leitura ou gravação do alvo. A própria pessoa segue (o contato, como no Meu Perfil).
  if (!isSelf && !claimsAreEdson(claims)) {
    try { if (await ehUsuarioTeste(admin, user.id)) return res.status(403).json({ success: false, error: USUARIO_TESTE_SO_EDSON_MSG }); }
    catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
  }
  // …e o próprio teste não troca o e-mail dele por aqui (o mesmo do Meu Perfil, acima).
  if (isSelf && !claimsAreEdson(claims)) {
    try { if (await testeTrocaOEmail(admin, user.id, user.email)) return res.status(403).json({ success: false, error: EMAIL_TESTE_SO_EDSON_MSG }); }
    catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
  }
  // A MARCA "administra usuários" (032): só o Edson dá ou tira — vindo de qualquer outra pessoa, mudar = 403 (mandar o
  // valor que já está no cadastro passa). Lida também em todo editar de admin: quem a tem não sobe de cargo com ela.
  const comoTI = ehTI && !isSelf;   // o TI editando OUTRA conta (a própria, só o contato — abaixo)
  const pedeMarca = user.adminUsuarios !== undefined && user.adminUsuarios !== null;
  let marcaAlvo: boolean | null = null;   // a marca do alvo hoje (null = a 032 não rodou)
  let marcaNova: boolean | null = null;   // o valor novo, só quando o Edson a muda
  if (pedeMarca || isAdmin || comoTI) {
    try { marcaAlvo = await marcaAdminUsuariosDe(admin, user.id); }
    catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
  }
  if (pedeMarca && (user.adminUsuarios === true) !== (marcaAlvo === true)) {
    if (!claimsAreEdson(claims)) return res.status(403).json({ success: false, error: MARCA_SO_EDSON_MSG });
    if (marcaAlvo === null) return res.json({ success: false, message: MARCA_SEM_032_MSG });
    marcaNova = user.adminUsuarios === true;
  }
  // O TI na PRÓPRIA conta (032): só o contato, como no Meu Perfil — cargo, setor e marcas dele, só o Edson. Mandar o que já
  // está no cadastro passa (a tela pode mandar o formulário inteiro); mudar = 403.
  if (ehTI && isSelf) {
    const { data: eu, error: euErr } = await admin.from("users").select("role, sector, okr_only, okr_viewer, okr_admin").eq("id", user.id).limit(1);
    if (euErr || !eu || !eu.length) return res.status(503).json({ success: false, message: "Não consegui ler o seu cadastro. Nada foi gravado; tente de novo." });
    const e0 = eu[0] as any;
    const muda = (v: any, atual: any, bool = false) => v !== undefined && v !== null && (bool ? !!v !== !!atual : String(v).trim() !== String(atual ?? "").trim());
    if (muda(user.role, e0.role) || muda(user.sector, e0.sector) || muda(user.okrOnly, e0.okr_only, true) || muda(user.okrViewer, e0.okr_viewer, true) || muda(user.okrAdmin, e0.okr_admin, true)) {
      return res.status(403).json({ success: false, error: TI_SI_MESMO_MSG });
    }
  }
  // O TI em OUTRA conta (032): só as comuns; e-mail, login e senha de quem já existe, nunca (é tomar a conta); só cargos
  // comuns; nenhuma marca. Conferido contra o CADASTRO, antes de qualquer gravação.
  let contaAntesDoTI: AvisoTIConta | null = null;   // como a conta estava, para o aviso ao Edson (07/10)
  if (comoTI) {
    let a: any = null;
    try { a = await contaParaTI(admin, user.id); }
    catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
    if (!a) return res.json({ success: false, message: "Usuário não encontrado." });
    contaAntesDoTI = contaDoAviso(user.id, a);
    if (contaAltaParaTI(a)) return res.status(403).json({ success: false, error: TI_CONTA_ALTA_MSG });
    const mudaEmail = String(user.email || "").trim().toLowerCase() !== String(a.email || "").trim().toLowerCase();
    const mudaLogin = user.username !== String(a.username || "").trim();
    if (mudaEmail || mudaLogin || !!user.password) return res.status(403).json({ success: false, error: TI_ACESSO_MSG });
    user.email = a.email ?? null;   // nem a grafia muda: fica o e-mail do cadastro, letra por letra
    if (user.role !== undefined && user.role !== null && !CARGOS_DO_TI.includes(String(user.role))) return res.status(403).json({ success: false, error: TI_CARGO_MSG });
    // e-mail de fora da empresa: só enquanto for representante (o cargo final; sem o campo, fica o do cadastro) — 07/10
    if (tiBarraEmailDeFora(user.role === undefined || user.role === null ? a.role : user.role, a.email)) return res.status(403).json({ success: false, error: TI_EMAIL_FORA_MSG });
    if ((user.okrViewer !== undefined && user.okrViewer !== null && !!user.okrViewer !== !!a.okr_viewer)
        || (user.okrAdmin !== undefined && user.okrAdmin !== null && !!user.okrAdmin !== !!a.okr_admin)) {
      return res.status(403).json({ success: false, error: TI_MARCAS_MSG });
    }
  }
  // Todos podem editar dados de contato; SO admin muda username/role/salary/senha.
  const patch: any = { name: user.name, surname: user.surname, email: user.email, phone: user.phone };
  let renameTo = "";
  let wantViewer = false;
  let wasOnly = false;
  let wantOnly = false;
  let setorPedido = "";
  let setorMudou = "";
  let setorTroca: { de: string; para: string } | null = null;   // a troca de setor que foi GRAVADA (a tela registra no log só ela)
  let setorDoCadastro = "";        // o setor antes deste salvar
  let viraRepresentante = false;   // passa a ser REPRESENTANTE agora (o banco troca o setor pelo dele, 030)
  let cargoDa030 = false;          // passa a ter um cargo que só existe a partir da 030 (DIRETOR_INDUSTRIAL, REPRESENTANTE)
  let cargoDoCadastro = "";        // o cargo antes deste salvar (a marca da 032 só fica em cargo comum)
  // O TI (comoTI) passa pelo mesmo caminho do admin, com o que já foi barrado acima e as exceções marcadas abaixo.
  if (isAdmin || comoTI) {
    // Cargo fora da lista: recusado aqui, ANTES de qualquer gravação (inclusive do kpi_rename_login, lá embaixo).
    if (user.role !== undefined && user.role !== null && !CARGOS_VALIDOS.includes(String(user.role))) {
      return res.json({ success: false, message: CARGO_DESCONHECIDO_MSG(user.role) });
    }
    // Renomear para um username que já existe (mesmo mudando maiúsculas, ex.: "EDSON") é recusado.
    try {
      if (await inUse("username", user.username, user.id)) return res.json({ success: false, message: "Nome de usuário já existe." });
      const { data: cur, error: curErr } = await admin.from("users").select("username, role, okr_viewer, okr_admin, okr_only, sector").eq("id", user.id).limit(1);
      if (curErr) return res.json({ success: false, message: "Não consegui ler o usuário. Tente de novo." });
      if (!cur || !cur.length) return res.json({ success: false, message: "Usuário não encontrado." });
      const oldName = String((cur[0] as any).username || "").trim();
      cargoDoCadastro = String((cur[0] as any).role || "");
      // REPRESENTANTE (06/10/2026): quem FICA (ou passa a ser) representante é sempre "Somente OKR".
      const representanteFinal = ehRepresentante(user.role === undefined || user.role === null ? (cur[0] as any).role : user.role);
      if (representanteFinal && user.id === EDSON_ID) return res.json({ success: false, message: "O Edson nunca é representante." });
      const cargoMuda = user.role !== undefined && user.role !== null && String(user.role) !== String((cur[0] as any).role || "");
      viraRepresentante = representanteFinal && cargoMuda;
      cargoDa030 = cargoMuda && (String(user.role) === DIRETOR_INDUSTRIAL || ehRepresentante(user.role));
      // Quem não pode DAR o cargo ouve isso primeiro (e não a frase do setor ou da marca, que sugeririam que sem elas
      // daria certo).
      // (o TI dá o Representante: é cargo comum — decisão do Edson, 07/10)
      if (viraRepresentante && !isGestor && !comoTI) return res.status(403).json({ success: false, error: CARGO_SO_DO_GESTOR_MSG });
      // SETOR (KPI dos setores, 30/09): sem o campo no pedido = fica como está; mudar só o Edson e os
      // admins de OKR — senão um COORDENADOR se punha no Financeiro e lia os indicadores de lá.
      const setorAtual = String((cur[0] as any).sector || "").trim();
      setorDoCadastro = setorAtual;
      setorPedido = user.sector === undefined || user.sector === null ? setorAtual : String(user.sector).trim();
      // Mexeu no campo e voltou ao que via: não é troca — fica o do cadastro (que outro admin pode ter mudado).
      if (user.sectorAntes !== undefined && user.sectorAntes !== null && setorPedido === String(user.sectorAntes).trim()) setorPedido = setorAtual;
      // O do representante é só dele e quem o põe é o banco (030): o enviado é ignorado (fica o do cadastro, e o banco
      // o refaz) — e não barra quem não dá setor (o GESTOR transforma alguém em representante sem precisar do Edson).
      if (representanteFinal) setorPedido = setorAtual;
      // …mas virar representante TROCA o setor (o banco põe o dele): quem está no P&D só sai pelo Edson (a regra do
      // setor reservado, que a troca pelo banco pularia).
      if (viraRepresentante && setorReservado(setorAtual) && !claimsAreEdson(claims)) {
        return res.status(403).json({ success: false, error: SETOR_RESERVADO_MSG });
      }
      if (viraRepresentante && setorSoEdson(setorAtual) && !claimsAreEdson(claims)) {
        return res.status(403).json({ success: false, error: SETOR_SO_EDSON_MSG });
      }
      // …e tirar alguém do setor dele (ida e volta pelo cargo) é mudar o setor: só o Edson e os admins de OKR (30/09) —
      // e o TI (032), que define o setor (o P&D e o Teste já foram barrados logo acima).
      if (viraRepresentante && setorAtual && !comoTI && !(await isOkrMasterDb(admin, claims.sub))) {
        return res.status(403).json({ success: false, error: "Esta pessoa tem setor, e virar representante troca o setor dela (o representante tem um só dele): só o Edson e os admins de OKR mudam o setor de alguém." });
      }
      if (setorPedido !== setorAtual) {
        // O setor de um representante não serve para outra pessoa (06/10/2026).
        if (setorDeRepresentante(setorPedido)) return res.json({ success: false, message: SETOR_DE_REPRESENTANTE_MSG });
        // (o TI define o setor das contas que edita — 032; P&D e Teste: as recusas logo abaixo)
        if (!comoTI && !(await isOkrMasterDb(admin, claims.sub))) {
          return res.status(403).json({ success: false, error: "Só o Edson e os admins de OKR mudam o setor de alguém (o setor abre o KPI do setor)." });
        }
        if ((setorReservado(setorPedido) || setorReservado(setorAtual)) && !claimsAreEdson(claims)) {
          return res.status(403).json({ success: false, error: SETOR_RESERVADO_MSG });
        }
        // O setor do teste (031): só o Edson põe ou tira alguém dele.
        if ((setorSoEdson(setorPedido) || setorSoEdson(setorAtual)) && !claimsAreEdson(claims)) {
          return res.status(403).json({ success: false, error: SETOR_SO_EDSON_MSG });
        }
        // A tela diz o setor que via (sectorAntes): se outro admin o mudou no meio, recusa em vez de desfazer.
        if (user.sectorAntes !== undefined && user.sectorAntes !== null && String(user.sectorAntes).trim() !== setorAtual)
          return res.status(409).json({ success: false, setorAtual, error: `O setor de ${user.username} mudou enquanto a tela estava aberta (agora: "${setorAtual || "sem setor"}"). Nada foi gravado — a lista foi atualizada; confira e salve de novo.` });
        setorMudou = `"${setorAtual || "—"}" → "${setorPedido || "—"}"`;
        setorTroca = { de: setorAtual, para: setorPedido };
      }
      // Admin de visualização: sem o campo no pedido (tela antiga) = fica como está;
      // mudar a marca é só do Edson ou do admin de OKR.
      const wasViewer = !!(cur[0] as any).okr_viewer;
      wantViewer = user.okrViewer === undefined || user.okrViewer === null ? wasViewer : !!user.okrViewer;
      // "Somente OKR" (029, 05/10/2026): a marca agora tranca a engenharia NO BANCO — sem o campo no pedido (tela
      // antiga, script) fica como está, como o visualizador; antes, faltar o campo a desligava calada.
      wasOnly = !!(cur[0] as any).okr_only;
      wantOnly = user.okrOnly === undefined || user.okrOnly === null ? wasOnly : !!user.okrOnly;
      // O grupo ADM Externo É o visualizador: quem fica nele fica com a marca.
      const wasExterno = (cur[0] as any).role === ADM_EXTERNO;
      const wantExterno = (user.role === undefined || user.role === null ? (cur[0] as any).role : user.role) === ADM_EXTERNO;
      if (wantExterno) wantViewer = true;
      // O representante: sempre "Somente OKR" (como o ADM Externo é sempre visualizador) e nunca visualizador nem admin de OKR.
      if (representanteFinal) {
        if (wantViewer || !!(cur[0] as any).okr_admin) return res.json({ success: false, message: REPRESENTANTE_SO_OKR_MSG });
        wantOnly = true;
      }
      // Mudar quem é "só visualização" (ou o grupo ADM Externo): só o Edson, ou um GESTOR admin
      // de OKR. Um CEO admin de OKR não — senão rebaixaria um GESTOR pela API (Edson, 30/09).
      if ((wantViewer !== wasViewer || wantExterno !== wasExterno) && (!isGestor || !(await isOkrMasterDb(admin, claims.sub)))) {
        return res.status(403).json({ success: false, error: "Só o Edson (ou um GESTOR admin de OKR) muda o admin de visualização do OKR (e o grupo ADM Externo)." });
      }
      // O Edson e o admin de OKR editam o OKR de todos: marcá-los "só visualização"
      // fecharia as gravações deles no banco (e o Edson não teria como desfazer).
      if ((wantViewer && !wasViewer || wantExterno && !wasExterno) && (user.id === EDSON_ID || (cur[0] as any).okr_admin)) {
        return res.json({ success: false, message: "O Edson e o admin de OKR não podem ser admin de visualização nem ADM Externo." });
      }
      if (oldName !== user.username) {
        // O login do Edson é fixo: o OKR e a governança dele são lidos pela chave 'edson'.
        if (user.id === EDSON_ID && oldName.toLowerCase() !== user.username.toLowerCase()) {
          return res.json({ success: false, message: "O login do Edson é fixo (o OKR e a governança dependem dele)." });
        }
        if (await okrKeyTaken(user.username.toLowerCase(), oldName.toLowerCase())) return res.json({ success: false, message: "Esse nome de usuário está ligado ao OKR de outra pessoa." });
        renameTo = user.username;
      }
    } catch (e: any) { return res.json({ success: false, message: e.message }); }
    // CEO/GESTOR e as contas que leem o OKR de todos (ver CARGOS_DE_TOPO): conferido
    // contra o CADASTRO, antes de qualquer gravação (o login novo só é gravado lá embaixo).
    if (!isGestor) {
      const { data: alvo, error: alvoErr } = await admin.from("users").select("role, email, username, okr_admin, okr_viewer").eq("id", user.id).limit(1);
      if (alvoErr || !alvo || !alvo.length) return res.json({ success: false, message: "Não consegui ler o usuário. Tente de novo." });
      const a = alvo[0] as any;
      const cargoNovo = user.role === undefined || user.role === null ? a.role : user.role; // sem o campo, o cargo fica
      // Dar ou tirar CEO, Diretor Industrial, GESTOR ou Representante (06/10/2026): só GESTOR (ou o Edson). O TI (032)
      // troca entre os cargos comuns, o Representante incluído (os outros já foram barrados acima).
      const trocaDoTI = comoTI && CARGOS_DO_TI.includes(String(cargoNovo)) && CARGOS_DO_TI.includes(String(a.role || ""));
      if (String(cargoNovo) !== String(a.role || "") && (cargoSoDoGestor(cargoNovo) || cargoSoDoGestor(a.role)) && !trocaDoTI) {
        return res.status(403).json({ success: false, error: CARGO_SO_DO_GESTOR_MSG });
      }
      // "Somente OKR" (029, 05/10/2026) tranca a engenharia no banco e tira o R$ de quem a tem: nas contas que leem
      // o OKR de todos (CEO, Diretor Industrial, GESTOR, admins do OKR, visualizador), pôr ou tirar a marca é de
      // GESTOR — a mesma régua de login/e-mail/senha delas (decisão do Edson, 25/09: "qualquer GESTOR").
      if (wantOnly !== wasOnly && contaQueLeTudo(a)) {
        return res.status(403).json({ success: false, error: "\"Somente OKR\" de CEO, Diretor Industrial, GESTOR e dos admins do OKR só um GESTOR muda." });
      }
      if (!isSelf && contaSoDoGestor(a)) {
        const mudaEmail = String(user.email || "").trim().toLowerCase() !== String(a.email || "").trim().toLowerCase();
        const mudaLogin = user.username !== String(a.username || "").trim();
        if (mudaEmail || mudaLogin || !!user.password) {
          return res.status(403).json({ success: false, error: "Login, e-mail e senha de CEO, Diretor Industrial, GESTOR, dos admins do OKR e dos representantes só um GESTOR altera." });
        }
      }
    }
    // E-mail, login e senha de quem ADMINISTRA USUÁRIOS (032): só o Edson (07/10, achado da crítica). Trocar o e-mail e
    // pedir o código em "Criar / redefinir senha" é entrar na conta — e ganhar a marca, que só o Edson dá: um COORDENADOR
    // (ou um GESTOR) passaria a excluir GESTOR e CEO e a definir setor. O contato (nome, telefone) segue com eles.
    if (!isSelf && !claimsAreEdson(claims) && marcaAlvo === true) {
      const { data: am, error: amErr } = await admin.from("users").select("email, username").eq("id", user.id).limit(1);
      if (amErr || !am || !am.length) return res.json({ success: false, message: "Não consegui ler o usuário. Tente de novo." });
      const a0 = am[0] as any;
      const mudaEmailM = String(user.email || "").trim().toLowerCase() !== String(a0.email || "").trim().toLowerCase();
      const mudaLoginM = user.username !== String(a0.username || "").trim();
      if (mudaEmailM || mudaLoginM || !!user.password) return res.status(403).json({ success: false, error: MARCA_ACESSO_SO_EDSON_MSG });
    }
    patch.role = user.role;
    // A PRÓPRIA senha só muda por /api/auth/change-password, que confere a atual.
    if (user.password && !isSelf) patch.password = user.password;
    patch.okr_viewer = wantViewer;
    patch.okr_enabled = wantViewer ? false : !!(user.okrEnabled || wantOnly); // "somente OKR" implica ter OKR
    patch.okr_only = wantViewer ? false : wantOnly;
    if ((wantViewer ? false : wantOnly) !== wasOnly) console.log(`[users/save] "Somente OKR" de ${user.id}: ${wasOnly} → ${!wasOnly} por ${canonUuid(claims.sub)}`);
    patch.sector = setorPedido || null;
  }
  // A MARCA (032) só fica em cargo comum, fora do visualizador, do Edson e do teste (o CHECK users_admin_usuarios_so_comuns
  // e o molde do teste): o Edson dando a marca, ou um admin subindo de cargo quem a tem, ouve a frase — antes de gravar.
  const marcaFinal = marcaNova !== null ? marcaNova : marcaAlvo === true;
  if (marcaFinal && (isAdmin || comoTI)) {
    const cargoFinal = String(patch.role ?? cargoDoCadastro);
    if (!CARGOS_COM_A_MARCA.includes(cargoFinal) || patch.okr_viewer === true || user.id === EDSON_ID) {
      return res.json({ success: false, message: MARCA_SO_COMUNS_MSG });
    }
  }
  if (marcaNova === true) {
    try { if (await ehUsuarioTeste(admin, user.id)) return res.json({ success: false, message: MARCA_SO_COMUNS_MSG }); }
    catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
  }
  if (marcaNova !== null) {
    patch.admin_usuarios = marcaNova;
    console.log(`[users/save] "administra usuários" de ${user.id}: ${!marcaNova} → ${marcaNova} pelo Edson`);
  }
  // Salario: leitura E escrita restritas ao Edson. Sem esta guarda, um admin
  // comum editando um usuario ZERARIA o salario real (o cliente dele tem 0).
  // O custo/hora por período (022) segue sozinho: o gatilho de users recalcula a série de hoje em
  // diante quando salário, cargo ou gente muda — pela tela ou pelo SQL Editor. Nada a chamar aqui.
  if (claimsAreEdson(claims) && user.salary !== undefined && user.salary !== null) {
    patch.salary = Number(user.salary) || 0;
  }
  // Troca de login + a chave do OKR dele numa transação só (kpi_rename_login): antes
  // eram duas chamadas, e se a segunda falhasse a pessoa perdia o próprio OKR.
  const trocarLogin = async (cadastroJaGravado: boolean): Promise<string | null> => {
    const { error: rnErr } = await admin.rpc("kpi_rename_login", { p_user: user.id, p_new: renameTo });
    if (!rnErr) return null;
    const m = String(rnErr.message || "");
    const msg = /OKR_CHAVE_OCUPADA/.test(m) ? "Esse nome de usuário está ligado ao OKR de outra pessoa."
      : (rnErr as any).code === "23505" ? "Nome de usuário já existe."
      : erroDoRepresentanteMsg(rnErr) || `Não consegui trocar o login: ${m}`;
    return cadastroJaGravado ? `${msg} Os outros dados foram salvos; só o login não mudou.` : msg;
  };
  // O cadastro (cargo, marcas, setor, contato). Devolve o setor como ficou GRAVADO (o gatilho do representante o troca).
  const gravarCadastro = async (loginJaGravado: boolean): Promise<{ erro: string | null; setor?: string }> => {
    const { data: gravou, error } = await admin.from("users").update(patch).eq("id", user.id).select("sector");
    if (error) {
      if ((error as any).code === "23505") return { erro: "E-mail ou nome de usuário já pertence a outra pessoa." };
      return { erro: `${erroDoRepresentanteMsg(error) || `Erro DB: ${error.message}`}${loginJaGravado ? " (o login novo já foi gravado)" : ""}` };
    }
    return { erro: null, setor: gravou && gravou.length ? String((gravou[0] as any).sector || "").trim() : undefined };
  };
  // CARGO DA 030 + LOGIN NOVO no mesmo salvar (06/10/2026): o cadastro PRIMEIRO, o login depois. Antes da 030 o banco
  // recusa DIRETOR_INDUSTRIAL e REPRESENTANTE (users_role_check), e o gatilho do representante recusa o homônimo — com
  // o login gravado antes, ficava "o login novo já foi gravado" e o resto não. Os outros cargos seguem na ordem de sempre.
  let gravado: { erro: string | null; setor?: string };
  if (renameTo && cargoDa030) {
    gravado = await gravarCadastro(false);
    if (gravado.erro) return res.json({ success: false, message: gravado.erro });
    const erroLogin = await trocarLogin(true);
    if (erroLogin) return res.json({ success: false, message: erroLogin });
  } else {
    if (renameTo) {
      const erroLogin = await trocarLogin(false);
      if (erroLogin) return res.json({ success: false, message: erroLogin });
    }
    gravado = await gravarCadastro(!!renameTo);
    if (gravado.erro) return res.json({ success: false, message: gravado.erro });
  }
  // Quem PASSA a ser representante sai do setor que tinha: o banco põe o dele (030). A troca vai na resposta como as
  // outras, para a tela registrá-la no log (06/10/2026) — antes ela acontecia calada.
  if (viraRepresentante && gravado.setor !== undefined && gravado.setor !== setorDoCadastro) {
    setorTroca = { de: setorDoCadastro, para: gravado.setor };
    setorMudou = `"${setorDoCadastro || "—"}" → "${gravado.setor || "—"}"`;
  }
  if (setorMudou) console.log(`[users/save] setor de ${user.id}: ${setorMudou} por ${canonUuid(claims.sub)}`);
  // O aviso ao Edson (07/10): o TI mudou nome, cargo, setor, "Somente OKR" ou "OKR habilitado" de OUTRA conta. O "depois" é
  // o que foi gravado (o setor, como o banco o deixou — o do representante ele troca); só o telefone não avisa.
  if (comoTI && contaAntesDoTI) {
    const a0 = contaAntesDoTI;
    const depois = contaDoAviso(user.id, {
      name: patch.name ?? a0.name, surname: patch.surname ?? a0.surname, username: a0.username, email: a0.email,
      role: patch.role ?? a0.role, sector: gravado.setor !== undefined ? gravado.setor : patch.sector !== undefined ? (patch.sector ?? "") : a0.sector,
      okr_only: patch.okr_only ?? a0.okr_only, okr_enabled: patch.okr_enabled ?? a0.okr_enabled,
    });
    if (avisoTIMudou(a0, depois)) await avisarEdsonDoTI(admin, claims.sub, { acao: "alterou", antes: a0, conta: depois }, inicioRota);
  }
  if (isSelf && user.password) {
    return res.json({ success: true, ...(setorTroca ? { setor: setorTroca } : {}), message: "Os dados foram salvos, mas a SUA senha não muda por aqui: troque em Meu Perfil, que confere a senha atual." });
  }
  return res.json({ success: true, ...(setorTroca ? { setor: setorTroca } : {}) });
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
  let papel: string | null = null;
  try { papel = await currentRole(admin, claims.sub); }
  catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
  const roleOk = ADMIN_ROLES.includes(String(papel));
  if (!(roleOk || claimsAreEdson(claims))) {
    return res.status(403).json({ success: false, error: "Sem permissao para alterar configuracoes." });
  }

  const incoming = (req.body && req.body.row) || {};
  const row: any = {};
  for (const k of Object.keys(incoming)) if (SETTINGS_WRITABLE.has(k)) row[k] = incoming[k];
  // CUSTO/HORA (022, 30/09/2026). R$ só para o Edson (pelo id) e os CEOs (cargo do cadastro) — decisão
  // do Edson, 30/09: de qualquer outro admin, o valor e o modo são ignorados (o resto grava).
  // 029 (05/10/2026): a mesma régua de quem VÊ o R$ (/api/labor/hourly-cost) — CEO marcado "Somente OKR" não grava.
  // 06/10/2026: o Diretor Industrial como o CEO (ehVisaoCeo) — senão recebia "salvo" e o valor nunca era gravado.
  let ceoQueVeReais = false;
  if (ehVisaoCeo(papel) && ("hourly_cost" in row || "use_automatic_cost" in row)) {
    try {
      const eu = await lerUsuario(admin, canonUuid(claims.sub) || "", "okr_only", "Nao consegui conferir o seu acesso. Tente de novo.");
      ceoQueVeReais = !!eu && !eu.okr_only;
    } catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
  }
  if (!(claimsAreEdson(claims) || ceoQueVeReais)) {
    delete row.hourly_cost;
    delete row.use_automatic_cost;
  }
  if (Object.keys(row).length === 0) return res.json({ success: true }); // nada a gravar

  const { data: existing, error: selErr } = await admin.from("settings").select("id, use_automatic_cost").limit(1);
  if (selErr) return res.json({ success: false, message: selErr.message });
  // O valor manual só é gravado junto do modo MANUAL. No automático a tela mandava a MÉDIA, e
  // settings.hourly_cost todo logado lê: era o vazamento da taxa. Decisão do Edson, 30/09 (tarde):
  // "não zerar; só parar de gravar a média nele" — o valor que já está lá fica como está.
  if ("hourly_cost" in row) {
    const modo = "use_automatic_cost" in row ? row.use_automatic_cost : (existing && existing[0] ? (existing[0] as any).use_automatic_cost : null);
    if (modo === true || modo === "true") delete row.hourly_cost;
  }
  if (Object.keys(row).length === 0) return res.json({ success: true }); // nada a gravar
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
  const { data: me, error: meErr } = await lerComDesligado((c) => admin.from("users").select(c).eq("id", String(claims.sub || "")).limit(1), "username, role, okr_viewer, okr_admin");
  if (meErr) return res.status(500).json({ success: false, error: "Nao consegui conferir o usuario." });
  // Desligado (022): o crachá ainda vale até 24 h, o link do OKR não sai.
  if (desligadoPeloCadastro(me && me[0], canonUuid(claims.sub))) return res.status(403).json({ success: false, error: "Este acesso foi encerrado." });
  if (ehVisualizador(me && me[0], canonUuid(claims.sub) || "")) return res.status(403).json({ success: false, error: "Usuario de visualizacao nao gera link." });
  const self = String((me && me[0] && (me[0] as any).username) || "").trim().toLowerCase();
  const requested = String((req.body && (req.body as any).ownerKey) || "").trim().toLowerCase();
  const ownerKey = requested || self;
  if (!ownerKey) return res.status(400).json({ success: false, error: "Usuario invalido." });
  // Cada um compartilha o SEU OKR; o Edson pode compartilhar o de qualquer um.
  if (ownerKey !== self && !claimsAreEdson(claims)) {
    return res.status(403).json({ success: false, error: "Sem permissao para compartilhar este OKR." });
  }
  // O usuário teste (031): o OKR dele só o Edson e ele veem, e este link é PÚBLICO e permanente (não há como revogar o
  // de OKR pessoal) — o teste não gera link, e nem o Edson gera o link do OKR do teste.
  try {
    const testes = await chavesDeUsuarioTeste(admin);
    if (testes.has(self)) return res.status(403).json({ success: false, error: "O usuário de teste não gera link público." });
    if (testes.has(ownerKey)) return res.status(403).json({ success: false, error: "O OKR do usuário de teste não tem link público." });
  } catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }

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

// POST /api/okr/panel/share { rotate?: boolean } — link público (só leitura) do PAINEL
// de Indicadores. Só o Edson ou o admin de OKR. Sem `rotate`, reusa o link que existe;
// com `rotate`, gera outro e o anterior para de funcionar.
app.post("/api/okr/panel/share", async (req, res) => {
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  try { if (!(await isOkrMasterDb(admin, claims.sub))) return res.status(403).json({ success: false, error: "So o Edson ou o admin de OKR compartilha o painel." }); }
  catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }
  const rotate = !!(req.body && (req.body as any).rotate);
  // Gerar um link NOVO derruba o que o Edson já distribuiu (25/09 foi assim): só ele troca.
  // O admin de OKR continua pegando e copiando o link atual. Decisão do Edson, 30/09.
  if (rotate && !claimsAreEdson(claims)) {
    return res.status(403).json({ success: false, error: "Só o Edson gera um link novo do painel. O link atual continua valendo." });
  }
  if (!rotate) {
    const { data: row, error } = await admin.from("okr_panel_share").select("token").eq("id", 1).limit(1);
    if (error) return res.status(500).json({ success: false, error: "Erro ao ler o link." });
    if (row && row[0] && (row[0] as any).token) return res.json({ success: true, token: (row[0] as any).token });
  }
  const token = randomBytes(24).toString("hex");
  const { error: upErr } = await admin.from("okr_panel_share")
    .upsert({ id: 1, token, created_by: canonUuid(claims.sub), created_at: new Date().toISOString() }, { onConflict: "id" });
  if (upErr) return res.status(500).json({ success: false, error: "Erro ao gerar o link." });
  return res.json({ success: true, token, rotated: rotate });
});

// ---- KPI DOS SETORES nos links públicos (30/09/2026, migração 023) ----------------------
// O KR ligado guarda só o ponteiro (kpiId = uuid do indicador); o valor é lido na hora por
// kpis_valores_ligados. Aqui o servidor (service_role) lê para o link público, que não tem
// sessão. O banco confere que o kpiId está mesmo naquele OKR e que o DONO do OKR enxerga o
// indicador (o servidor só pula a trava "quem pede lê aquele OKR" — quem abre o link já leu).
// A resposta leva só número e período: nada de nome nem uuid do indicador no painel.
// Falhou (023 não rodada, banco fora)? kpi = [] e o link mostra o número gravado no KR.
const KPI_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type KpiPedido = { dono: string; id: string; de: string; ate: string };
type KpiValor = { valor: number | null; periodo: string | null; frequencia: string | null; consolidacao: string | null };
// null = não deu para ler (023 ausente, banco fora): a resposta leva kpi: null e a tela mostra o
// número gravado com "sem o valor do KPI agora" — nunca "o dono não enxerga mais — religue".
const lerKpisLigados = async (admin: any, pedidos: KpiPedido[]): Promise<Map<string, KpiValor> | null> => {
  const out = new Map<string, KpiValor>();
  const chave = (d: string, i: string, de: string, ate: string) => `${d}|${i}|${de}|${ate}`;
  const unicos = Array.from(new Map(pedidos.map(p => [chave(p.dono, p.id, p.de, p.ate), p] as const)).values());
  for (let i = 0; i < unicos.length; i += 400) {
    const { data, error } = await admin.rpc("kpis_valores_ligados", { p_pedidos: unicos.slice(i, i + 400) });
    if (error) { console.warn("[okr/public] KPI dos setores não lido:", error.code || "", String(error.message || "").slice(0, 120)); return null; }
    (Array.isArray(data) ? data : []).forEach((r: any) => out.set(chave(String(r.dono || ""), String(r.indicador_id || ""), String(r.de ?? ""), String(r.ate ?? "")),
      { valor: r.valor === null || r.valor === undefined ? null : Number(r.valor), periodo: r.periodo ? String(r.periodo).slice(0, 10) : null,
        frequencia: typeof r.frequencia === "string" ? r.frequencia : null,
        consolidacao: r.consolidacao === "soma" || r.consolidacao === "ultimo" ? r.consolidacao : null }));
  }
  return out;
};

// GET /api/okr/panel/public?token=... — leitura PÚBLICA (sem login) do painel de
// Indicadores. Leva SÓ o que o painel mostra: nome, setor e, do período ativo de cada
// OKR, os números dos KRs (atual/base/meta/status) — sem títulos, notas nem tarefas.
app.get("/api/okr/panel/public", async (req, res) => {
  const token = String((req.query && (req.query as any).token) || "").trim();
  if (!token) return res.status(400).json({ success: false, error: "token ausente." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  const { data: sh, error: shErr } = await admin.from("okr_panel_share").select("token").eq("id", 1).limit(1);
  if (shErr) return res.status(500).json({ success: false, error: "Erro ao ler." });
  if (!sh || !sh[0] || (sh[0] as any).token !== token) return res.status(404).json({ success: false, error: "Link invalido." });
  // O usuário teste (031) não entra no painel: o OKR dele só o Edson e ele veem, e a service_role daqui passa por cima
  // da RLS. Antes da 031 a coluna não existe e não há teste (lerComUsuarioTeste relê sem ela); outro erro = 500.
  const [{ data: okrs, error: e1 }, { data: us, error: e2 }] = await Promise.all([
    admin.from("okr_state").select("owner_key, data"),
    lerComUsuarioTeste((c) => admin.from("users").select(c), "username, name, sector"),
  ]);
  if (e1 || e2) return res.status(500).json({ success: false, error: "Erro ao ler." });
  const people: Record<string, { name: string; sector: string }> = {};
  const chavesTeste = new Set<string>();
  (us || []).forEach((u: any) => {
    const k = String(u.username || "").trim().toLowerCase();
    if (u.usuario_teste) { chavesTeste.add(k); return; }
    people[k] = { name: String(u.name || ""), sector: String(u.sector || "") };
  });
  // Esqueleto: a MESMA árvore que a tela lê (ids e os números do KR, sem texto), com o
  // valor cru — quem normaliza é o migrateToStore do navegador, igual à tela interna,
  // para o link público e a tela darem o mesmo número. Só o período ativo viaja.
  const isObj = (x: any) => !!x && typeof x === "object" && !Array.isArray(x);
  const raw = (v: any) => (v === null || ["number", "string", "boolean"].includes(typeof v)) ? v : undefined;
  // Mesma regra do str() de src/okr/okr.ts (texto fica, nulo vira '', objeto vira JSON).
  const ids = (v: any): string => typeof v === "string" ? v : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  // KR ligado ao KPI dos setores: o esqueleto leva a chave OPACA "k<n>" (nunca o uuid) e o
  // início/prazo crus; o valor vai à parte, em `kpi`, com a mesma chave.
  const kpiPedidos: KpiPedido[] = [];
  const kpiOpacos: { dono: string; k: string; de: string; ate: string; real: string }[] = [];
  const skelObjs = (os: any, dono: string, donoOpaco: string) => (Array.isArray(os) ? os : []).filter(isObj).map((o: any) => ({
    id: ids(o.id),
    keyResults: (Array.isArray(o.keyResults) ? o.keyResults : []).filter(isObj).map((k: any) => {
      const base: any = {
        id: ids(k.id), baseline: raw(k.baseline), target: raw(k.target), current: raw(k.current),
        status: typeof k.status === "string" ? k.status : undefined, archived: !!k.archived,
      };
      const kid = typeof k.kpiId === "string" ? k.kpiId.trim().toLowerCase() : "";
      if (dono && KPI_UUID_RE.test(kid)) {
        const de = k.start == null ? "" : ids(k.start), ate = ids(k.due);
        const opaco = `k${kpiOpacos.length + 1}`;
        kpiPedidos.push({ dono, id: kid, de, ate });
        kpiOpacos.push({ dono: donoOpaco, k: opaco, de, ate, real: `${dono}|${kid}|${de}|${ate}` });
        Object.assign(base, { kpiId: opaco, start: de, due: ate });
      }
      return base;
    }),
  }));
  const rows = (okrs || [])
    .filter((r: any) => typeof r.owner_key === "string" && r.owner_key.trim() && !r.owner_key.startsWith("excluido:")
      && !chavesTeste.has(r.owner_key.trim().toLowerCase()))
    .map((r: any, i: number) => {
      const d = isObj(r.data) ? r.data : {};
      const owner = ids(d.owner);
      const periods = (Array.isArray(d.periods) ? d.periods : []).filter(isObj);
      const dono = String(r.owner_key).trim().toLowerCase(), donoOpaco = `p${i + 1}`;
      let data: any = { owner };
      if (periods.length) {
        const act = periods.find((q: any) => ids(q.id) === ids(d.activePeriodId)) || periods[0];
        data = { owner, activePeriodId: ids(act.id), periods: [{ id: ids(act.id), label: "", range: "", checkins: [], objectives: skelObjs(act.objectives, dono, donoOpaco) }] };
      } else if (Array.isArray(d.objectives)) {
        data = { owner, objectives: skelObjs(d.objectives, dono, donoOpaco) };
      }
      const pp = people[r.owner_key] || { name: "", sector: "" };
      // A chave do OKR é o LOGIN da pessoa: o link leva só um número de linha.
      return { ownerKey: donoOpaco, name: pp.name, sector: pp.sector, data };
    });
  let kpi: any[] | null = [];
  if (kpiPedidos.length) {
    const vals = await lerKpisLigados(admin, kpiPedidos);
    kpi = vals ? kpiOpacos.filter(o => vals.has(o.real)).map(o => ({ dono: o.dono, k: o.k, de: o.de, ate: o.ate, ...vals.get(o.real)! })) : null;
  }
  return res.json({ success: true, rows, kpi });
});

// GET /api/okr/public?token=... — leitura PUBLICA (sem login) do OKR. So leitura.
app.get("/api/okr/public", async (req, res) => {
  const token = String((req.query && (req.query as any).token) || "").trim();
  if (!token) return res.status(400).json({ success: false, error: "token ausente." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  const { data, error } = await admin.from("okr_state").select("owner_key, data").eq("share_token", token).limit(1);
  if (error) return res.status(500).json({ success: false, error: "Erro ao ler." });
  if (!data || data.length === 0) return res.status(404).json({ success: false, error: "Link invalido." });
  const row = data[0] as any;
  // KPI dos setores: o valor dos KRs ligados deste OKR (dono '' na resposta — quem abre o link
  // não precisa do login do dono). Mesma regra do painel.
  const txt = (v: any): string => typeof v === "string" ? v : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  const dono = String(row.owner_key || "").trim().toLowerCase();
  const pedidos: KpiPedido[] = [];
  const isObjP = (x: any) => !!x && typeof x === "object" && !Array.isArray(x);
  const periodos = isObjP(row.data) && Array.isArray(row.data.periods) ? row.data.periods : [];
  periodos.filter(isObjP).forEach((p: any) => (Array.isArray(p.objectives) ? p.objectives : []).filter(isObjP).forEach((o: any) =>
    (Array.isArray(o.keyResults) ? o.keyResults : []).filter(isObjP).forEach((k: any) => {
      const kid = typeof k.kpiId === "string" ? k.kpiId.trim().toLowerCase() : "";
      if (dono && KPI_UUID_RE.test(kid)) pedidos.push({ dono, id: kid, de: k.start == null ? "" : txt(k.start), ate: txt(k.due) });
    })));
  let kpi: any[] | null = [];
  if (pedidos.length) {
    const vals = await lerKpisLigados(admin, pedidos);
    kpi = vals ? pedidos.filter(p => vals.has(`${p.dono}|${p.id}|${p.de}|${p.ate}`))
      .map(p => ({ dono: "", k: p.id, de: p.de, ate: p.ate, ...vals.get(`${p.dono}|${p.id}|${p.de}|${p.ate}`)! })) : null;
  }
  return res.json({ success: true, data: row.data, kpi });
});

// ========================= OKR PARECIDOS =========================
// INICIATIVAS PARECIDAS (07/10/2026). Pedido do Edson: "o Edson tá criando um OKR e esse OKR tem a palavra aplicativo
// de inovação … e o Nascimento está fazendo alguma coisa que tem aplicativo de inovação … gostaria que tivesse uma
// inteligência que avisasse que tem um projeto paralelo com um nome similar rodando pelo usuário A, B ou C."
// Decisões dele (07/10):
//  · pessoa comum recebe SÓ O NOME de quem toca algo parecido ("converse com ele") — nunca o texto, o item nem o motivo
//    da IA sobre o OKR alheio; o Edson, os admins de OKR e a visão do CEO (CARGOS_VISAO_CEO) recebem o texto. O nível é
//    lido do CADASTRO na hora (nunca do crachá); não conseguir ler = 503, nunca "completo" por engano;
//  · compara SÓ o OKR: objetivos, KRs (do período ativo, não arquivados) e o portfólio — nada do Nexus Flow, Inovações
//    ou KPI dos setores. Fora: o OKR do dono que está sendo editado (o item e os irmãos dele), os 'excluido:…', os
//    desligados e — salvo para o Edson — o usuário teste (031: a service_role passa por cima da RLS, o filtro é aqui);
//  · "texto + IA confirma": candidatos pelo texto (grátis) e o Gemini (os mesmos modelos de /api/gemini/generate) diz
//    se é o MESMO assunto, em UMA chamada de ~8 s. Falhou/demorou = só texto, com corte mais alto, e a resposta diz
//    (ia: 'indisponivel');
//  · aviso amarelo, não impede salvar (é a tela); nada novo no banco — cache em memória de 10 min.
// A lógica pura mora em ./_parecidos.ts, carregada na hora como a da agenda: se faltar no pacote, cai só isto.
type ParecidosMod = typeof import("./_parecidos.js");
let parecidosModP: Promise<ParecidosMod> | null = null;
const parecidosMod = (): Promise<ParecidosMod> => {
  if (!parecidosModP) parecidosModP = import("./_parecidos.js").catch((e) => { parecidosModP = null; throw e; });
  return parecidosModP;
};
// `chave` (só no nível nomes) = o login do cadastro, minúsculo — o único OKR que essa pessoa edita (a RLS só deixa o
// dono e o master gravarem), logo o único ownerKey que ela pode mandar (achado A2, 07/10).
type NivelParecidos = { id: string; nivel: "completo" | "nomes"; edson: boolean; chave?: string };
// null = sem acesso (403): sem cadastro, desligado, visualizador (okr_viewer / ADM_EXTERNO, "o master vence") ou sem OKR
// (nem okr_enabled, nem "Somente OKR"). O representante é sempre "Somente OKR" e nunca admin de OKR (06/10): nível nomes,
// mesmo se uma marca aparecer. Falha ao ler o cadastro LANÇA (a rota responde 503).
async function nivelParecidos(admin: any, sub: any): Promise<NivelParecidos | null> {
  const id = canonUuid(sub); if (!id) return null;
  if (id === EDSON_ID) return { id, nivel: "completo", edson: true };
  const r = await lerUsuario(admin, id, "username, role, okr_viewer, okr_admin, okr_only, okr_enabled", "Nao consegui conferir o seu acesso. Tente de novo.");
  if (!r || desligadoPeloCadastro(r, id) || ehVisualizador(r, id)) return null;
  const chave = String(r.username || "").trim().toLowerCase();
  if (ehRepresentante(r.role)) return { id, nivel: "nomes", edson: false, chave };
  if (r.okr_admin || ehVisaoCeo(r.role)) return { id, nivel: "completo", edson: false };
  if (r.okr_enabled || r.okr_only) return { id, nivel: "nomes", edson: false, chave };
  return null;
}
// Os itens de todos os OKRs que podem aparecer. Só as colunas necessárias: okr_state sem share_token; users sem salário
// nem senha. A marca do teste por lerComUsuarioTeste (antes da 031 = ninguém é teste; outro erro = erro → 503), e o
// desligado_em NA MESMA leitura, sem a releitura do lerComDesligado: lá, qualquer erro relia sem a coluna e punha null
// em todos — uma falha passageira fazia o OKR dos DESLIGADOS entrar (e ficar 10 min no cache). Aqui erro = 503 (A4, 07/10;
// a 022 já está no banco).
async function itensParecidos(admin: any, mod: ParecidosMod, incluiTeste: boolean) {
  const [{ data: okrs, error: e1 }, { data: us, error: e2 }] = await Promise.all([
    admin.from("okr_state").select("owner_key, data"),
    lerComUsuarioTeste((c) => admin.from("users").select(c), "username, name, surname, desligado_em"),
  ]);
  if (e1 || e2) throw new Error("Nao consegui ler os OKRs agora. Tente de novo.");
  return mod.itensDeTodos(okrs as any[], mod.pessoasDoCadastro(us), incluiTeste);
}
// O Gemini do jeito de /api/gemini/generate (o mesmo cliente, a mesma chave, os mesmos modelos de reserva), com prazo:
// cada modelo recebe o tempo que SOBRA, e cota estourada para na hora. As instruções vão em systemInstruction e os
// textos dos OKRs em JSON, como dados. Devolve o texto cru — quem confere é o módulo (lerRespostaIa).
const geminiParecidos = async (pedido: { sistema: string; dados: string }, prazoMs: number): Promise<string> => {
  const chave = String(process.env.GEMINI_API_KEY || "").trim();
  if (!chave) throw new Error("GEMINI_API_KEY ausente");
  const ai = new GoogleGenAI({ apiKey: chave, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
  const fim = Date.now() + prazoMs;
  let ultimo: any = null;
  for (const modelo of [GEMINI_MODELO_PADRAO, ...GEMINI_MODELOS_RESERVA]) {
    const resta = fim - Date.now();
    if (resta < 300) break;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), resta);
    try {
      const r = await ai.models.generateContent({
        model: modelo,
        contents: [{ role: "user", parts: [{ text: pedido.dados }] }],
        config: { systemInstruction: pedido.sistema, responseMimeType: "application/json", abortSignal: ctrl.signal },
      });
      if (r && r.text) return r.text;
    } catch (e: any) {
      ultimo = e;
      const m = String((e && e.message) || e).toLowerCase();
      if (m.includes("quota") || m.includes("429") || m.includes("exhausted")) break;
    } finally { clearTimeout(t); }
  }
  throw ultimo || new Error("sem resposta");
};
// Chama a IA (a falsa da bancada, quando trocada) dentro do prazo e confere a resposta. null = IA indisponível (erro,
// demora ou resposta fora do formato). No log só o tipo do erro — nunca os textos dos OKRs. `prazoMax`: o tempo que
// SOBRA até a hora fixa da resposta do nível nomes (a IA nunca a ultrapassa; sem tempo = sem IA).
async function confirmarComIa(mod: ParecidosMod, pedido: { sistema: string; dados: string }, n: number, onde: string, prazoMax?: number): Promise<Map<number, string> | null> {
  const ia = mod.iaDeTeste() || geminiParecidos;
  const prazo = Math.min(mod.prazoDaIa(), prazoMax ?? Infinity);
  if (!(prazo > 0)) { console.warn(`[parecidos] ${onde}: sem tempo para a IA; ficou só o texto`); return null; }
  try {
    const lida = mod.lerRespostaIa(await mod.comPrazo(ia(pedido, prazo), prazo + 250), n);
    if (!lida) console.warn(`[parecidos] ${onde}: resposta da IA fora do formato; ficou só o texto`);
    return lida;
  } catch (e: any) {
    console.warn(`[parecidos] ${onde}: IA indisponivel (${String((e && (e.status || e.code || e.message)) || "erro").slice(0, 60)}); ficou só o texto`);
    return null;
  }
}

// POST /api/okr/parecidos { ownerKey, texto, tipo: 'objetivo'|'kr'|'portfolio', ref? } — o texto que acabou de ser
// gravado no OKR de `ownerKey` tem algo parecido no OKR de outra pessoa? `ref` (o item editado) é aceito, só o formato
// é conferido (não é usado: a comparação já tira o OKR inteiro do dono). Texto curto ou padrão ("Novo resultado-chave"…) = itens [] sem custo.
// NÍVEL NOMES (achados A1/A2/A6, 07/10): o ownerKey tem de ser o PRÓPRIO login (senão 403) — tirar o OKR de outra pessoa
// da comparação dizia de quem era a palavra, e dava o cache dela; e a resposta sai SEMPRE na mesma hora (t0 + prazo da
// IA + 1 s), com ou sem candidato, do cache ou não — pelo tempo dava para saber se uma palavra estava no OKR de alguém,
// mesmo com a IA dizendo "não é o mesmo assunto". 4xx, 503 e texto curto saem na hora (não dependem do OKR alheio).
app.post("/api/okr/parecidos", async (req, res) => {
  const t0 = Date.now();
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  let quem: NivelParecidos | null;
  try { quem = await nivelParecidos(admin, claims.sub); }
  catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
  if (!quem) return res.status(403).json({ success: false, error: "Sem permissao." });
  // Conta ANTES de trabalhar (cache e texto curto também contam): 30 por 10 min por pessoa.
  if ((await rlHit(`parecidos:user:${quem.id}`, 600)) > 30) return tooMany(res, 600);
  let mod: ParecidosMod;
  try { mod = await parecidosMod(); }
  catch (e: any) {
    console.error("[parecidos] modulo _parecidos nao carregou:", e?.message || e);
    return res.status(503).json({ success: false, error: "A comparação não está disponível agora." });
  }
  const b: any = req.body || {};
  const ownerKey = typeof b.ownerKey === "string" ? b.ownerKey.trim().toLowerCase() : "";
  if (!ownerKey || ownerKey.length > 120) return res.status(400).json({ success: false, error: "Dono do OKR invalido." });
  if (quem.nivel === "nomes" && (!quem.chave || ownerKey !== quem.chave)) return res.status(403).json({ success: false, error: "Sem permissao." });
  if (!mod.ehTipo(b.tipo)) return res.status(400).json({ success: false, error: "Tipo invalido." });
  if (typeof b.texto !== "string") return res.status(400).json({ success: false, error: "Texto invalido." });
  if (b.ref != null && (typeof b.ref !== "string" || b.ref.length > 200)) return res.status(400).json({ success: false, error: "Item invalido." });
  const texto = b.texto.slice(0, mod.TEXTO_MAX);
  if (!mod.textoValido(texto)) return res.json(mod.respostaPorNivel(quem.nivel, { ia: "ok", itens: [] }));
  // A hora fixa do nível nomes (0 = sem hora fixa: o nível completo já vê o texto). A IA só tem o que sobra até ela.
  const fixo = quem.nivel === "nomes" ? t0 + mod.prazoDaIa() + 1000 : 0;
  const responder = async (corpo: unknown) => {
    const resta = fixo - Date.now();
    if (resta > 0) await new Promise((ok) => setTimeout(ok, resta));
    return res.json(corpo);
  };
  // O cache guarda o resultado COMPLETO; o nível é aplicado na saída, para cada um. O Edson (que vê o teste) tem a sua chave.
  const chave = mod.chavePedido(quem.edson, ownerKey, texto);
  let r = mod.cachePedidos.get(chave);
  if (!r) {
    let itens: Awaited<ReturnType<typeof itensParecidos>>;
    try { itens = await itensParecidos(admin, mod, quem.edson); }
    catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
    const cands = mod.candidatos(texto, ownerKey, itens);
    const prazoMax = fixo ? fixo - Date.now() - 500 : undefined;
    const confirmados = cands.length ? await confirmarComIa(mod, mod.pedidoConfirmar(texto, cands), cands.length, "pedido", prazoMax) : new Map<number, string>();
    r = mod.resultadoConfirmar(cands, confirmados);
    mod.cachePedidos.set(chave, r, r.ia === "ok" ? mod.CACHE_MS : mod.CACHE_SEM_IA_MS);
  }
  return responder(mod.respostaPorNivel(quem.nivel, r));
});

// GET /api/okr/parecidos/painel — os pares parecidos entre OKRs de pessoas DIFERENTES, com o texto. Só o nível completo
// (Edson, admins de OKR, visão do CEO); o resto, 403. Uma chamada à IA para os até 40 pares; cache de 10 min.
app.get("/api/okr/parecidos/painel", async (req, res) => {
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  let quem: NivelParecidos | null;
  try { quem = await nivelParecidos(admin, claims.sub); }
  catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
  if (!quem || quem.nivel !== "completo") return res.status(403).json({ success: false, error: "Só o Edson, os admins de OKR e a diretoria (CEO / Diretor Industrial) veem as iniciativas parecidas." });
  if ((await rlHit(`parecidos:painel:${quem.id}`, 600)) > 10) return tooMany(res, 600);
  let mod: ParecidosMod;
  try { mod = await parecidosMod(); }
  catch (e: any) {
    console.error("[parecidos] modulo _parecidos nao carregou:", e?.message || e);
    return res.status(503).json({ success: false, error: "A comparação não está disponível agora." });
  }
  const chave = quem.edson ? "com-teste" : "sem-teste";
  let r = mod.cachePainel.get(chave);
  if (!r) {
    let itens: Awaited<ReturnType<typeof itensParecidos>>;
    try { itens = await itensParecidos(admin, mod, quem.edson); }
    catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
    const pares = mod.paresCandidatos(itens);
    const confirmados = pares.length ? await confirmarComIa(mod, mod.pedidoPainel(pares), pares.length, "painel") : new Map<number, string>();
    r = { ...mod.resultadoPainel(pares, confirmados), geradoEm: new Date().toISOString() };
    mod.cachePainel.set(chave, r, r.ia === "ok" ? mod.CACHE_MS : mod.CACHE_SEM_IA_MS);
  }
  return res.json({ success: true, ia: r.ia, geradoEm: r.geradoEm, pares: r.pares });
});

// ========================= AGENDA =========================
// Agenda dos usuários do OKR (29/09/2026, migração 012) — tabela própria, separada do OKR.
// O BANCO monta a fila de e-mails (agenda_alerta, por gatilho); aqui só se ENVIA:
//  - /api/agenda/disparar: o pg_cron do Supabase chama a cada 5 min (migração 013) com um
//    segredo. Pega o que venceu (agenda_pegar_devidos), manda pelo SMTP da empresa e marca
//    (agenda_marcar_envio). Falha de envio volta para a fila sozinha (até 5 tentativas);
//    com o SMTP INTEIRO fora a rodada para e o resto volta ADIADO, sem gastar tentativa.
//    No sucesso, o marcar leva quem o SMTP ACEITOU (p_recebeu, os ids): é por esse registro
//    que o banco decide quem ganha depois o 'cancelado' e o 'removido' (29/09, 2º cético).
//  - /api/agenda/testar: quem está logado pede um alerta de TESTE de um compromisso que
//    enxerga — vai SÓ para o e-mail cadastrado de quem pediu.
// Destinatário é sempre o e-mail do CADASTRO (users.email), nunca um endereço digitado
// (decisão do Edson, 29/09 — a mesma trava do /api/send-email). E SÓ da empresa (domínios +
// Configurações) ou o do Edson — decisão do Edson, 29/09 à tarde (agendaRecebe, logo abaixo).
//
// As funções de e-mail/.ics (./_agenda.ts) são carregadas aqui, na hora, e não no topo do
// arquivo: se o módulo faltar no pacote da Vercel, cai SÓ a agenda — login e o resto da
// API continuam de pé. O ".js" é de propósito (a função roda como ESM na Vercel; tsc e tsx
// resolvem o ".js" para o ".ts").
type AgendaMod = typeof import("./_agenda.js");
let agendaModP: Promise<AgendaMod> | null = null;
const agendaMod = (): Promise<AgendaMod> => {
  if (!agendaModP) agendaModP = import("./_agenda.js").catch((e) => { agendaModP = null; throw e; });
  return agendaModP;
};

const AGENDA_APP_URL = "https://kpieng.jimpnexus.com";
const AGENDA_LOTE = 10;              // alertas por chamada de agenda_pegar_devidos
const AGENDA_ORCAMENTO_MS = 7500;    // depois disto não começa envio nem lote novo (Vercel)
const AGENDA_LIMITE_MS = 9000;       // teto de uma rodada inteira, contando o último envio

// O link do botão do e-mail vem da configuração do servidor — NUNCA do cabeçalho Host do
// pedido (um Host forjado poria um link de phishing no e-mail oficial).
const agendaAppUrl = (): string => {
  const u = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s"'<>\\]+$/i.test(u) ? u : AGENDA_APP_URL;
};

// Segredo do disparador: AGENDA_CRON_SECRET (ou CRON_SECRET). Curto demais = desligado.
const agendaSegredo = (): string | null => {
  const s = String(process.env.AGENDA_CRON_SECRET || process.env.CRON_SECRET || "").trim();
  return s.length >= 16 ? s : null;
};
// Tempo constante: compara os SHA-256 (sempre 32 bytes), sem vazar tamanho nem prefixo.
const agendaSegredoConfere = (recebido: string, esperado: string): boolean =>
  timingSafeEqual(createHash("sha256").update(recebido, "utf8").digest(), createHash("sha256").update(esperado, "utf8").digest());

// SMTP: a mesma conta e a mesma configuração do sendPlainMail / /api/send-email.
const agendaSmtp = () => {
  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!host || !user || !pass) return null;
  const p = parseInt(process.env.EMAIL_PORT || "465", 10);
  const port = Number.isFinite(p) && p > 0 ? p : 465;
  return { host, port, user, pass, from: process.env.EMAIL_FROM || user };
};
type AgendaSmtp = NonNullable<ReturnType<typeof agendaSmtp>>;
const agendaSmtpBase = (c: AgendaSmtp) => ({
  host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass },
  connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
  tls: { rejectUnauthorized: false }, // alinha com /api/send-email (cert do mail server)
});
const agendaMensagem = (c: AgendaSmtp, email: AgendaEmail, para: AgendaPessoa[]) => {
  const enderecos = para.map((p) => ({ name: String(p.nome || "").replace(/["<>,;\\\r\n]/g, "").trim(), address: String(p.email) }));
  // Aviso "removido" para mais de uma pessoa (tiradas da lista na mesma gravação): uma não
  // fica sabendo quem mais saiu. O To: é o próprio sistema e os endereços vão só no envelope
  // (como Cco — o cabeçalho não os lista). Decisão do Edson, 29/09 (P1/S2).
  const oculto = email.ocultarDestinatarios && enderecos.length > 1;
  return {
    from: { name: "JIMPNexus KPI · Agenda", address: c.from },
    to: oculto ? [{ name: "JIMPNexus KPI · Agenda", address: c.from }] : enderecos,
    ...(oculto ? { envelope: { from: c.from, to: enderecos.map((e) => e.address) } } : {}),
    subject: email.subject,
    text: email.text,
    html: email.html,
    attachments: [{ filename: email.icsFilename, content: email.ics, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
    // E-mail automático: sem "fora do escritório" de volta para a conta do sistema.
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
  };
};
// Promessa com prazo: o SMTP pendurado não pode segurar a função até a Vercel matar.
const agendaComPrazo = <T>(p: Promise<T>, ms: number): Promise<T> => new Promise<T>((ok, falha) => {
  const t = setTimeout(() => falha(Object.assign(new Error("o servidor de e-mail demorou demais"), { code: "TIMEOUT" })), ms);
  p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); falha(e); });
});

// ---- E-mail da agenda SÓ para a empresa — decisão do Edson, 29/09 (tarde) ----
// Recebe quem tem e-mail de domínio da empresa (ALLOWED_EMAIL_DOMAINS: jimp.com.br,
// joinvilleimplementos.com.br, furgoesjoinville.com.br) ou um endereço configurado em
// Configurações (settings: email_to, interruption_email_to, email_from) — a MESMA regra do
// /api/send-email (recipientAllowed + configuredRecipients) — e o EDSON, qualquer que seja o
// e-mail dele (pelo id, nunca pelo endereço). Endereço de fora não recebe (a tela avisa).
// Por quê: o "Meu Perfil" troca o e-mail sem senha, e a conta oficial não pode virar canal
// de texto livre para fora (a mesma trava do /api/send-email, 25/09).
// Domínio EXATO, o padrão da casa: "x@mail.jimp.com.br" NÃO passa (subdomínio não é caixa
// que o Edson listou; se um dia precisar, o endereço entra em Configurações). Maiúsculas e
// espaços em volta não contam (recipientAllowed normaliza).
// Configurações que não dá para ler (erro, ou mais de 2 s) = vale SÓ o domínio: nunca abre.
const AGENDA_SO_EMPRESA = "Seu e-mail cadastrado é de fora da empresa — a agenda só manda alerta para e-mails @jimp.com.br, @joinvilleimplementos.com.br ou @furgoesjoinville.com.br.";
const AGENDA_SETTINGS_PRAZO_MS = 2000;
const agendaConfiaveis = (admin: any): Promise<Set<string>> =>
  agendaComPrazo(configuredRecipients(admin), AGENDA_SETTINGS_PRAZO_MS).catch((e) => {
    console.warn("[Agenda] Configurações não lidas a tempo; vale só o domínio da empresa:", e?.code || e?.message || e);
    return new Set<string>();
  });
// Passa sem precisar das Configurações: o Edson (pelo id) ou um domínio da empresa.
const agendaPassaDireto = (p: AgendaPessoa): boolean =>
  canonUuid(p.id) === EDSON_ID || recipientAllowed(String(p.email || ""), new Set<string>());
// Recebe? `confiaveis` = os endereços de Configurações (null = ninguém precisou deles).
const agendaRecebe = (p: AgendaPessoa, confiaveis: Set<string> | null): boolean =>
  agendaPassaDireto(p) || (!!confiaveis && recipientAllowed(String(p.email || ""), confiaveis));

// GET/POST /api/agenda/disparar — só o pg_cron (Authorization: Bearer <segredo>).
app.all("/api/agenda/disparar", async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).set("Allow", "GET, POST").json({ success: false, error: "Metodo nao permitido." });
  }
  const segredo = agendaSegredo();
  if (!segredo) return res.status(503).json({ success: false, error: "Disparador da agenda nao configurado." });
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!m || !agendaSegredoConfere(m[1].trim(), segredo)) {
    console.warn("[Agenda] disparo recusado (segredo ausente ou diferente). ip:", clientIp(req));
    return res.status(401).json({ success: false, error: "Nao autorizado." });
  }
  // Sem SMTP não se tira NADA da fila (senão os alertas gastariam tentativas à toa).
  const smtp = agendaSmtp();
  if (!smtp) return res.status(503).json({ success: false, error: "E-mail nao configurado no servidor (EMAIL_HOST/EMAIL_USER/EMAIL_PASS)." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  let ag: AgendaMod;
  try { ag = await agendaMod(); }
  catch (e: any) {
    console.error("[Agenda] modulo _agenda nao carregou:", e?.message || e);
    return res.status(500).json({ success: false, error: "Modulo da agenda nao carregou no servidor." });
  }

  const inicio = Date.now();
  const appUrl = agendaAppUrl();
  const segredos = [smtp.pass, smtp.user, segredo, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_JWT_SECRET];
  const cont = { enviados: 0, falhas: 0, semDestinatario: 0, adiados: 0, lotes: 0 };
  let erroFila: string | null = null;
  // O SMTP INTEIRO falhou nesta rodada (senha trocada, servidor fora, conexão caiu): a rodada
  // para e o resto volta ADIADO, sem gastar tentativa (achado S3, 29/09). Guarda o erro curto.
  let smtpFora: string | null = null;
  // E-mail só para a empresa (decisão do Edson, 29/09): os endereços de Configurações, lidos no
  // máximo UMA vez por rodada — e só se alguém não passa direto (domínio da empresa / Edson).
  let confiaveis: Set<string> | null = null;
  let foraDaEmpresa = 0; // destinatários cortados na rodada (vai no log e na resposta)

  // Marca o resultado; tenta 2x — um "enviado" que não foi marcado voltaria para a fila
  // em 10 min e a pessoa receberia o e-mail de novo. `recebeu` (só no sucesso, sempre no
  // sucesso) = os ids de quem o SMTP aceitou; nas falhas não vai (o banco tem default null).
  const marcar = async (id: number, ok: boolean, erro: string | null, destinatarios: string | null, recebeu?: string[]) => {
    for (let i = 0; i < 2; i++) {
      const { error } = await admin.rpc("agenda_marcar_envio", {
        p_id: id, p_ok: ok, p_erro: erro, p_destinatarios: destinatarios, ...(recebeu ? { p_recebeu: recebeu } : {}),
      });
      if (!error) return;
      console.error(`[Agenda] marcar_envio(${id}) falhou:`, ag.mensagemCurta(error, segredos));
    }
  };

  // UM transporte por chamada, com a conexão reaproveitada entre os e-mails do lote.
  const transporte = nodemailer.createTransport({ ...agendaSmtpBase(smtp), pool: true, maxConnections: 1, maxMessages: 100 });
  try {
    while (Date.now() - inicio < AGENDA_ORCAMENTO_MS) {
      const { data, error } = await admin.rpc("agenda_pegar_devidos", { p_limite: AGENDA_LOTE });
      if (error) {
        erroFila = ag.mensagemCurta(error, segredos);
        console.error("[Agenda] agenda_pegar_devidos falhou:", erroFila);
        break;
      }
      cont.lotes++;
      const linhas: any[] = Array.isArray(data) ? data : [];
      const adiar: number[] = [];
      const devidos = linhas.map((bruta) => ag.normalizarDevido(bruta));
      // Configurações só quando alguém do lote não passa direto (o comum — todo mundo @empresa —
      // não custa leitura nenhuma). Aqui, ANTES do laço: o orçamento de tempo lá embaixo já conta
      // o que ela gastou (até 2 s).
      if (!confiaveis && devidos.some((d) => !!d && d.destinatarios.some((p) => !agendaPassaDireto(p)))) {
        confiaveis = await agendaConfiaveis(admin);
      }
      for (const d of devidos) {
        if (!d) { console.error("[Agenda] linha da fila sem alerta_id; ignorada."); continue; }
        const decorrido = Date.now() - inicio;
        if (smtpFora || decorrido >= AGENDA_ORCAMENTO_MS) {
          // Já está 'enviando': volta para a fila (sai na próxima rodada). Marcados JUNTOS,
          // depois do laço — um por um eram N idas ao banco em série DEPOIS do teto, e a
          // rodada passava de 10 s (bancada 29/09: 10,1 s com o SMTP pendurado e 100 ms por
          // ida ao banco; a Vercel corta a função e os alertas ficavam presos em 'enviando').
          // Com o SMTP fora, tentar o resto só gastaria as tentativas (5 = 'falhou' de vez).
          adiar.push(d.alerta_id);
          continue;
        }
        // Quem é de fora da empresa sai ANTES de montar o e-mail (o "Enviado para" lista só quem
        // recebe). O registro e o log dizem que houve corte — sem o endereço inteiro (maskEmail).
        const para = d.destinatarios.filter((p) => agendaRecebe(p, confiaveis));
        const fora = d.destinatarios.filter((p) => !para.includes(p));
        const notaFora = ag.registroForaDaEmpresa(fora);
        if (fora.length) {
          foraDaEmpresa += fora.length;
          console.warn(`[Agenda] alerta ${d.alerta_id}: ${fora.length} destinatario(s) de fora da empresa nao recebe(m): ${fora.map((p) => ag.maskEmail(p.email)).join(", ")}`);
        }
        if (!para.length) {
          // Ninguém (ou só gente de fora): encerra. Quem foi cortado vai em p_destinatarios (o
          // p_erro fica o 'SEM_DESTINATARIO' exato: é por ele que a 012 encerra sem repetir).
          cont.semDestinatario++;
          await marcar(d.alerta_id, false, "SEM_DESTINATARIO", notaFora || null);
          continue;
        }
        try {
          const email = ag.buildAgendaEmail({
            codigo: d.codigo, item: d.item, dono: d.dono, participantes: d.participantes,
            destinatarios: para, appUrl,
          });
          const info: any = await agendaComPrazo(transporte.sendMail(agendaMensagem(smtp, email, para)), Math.max(1500, AGENDA_LIMITE_MS - decorrido));
          cont.enviados++;
          // O SMTP pode aceitar uns e recusar outros (sem erro): o registro diz quem ficou de fora,
          // e SÓ quem ele ACEITOU conta como quem recebeu (p_recebeu). Recusado pelo SMTP e cortado
          // por ser de fora da empresa NÃO contam (29/09, furos A e B do 2º cético). Id que não é
          // uuid não vai (o banco recusaria a lista inteira e o alerta ficaria sem marcar).
          const { aceitos, recusados } = ag.aceitosPeloSmtp(para, info);
          const recebeu = Array.from(new Set(aceitos.map((p) => canonUuid(p.id)).filter((x): x is string => !!x)));
          const registro = ag.formatarDestinatarios(aceitos) + (recusados.length ? ` | recusado pelo servidor: ${recusados.join(", ")}` : "")
            + (notaFora ? ` | ${notaFora}` : "");
          if (recusados.length) console.warn(`[Agenda] alerta ${d.alerta_id}: ${recusados.length} destinatario(s) recusado(s) pelo SMTP.`);
          await marcar(d.alerta_id, true, null, registro, recebeu);
        } catch (e: any) {
          const msg = ag.mensagemCurta(e, segredos);
          // Falha de UM e-mail (destinatário/mensagem recusados) = falha comum: marca e segue.
          // Do servidor INTEIRO = a rodada para (o resto do lote volta ADIADO lá em cima). Se
          // foi com certeza antes de a mensagem sair (login/DNS/TLS/conexão), nem este gasta
          // tentativa; se pode ter sido depois do DATA, este gasta (o teto de 5 segura o
          // reenvio — sem ele, um e-mail já entregue sairia de novo a cada rodada).
          const falha = ag.classificarFalhaSmtp(e);
          if (falha !== "comum") smtpFora = msg;
          console.error(`[Agenda] alerta ${d.alerta_id} (${d.codigo}) nao saiu: ${msg}${falha !== "comum" ? " — servidor de e-mail fora; a rodada para" : ""}`);
          if (falha === "fora-antes") {
            adiar.push(d.alerta_id);
          } else {
            cont.falhas++;
            await marcar(d.alerta_id, false, msg, null);
          }
        }
      }
      if (adiar.length) {
        cont.adiados += adiar.length;
        const motivo = smtpFora
          ? "ADIADO: o servidor de e-mail falhou nesta rodada; sai na próxima."
          : "ADIADO: a rodada do disparador acabou o tempo antes deste envio.";
        await Promise.all(adiar.map((id) => marcar(id, false, motivo, null)));
      }
      if (smtpFora || linhas.length < AGENDA_LOTE) break; // SMTP fora, ou a fila esvaziou
    }
  } finally {
    try { transporte.close(); } catch { /* já fechado */ }
  }

  console.log(`[Agenda] disparo: enviados=${cont.enviados} falhas=${cont.falhas} semDestinatario=${cont.semDestinatario} adiados=${cont.adiados} lotes=${cont.lotes}${foraDaEmpresa ? ` foraDaEmpresa=${foraDaEmpresa}` : ""} ms=${Date.now() - inicio}${erroFila ? " (erro ao ler a fila)" : ""}${smtpFora ? ` (servidor de e-mail fora: ${smtpFora})` : ""}`);
  if (erroFila && cont.lotes === 0) {
    return res.status(500).json({ success: false, error: "Nao consegui ler a fila da agenda.", ...cont });
  }
  // SMTP fora: success false e o erro (sem segredo) na resposta — ela fica em
  // net._http_response (013), onde o Edson confere o disparador. foraDaEmpresa (só quando
  // houve) = quantos destinatários de fora da empresa ficaram sem o e-mail nesta rodada.
  return res.json({ success: !erroFila && !smtpFora, ...cont, ...(foraDaEmpresa ? { foraDaEmpresa } : {}), ...(smtpFora ? { smtpFora } : {}) });
});

// POST /api/agenda/testar { itemId } — alerta de TESTE agora, só para quem pediu.
app.post("/api/agenda/testar", async (req, res) => {
  const inicioRota = Date.now(); // o prazo do SMTP conta o que as leituras já gastaram (corte da Vercel em 10 s)
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Não autorizado." });
  const sid = canonUuid(claims.sub);
  if (!sid) return res.status(401).json({ success: false, error: "Não autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor não configurado." });
  try {
    if (await isViewerDb(admin, sid)) return res.status(403).json({ success: false, error: "Usuário de visualização não usa a agenda." });
  } catch (e: any) {
    console.error("[Agenda] teste: conferir o acesso falhou:", e?.message || e);
    return res.status(503).json({ success: false, error: "Não consegui conferir o seu acesso. Tente de novo." });
  }
  // Conta ANTES de agir: 5 testes a cada 15 min por pessoa (é e-mail pela conta oficial).
  if ((await rlHit(`agenda-teste:${sid}`, 900)) > 5) return tooMany(res, 900);
  const itemId = canonUuid((req.body || {}).itemId);
  if (!itemId) return res.status(400).json({ success: false, error: "Compromisso inválido." });
  const smtp = agendaSmtp();
  if (!smtp) return res.status(503).json({ success: false, error: "E-mail não configurado no servidor." });
  let ag: AgendaMod;
  try { ag = await agendaMod(); }
  catch (e: any) {
    console.error("[Agenda] modulo _agenda nao carregou:", e?.message || e);
    return res.status(500).json({ success: false, error: "Módulo da agenda não carregou no servidor." });
  }

  // Quem pode testar: quem ENXERGA o compromisso — o dono, e o Edson (só ele vê a agenda dos
  // outros; a dele, só ele). A mesma regra da política agenda_item_ler (012). O admin de OKR,
  // o CEO e o convidado NÃO: decisão do Edson, 29/09 ("A minha agenda somente eu mesmo posso
  // ver"). Qualquer outro recebe o MESMO 404 de "não existe" — não revela o compromisso.
  let email: AgendaEmail;
  let para: AgendaPessoa;
  try {
    const { data: rows, error } = await admin.from("agenda_item")
      .select("id, owner_id, titulo, tipo, local, descricao, inicio_dia, inicio_hora, fim_dia, fim_hora, participantes, status, updated_at")
      .eq("id", itemId).limit(1);
    if (error) throw new Error("Não consegui ler o compromisso. Tente de novo.");
    const it = rows && (rows[0] as any);
    const donoId = it ? canonUuid(it.owner_id) : null;
    const partIds: string[] = it && Array.isArray(it.participantes)
      ? it.participantes.map((x: any) => canonUuid(x)).filter((x: string | null): x is string => !!x)
      : [];
    const pode = !!it && (donoId === sid || sid === EDSON_ID);
    if (!pode) return res.status(404).json({ success: false, error: "Compromisso não encontrado." });

    const ids = Array.from(new Set([sid, donoId, ...partIds].filter((x): x is string => !!x)));
    const { data: pessoas, error: pErr } = await admin.from("users").select("id, name, surname, email").in("id", ids);
    if (pErr) throw new Error("Não consegui ler o cadastro. Tente de novo.");
    const porId = new Map<string, any>();
    (pessoas || []).forEach((u: any) => { const k = canonUuid(u.id); if (k) porId.set(k, u); });
    const nomeDe = (u: any) => `${(u && u.name) || ""} ${(u && u.surname) || ""}`.trim();
    const eu = porId.get(sid);
    const meuEmail = String((eu && eu.email) || "").trim();
    if (!eu || !isValidEmail(meuEmail)) return res.status(400).json({ success: false, error: "Você não tem e-mail cadastrado — cadastre em “Meu Perfil”." });
    para = { id: sid, nome: nomeDe(eu), email: meuEmail };
    // E-mail de fora da empresa não recebe nem o teste; o do Edson, sim (pelo id). As
    // Configurações só são lidas quando o domínio não basta. Decisão do Edson, 29/09 (tarde).
    if (!agendaPassaDireto(para) && !agendaRecebe(para, await agendaConfiaveis(admin))) {
      return res.status(400).json({ success: false, error: AGENDA_SO_EMPRESA });
    }
    const participantes = partIds.map((id) => nomeDe(porId.get(id))).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
    email = ag.buildAgendaEmail({
      codigo: "1d",
      item: {
        id: String(it.id), titulo: String(it.titulo || ""), tipo: String(it.tipo || "outro"),
        local: it.local ?? null, descricao: it.descricao ?? null,
        inicio_dia: String(it.inicio_dia || ""), inicio_hora: it.inicio_hora ?? null,
        fim_dia: String(it.fim_dia || it.inicio_dia || ""), fim_hora: it.fim_hora ?? null,
        status: String(it.status || "ativo"), updated_at: String(it.updated_at || ""),
      },
      dono: { id: donoId || "", nome: nomeDe(porId.get(donoId || "")), email: null },
      participantes,
      destinatarios: [para],
      appUrl: agendaAppUrl(),
      teste: true,
    });
  } catch (e: any) {
    console.error("[Agenda] teste: leitura falhou:", e?.message || e);
    return res.status(503).json({ success: false, error: String(e?.message || "Não consegui ler o compromisso. Tente de novo.") });
  }

  const transporte = nodemailer.createTransport(agendaSmtpBase(smtp));
  try {
    await agendaComPrazo(transporte.sendMail(agendaMensagem(smtp, email, [para])), Math.max(1500, 9000 - (Date.now() - inicioRota)));
  } catch (e: any) {
    console.error(`[Agenda] teste do compromisso ${itemId} nao saiu:`, ag.mensagemCurta(e, [smtp.pass, smtp.user]));
    return res.status(502).json({ success: false, error: ag.smtpErroAmigavel(e) });
  } finally {
    try { transporte.close(); } catch { /* já fechado */ }
  }
  console.log(`[Agenda] teste do compromisso ${itemId} enviado para ${ag.maskEmail(para.email)}`);
  return res.json({ success: true, para: ag.maskEmail(para.email) });
});

// POST /api/users/delete { id } — so admin, nao pode excluir a si mesmo
app.post("/api/users/delete", async (req, res) => {
  const inicioRota = Date.now();   // o prazo do aviso ao Edson desconta o que a rota já gastou
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  let isGestor = false; // só GESTOR exclui CEO, GESTOR e as contas que leem o OKR de todos
  // …e quem administra usuários (032, TI): exclui todos menos o Edson e o teste — decisão do Edson, 07/10 ("inclusive
  // CEO, Diretor, Gestor, admins de OKR"). Quem tem registros: só desligar (a trava 409 abaixo vale para ele também).
  let ehTI = false;
  try {
    const papel = await currentRole(admin, claims.sub);
    if (ehVisaoCeo(papel) && !claimsAreEdson(claims)) return res.status(403).json({ success: false, error: CEO_SO_VE });
    if (!PESSOAS_ADMIN_ROLES.includes(String(papel)) && !claimsAreEdson(claims)) {
      ehTI = await administraUsuariosDb(admin, claims.sub);
      if (!ehTI) return res.status(403).json({ success: false, error: "Sem permissao." });
    }
    isGestor = papel === "GESTOR" || claimsAreEdson(claims);
  }
  catch (e: any) { return res.status(503).json({ success: false, message: e.message }); }

  const id = canonUuid((req.body || {}).id);
  if (!id) return res.status(400).json({ success: false, error: "id ausente ou invalido." });
  if (id === canonUuid(claims.sub)) return res.status(400).json({ success: false, error: "Nao e possivel excluir o proprio usuario." });
  // O Edson (dono do sistema) não pode ser excluído por ninguém.
  if (id === EDSON_ID) return res.status(403).json({ success: false, error: "A conta do Edson nao pode ser excluida." });

  // Sem saber o login não dá para arquivar o OKR dele: não exclui (antes excluía e
  // o OKR ficava sem dono, calado).
  // (nome, e-mail, setor e as marcas do OKR: o aviso ao Edson quando quem exclui é o TI — 07/10)
  const { data: cur, error: curErr } = await lerComUsuarioTeste((c) => admin.from("users").select(c).eq("id", id).limit(1), "username, role, okr_admin, okr_viewer, name, surname, email, sector, okr_only, okr_enabled");
  if (curErr) return res.json({ success: false, message: "Nao consegui ler o usuario. Nada foi excluido; tente de novo." });
  // O usuário teste (031): só o Edson mexe na conta dele — e nem o Edson o exclui por aqui: excluir arquiva o OKR como
  // 'excluido:<id>:<login>' e apaga a linha de users, e daí em diante o banco não sabe mais que aquele OKR e aquele log
  // eram do teste (a RLS da 031 lê a marca em users) — os admins de OKR passariam a ver o OKR, e GESTOR/COORDENADOR/CEO
  // o log. Para encerrar: Desligar (a linha fica, a marca fica) ou a limpeza completa pelo banco, decisão do Edson.
  if (cur && cur[0] && (cur[0] as any).usuario_teste) {
    if (!claimsAreEdson(claims)) return res.status(403).json({ success: false, error: USUARIO_TESTE_SO_EDSON_MSG });
    return res.status(409).json({ success: false, message: "O usuário de teste não é excluído pela Equipe: o OKR e o log dele ficariam à vista de outras pessoas. Use Desligar, ou peça a limpeza completa pelo banco." });
  }
  if (!isGestor && !ehTI && contaSoDoGestor(cur && cur[0])) {
    return res.status(403).json({ success: false, error: "Só um GESTOR exclui CEO, Diretor Industrial, GESTOR, os admins do OKR e os representantes." });
  }
  const oldKey = String((cur && cur[0] && (cur[0] as any).username) || "").trim().toLowerCase();
  // Quem tem REGISTRO não é excluído. No banco de produção (lido em 30/09), projetos, atividades,
  // paradas, inovações e ocorrências ficam SEM DONO ao excluir (on delete set null) e a agenda é
  // apagada junto (012) — o Rogerio Sinotti tinha 84 projetos e 120 atividades. Regra do Edson,
  // 30/09: "preciso que as informações criadas por ele continuem registradas" → desligar, não
  // excluir. Antes esta rota zerava o dono dos projetos e das inovações ANTES de tentar excluir,
  // sem transação. Se não der para contar, também não exclui.
  const REGISTROS_DO_USUARIO: [string, string, string][] = [
    ["projects", "user_id", "projeto(s)"],
    ["operational_activities", "user_id", "atividade(s)"],
    ["interruptions", "designer_id", "parada(s)"],
    ["innovations", "author_id", "inovação(ões)"],
    ["issues", "reported_by", "ocorrência(s)"],
    ["project_requests", "created_by", "pedido(s) criado(s)"],
    ["project_requests", "assigned_to", "pedido(s) atribuído(s)"],
    ["agenda_item", "owner_id", "compromisso(s) na agenda"],
    // KPI dos setores (023): a autoria dos lançamentos e dos indicadores não pode sumir.
    ["kpis_lancamento", "lancado_por", "lançamento(s) no KPI dos setores"],
    ["kpis_lancamento_hist", "por", "correção(ões) no KPI dos setores"],
    ["kpis_indicador", "criado_por", "indicador(es) do KPI dos setores"],
    ["kpis_meta", "por", "meta(s) no KPI dos setores"],
  ];
  const achados: string[] = [];
  for (const [tabela, coluna, rotulo] of REGISTROS_DO_USUARIO) {
    // Nas tabelas do KPI dos setores a contagem vai por GET, não HEAD: sem a 023, o 404 do HEAD vem SEM
    // corpo (não diz que a tabela não existe) e a exclusão parava em "não consegui conferir".
    const kpis = tabela.startsWith("kpis_");
    const { count, error: cErr }: any = kpis
      ? await admin.from(tabela).select(tabela === "kpis_meta" ? "indicador_id" : "id", { count: "exact" }).eq(coluna, id).limit(1)
      : await admin.from(tabela).select("id", { count: "exact", head: true }).eq(coluna, id);
    // A 023 ainda não rodou: as tabelas do KPI dos setores não existem, e ninguém tem registro nelas.
    if (cErr && kpis && (cErr.code === "PGRST205" || cErr.code === "42P01")) continue;
    // NaN (Content-Range "*") também é "number": só vale inteiro >= 0.
    if (cErr || !Number.isInteger(count) || (count as number) < 0) {
      console.error("[users/delete] não consegui contar", tabela, coluna, cErr?.code || "");
      return res.status(503).json({ success: false, message: "Não consegui conferir os registros deste usuário. Nada foi excluído." });
    }
    if ((count as number) > 0) achados.push(`${count} ${rotulo}`);
  }
  if (achados.length) {
    return res.status(409).json({
      success: false,
      message: `Não excluí: este usuário tem ${achados.join(", ")}. Excluir apagaria a autoria desses registros. ` +
        "Para quem saiu da empresa, o certo é desligar (tirar o acesso e manter o cadastro) — use Desligar na tela de Equipe" +
        (ehTI ? "." : " (Edson ou GESTOR)."),   // o TI (032) também desliga: a frase não o manda pedir a outro
    });
  }
  // O custo/hora por período (022) segue a exclusão sozinho (gatilho de users, de hoje em diante).
  // Só o id volta (antes `.select()` trazia a linha inteira — salário e senha — ao servidor, e ninguém a usava).
  const { data, error } = await admin.from("users").delete().eq("id", id).select("id");
  if (error) return res.json({ success: false, message: `Erro ao excluir: ${error.message}` });
  if (!data || data.length === 0) return res.json({ success: false, message: "Usuario nao encontrado." });
  // O OKR de quem saiu é ARQUIVADO (chave 'excluido:...'), não apagado: fica guardado
  // e o login fica livre — antes, recriar a pessoa com o mesmo login era recusado.
  let resposta: { success: true; message?: string } = { success: true };
  if (oldKey) {
    const { error: arqErr } = await admin.from("okr_state").update({ owner_key: `excluido:${id}:${oldKey}` }).eq("owner_key", oldKey);
    if (arqErr) resposta = { success: true, message: `Usuario excluido, mas o OKR dele nao foi arquivado: ${arqErr.message}` };
  }
  // O aviso ao Edson (07/10): o TI excluiu — a conta como estava (lida antes de excluir).
  if (ehTI) await avisarEdsonDoTI(admin, claims.sub, { acao: "excluiu", conta: contaDoAviso(id, cur && cur[0]) }, inicioRota);
  return res.json(resposta);
});

// ============================================================
// CUSTO / SALARIO (C2 da auditoria). O salario individual NUNCA mais sai do
// banco para o navegador de ninguem — nem via select('*'). Duas portas:
//  - /api/labor/hourly-cost: devolve o custo/hora POR PERÍODO (022), e só para
//    quem pode ver R$. Nao revela salario de ninguem.
//  - /api/users/salaries: devolve os salarios individuais, SO para o Edson.
// ============================================================

// ---- Custo/hora por período (022, 30/09/2026). Decisões do Edson, 30/09: "congelar cada mês" (jan–ago
// valem o que valem hoje; setembro em diante sem o salário dele; quem é desligado sai do custo no dia
// seguinte ao último dia) e R$ SÓ para o Edson (pelo id) e os CEOs (cargo lido do CADASTRO, não do
// crachá). A série mora em custo_hora_periodo e só a service_role a lê.
//  - Edson/CEO: { podeVerReais: true, periodos: [{desde, taxa}], taxaHoje, taxaInovacoes }.
//  - demais: { podeVerReais: false, semReais: true, taxaInovacoes } — NUNCA periodos nem taxaHoje.
//  - taxaInovacoes = a taxa de antes do corte (a linha que cobre 31/08/2026): a tela de Inovações não
//    muda (decisão 5). Só para quem vê Inovações (a mesma lista de canSeeInnovations, App.tsx).
// Antes: UMA média com os salários de HOJE, a todos (hourlyRate), aplicada a registros de qualquer data.
// 06/10/2026: onde diz "CEO" vale também o Diretor Industrial (ehVisaoCeo / CARGOS_VISAO_CEO) — "o mesmo privilégio e
// visualização do CEO". O REPRESENTANTE fica fora das duas listas (é "Somente OKR").
const CUSTO_CARGOS_QUE_VEEM_INOVACOES = ["GESTOR", ...CARGOS_VISAO_CEO, "PROJETISTA", "COORDENADOR", "PROCESSOS"];
const CUSTO_DIA_DAS_INOVACOES = "2026-08-31";
// TRANSIÇÃO (cético de 30/09): uma aba aberta com o pacote de ANTES lê `hourlyRate`; sem ele o custo/hora
// vira 0 e a tela antiga de Inovações GRAVA a economia errada. Até este dia (de Joinville, inclusive),
// quem vê Inovações ainda recebe hourlyRate = taxaInovacoes — a taxa de antes, que essa pessoa já
// recebia (não vaza nada novo). O pacote novo ignora o campo. Depois desta data, o campo some.
const CUSTO_HOURLY_RATE_ANTIGO_ATE = "2026-10-07";

// A regra de ANTES (a 022 não rodou): a média de hoje, como esta rota fazia até 30/09. Só serve para a
// taxa das Inovações não virar 0 se o código subir antes da 022 (a ordem certa é a 022 primeiro).
// 06/10/2026: o Diretor Industrial e o Representante também fora da média (como o CEO e o PROCESSOS) — custo por
// ÁREA, nunca por cargo; a mesma exclusão da custo_hora_taxa_calculada no banco (030).
const custoTaxaDaRegraDeAntes = async (admin: any): Promise<number | null> => {
  const { data, error } = await admin.from("users").select("role,salary");
  if (error) { console.error("[labor/hourly-cost] regra de antes:", error.code || "(sem código)"); return null; }
  const relevant = (data || []).filter(
    (u: any) => !ehVisaoCeo(u.role) && u.role !== "PROCESSOS" && u.role !== ADM_EXTERNO && !ehRepresentante(u.role) && Number(u.salary) > 0
  );
  const total = relevant.reduce((acc: number, u: any) => acc + Number(u.salary || 0), 0);
  return total / (relevant.length || 1) / 220; // media mensal / 220h
};

// GET /api/labor/hourly-cost — a série (Edson/CEO) ou só a taxa das Inovações (demais).
app.get("/api/labor/hourly-cost", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const hcClaims = verifyBearerToken(req);
  if (!hcClaims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  const id = canonUuid(hcClaims.sub);
  if (!id) return res.status(403).json({ success: false, error: "Sem permissao." });
  let r: any = null;
  try { r = await lerUsuario(admin, id, "role, okr_viewer, okr_admin, okr_only", "Nao consegui conferir o seu acesso. Tente de novo."); }
  catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
  // Custo/hora sai dos salários: não é do painel de OKR, nem de quem saiu, nem de quem não está no cadastro.
  if (!r || ehVisualizador(r, id) || desligadoPeloCadastro(r, id)) return res.status(403).json({ success: false, error: "Sem permissao." });
  const ehEdson = claimsAreEdson(hcClaims);
  // 029 (05/10/2026): "Somente OKR" não vê nada da engenharia — nem R$, mesmo com cargo CEO (o Edson, sempre).
  const podeVerReais = ehEdson || (ehVisaoCeo(r.role) && !r.okr_only);
  const veInovacoes = ehEdson || (CUSTO_CARGOS_QUE_VEEM_INOVACOES.includes(String(r.role || "")) && !r.okr_only);
  const hoje = hojeJoinville();
  const transicao = hoje <= CUSTO_HOURLY_RATE_ANTIGO_ATE;
  const antigo = (taxa: number | null) => (transicao && veInovacoes && taxa !== null ? { hourlyRate: taxa } : {});

  const { data, error } = await admin.from("custo_hora_periodo").select("desde, taxa").eq("area", "engenharia").order("desde", { ascending: true });
  if (error) {
    const code = String(error.code || "");
    // PGRST205 = a tabela não existe para o PostgREST (a 022 não rodou, ou faltou o reload schema).
    if (code === "PGRST205" || code === "42P01") {
      const taxaAntes = veInovacoes ? await custoTaxaDaRegraDeAntes(admin) : null;
      return res.json({
        success: true, instalado: false, podeVerReais, semReais: !podeVerReais, hoje,
        ...(podeVerReais ? { periodos: [], taxaHoje: 0 } : {}),
        taxaInovacoes: taxaAntes, ...antigo(taxaAntes),
      });
    }
    console.error("[labor/hourly-cost] série:", code || "(sem código)");
    return res.status(500).json({ success: false, error: "Erro ao ler o custo/hora." });
  }
  const periodos = (Array.isArray(data) ? data : [])
    .map((p: any) => ({ desde: String((p && p.desde) || "").slice(0, 10), taxa: Number(p && p.taxa) }))
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.desde) && Number.isFinite(p.taxa) && p.taxa >= 0)
    .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  // A taxa de um dia = a da última linha com desde <= dia; antes da primeira linha, a primeira (nunca 0).
  const vigente = (dia: string): number => {
    let t: number | null = null;
    for (const p of periodos) { if (p.desde <= dia) t = p.taxa; else break; }
    return t !== null ? t : (periodos.length ? periodos[0].taxa : 0);
  };
  const taxaInovacoes = veInovacoes ? vigente(CUSTO_DIA_DAS_INOVACOES) : null;
  if (!podeVerReais) {
    return res.json({ success: true, instalado: true, podeVerReais: false, semReais: true, hoje, taxaInovacoes, ...antigo(taxaInovacoes) });
  }
  // 029 (05/10/2026): o navegador não lê mais settings.hourly_cost (o banco só lhe dá as outras colunas). O valor
  // MANUAL do custo/hora sai daqui, junto com o MODO, lidos na MESMA linha (os dois nunca descasam), só para quem
  // vê R$. Falhou a leitura = 500: a tela fica sem R$ (nunca com R$ errado calado). Nunca imprimir o valor.
  const { data: s, error: sErr } = await admin.from("settings").select("hourly_cost, use_automatic_cost").limit(1);
  if (sErr) {
    // Sem o modo não dá para saber se vale a série ou o valor manual: a resposta sai SEM R$ (como para quem não vê),
    // com a marca da falha — mas a taxa das Inovações continua (senão salvar inovação travaria por isso).
    console.error("[labor/hourly-cost] valor manual:", sErr.code || "(sem código)");
    return res.json({ success: true, instalado: true, podeVerReais: false, semReais: true, falhaLeitura: true, hoje, taxaInovacoes, ...antigo(taxaInovacoes) });
  }
  const linha: any = s && s[0] ? s[0] : {};
  const bruto = linha.hourly_cost;
  const manual = bruto === null || bruto === undefined ? null : Number(bruto);
  const auto = linha.use_automatic_cost;
  return res.json({
    success: true, instalado: true, podeVerReais: true, hoje, periodos, taxaHoje: vigente(hoje), taxaInovacoes, ...antigo(taxaInovacoes),
    custoManual: manual !== null && Number.isFinite(manual) ? manual : null,
    ...(auto === true || auto === false ? { custoAutomatico: auto } : auto === "true" || auto === "false" ? { custoAutomatico: auto === "true" } : {}),
  });
});

// GET /api/projects/custo-gravado — o custo GRAVADO de cada projeto (projects.total_cost > 0), que só a exportação
// de jan–ago usa (decisão do Edson, 30/09: "jan–ago com o custo gravado na época"). 029 (05/10/2026): o navegador
// não lê mais as colunas de custo; quem vê R$ (Edson pelo id; CEO pelo cadastro, fora "Somente OKR", visualizador
// e desligado) pede aqui, na hora de exportar. Rota à parte da série: se falhar, só a exportação avisa — o resto do
// R$ continua. Páginas por CHAVE (id > o último), não por deslocamento: apagar um projeto no meio da leitura não
// pula outro; e lê até vir uma página VAZIA (não "menos de 1.000"): se o teto do PostgREST for menor que 1.000,
// nada fica de fora calado. Falhou qualquer página = 500 (nada pela metade). Nunca imprimir o resultado.
app.get("/api/projects/custo-gravado", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  const id = canonUuid(claims.sub);
  if (!id) return res.status(403).json({ success: false, error: "Sem permissao." });
  let r: any = null;
  try { r = await lerUsuario(admin, id, "role, okr_viewer, okr_admin, okr_only", "Nao consegui conferir o seu acesso. Tente de novo."); }
  catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
  if (!r || ehVisualizador(r, id) || desligadoPeloCadastro(r, id)) return res.status(403).json({ success: false, error: "Sem permissao." });
  if (!(claimsAreEdson(claims) || (ehVisaoCeo(r.role) && !r.okr_only))) return res.status(403).json({ success: false, error: "Sem permissao." });   // CEO ou Diretor Industrial (06/10)
  const custoGravado: Record<string, number> = {};
  let depoisDe = "";
  for (let pagina = 0; ; pagina++) {
    let q = admin.from("projects").select("id, total_cost").gt("total_cost", 0).order("id", { ascending: true }).limit(1000);
    if (depoisDe) q = q.gt("id", depoisDe);
    const { data, error } = await q;
    if (error) {
      console.error("[projects/custo-gravado]", error.code || "(sem código)");
      return res.status(500).json({ success: false, error: "Erro ao ler o custo gravado." });
    }
    const linhas = Array.isArray(data) ? data : [];
    if (linhas.length === 0) break;
    for (const p of linhas) {
      const v = Number((p as any).total_cost);
      if ((p as any).id && Number.isFinite(v) && v > 0) custoGravado[String((p as any).id)] = v;
    }
    depoisDe = String((linhas[linhas.length - 1] as any).id);
    if (pagina >= 100) {
      console.error("[projects/custo-gravado] mais de 100.000 linhas");
      return res.status(500).json({ success: false, error: "Erro ao ler o custo gravado." });
    }
  }
  return res.json({ success: true, custoGravado });
});

// POST /api/users/desligar { id, ultimoDia: 'AAAA-MM-DD' } — DESLIGAR SEM EXCLUIR (022, 30/09/2026).
// Decisão do Edson, 30/09: quem saiu é desligado, não excluído; desliga o Edson ou um GESTOR (cargo do
// cadastro). O último dia é o último dia TRABALHADO (inclusive) e vai até hoje — nunca no futuro: o
// desligamento é feito no fim do último dia. Tudo numa transação no banco (kpi_desligar_usuario, só
// service_role): as datas, uma senha aleatória que ninguém conhece (hash e texto, pelo crypt do banco —
// o verify_login da 001 só olha o hash quando ele existe), o e-mail fora do cadastro (sem ele, o "código
// por e-mail" não chega a lugar nenhum), os códigos zerados e o custo/hora refeito a partir do dia
// seguinte (nunca antes do mês corrente: mês fechado não muda). O cadastro e tudo o que a pessoa fez
// ficam no nome dela. Resposta: custoDesde = o 1º dia sem o salário dela no custo.
app.post("/api/users/desligar", async (req, res) => {
  const inicioRota = Date.now();   // o prazo do aviso ao Edson desconta o que a rota já gastou
  res.set("Cache-Control", "private, no-store");
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Nao autorizado." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });
  const meuId = canonUuid(claims.sub);
  if (!meuId) return res.status(401).json({ success: false, error: "Nao autorizado." });
  let papel: string | null = null;
  try { papel = await currentRole(admin, meuId); }
  catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
  // …e quem administra usuários (032, TI): desliga todos menos o Edson e o teste (decisão do Edson, 07/10).
  let ehTI = false;   // o TI não ouve falar de custo: a resposta dele vai sem o custoDesde (abaixo)
  if (!(claimsAreEdson(claims) || papel === "GESTOR")) {
    try { ehTI = await administraUsuariosDb(admin, meuId); }
    catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
    if (!ehTI) return res.status(403).json({ success: false, error: "Só o Edson ou um GESTOR desliga." });
  }
  const alvo = canonUuid((req.body || {}).id);
  if (!alvo) return res.status(400).json({ success: false, error: "id ausente ou invalido." });
  if (alvo === meuId) return res.status(400).json({ success: false, error: "Não dá para desligar a si mesmo." });
  if (alvo === EDSON_ID) return res.status(403).json({ success: false, error: "A conta do Edson não pode ser desligada." });
  // O usuário teste (031): só o Edson mexe na conta dele.
  if (!claimsAreEdson(claims)) {
    try { if (await ehUsuarioTeste(admin, alvo)) return res.status(403).json({ success: false, error: USUARIO_TESTE_SO_EDSON_MSG }); }
    catch (e: any) { return res.status(503).json({ success: false, error: e.message }); }
  }
  const ultimoDia = String((req.body || {}).ultimoDia ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ultimoDia);
  const real = !!m && (() => {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
  })();
  if (!real) return res.status(400).json({ success: false, error: "Informe o último dia trabalhado (AAAA-MM-DD)." });
  if (ultimoDia > hojeJoinville()) return res.status(400).json({ success: false, error: "O último dia não pode ser no futuro: desligue no fim do último dia." });
  if (ultimoDia < "2026-01-01") return res.status(400).json({ success: false, error: "O último dia tem de ser de 2026 em diante." });

  // O aviso ao Edson (07/10), quando quem desliga é o TI: a conta como está AGORA — desligar tira o e-mail do cadastro.
  let contaAntesDoTI: AvisoTIConta | null = null;
  if (ehTI) {
    const { data: ca, error: caErr } = await admin.from("users").select(AVISO_TI_COLS).eq("id", alvo).limit(1);
    if (caErr) return res.status(503).json({ success: false, error: "Não consegui ler o usuário. Nada foi gravado; tente de novo." });
    contaAntesDoTI = contaDoAviso(alvo, ca && ca[0]);
  }

  const { data, error } = await admin.rpc("kpi_desligar_usuario", { p_user: alvo, p_ultimo_dia: ultimoDia });
  if (error) {
    const code = String(error.code || "");
    const msg = String(error.message || "");
    // PGRST202 = a função não existe para o PostgREST (a 022 não rodou); 42883 = não existe no banco.
    if (code === "PGRST202" || code === "42883") return res.status(503).json({ success: false, error: "O desligamento ainda não está instalado no banco: rode a migração 022." });
    if (/DESLIGAR_NAO_ACHEI/.test(msg)) return res.status(404).json({ success: false, error: "Usuário não encontrado." });
    if (/DESLIGAR_JA_DESLIGADO/.test(msg)) return res.status(409).json({ success: false, error: "Já está desligado." });
    if (/DESLIGAR_EDSON/.test(msg)) return res.status(403).json({ success: false, error: "A conta do Edson não pode ser desligada." });
    if (/DESLIGAR_FUTURO/.test(msg)) return res.status(400).json({ success: false, error: "O último dia não pode ser no futuro: desligue no fim do último dia." });
    if (/DESLIGAR_(DATA|DADOS)/.test(msg)) return res.status(400).json({ success: false, error: "Informe o último dia trabalhado (AAAA-MM-DD)." });
    console.error("[users/desligar] falhou:", code || "(sem código)");
    return res.status(500).json({ success: false, error: "Não consegui desligar. Nada foi gravado; tente de novo." });
  }
  const custoDesde = String((data && typeof data === "object" && (data as any).custo_desde) || "").slice(0, 10);
  if (ehTI && contaAntesDoTI) await avisarEdsonDoTI(admin, meuId, { acao: "desligou", conta: contaAntesDoTI, ultimoDia }, inicioRota);
  // O TI (032, decisão do Edson 07/10: "nunca vê salário, R$, custo/hora"): desligou, e só — sem a data do custo/hora.
  return res.json({ success: true, ...(!ehTI && /^\d{4}-\d{2}-\d{2}$/.test(custoDesde) ? { custoDesde } : {}) });
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

// ========================= INFRA =========================
// Indicador de uso (29/09/2026) — pedido do Edson: "um lugar onde eu possa ver o nível que está
// o banco de dados … no cantinho superior, em todas as minhas telas". SÓ para ele (pelo id).
// Decisões dele, 29/09: e-mail de alerta a 80%, 1 por dia; sem token da Vercel por ora (o
// painel mostra os limites do plano + o link para o uso do time).
//  - GET /api/infra/uso: o chip "BD x%" e o painel (src/components/UsoInfra.tsx). 401 sem crachá,
//    403 se não é o Edson — ANTES de ir ao banco. Mede pela infra_uso_banco() (migração 014, só
//    service_role) com prazo de 3 s e cache em memória de 10 min ("Medir agora" = ?forcar=1, no
//    máximo 1 a cada 30 s). A 014 não rodou (PGRST202) → 200 com status 'nao_instalado' (o chip
//    fica cinza, nunca 500). Falha/demora do banco → 200 com status 'erro' (o resto do painel
//    — Vercel e links — continua).
//  - GET|POST /api/infra/verificar: o pg_cron chama 1x por dia (migração 015) com o MESMO segredo
//    do disparador da agenda (AGENDA_CRON_SECRET). Mede na hora; se o uso >= INFRA_ALERTA_PCT
//    (padrão 80) e o alerta de hoje (dia de Joinville) ainda não saiu (tabela infra_alerta),
//    manda UM e-mail ao Edson — o e-mail CADASTRADO dele, pelo id — e anota o dia.
// Limites e planos: variáveis de SERVIDOR (nunca VITE_) — INFRA_DB_LIMITE_MB (padrão 500),
// INFRA_PLANO_SUPABASE (free), INFRA_PLANO_VERCEL (hobby), INFRA_ALERTA_PCT (80). Sem elas vale o
// confirmado por print do Edson em 29/09 (Supabase FREE, Vercel HOBBY). O uso da Vercel e o
// egress/logs do Supabase NÃO são medidos aqui (sem API sem token): vão como referência + link.
const INFRA_LIMITES_CONFERIDOS_EM = "2026-09-29";
const INFRA_CACHE_MS = 10 * 60 * 1000;
const INFRA_FORCAR_MIN_MS = 30 * 1000;
const INFRA_RPC_PRAZO_MS = 3000;
const INFRA_EMAIL_PRAZO_MS = 9000;
const INFRA_MB = 1024 * 1024;
// Vercel Hobby (vercel.com/docs/plans/hobby, conferida em 29/09/2026). A cota é do TIME inteiro
// (KPI, pedidos, CMMS, TAESA e portal somados); estourou = espera 30 dias ou o time é pausado.
const INFRA_VERCEL_HOBBY = { cpu_ativa_horas: 4, invocacoes: 1000000, cdn_requests: 1000000, transferencia_gb: 100 };
// Supabase Free: o que só o painel Usage da organização mede (não há API sem token).
const INFRA_SUPABASE_FREE_PAINEL = { egress_gb: 5, logs_gb: 1 };
// Links de uso: o da Vercel abre o Usage do time escolhido no painel; o do Supabase, o Usage
// da organização ("_" = o painel pede para escolher).
const INFRA_LINK_VERCEL_USO = "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fusage&title=Uso";
const INFRA_LINK_SUPABASE_USO = "https://supabase.com/dashboard/org/_/usage";
// Se o cadastro do Edson não tiver e-mail válido, o alerta vai para o e-mail de notificação
// dele (o mesmo de NOTIFY_RECIPIENTS; o gmail é só o login).
const INFRA_EDSON_EMAIL_RESERVA = "edson@jimp.com.br";

// Variável numérica de servidor: fora do intervalo, vazia ou lixo = o padrão.
const infraNumero = (bruto: unknown, padrao: number, min: number, max: number): { valor: number; daVariavel: boolean } => {
  const s = String(bruto ?? "").trim().replace(",", ".");
  const n = s ? Number(s) : NaN;
  if (s && !(Number.isFinite(n) && n >= min && n <= max)) console.warn(`[Infra] valor inválido numa variável INFRA_* (${JSON.stringify(s.slice(0, 20))}); vale o padrão ${padrao}.`);
  return Number.isFinite(n) && n >= min && n <= max ? { valor: n, daVariavel: true } : { valor: padrao, daVariavel: false };
};
const infraPlano = (bruto: unknown, padrao: string): string => {
  const s = String(bruto ?? "").trim().toLowerCase();
  return /^[a-z][a-z0-9_-]{0,19}$/.test(s) ? s : padrao;
};
const infraConfig = () => {
  const limite = infraNumero(process.env.INFRA_DB_LIMITE_MB, 500, 1, 10000000);
  return {
    limiteMb: limite.valor,
    limiteBytes: Math.round(limite.valor * INFRA_MB),
    limiteOrigem: limite.daVariavel ? "variavel" : "padrao",
    alertaPct: infraNumero(process.env.INFRA_ALERTA_PCT, 80, 1, 100).valor,
    planoSupabase: infraPlano(process.env.INFRA_PLANO_SUPABASE, "free"),
    planoVercel: infraPlano(process.env.INFRA_PLANO_VERCEL, "hobby"),
  };
};
type InfraCfg = ReturnType<typeof infraConfig>;
// % com 3 casas, arredondado PARA BAIXO: o chip mostra o inteiro de baixo, e "80%" na tela
// acontece exatamente quando o alerta (>= 80) dispara.
const infraPct = (usado: number, limite: number): number => Math.floor((usado / limite) * 100000) / 1000;
const infraNaoNeg = (v: any): number => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const infraMascara = (e: string): string => String(e).replace(/^(.)[^@]*(@.*)$/, "$1***$2");
// O dia de Joinville (AAAA-MM-DD), qualquer que seja o fuso da máquina (a Vercel roda em UTC).
const infraDiaJoinville = (d: Date): string => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => (p.find((x) => x.type === t) || { value: "" }).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
};

type InfraBanco = {
  usado_bytes: number; app_bytes: number; somente_leitura: boolean; medido_em: string;
  maiores: { nome: string; total_bytes: number; dados_bytes: number; linhas_aprox: number }[];
};
type InfraMedida = { status: "ok"; banco: InfraBanco } | { status: "nao_instalado" | "erro"; motivo: string };
const INFRA_NAO_INSTALADO = "A medição ainda não está instalada no banco: rode a migração 014_infra_uso.sql no SQL Editor do Supabase.";
const INFRA_ERRO_MEDIR = "Não consegui medir o banco agora. Tente de novo em alguns minutos.";

// UMA ida ao banco: infra_uso_banco() com prazo de 3 s (e o pedido é cancelado no prazo).
const infraMedirBanco = async (admin: any): Promise<InfraMedida> => {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const prazo = new Promise<never>((_, falha) => {
      timer = setTimeout(() => { falha(Object.assign(new Error("prazo"), { code: "INFRA_PRAZO" })); ctrl.abort(); }, INFRA_RPC_PRAZO_MS);
    });
    const { data, error } = (await Promise.race([admin.rpc("infra_uso_banco").abortSignal(ctrl.signal), prazo])) as any;
    if (error) {
      const code = String(error.code || "");
      // PGRST202 = a função não existe para o PostgREST (a 014 não rodou, ou faltou o reload
      // schema); 42883 = não existe no banco.
      if (code === "PGRST202" || code === "42883") return { status: "nao_instalado", motivo: INFRA_NAO_INSTALADO };
      console.error("[Infra] infra_uso_banco falhou:", code || "(sem código)", String(error.message || "").slice(0, 200));
      return { status: "erro", motivo: INFRA_ERRO_MEDIR };
    }
    const d = data && typeof data === "object" ? data : null;
    const usado = d ? Number(d.total_bytes) : NaN;
    if (!d || !Number.isFinite(usado) || usado <= 0) {
      console.error("[Infra] infra_uso_banco devolveu algo inesperado:", typeof data);
      return { status: "erro", motivo: INFRA_ERRO_MEDIR };
    }
    const maiores = (Array.isArray(d.maiores) ? d.maiores : []).slice(0, 10).map((m: any) => ({
      nome: String((m && m.nome) || "?").slice(0, 120),
      total_bytes: infraNaoNeg(m && m.total_bytes),
      dados_bytes: infraNaoNeg(m && m.dados_bytes),
      linhas_aprox: infraNaoNeg(m && m.linhas_aprox),
    }));
    const medidoMs = Date.parse(String(d.medido_em || ""));
    return {
      status: "ok",
      banco: {
        usado_bytes: usado,
        app_bytes: infraNaoNeg(d.app_bytes),
        somente_leitura: d.somente_leitura === true,
        medido_em: new Date(Number.isFinite(medidoMs) ? medidoMs : Date.now()).toISOString(),
        maiores,
      },
    };
  } catch (e: any) {
    if (e && e.code === "INFRA_PRAZO") {
      console.error("[Infra] infra_uso_banco passou de 3 s.");
      return { status: "erro", motivo: "O banco demorou mais de 3 s para responder. Tente de novo em alguns minutos." };
    }
    console.error("[Infra] infra_uso_banco falhou:", (e && (e.code || e.name)) || "erro");
    return { status: "erro", motivo: INFRA_ERRO_MEDIR };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// Cache do chip (memória da instância): só a medição BOA fica guardada — "não instalado" e erro
// voltam a perguntar ao banco (rodou a 014 → o chip acende na próxima leitura). Pedidos ao mesmo
// tempo dividem UMA ida ao banco.
let infraCache: { em: number; banco: InfraBanco } | null = null;
let infraUltimaForcada = 0;
let infraEmVoo: Promise<InfraMedida> | null = null;
const infraMedir = async (admin: any, forcar: boolean): Promise<{ medida: InfraMedida; doCache: boolean }> => {
  const agora = Date.now();
  if (infraCache && agora - infraCache.em < INFRA_CACHE_MS && !(forcar && agora - infraUltimaForcada >= INFRA_FORCAR_MIN_MS)) {
    return { medida: { status: "ok", banco: infraCache.banco }, doCache: true };
  }
  if (forcar) infraUltimaForcada = agora;
  if (!infraEmVoo) infraEmVoo = infraMedirBanco(admin).finally(() => { infraEmVoo = null; });
  const medida = await infraEmVoo;
  if (medida.status === "ok") infraCache = { em: Date.now(), banco: medida.banco };
  return { medida, doCache: false };
};

const infraResposta = (medida: InfraMedida, cfg: InfraCfg, doCache: boolean) => ({
  success: true,
  status: medida.status,
  ...(medida.status !== "ok" ? { motivo: medida.motivo } : {}),
  banco: medida.status === "ok" ? {
    usado_bytes: medida.banco.usado_bytes,
    limite_bytes: cfg.limiteBytes,
    pct: infraPct(medida.banco.usado_bytes, cfg.limiteBytes),
    maiores: medida.banco.maiores,
    somente_leitura: medida.banco.somente_leitura,
    medido_em: medida.banco.medido_em,
    app_bytes: medida.banco.app_bytes,
    limite_origem: cfg.limiteOrigem,
  } : null,
  vercel: {
    plano: cfg.planoVercel,
    limites: cfg.planoVercel === "hobby" ? INFRA_VERCEL_HOBBY : null,
    link_uso: INFRA_LINK_VERCEL_USO,
  },
  supabase: {
    plano: cfg.planoSupabase,
    links: { uso: INFRA_LINK_SUPABASE_USO },
    limites_so_no_painel: cfg.planoSupabase === "free" ? INFRA_SUPABASE_FREE_PAINEL : null,
  },
  limites_conferidos_em: INFRA_LIMITES_CONFERIDOS_EM,
  cache: doCache,
});

// GET /api/infra/uso — o chip e o painel. SÓ o Edson.
app.get("/api/infra/uso", async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const claims = verifyBearerToken(req);
  if (!claims) return res.status(401).json({ success: false, error: "Não autorizado." });
  // Antes de qualquer ida ao banco: quem não é o Edson não custa nem uma consulta.
  if (!claimsAreEdson(claims)) return res.status(403).json({ success: false, error: "Sem permissão." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor não configurado." });
  const { medida, doCache } = await infraMedir(admin, String(req.query.forcar || "") === "1");
  return res.json(infraResposta(medida, infraConfig(), doCache));
});

const infraFmtMb = (b: number): string =>
  (b / INFRA_MB).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const infraFmtTam = (b: number): string =>
  b >= INFRA_MB ? `${infraFmtMb(b)} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString("pt-BR")} kB`;
const infraTextoAlerta = (banco: InfraBanco, cfg: InfraCfg, pct: number) => {
  const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(banco.medido_em));
  const pctTxt = Math.floor(pct).toLocaleString("pt-BR");
  const limiteTxt = cfg.limiteMb.toLocaleString("pt-BR");
  const linhas = [
    `Alerta diário do uso do banco do KPI (Supabase, plano ${cfg.planoSupabase.toUpperCase()}).`,
    "",
    `Uso agora: ${infraFmtMb(banco.usado_bytes)} MB de ${limiteTxt} MB (${pctTxt}%).`,
    `O aviso sai a partir de ${cfg.alertaPct.toLocaleString("pt-BR")}%.`,
    banco.somente_leitura ? "ATENÇÃO: o banco JÁ ESTÁ EM SOMENTE LEITURA — ninguém consegue gravar." : "Somente leitura: não (o banco ainda aceita gravação).",
    `Medido em ${quando} (horário de Brasília).`,
    "",
    "As maiores tabelas:",
    ...banco.maiores.map((m, i) => `  ${i + 1}. ${m.nome} — ${infraFmtTam(m.total_bytes)} (dados ${infraFmtTam(m.dados_bytes)}, ~${Math.round(m.linhas_aprox).toLocaleString("pt-BR")} linhas)`),
    "",
    cfg.planoSupabase === "free"
      ? `No plano FREE, passou de ${limiteTxt} MB o banco fica SOMENTE LEITURA na hora: ninguém grava KPI, OKR nem Agenda.`
      : `Limite configurado: ${limiteTxt} MB (INFRA_DB_LIMITE_MB).`,
    "Antes de apagar qualquer dado, chame o Claude: o que dá para limpar depende da tabela.",
    `Uso da organização no Supabase: ${INFRA_LINK_SUPABASE_USO}`,
    "",
    `Este aviso sai no máximo 1 vez por dia enquanto o uso estiver em ${cfg.alertaPct.toLocaleString("pt-BR")}% ou mais.`,
  ];
  return { subject: `[JIMPNexus KPI] Banco em ${pctTxt}% — ${infraFmtMb(banco.usado_bytes)} MB de ${limiteTxt} MB`, text: linhas.join("\n") };
};

// GET/POST /api/infra/verificar — só o pg_cron (Authorization: Bearer <o segredo da agenda>).
app.all("/api/infra/verificar", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).set("Allow", "GET, POST").json({ success: false, error: "Metodo nao permitido." });
  }
  const inicio = Date.now();
  const segredo = agendaSegredo();
  if (!segredo) return res.status(503).json({ success: false, error: "Verificador nao configurado." });
  const recebido = (String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i) || [])[1];
  if (!recebido || !agendaSegredoConfere(recebido.trim(), segredo)) {
    console.warn("[Infra] verificar recusado (segredo ausente ou diferente). ip:", clientIp(req));
    return res.status(401).json({ success: false, error: "Nao autorizado." });
  }
  // Sem SMTP não mede nem anota nada (a mesma regra do disparador da agenda).
  const smtp = agendaSmtp();
  if (!smtp) return res.status(503).json({ success: false, status: "erro", error: "E-mail nao configurado no servidor (EMAIL_HOST/EMAIL_USER/EMAIL_PASS)." });
  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ success: false, error: "Servidor nao configurado." });

  const cfg = infraConfig();
  const medida = await infraMedirBanco(admin); // sempre na hora: o alerta vê o número de agora
  if (medida.status !== "ok") {
    return res.status(medida.status === "nao_instalado" ? 200 : 502).json({ success: false, status: medida.status, motivo: medida.motivo });
  }
  const pct = infraPct(medida.banco.usado_bytes, cfg.limiteBytes);
  if (pct < cfg.alertaPct) return res.json({ success: true, status: "ok", alerta: "abaixo", pct, limite_pct: cfg.alertaPct });

  // RESERVA o dia ANTES de mandar (a chave é o dia): duas chamadas ao mesmo tempo não mandam
  // dois e-mails. Se o envio falhar, a reserva é desfeita e a próxima chamada tenta de novo.
  const dia = infraDiaJoinville(new Date());
  const { error: reservaErr } = await admin.from("infra_alerta").insert({ dia, pct });
  if (reservaErr) {
    const code = String(reservaErr.code || "");
    if (code === "23505") return res.json({ success: true, status: "ok", alerta: "ja_enviado_hoje", pct, dia });
    if (code === "PGRST205" || code === "42P01") return res.json({ success: false, status: "nao_instalado", motivo: INFRA_NAO_INSTALADO });
    console.error("[Infra] nao consegui anotar o alerta do dia:", code || "(sem código)", String(reservaErr.message || "").slice(0, 200));
    return res.status(502).json({ success: false, status: "erro", motivo: "Não consegui anotar o alerta de hoje; nada foi enviado." });
  }

  // Para quem: o e-mail CADASTRADO do Edson (pelo id, nunca pelo endereço). Sem cadastro
  // legível ou sem e-mail válido: o e-mail de notificação dele.
  let para = INFRA_EDSON_EMAIL_RESERVA;
  try {
    const { data } = (await agendaComPrazo(admin.from("users").select("email").eq("id", EDSON_ID).limit(1) as any, 2000)) as any;
    const e = String((data && data[0] && data[0].email) || "").trim();
    if (isValidEmail(e)) para = e;
  } catch (e: any) {
    console.warn("[Infra] cadastro do Edson não lido a tempo; vai para o e-mail de notificação dele:", (e && e.code) || "erro");
  }

  const { subject, text } = infraTextoAlerta(medida.banco, cfg, pct);
  const transporte = nodemailer.createTransport(agendaSmtpBase(smtp));
  try {
    await agendaComPrazo(transporte.sendMail({
      from: { name: "JIMPNexus KPI · Uso", address: smtp.from },
      to: para,
      subject,
      text,
      headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
    }), Math.max(1500, INFRA_EMAIL_PRAZO_MS - (Date.now() - inicio)));
  } catch (e: any) {
    // Só o código do erro no log: a mensagem do SMTP pode ecoar usuário/senha.
    console.error("[Infra] alerta de uso nao saiu:", (e && (e.code || e.responseCode)) || "erro");
    const { error: desfazErr } = await admin.from("infra_alerta").delete().eq("dia", dia);
    if (desfazErr) console.error("[Infra] nao consegui desfazer a reserva do dia", dia, String(desfazErr.code || ""));
    return res.status(502).json({ success: false, status: "erro", motivo: "O servidor de e-mail recusou ou não respondeu; o alerta fica para a próxima chamada." });
  } finally {
    try { transporte.close(); } catch { /* já fechado */ }
  }
  console.log(`[Infra] alerta de uso (${pct}%) enviado para ${infraMascara(para)}`);
  return res.json({ success: true, status: "ok", alerta: "enviado", pct, dia, para: infraMascara(para) });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(500).json({ success: false, error: "Erro interno." });
});

export default app;
