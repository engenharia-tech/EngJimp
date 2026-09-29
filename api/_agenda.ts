// AGENDA (29/09/2026) — o e-mail dos alertas: assunto, HTML, texto puro e o convite .ics.
//
// Funções PURAS: sem express, sem banco, sem nodemailer — quem lê a fila e manda é o
// api/index.ts (bloco AGENDA). O "_" no nome faz a Vercel NÃO publicar este arquivo como
// rota. É importado como "./_agenda.js" (o pacote é ESM na Vercel: import relativo sem
// extensão não é achado em produção; o tsc e o tsx resolvem o ".js" para este ".ts").
//
// Datas: o compromisso é DIA + HORA locais de Joinville ('AAAA-MM-DD' + 'HH:MM[:SS]' ou
// null = dia inteiro). Joinville = UTC−3 fixo (o Brasil está sem horário de verão desde
// 2019); no .ics a hora vai em UTC ("Z"). Nada aqui usa new Date('AAAA-MM-DD') (vira UTC)
// nem o fuso da máquina: dia da semana e datas saem de Date.UTC sobre os números.
//
// Segurança: TODO texto que veio do usuário (título, local, descrição, nomes) passa por
// escapeHtml no HTML e por icsTexto no .ics; o assunto vira uma linha só.

export type AgendaLembreteCodigo = '7d' | '3d' | '1d' | 'dia7h' | '1h' | '30m';
// 'removido' = a pessoa foi TIRADA da lista de participantes (decisão do Edson, 29/09 — antes
// ela recebia o 'cancelado' com os dados de agora). Leva só título, datas e dono.
export type AgendaAvisoCodigo = 'convite' | 'alterado' | 'cancelado' | 'removido';
export type AgendaCodigo = AgendaLembreteCodigo | AgendaAvisoCodigo;

// O compromisso como vem de agenda_pegar_devidos (coluna `item`, jsonb — migração 012).
export interface AgendaEmailItem {
  id: string;
  titulo: string;
  tipo: string;
  local: string | null;
  descricao: string | null;
  inicio_dia: string;          // 'AAAA-MM-DD'
  inicio_hora: string | null;  // 'HH:MM:SS' ou null = dia inteiro
  fim_dia: string;             // 'AAAA-MM-DD'
  fim_hora: string | null;     // 'HH:MM:SS' ou null
  status: string;              // 'ativo' | 'concluido' | 'cancelado'
  updated_at: string;          // timestamptz em ISO (versão da linha)
}

// Pessoa do cadastro (dono / destinatário). E-mail sempre o CADASTRADO (users.email).
export interface AgendaPessoa {
  id: string;
  nome: string;
  email: string | null;
}

// Uma linha de agenda_pegar_devidos(p_limite).
export interface AgendaDevido {
  alerta_id: number;
  codigo: AgendaCodigo;
  dispara_em: string;
  tentativas: number;
  item: AgendaEmailItem;
  dono: AgendaPessoa;
  participantes: string[];       // nomes (para mostrar no e-mail)
  destinatarios: AgendaPessoa[]; // para quem vai (e-mail cadastrado e válido, sem repetição)
}

export interface AgendaEmailInput {
  codigo: AgendaCodigo;
  item: AgendaEmailItem;
  dono: AgendaPessoa;
  participantes: string[];
  destinatarios: AgendaPessoa[];
  appUrl: string;
  teste?: boolean;
  agora?: Date;                  // a hora do ENVIO (padrão: agora): DTSTAMP do .ics e o rótulo real do lembrete
}

export interface AgendaEmail {
  subject: string;
  html: string;
  text: string;
  ics: string;
  icsFilename: string;
  // true = um destinatário não pode ver os outros (aviso 'removido': quem saiu da lista não
  // fica sabendo quem mais saiu junto). O servidor manda com o To: do próprio sistema e os
  // endereços só no envelope (como Cco).
  ocultarDestinatarios: boolean;
}

// ---- Rótulos (os MESMOS de src/agenda/agenda.ts — AGENDA_TIPOS; mudou lá, muda aqui) ----

const TIPOS: Record<string, { label: string; color: string }> = {
  viagem:  { label: 'Viagem',           color: '#8b5cf6' },
  visita:  { label: 'Visita a cliente', color: '#0ea5e9' },
  reuniao: { label: 'Reunião',          color: '#f59e0b' },
  tarefa:  { label: 'Tarefa',           color: '#10b981' },
  evento:  { label: 'Evento / feira',   color: '#ec4899' },
  outro:   { label: 'Outro',            color: '#64748b' },
};
export const tipoAgenda = (t: unknown): { label: string; color: string } =>
  Object.prototype.hasOwnProperty.call(TIPOS, String(t)) ? TIPOS[String(t)] : TIPOS.outro;
// No aviso 'removido' nem o tipo vai (pode ter mudado na mesma gravação que tirou a pessoa).
const TIPO_NEUTRO = { label: 'Compromisso', color: '#64748b' };

const LEMBRETES: AgendaLembreteCodigo[] = ['7d', '3d', '1d', 'dia7h', '1h', '30m'];
const AVISOS: AgendaAvisoCodigo[] = ['convite', 'alterado', 'cancelado', 'removido'];
const ehLembrete = (c: unknown): c is AgendaLembreteCodigo => LEMBRETES.includes(c as AgendaLembreteCodigo);
const ehCodigo = (c: unknown): c is AgendaCodigo => ehLembrete(c) || AVISOS.includes(c as AgendaAvisoCodigo);

const ROTULO_LEMBRETE: Record<AgendaLembreteCodigo, string> = {
  '7d': 'Em 7 dias', '3d': 'Em 3 dias', '1d': 'Amanhã', dia7h: 'Hoje', '1h': 'Em 1 hora', '30m': 'Em 30 minutos',
};
const NOME_LEMBRETE: Record<AgendaLembreteCodigo, string> = {
  '7d': '7 dias antes', '3d': '3 dias antes', '1d': '1 dia antes', dia7h: 'no dia, às 7h', '1h': '1 hora antes', '30m': '30 minutos antes',
};
// A distância que cada código promete (dias até o dia do compromisso / minutos até começar).
// Quando o envio sai fora disso (disparador parado, nova tentativa, virada do dia), o rótulo
// e a abertura saem da distância REAL (achado D1, 29/09).
const DIAS_DO_CODIGO: Partial<Record<AgendaLembreteCodigo, number>> = { '7d': 7, '3d': 3, '1d': 1, dia7h: 0 };
const MINUTOS_DO_CODIGO: Partial<Record<AgendaLembreteCodigo, number>> = { '1h': 60, '30m': 30 };
const FOLGA_MINUTOS = 5; // o disparador roda a cada 5 min: até 5 min de atraso ainda é "em 1 hora"

// ---- Texto ------------------------------------------------------------------

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => HTML_ESC[c]);

// Uma linha só: sem quebra nem caractere de controle (assunto, título, nomes).
export const umaLinha = (s: unknown): string =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();

// Texto de várias linhas: quebra normalizada para \n, sem os outros controles.
const variasLinhas = (s: unknown): string =>
  String(s ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, '').trim();

const cortar = (s: string, max: number): string => {
  const cs = Array.from(s);
  return cs.length > max ? `${cs.slice(0, max - 1).join('').trimEnd()}…` : s;
};

// "edson@jimp.com.br" → "e***@jimp.com.br" (o que a tela mostra de "para onde foi").
export const maskEmail = (email: unknown): string => {
  const s = String(email ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1 || at === s.length - 1) return '***';
  return `${Array.from(s)[0]}***${s.slice(at)}`;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const nomeParaCabecalho = (s: unknown): string => umaLinha(s).replace(/["<>,;\\]/g, '').trim();

// Registro de para quem saiu: "Nome <email>, Nome <email>".
export const formatarDestinatarios = (lista: AgendaPessoa[]): string =>
  lista.filter(p => p.email).map(p => {
    const n = nomeParaCabecalho(p.nome);
    return n ? `${n} <${p.email}>` : String(p.email);
  }).join(', ');

// Quem ficou SEM o e-mail por ser de fora da empresa (decisão do Edson, 29/09 à tarde — quem
// decide é o servidor, api/index.ts, agendaRecebe): para o registro da fila, SEM o endereço
// inteiro — "fora da empresa, não enviado: Nome <g***@gmail.com>". Vazio quando ninguém.
export const registroForaDaEmpresa = (fora: AgendaPessoa[]): string =>
  fora.length
    ? `fora da empresa, não enviado: ${fora.map(p => {
      const n = nomeParaCabecalho(p.nome);
      return n ? `${n} <${maskEmail(p.email)}>` : maskEmail(p.email);
    }).join(', ')}`
    : '';

// Quem RECEBEU o e-mail = quem o servidor de e-mail ACEITOU (29/09, furos A e B do 2º cético).
// O banco guarda isso no alerta (agenda_marcar_envio, p_recebeu) e é por aí que decide quem
// ganha depois o 'cancelado' e o 'removido': só quem já recebeu algum e-mail do compromisso, e
// o 'removido' com o título/datas do último que a pessoa recebeu. Conta SÓ quem está em
// info.accepted do nodemailer, casado com os destinatários pelo e-mail, sem diferenciar
// maiúscula (o nodemailer devolve o domínio em minúsculas). Quem o SMTP recusou (info.rejected)
// fica fora; quem foi cortado por ser de fora da empresa nem chega aqui (não está em `para`).
// Sem info.accepted, ninguém conta: na dúvida, "não recebeu" — o pior caso é alguém ficar sem
// um aviso, nunca receber um aviso de algo que não sabia.
const chaveEndereco = (v: unknown): string =>
  String((v && typeof v === 'object' ? (v as { address?: unknown }).address : v) ?? '').trim().toLowerCase();
export const aceitosPeloSmtp = (para: AgendaPessoa[], info: unknown): { aceitos: AgendaPessoa[]; recusados: string[] } => {
  const i = (info && typeof info === 'object' ? info : {}) as { accepted?: unknown; rejected?: unknown };
  const enderecos = (v: unknown): string[] => (Array.isArray(v) ? v : []).map(chaveEndereco).filter(Boolean);
  const aceitosSmtp = new Set(enderecos(i.accepted));
  return {
    aceitos: para.filter(p => aceitosSmtp.has(chaveEndereco(p.email))),
    recusados: Array.from(new Set(enderecos(i.rejected))),
  };
};

// Mensagem de erro curta para o registro da fila — sem senha/segredo (troca por ***).
export const mensagemCurta = (e: unknown, segredos: (string | null | undefined)[] = []): string => {
  const err = e as { code?: unknown; message?: unknown } | null;
  const code = err && err.code ? `${umaLinha(err.code)}: ` : '';
  let msg = `${code}${umaLinha((err && err.message) || e || 'falha no envio')}`;
  for (const s of segredos) {
    const t = String(s ?? '');
    if (t.length >= 4) msg = msg.split(t).join('***');
  }
  return cortar(msg || 'falha no envio', 300);
};

// O erro do SMTP em português, para a pessoa (sem detalhe técnico nem segredo).
export const smtpErroAmigavel = (e: unknown): string => {
  const code = String((e as { code?: unknown } | null)?.code || '');
  if (code === 'TIMEOUT' || code === 'ETIMEDOUT') return 'O servidor de e-mail demorou demais para responder. Tente de novo em alguns minutos.';
  if (code === 'EAUTH') return 'O servidor de e-mail recusou o login da conta do sistema. Avise o Edson (EMAIL_USER/EMAIL_PASS).';
  if (['ECONNECTION', 'ECONNREFUSED', 'ESOCKET', 'EDNS', 'ETLS', 'ECONNRESET'].includes(code)) return 'Não consegui falar com o servidor de e-mail. Tente de novo em alguns minutos.';
  if (code === 'EENVELOPE') return 'O servidor de e-mail recusou o destinatário.';
  return 'Não consegui enviar o e-mail de teste. Tente de novo em alguns minutos.';
};

// A falha do SMTP no disparador foi de UM e-mail ou do servidor INTEIRO? (achado S3, 29/09)
//  'comum'      — só deste e-mail (destinatário ou mensagem recusados: EENVELOPE, EMESSAGE…):
//                 marca a falha e segue para o próximo.
//  'fora'       — do servidor inteiro, mas pode ter sido DEPOIS de a mensagem sair (a conexão
//                 cai ou o tempo acaba depois do DATA): este gasta a tentativa (o teto de 5
//                 continua valendo — reenviar sem limite duplicaria o e-mail), a rodada PARA e
//                 o resto do lote volta ADIADO, sem gastar tentativa.
//  'fora-antes' — do servidor inteiro e com CERTEZA antes de a mensagem sair (login recusado,
//                 DNS, TLS, porta fechada, conexão que nem abriu): nem este gasta tentativa.
// Antes, cada alerta do lote tentava, falhava rápido e gastava uma tentativa: uma queda de
// ~50 min jogava em 'falhou', de vez, tudo o que venceu no intervalo (e eram 10 logins
// errados por rodada na conta de e-mail).
export type AgendaFalhaSmtp = 'comum' | 'fora' | 'fora-antes';
export const classificarFalhaSmtp = (e: unknown): AgendaFalhaSmtp => {
  const err = (e && typeof e === 'object' ? e : {}) as { code?: unknown; syscall?: unknown; message?: unknown };
  const code = String(err.code || '');
  const msg = String(err.message || '');
  if (code === 'EAUTH' || code === 'EDNS' || code === 'ETLS') return 'fora-antes';
  // O nodemailer troca o código do erro de rede por ESOCKET, mas o syscall 'connect' fica:
  // é a conexão que não abriu (ECONNREFUSED, host fora, sem rota).
  if (code === 'ESOCKET' && err.syscall === 'connect') return 'fora-antes';
  if (code === 'ETIMEDOUT' && /^(Connection timeout|Greeting never received)/.test(msg)) return 'fora-antes';
  if (['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'TIMEOUT', 'EPROTOCOL'].includes(code)) return 'fora';
  return 'comum';
};

// ---- Datas (números puros, sem fuso da máquina) ----------------------------

interface Dia { y: number; m: number; d: number }
const DIA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const p2 = (n: number) => String(n).padStart(2, '0');

const lerDia = (s: unknown): Dia | null => {
  const m = DIA_RE.exec(String(s ?? '').trim().slice(0, 10));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
};
const lerHora = (s: unknown): string | null => {
  const m = HORA_RE.exec(String(s ?? '').trim());
  return m ? `${m[1]}:${m[2]}` : null;
};
const chave = (x: Dia) => x.y * 10000 + x.m * 100 + x.d;
const maisDias = (x: Dia, n: number): Dia => {
  const t = new Date(Date.UTC(x.y, x.m - 1, x.d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const semana = (x: Dia) => SEMANA[new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay()];
// "sáb, 10/10/2026" (com ano) ou "sáb, 10/10".
const fmtDia = (x: Dia, ano: boolean) => `${semana(x)}, ${p2(x.d)}/${p2(x.m)}${ano ? `/${x.y}` : ''}`;
// Instante (ms) de um dia/hora de Joinville (UTC−3).
const instanteBR = (x: Dia, hhmm: string): number => {
  const [h, mi] = hhmm.split(':').map(Number);
  return Date.UTC(x.y, x.m - 1, x.d, h + 3, mi);
};
// O dia de Joinville de um instante (ms).
const diaBR = (ms: number): Dia => {
  const t = new Date(ms - 3 * 3600000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};
const diasEntre = (de: Dia, ate: Dia): number =>
  Math.round((Date.UTC(ate.y, ate.m - 1, ate.d) - Date.UTC(de.y, de.m - 1, de.d)) / 86400000);

type Quando = Pick<AgendaEmailItem, 'inicio_dia' | 'inicio_hora' | 'fim_dia' | 'fim_hora'>;

// Toda hora da agenda é de Joinville; quem está fora do Brasil (viagem à China, cliente na
// Noruega) precisa ler isso no texto — o .ics o calendário converte sozinho (achado D2, 29/09).
const HORARIO_BRASILIA = ' (horário de Brasília)';

// Por extenso (corpo do e-mail e avisos):
//   "sáb, 10/10/2026 → ter, 20/10/2026 (dia inteiro)" · "sex, 09/10/2026 · 14:00–15:30 (horário de Brasília)"
//   "sex, 09/10/2026 (dia inteiro)" · "sex, 09/10/2026 14:00 → dom, 11/10/2026 18:00 (horário de Brasília)"
// Curto (assunto dos lembretes, que são de poucos dias): sem ano, sem "(dia inteiro)" e sem
// o fuso (o corpo diz).
export const quandoTexto = (it: Quando, curto = false): string => {
  const di = lerDia(it.inicio_dia);
  if (!di) return umaLinha(it.inicio_dia);
  const df0 = lerDia(it.fim_dia);
  const df = df0 && chave(df0) > chave(di) ? df0 : di;
  const hi = lerHora(it.inicio_hora);
  const hf = hi ? lerHora(it.fim_hora) : null;
  const ano = !curto;
  const fim = curto ? '' : hi ? HORARIO_BRASILIA : ' (dia inteiro)';
  if (chave(df) > chave(di)) {
    return `${fmtDia(di, ano)}${hi ? ` ${hi}` : ''} → ${fmtDia(df, ano)}${hf ? ` ${hf}` : ''}${fim}`;
  }
  if (!hi) return `${fmtDia(di, ano)}${fim}`;
  return `${fmtDia(di, ano)} · ${hi}${hf && hf !== hi ? `–${hf}` : ''}${fim}`;
};

const minutosTexto = (n: number): string => {
  if (n < 60) return `${n} ${n === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h} ${h === 1 ? 'hora' : 'horas'}${m ? ` e ${m} ${m === 1 ? 'minuto' : 'minutos'}` : ''}`;
};

// Rótulo ("Amanhã, 14:00", "Em 1 hora"…) e frase de abertura do lembrete. Pelo CÓDIGO quando
// o envio sai na hora prevista; pela distância REAL até o compromisso quando não sai (fila
// parada, nova tentativa, a rodada das 00:00 mandando o "1 dia antes" já no dia) — antes o
// texto vinha sempre do código e um atraso virava e-mail falso (achado D1, 29/09).
const textoLembrete = (codigo: AgendaLembreteCodigo, it: Quando, agoraMs: number, real: boolean): { rotulo: string; abertura: string } => {
  const di = lerDia(it.inicio_dia);
  const dfx = lerDia(it.fim_dia);
  const hi = lerHora(it.inicio_hora);
  const comeca = di && dfx && chave(dfx) > chave(di) ? 'Começa' : 'É';
  const emDias = (n: number) => {
    if (n === 0) return { rotulo: `Hoje${hi ? `, ${hi}` : ''}`, abertura: `${comeca} hoje${hi ? `, às ${hi}` : ''}.` };
    if (n === 1) return { rotulo: `Amanhã${hi ? `, ${hi}` : ''}`, abertura: `${comeca} amanhã${hi ? `, às ${hi}` : ''}.` };
    return { rotulo: `Em ${n} dias`, abertura: `Faltam ${n} dias para este compromisso.` };
  };
  const emMinutos = (n: number) => (n <= 0
    ? { rotulo: 'Agora', abertura: `Começa agora${hi ? ` (às ${hi})` : ''}.` }
    : { rotulo: `Em ${minutosTexto(n)}`, abertura: `Começa em ${minutosTexto(n)}${hi ? ` (às ${hi})` : ''}.` });

  if (real && di) {
    const diasAte = diasEntre(diaBR(agoraMs), di);
    const minAte = hi ? Math.round((instanteBR(di, hi) - agoraMs) / 60000) : null;
    const minCodigo = MINUTOS_DO_CODIGO[codigo];
    const diasCodigo = DIAS_DO_CODIGO[codigo];
    if (minCodigo !== undefined && minAte !== null && Math.abs(minAte - minCodigo) > FOLGA_MINUTOS) {
      if (minAte < 180) return emMinutos(minAte);
      if (diasAte >= 0) return emDias(diasAte);
    }
    if (diasCodigo !== undefined && diasAte >= 0 && diasAte !== diasCodigo) return emDias(diasAte);
  }
  // Pelo código (o envio saiu na hora certa).
  if (codigo === '7d') return { rotulo: ROTULO_LEMBRETE[codigo], abertura: 'Faltam 7 dias para este compromisso.' };
  if (codigo === '3d') return { rotulo: ROTULO_LEMBRETE[codigo], abertura: 'Faltam 3 dias para este compromisso.' };
  if (codigo === '1d') return emDias(1);
  if (codigo === 'dia7h') return emDias(0);
  if (codigo === '1h') return { rotulo: ROTULO_LEMBRETE[codigo], abertura: `Começa em 1 hora${hi ? ` (às ${hi})` : ''}.` };
  return { rotulo: ROTULO_LEMBRETE[codigo], abertura: `Começa em 30 minutos${hi ? ` (às ${hi})` : ''}.` };
};

// ---- .ics (RFC 5545) --------------------------------------------------------

// TEXT: escapa \ ; , e quebra de linha; tira caractere de controle (menos TAB).
export const icsTexto = (s: unknown): string =>
  variasLinhas(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const octetos = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

// Dobra em 75 OCTETOS (UTF-8), sem partir um caractere nem uma sequência de escape
// ("\n", "\;"): a continuação começa com um espaço, que conta nos 75.
export const icsDobrar = (linha: string): string => {
  const partes: string[] = [];
  let atual = '';
  let n = 0;      // octetos da linha atual (o espaço da continuação conta)
  let toks = 0;   // pedaços de conteúdo na linha atual
  for (const tok of linha.match(/\\[\s\S]|[\s\S]/gu) || []) {
    let b = 0;
    for (const ch of tok) b += octetos(ch.codePointAt(0) as number);
    if (n + b > 75 && toks > 0) {
      partes.push(atual);
      atual = ' ';
      n = 1;
      toks = 0;
    }
    atual += tok;
    n += b;
    toks++;
  }
  partes.push(atual);
  return partes.join('\r\n');
};

const icsUtc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261009T170000Z
const icsData = (x: Dia) => `${String(x.y).padStart(4, '0')}${p2(x.m)}${p2(x.d)}`;
// STATUS:CANCELLED no .ics: o compromisso foi cancelado, OU a pessoa saiu da lista
// ('removido') — nos dois casos ele tem de sair do calendário dela.
const ehCancelado = (codigo: AgendaCodigo, item: AgendaEmailItem) =>
  codigo === 'cancelado' || codigo === 'removido' || item.status === 'cancelado';

const buildIcs = (i: AgendaEmailInput, agoraMs: number, descricao: string): string => {
  const it = i.item;
  const uid = String(it.id || '').replace(/[^A-Za-z0-9-]/g, '') || 'sem-id';
  const upMs = Date.parse(String(it.updated_at || ''));
  const seq = Number.isFinite(upMs) ? Math.max(0, (upMs / 1000) | 0) : 0;
  const di = lerDia(it.inicio_dia) || (() => {
    const t = new Date(agoraMs - 3 * 3600000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  })();
  const df0 = lerDia(it.fim_dia);
  const df = df0 && chave(df0) > chave(di) ? df0 : di;
  const hi = lerHora(it.inicio_hora);
  const hf = hi ? lerHora(it.fim_hora) : null;

  const datas: string[] = [];
  if (hi) {
    const ini = instanteBR(di, hi);
    let fim: number;
    if (hf) fim = instanteBR(df, hf);
    else if (chave(df) > chave(di)) fim = instanteBR(df, '23:59'); // vários dias sem hora de fim
    else fim = ini + 3600000;                                       // mesmo dia sem hora de fim: 1 h
    if (!(fim > ini)) fim = ini + 3600000;
    datas.push(`DTSTART:${icsUtc(ini)}`, `DTEND:${icsUtc(fim)}`);
  } else {
    // Dia inteiro: DTEND é EXCLUSIVO (o dia seguinte ao último).
    datas.push(`DTSTART;VALUE=DATE:${icsData(di)}`, `DTEND;VALUE=DATE:${icsData(maisDias(df, 1))}`);
  }

  const local = umaLinha(it.local);
  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JIMPNexus KPI//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@kpieng.jimpnexus.com`,
    `DTSTAMP:${icsUtc(agoraMs)}`,
    ...(Number.isFinite(upMs) ? [`LAST-MODIFIED:${icsUtc(upMs)}`] : []),
    `SEQUENCE:${seq}`,
    ...datas,
    `SUMMARY:${icsTexto(umaLinha(it.titulo) || 'Compromisso')}`,
    ...(local ? [`LOCATION:${icsTexto(local)}`] : []),
    `DESCRIPTION:${icsTexto(descricao)}`,
    `URL:${i.appUrl}`,
    `STATUS:${ehCancelado(i.codigo, it) ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return linhas.map(icsDobrar).join('\r\n') + '\r\n';
};

const nomeArquivo = (titulo: string): string => {
  const slug = titulo.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return `agenda-${slug || 'compromisso'}.ics`;
};

// ---- O e-mail ---------------------------------------------------------------

const FONTE = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";
const APP_URL_PADRAO = 'https://kpieng.jimpnexus.com';

export const buildAgendaEmail = (input: AgendaEmailInput): AgendaEmail => {
  const codigo: AgendaCodigo = ehCodigo(input.codigo) ? input.codigo : '1d';
  const semCodigoConhecido = !ehCodigo(input.codigo);
  const it = input.item;
  const teste = !!input.teste;
  const agoraMs = (input.agora || new Date()).getTime();
  const appUrl = /^https?:\/\/[^\s"'<>\\]+$/i.test(String(input.appUrl || '').trim())
    ? String(input.appUrl).trim()
    : APP_URL_PADRAO;

  const cancelado = ehCancelado(codigo, it);
  // Quem foi TIRADO da lista ('removido' — P1/S2, decisão do Edson, 29/09) recebe SÓ o que já
  // conhecia: título, datas e de quem é a agenda. Nada de local, descrição, participantes nem
  // tipo — o dono pode ter gravado isso na mesma gravação que tirou a pessoa (ou depois,
  // enquanto o aviso estava na fila). O 012 já manda o 'removido' só com o que ela sabia; o
  // corte aqui é a segunda trava. O 'cancelado' de compromisso NÃO cancelado é o mesmo caso:
  // é o de um compromisso reaberto antes do disparo, e o 012 (agenda_pegar_devidos) o deixa
  // só para quem ficou FORA da lista — quem continua recebe o convite da reabertura.
  const removido = codigo === 'removido' || (codigo === 'cancelado' && it.status !== 'cancelado');
  const titulo = umaLinha(it.titulo) || 'Compromisso';
  const tipo = removido ? TIPO_NEUTRO : tipoAgenda(it.tipo);
  const local = removido ? '' : umaLinha(it.local);
  const descricao = removido ? '' : variasLinhas(it.descricao);
  const donoNome = umaLinha(input.dono && input.dono.nome) || 'um usuário do JIMPNexus';
  const participantes = removido ? [] : (Array.isArray(input.participantes) ? input.participantes : []).map(umaLinha).filter(Boolean);
  const quando = quandoTexto(it);
  const quandoCurto = quandoTexto(it, true);
  const hi = lerHora(it.inicio_hora);

  // Rótulo e abertura do lembrete: "Amanhã, 14:00", "Hoje", "Em 1 hora"… pela distância real
  // na hora do envio quando ela não bate com o código (no TESTE, sempre o do código). Código
  // fora da lista — não deveria existir, o banco tem CHECK — vira um "Lembrete" genérico.
  let rotulo = '';
  let aberturaLembrete = '';
  if (ehLembrete(codigo)) {
    if (semCodigoConhecido) {
      rotulo = 'Lembrete';
      aberturaLembrete = 'Lembrete automático da sua agenda.';
    } else {
      const t = textoLembrete(codigo, it, agoraMs, !teste);
      rotulo = t.rotulo;
      aberturaLembrete = t.abertura;
    }
  }

  // Assunto (uma linha, sem emoji).
  const tituloAssunto = cortar(titulo, 120);
  let base: string;
  if (ehLembrete(codigo)) base = `${rotulo}: ${tituloAssunto} (${quandoCurto})`;
  else if (codigo === 'convite') base = `Convite: ${tituloAssunto} — ${quando}`;
  else if (codigo === 'alterado') base = `Alterado: ${tituloAssunto} — agora ${quando}`;
  else if (removido) base = `Removido: ${tituloAssunto} (${quando})`;
  else base = `Cancelado: ${tituloAssunto} (${quando})`;
  const subject = cortar(umaLinha(`${teste ? '[TESTE] ' : ''}Agenda · ${base}`), 250);

  // Manchete e a frase de abertura.
  let manchete: string;
  let abertura: string;
  if (ehLembrete(codigo)) {
    manchete = semCodigoConhecido ? 'Lembrete' : `Lembrete · ${rotulo}`;
    abertura = aberturaLembrete;
  } else if (codigo === 'convite') {
    manchete = 'Convite para um compromisso';
    abertura = `${donoNome} incluiu você como participante deste compromisso.`;
  } else if (codigo === 'alterado') {
    manchete = 'Compromisso alterado';
    abertura = `${donoNome} alterou este compromisso. Os dados abaixo já são os novos.`;
  } else if (removido) {
    manchete = 'Você saiu da lista de participantes';
    abertura = `${donoNome} tirou você da lista de participantes deste compromisso — você não receberá mais os avisos dele.`;
  } else {
    manchete = 'Compromisso cancelado';
    abertura = `${donoNome} cancelou este compromisso.`;
  }
  // No teste a data pode estar longe: a abertura diz que é um exemplo (o assunto e a
  // manchete ficam iguais aos do lembrete de verdade, para a pessoa ver como chega).
  if (teste && ehLembrete(codigo) && !semCodigoConhecido) {
    abertura = `Exemplo do lembrete "${NOME_LEMBRETE[codigo]}" deste compromisso. Na hora certa ele diz: "${abertura}"`;
  }

  // Por que a pessoa recebe (o e-mail vai junto para todos os destinatários).
  const destinos = (Array.isArray(input.destinatarios) ? input.destinatarios : []).map(p => ({
    nome: umaLinha(p.nome) || 'sem nome',
    papel: input.dono && p.id && p.id === input.dono.id ? 'dono' : 'participante',
  }));
  let porque: string;
  if (teste) {
    porque = `E-mail de TESTE, pedido por você na Agenda e enviado só para o seu e-mail cadastrado. É assim que chega o lembrete "${NOME_LEMBRETE['1d']}"; os dados são os de agora.`;
  } else if (ehLembrete(codigo)) {
    porque = 'Você recebe este lembrete porque é o dono deste compromisso ou foi incluído nele como participante. Os lembretes são escolhidos no próprio compromisso, na Agenda.';
  } else if (removido) {
    porque = 'Você recebe este aviso porque estava na lista de participantes deste compromisso. Não receberá mais os e-mails dele.';
  } else if (codigo === 'cancelado') {
    porque = 'Você recebe este aviso porque estava na lista de participantes deste compromisso.';
  } else {
    porque = 'Você recebe este aviso porque está na lista de participantes deste compromisso.';
  }
  // A agenda é privada (decisão do Edson, 29/09): só o dono (e o Edson) vê o compromisso no
  // app — o participante NÃO o encontra lá. Dizer isso a quem recebe como participante
  // (a quem saiu da lista, não: ele não recebe mais nada).
  if (!teste && !removido && (participantes.length > 0 || !ehLembrete(codigo))) {
    porque += ` O compromisso fica na agenda de ${donoNome}; os participantes não o veem no app — recebem estes e-mails${cancelado ? '.' : ', e o arquivo .ics anexo o põe no seu calendário.'}`;
  }
  // Quem saiu da lista não vê quem mais recebeu (nem quem mais saiu junto).
  const enviadoPara = !teste && !removido && destinos.length ? destinos.map(d => `${d.nome} (${d.papel})`).join(' · ') : '';
  // O .ics: cancelado/removido tira do calendário; o resto põe — e a hora, lá, já vem
  // convertida para o fuso de quem abre (achado D2).
  const automatico = `Alerta automático do JIMPNexus KPI — não responda este e-mail. ${cancelado
    ? 'O arquivo .ics anexo tira o compromisso do seu calendário.'
    : `O arquivo .ics anexo põe o compromisso no seu calendário.${hi ? ' No calendário, o .ics mostra a hora já convertida para o seu fuso.' : ''}`}`;
  // O botão: o participante não encontra o compromisso no app (a agenda é privada), então
  // fora do teste ele só abre o sistema (achado T8). No teste quem recebe é o dono ou o Edson.
  const rotuloLink = teste ? 'Abrir a agenda' : 'Abrir o JIMPNexus KPI';

  // ---- HTML (tabelas + estilo inline, 600 px, funciona no Outlook) ----
  const campo = (rotuloCampo: string, valorHtml: string) => `
                <tr><td style="padding:12px 0 0 0;">
                  <div style="font-family:${MONO};font-size:10px;line-height:14px;letter-spacing:2px;text-transform:uppercase;color:#64748b;">${escapeHtml(rotuloCampo)}</div>
                  <div style="font-family:${FONTE};font-size:15px;line-height:22px;color:#0f172a;">${valorHtml}</div>
                </td></tr>`;
  const campos = [
    campo('Quando', escapeHtml(quando)),
    local ? campo('Local', escapeHtml(local)) : '',
    descricao ? campo('Descrição', escapeHtml(descricao).replace(/\n/g, '<br>')) : '',
    campo('Agenda de', escapeHtml(donoNome)),
    participantes.length ? campo('Participantes', escapeHtml(participantes.join(', '))) : '',
  ].join('');
  const seloCancelado = cancelado
    ? `&nbsp;&nbsp;<span style="display:inline-block;padding:1px 6px;font-family:${MONO};font-size:10px;letter-spacing:1px;color:#b91c1c;background:#fee2e2;border:1px solid #fecaca;">${removido ? 'FORA DA LISTA' : 'CANCELADO'}</span>`
    : '';
  const faixaTeste = teste
    ? `
          <tr><td bgcolor="#fef3c7" style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 28px;font-family:${FONTE};font-size:13px;line-height:19px;color:#92400e;">
            <span style="font-family:${MONO};font-size:10px;letter-spacing:2px;">E-MAIL DE TESTE</span><br>
            Pedido por você na Agenda. Só você recebeu; os participantes não.
          </td></tr>`
    : '';
  const preheader = `${ehLembrete(codigo) ? `${rotulo} — ` : ''}${titulo}${local ? ` · ${local}` : ''}`;
  const urlHtml = escapeHtml(appUrl);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f1f5f9;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background:#f1f5f9;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr><td bgcolor="#0f172a" style="background:#0f172a;border-left:4px solid #f97316;padding:20px 28px;">
          <div style="font-family:${MONO};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#f97316;">JIMPNEXUS KPI · AGENDA</div>
          <div style="font-family:${FONTE};font-size:20px;line-height:28px;font-weight:bold;color:#ffffff;padding-top:6px;">${escapeHtml(manchete)}</div>
        </td></tr>${faixaTeste}
        <tr><td bgcolor="#ffffff" style="background:#ffffff;padding:22px 28px 26px 28px;">
          <div style="font-family:${FONTE};font-size:15px;line-height:22px;color:#334155;padding-bottom:16px;">${escapeHtml(abertura)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;">
            <tr>
              <td width="6" bgcolor="${tipo.color}" style="width:6px;background:${tipo.color};font-size:0;line-height:0;">&nbsp;</td>
              <td style="padding:16px 20px 18px 20px;">
                <div style="font-family:${MONO};font-size:10px;line-height:14px;letter-spacing:2px;text-transform:uppercase;color:#475569;"><span style="color:${tipo.color};">&#9679;</span>&nbsp;${escapeHtml(tipo.label)}${seloCancelado}</div>
                <div style="font-family:${FONTE};font-size:20px;line-height:27px;font-weight:bold;color:#0f172a;padding-top:4px;${cancelado && !removido ? 'text-decoration:line-through;' : ''}">${escapeHtml(titulo)}</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${campos}
                </table>
              </td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;">
            <tr><td bgcolor="#c2410c" style="background:#c2410c;mso-padding-alt:12px 22px;">
              <a href="${urlHtml}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONTE};font-size:14px;line-height:18px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(rotuloLink)} &rarr;</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td bgcolor="#f8fafc" style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px 20px 28px;font-family:${FONTE};font-size:12px;line-height:18px;color:#64748b;">
          ${escapeHtml(porque)}${enviadoPara ? `<br>Enviado para: ${escapeHtml(enviadoPara)}.` : ''}<br>${escapeHtml(automatico)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
`;

  // ---- Texto puro (a mesma informação) ----
  const txt: string[] = ['JIMPNEXUS KPI · AGENDA', manchete, ''];
  if (teste) txt.push('*** E-MAIL DE TESTE — pedido por você na Agenda. Só você recebeu; os participantes não. ***', '');
  txt.push(abertura, '');
  txt.push(`${tipo.label.toUpperCase()}${cancelado ? (removido ? ' · FORA DA LISTA' : ' · CANCELADO') : ''}`);
  txt.push(titulo, '');
  txt.push(`Quando: ${quando}`);
  if (local) txt.push(`Local: ${local}`);
  if (descricao) txt.push('Descrição:', descricao);
  txt.push(`Agenda de: ${donoNome}`);
  if (participantes.length) txt.push(`Participantes: ${participantes.join(', ')}`);
  txt.push('', `${rotuloLink}: ${appUrl}`, '', '--', porque);
  if (enviadoPara) txt.push(`Enviado para: ${enviadoPara}.`);
  txt.push(automatico);
  const text = txt.join('\n') + '\n';

  // ---- .ics ----
  const descIcs = [
    descricao,
    `Agenda de ${donoNome}`,
    participantes.length ? `Participantes: ${participantes.join(', ')}` : '',
    `${rotuloLink}: ${appUrl}`,
  ].filter(Boolean).join('\n\n');
  // O local cortado vai também para o .ics (LOCATION) — no 'removido' ele não sai.
  const ics = buildIcs({ ...input, item: { ...it, local }, codigo, appUrl }, agoraMs, descIcs);

  return { subject, html, text, ics, icsFilename: nomeArquivo(titulo), ocultarDestinatarios: removido };
};

// ---- A linha da fila (agenda_pegar_devidos) → objeto conferido -------------

const objeto = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try { const o = JSON.parse(v); if (o && typeof o === 'object' && !Array.isArray(o)) return o; } catch { /* segue vazio */ }
  }
  return {};
};
const lista = (v: unknown): unknown[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const a = JSON.parse(v); if (Array.isArray(a)) return a; } catch { /* vazio */ } }
  return [];
};
const textoOuNulo = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

// Devolve null só quando nem o id do alerta dá para ler (aí não há como marcar).
// Destinatário sem e-mail válido sai da lista; e-mail repetido também.
export const normalizarDevido = (r: unknown): AgendaDevido | null => {
  const row = objeto(r);
  const alertaId = Number(row.alerta_id);
  if (!Number.isFinite(alertaId) || alertaId <= 0) return null;
  const it = objeto(row.item);
  const dono = objeto(row.dono);
  const vistos = new Set<string>();
  const destinatarios: AgendaPessoa[] = [];
  for (const x of lista(row.destinatarios)) {
    const p = objeto(x);
    const email = String(p.email ?? '').trim();
    if (!EMAIL_RE.test(email) || vistos.has(email.toLowerCase())) continue;
    vistos.add(email.toLowerCase());
    destinatarios.push({ id: String(p.id ?? ''), nome: umaLinha(p.nome), email });
  }
  return {
    alerta_id: alertaId,
    codigo: String(row.codigo ?? '') as AgendaCodigo, // fora da lista: o e-mail sai como "Lembrete"
    dispara_em: String(row.dispara_em ?? ''),
    tentativas: Number(row.tentativas) || 0,
    item: {
      id: String(it.id ?? ''),
      titulo: String(it.titulo ?? ''),
      tipo: String(it.tipo ?? 'outro'),
      local: textoOuNulo(it.local),
      descricao: textoOuNulo(it.descricao),
      inicio_dia: String(it.inicio_dia ?? ''),
      inicio_hora: textoOuNulo(it.inicio_hora),
      fim_dia: String(it.fim_dia ?? it.inicio_dia ?? ''),
      fim_hora: textoOuNulo(it.fim_hora),
      status: String(it.status ?? 'ativo'),
      updated_at: String(it.updated_at ?? ''),
    },
    dono: { id: String(dono.id ?? ''), nome: umaLinha(dono.nome), email: textoOuNulo(dono.email) },
    participantes: lista(row.participantes).map(umaLinha).filter(Boolean),
    destinatarios,
  };
};
