// AGENDA dos usuários do OKR (29/09/2026) — tipos e regras puras (sem rede).
//
// Pedido do Edson: compromissos futuros (viagem para a China, visita a cliente, reunião no
// dia tal) numa visão parecida com a linha do tempo do OKR, SEPARADA dele, com alerta por
// e-mail para os e-mails cadastrados. A regra de quem vê/grava e a fila de e-mails moram
// no banco (supabase/migrations/012_agenda.sql); aqui só o que a tela precisa saber.
//
// Datas: o compromisso é gravado em DIA + HORA LOCAIS de Joinville (America/Sao_Paulo),
// nunca como instante do navegador — "10/10 às 14:00" é o mesmo para todo mundo.

export type AgendaTipo = 'viagem' | 'visita' | 'reuniao' | 'tarefa' | 'evento' | 'outro';
export type AgendaStatus = 'ativo' | 'concluido' | 'cancelado';
export type AgendaLembrete = '7d' | '3d' | '1d' | 'dia7h' | '1h' | '30m';
export type AgendaAvisoCodigo = 'convite' | 'alterado' | 'cancelado' | 'removido';
export type AgendaAlertaCodigo = AgendaLembrete | AgendaAvisoCodigo;
export type AgendaAlertaEstado = 'pendente' | 'enviando' | 'enviado' | 'falhou' | 'expirado' | 'sem_destinatario';

export interface AgendaItem {
  id: string;
  ownerId: string;
  titulo: string;
  tipo: AgendaTipo;
  local: string;            // '' = sem local
  descricao: string;        // '' = sem descrição
  inicioDia: string;        // 'AAAA-MM-DD'
  inicioHora: string | null; // 'HH:MM' ou null = dia inteiro
  fimDia: string;           // 'AAAA-MM-DD' (>= inicioDia)
  fimHora: string | null;   // 'HH:MM' ou null (só existe com inicioHora)
  participantes: string[];  // ids de usuários cadastrados (nunca o dono)
  alertas: AgendaLembrete[];
  status: AgendaStatus;
  criadoEm: string;
  updatedAt: string;        // versão: gravação só passa se ainda for esta
}

// O que a tela manda para criar/editar (o banco carimba dono, criação e versão).
export interface AgendaItemInput {
  titulo: string;
  tipo: AgendaTipo;
  local: string;
  descricao: string;
  inicioDia: string;
  inicioHora: string | null;
  fimDia: string;
  fimHora: string | null;
  participantes: string[];
  alertas: AgendaLembrete[];
  status: AgendaStatus;
}

export interface AgendaAlerta {
  id: number;
  itemId: string;
  codigo: AgendaAlertaCodigo;
  disparaEm: string;        // ISO (instante)
  estado: AgendaAlertaEstado;
  tentativas: number;
  enviadoEm: string | null;
  destinatarios: string;    // para quem saiu (registro)
  erro: string;
}

// ---- Rótulos e cores ------------------------------------------------------

export const AGENDA_TIPOS: { id: AgendaTipo; label: string; plural: string; color: string }[] = [
  { id: 'viagem',  label: 'Viagem',            plural: 'Viagens',             color: '#8b5cf6' },
  { id: 'visita',  label: 'Visita a cliente',  plural: 'Visitas a clientes',  color: '#0ea5e9' },
  { id: 'reuniao', label: 'Reunião',           plural: 'Reuniões',            color: '#f59e0b' },
  { id: 'tarefa',  label: 'Tarefa',            plural: 'Tarefas',             color: '#10b981' },
  { id: 'evento',  label: 'Evento / feira',    plural: 'Eventos e feiras',    color: '#ec4899' },
  { id: 'outro',   label: 'Outro',             plural: 'Outros',              color: '#64748b' },
];
export const tipoInfo = (t: string) => AGENDA_TIPOS.find(x => x.id === t) || AGENDA_TIPOS[AGENDA_TIPOS.length - 1];

export const AGENDA_LEMBRETES: { id: AgendaLembrete; label: string; curto: string; soComHora: boolean }[] = [
  { id: '7d',    label: '7 dias antes',        curto: '7 d',   soComHora: false },
  { id: '3d',    label: '3 dias antes',        curto: '3 d',   soComHora: false },
  { id: '1d',    label: '1 dia antes',         curto: '1 d',   soComHora: false },
  { id: 'dia7h', label: 'No dia, às 7h',       curto: 'dia 7h', soComHora: false },
  { id: '1h',    label: '1 hora antes',        curto: '1 h',   soComHora: true },
  { id: '30m',   label: '30 minutos antes',    curto: '30 min', soComHora: true },
];
// Decisão do Edson (29/09): o padrão de um compromisso novo.
export const AGENDA_ALERTAS_PADRAO: AgendaLembrete[] = ['1d', 'dia7h', '1h'];

export const AGENDA_CODIGO_LABEL: Record<AgendaAlertaCodigo, string> = {
  '7d': '7 dias antes', '3d': '3 dias antes', '1d': '1 dia antes', dia7h: 'no dia, às 7h', '1h': '1 hora antes', '30m': '30 minutos antes',
  convite: 'convite aos participantes', alterado: 'aviso de alteração', cancelado: 'aviso de cancelamento',
  removido: 'aviso de remoção da lista',
};
export const AGENDA_ESTADO_LABEL: Record<AgendaAlertaEstado, string> = {
  pendente: 'agendado', enviando: 'enviando', enviado: 'enviado', falhou: 'falhou',
  expirado: 'não saiu a tempo', sem_destinatario: 'ninguém com e-mail',
};
export const STATUS_LABEL: Record<AgendaStatus, string> = { ativo: 'Ativo', concluido: 'Concluído', cancelado: 'Cancelado' };

// ---- Quem RECEBE o e-mail da agenda (decisão do Edson, 29/09 à tarde) -------
// Só endereços da EMPRESA — a mesma trava do /api/send-email (recipientAllowed +
// configuredRecipients em api/index.ts): os domínios abaixo, MAIS os endereços escritos em
// Configurações (settings: email_to, interruption_email_to, email_from) — e o e-mail do
// Edson, qualquer que seja (pelo ID, nunca pelo endereço). Motivo: o "Meu Perfil" troca o
// e-mail sem senha, e a conta oficial não pode virar canal de texto livre para fora.
// ⚠ Quem decide é o SERVIDOR. A tela da agenda NÃO recebe os endereços de Configurações:
// um e-mail de fora que por acaso esteja liberado lá é avisado a mais aqui (caso raro) —
// por isso os avisos da tela dizem "provavelmente não recebe".
export const AGENDA_EDSON_ID = '1e570c78-7278-4e8d-a90e-a820c11bb07a';
export const AGENDA_EMAIL_DOMINIOS: readonly string[] = ['jimp.com.br', 'joinvilleimplementos.com.br', 'furgoesjoinville.com.br'];
// true = a regra do domínio deixa este e-mail receber. O Edson (pelo id) sempre true — se ele
// estiver SEM e-mail, quem avisa é o "tem e-mail" (temEmail), não esta função.
export const emailRecebeAlerta = (email: string | null | undefined, userId?: string | null): boolean => {
  if (String(userId || '').trim().toLowerCase() === AGENDA_EDSON_ID) return true;
  const a = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a)) return false;
  return AGENDA_EMAIL_DOMINIOS.includes(a.split('@')[1]);   // domínio exato (subdomínio não vale), como o servidor
};

// ---- Datas (dia/hora locais de Joinville) ----------------------------------

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::\d{2}(?:\.\d+)?)?$/;

// 'AAAA-MM-DD' → Date à meia-noite LOCAL do navegador (para desenhar no eixo). null se inválido.
export const parseDay = (s: string | null | undefined): Date | null => {
  const m = DAY_RE.exec(String(s || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
};
export const toDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 'HH:MM[:SS]' → 'HH:MM', ou null.
export const normHour = (s: string | null | undefined): string | null => {
  const m = HOUR_RE.exec(String(s || '').trim());
  return m ? `${m[1]}:${m[2]}` : null;
};
export const addDaysStr = (day: string, n: number): string => {
  const d = parseDay(day); if (!d) return day;
  return toDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
export const dayDiffStr = (a: string, b: string): number => {
  const da = parseDay(a), db = parseDay(b); if (!da || !db) return 0;
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
};
// Hoje em Joinville ('AAAA-MM-DD'), qualquer que seja o fuso do navegador.
export const todayBR = (now: Date = new Date()): string => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t: string) => p.find(x => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
};

// Instante de um dia/hora de Joinville. O Brasil está sem horário de verão desde 2019
// (UTC−3 fixo); o banco usa o nome do fuso (America/Sao_Paulo) e é quem manda — isto
// aqui só serve para PREVER na tela.
export const brInstant = (day: string, hour: string | null): Date | null => {
  const m = DAY_RE.exec(day); if (!m) return null;
  const h = normHour(hour) || '00:00';
  const [hh, mm] = h.split(':').map(Number);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], hh + 3, mm));
};

// Quando cada lembrete dispara — a MESMA regra de agenda_momento_alerta (012).
export const momentoAlerta = (codigo: AgendaLembrete, dia: string, hora: string | null): Date | null => {
  const h = normHour(hora);
  if (!h) {
    const at7 = (n: number) => brInstant(addDaysStr(dia, -n), '07:00');
    if (codigo === '7d') return at7(7);
    if (codigo === '3d') return at7(3);
    if (codigo === '1d') return at7(1);
    if (codigo === 'dia7h') return at7(0);
    return null;
  }
  const base = brInstant(dia, h); if (!base) return null;
  const minus = (min: number) => new Date(base.getTime() - min * 60000);
  switch (codigo) {
    case '7d': return minus(7 * 1440);
    case '3d': return minus(3 * 1440);
    case '1d': return minus(1440);
    case 'dia7h': return h > '07:00' ? brInstant(dia, '07:00') : null;
    case '1h': return minus(60);
    case '30m': return minus(30);
  }
  return null;
};

// Prévia dos lembretes que vão sair (os que ainda estão no futuro), já sem repetição de
// minuto — mesma regra do gatilho (fica o mais próximo do compromisso).
export const previewAlertas = (item: Pick<AgendaItemInput, 'inicioDia' | 'inicioHora' | 'alertas' | 'status'>, now: Date = new Date()): { codigo: AgendaLembrete; quando: Date }[] => {
  if (item.status !== 'ativo') return [];
  const ordem: AgendaLembrete[] = ['30m', '1h', 'dia7h', '1d', '3d', '7d'];
  const out: { codigo: AgendaLembrete; quando: Date }[] = [];
  const seen = new Set<number>();
  [...item.alertas].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)).forEach(c => {
    const q = momentoAlerta(c, item.inicioDia, item.inicioHora);
    if (!q || q.getTime() <= now.getTime() || seen.has(q.getTime())) return;
    seen.add(q.getTime()); out.push({ codigo: c, quando: q });
  });
  return out.sort((a, b) => a.quando.getTime() - b.quando.getTime());
};

// ---- Formatação ------------------------------------------------------------

const fmtD = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
const fmtDLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
export const fmtDay = (day: string): string => { const d = parseDay(day); return d ? fmtD.format(d) : day; };
export const fmtDayLong = (day: string): string => { const d = parseDay(day); return d ? fmtDLong.format(d).replace(/\.,?/g, '').replace(/\s+/g, ' ') : day; };
export const fmtInstantBR = (d: Date | string): string => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(x);
};
// "10/10/26 · 14:00–15:30", "10/10/26 → 20/10/26", "10/10/26 (dia inteiro)".
export const fmtQuando = (it: Pick<AgendaItem, 'inicioDia' | 'inicioHora' | 'fimDia' | 'fimHora'>): string => {
  const hi = normHour(it.inicioHora), hf = normHour(it.fimHora);
  if (it.fimDia && it.fimDia !== it.inicioDia) {
    return `${fmtDay(it.inicioDia)}${hi ? ` ${hi}` : ''} → ${fmtDay(it.fimDia)}${hf ? ` ${hf}` : ''}`;
  }
  if (!hi) return `${fmtDay(it.inicioDia)} (dia inteiro)`;
  return `${fmtDay(it.inicioDia)} · ${hi}${hf ? `–${hf}` : ''}`;
};
// "hoje", "amanhã", "em 12 dias", "há 3 dias" (em relação a hoje em Joinville).
export const fmtFalta = (day: string, hoje: string = todayBR()): string => {
  const n = dayDiffStr(hoje, day);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n === -1) return 'ontem';
  return n > 0 ? `em ${n} dias` : `há ${-n} dias`;
};

// ---- Linha do banco ↔ objeto da tela ---------------------------------------

export const AGENDA_ITEM_COLS = 'id, owner_id, titulo, tipo, local, descricao, inicio_dia, inicio_hora, fim_dia, fim_hora, participantes, alertas, status, criado_em, updated_at';
export const AGENDA_ALERTA_COLS = 'id, item_id, codigo, dispara_em, estado, tentativas, enviado_em, destinatarios, erro';

const LEMBRETES = new Set<string>(AGENDA_LEMBRETES.map(l => l.id));
export const mapAgendaItem = (r: any): AgendaItem => ({
  id: String(r.id),
  ownerId: String(r.owner_id || ''),
  titulo: String(r.titulo || ''),
  tipo: tipoInfo(r.tipo).id,
  local: r.local ? String(r.local) : '',
  descricao: r.descricao ? String(r.descricao) : '',
  inicioDia: String(r.inicio_dia || ''),
  inicioHora: normHour(r.inicio_hora),
  fimDia: String(r.fim_dia || r.inicio_dia || ''),
  fimHora: normHour(r.fim_hora),
  participantes: Array.isArray(r.participantes) ? r.participantes.map(String) : [],
  alertas: (Array.isArray(r.alertas) ? r.alertas : []).filter((a: any) => LEMBRETES.has(a)) as AgendaLembrete[],
  status: (['ativo', 'concluido', 'cancelado'].includes(r.status) ? r.status : 'ativo') as AgendaStatus,
  criadoEm: String(r.criado_em || ''),
  updatedAt: String(r.updated_at || ''),
});
export const mapAgendaAlerta = (r: any): AgendaAlerta => ({
  id: Number(r.id),
  itemId: String(r.item_id),
  codigo: r.codigo as AgendaAlertaCodigo,
  disparaEm: String(r.dispara_em || ''),
  estado: r.estado as AgendaAlertaEstado,
  tentativas: Number(r.tentativas) || 0,
  enviadoEm: r.enviado_em ? String(r.enviado_em) : null,
  destinatarios: r.destinatarios ? String(r.destinatarios) : '',
  erro: r.erro ? String(r.erro) : '',
});
// O que vai para o banco (dono, criação e versão o banco carimba sozinho).
export const toAgendaRow = (i: AgendaItemInput) => {
  const inicioHora = normHour(i.inicioHora);
  return {
    titulo: i.titulo.trim(),
    tipo: i.tipo,
    local: i.local.trim() || null,
    descricao: i.descricao.trim() || null,
    inicio_dia: i.inicioDia,
    inicio_hora: inicioHora,
    fim_dia: i.fimDia || i.inicioDia,
    fim_hora: inicioHora ? normHour(i.fimHora) : null,
    participantes: Array.from(new Set(i.participantes)),
    alertas: Array.from(new Set(i.alertas)).filter(a => inicioHora || !AGENDA_LEMBRETES.find(l => l.id === a)?.soComHora),
    status: i.status,
  };
};

// Conferência antes de gravar — a mesma que o banco faz (as mensagens são para a pessoa).
export const validarAgenda = (i: AgendaItemInput): string | null => {
  if (!i.titulo.trim()) return 'Dê um título ao compromisso (ex.: "Viagem à China").';
  if (i.titulo.trim().length > 200) return 'O título pode ter até 200 caracteres.';
  if (i.local.trim().length > 200) return 'O local pode ter até 200 caracteres.';
  if (i.descricao.trim().length > 4000) return 'A descrição pode ter até 4000 caracteres.';
  const di = parseDay(i.inicioDia), df = parseDay(i.fimDia || i.inicioDia);
  if (!di) return 'Escolha a data de início.';
  if (!df) return 'A data de fim não é uma data válida.';
  if (di.getFullYear() < 2000 || df.getFullYear() > 2100) return 'A data precisa estar entre 2000 e 2100.';
  if (df < di) return 'O fim não pode ser antes do início.';
  const hi = normHour(i.inicioHora), hf = normHour(i.fimHora);
  if (i.inicioHora && !hi) return 'A hora de início não é válida.';
  if (i.fimHora && !hf) return 'A hora de fim não é válida.';
  if (hf && !hi) return 'Para ter hora de fim, informe a hora de início.';
  if (hi && hf && (i.fimDia || i.inicioDia) === i.inicioDia && hf < hi) return 'No mesmo dia, a hora de fim não pode ser antes da de início.';
  if (i.participantes.length > 30) return 'Até 30 participantes por compromisso.';
  return null;
};

// Novo compromisso em branco (hoje, dia inteiro, alertas padrão).
export const novoAgendaInput = (dia: string = todayBR()): AgendaItemInput => ({
  titulo: '', tipo: 'reuniao', local: '', descricao: '',
  inicioDia: dia, inicioHora: null, fimDia: dia, fimHora: null,
  participantes: [], alertas: [...AGENDA_ALERTAS_PADRAO], status: 'ativo',
});
export const itemToInput = (it: AgendaItem): AgendaItemInput => ({
  titulo: it.titulo, tipo: it.tipo, local: it.local, descricao: it.descricao,
  inicioDia: it.inicioDia, inicioHora: it.inicioHora, fimDia: it.fimDia, fimHora: it.fimHora,
  participantes: [...it.participantes], alertas: [...it.alertas], status: it.status,
});

// ---- Livre/ocupado ao convidar (migração 016 — 29/09, fim da tarde) ---------
// Pedido do Edson: "quando eu anexo pessoas nas atividades, é importante ver se ela não tem
// compromisso na hora". Decisão dele: mostrar SÓ "ocupado" e o HORÁRIO, para todos (inclusive
// o horário ocupado do Edson) — nunca título, local, descrição, tipo, participantes nem o
// dono do compromisso que ocupa. O banco nem devolve isso (public.agenda_ocupado só dá pessoa,
// início, fim e "dia inteiro"). É a única exceção à regra "cada um vê só a sua".

export interface AgendaOcupado {
  pessoa: string;       // id do usuário que está ocupado
  inicio: string;       // ISO (instante)
  fim: string;          // ISO (instante; exclusivo)
  diaInteiro: boolean;
}
export const OCUPADO_LOTE = 60;               // o banco recusa mais de 60 pessoas por consulta
export const OCUPADO_JANELA_MAX_DIAS = 62;    // e janela maior que 62 dias

// O intervalo [início, fim) que um compromisso OCUPA — a MESMA regra da 016 e do convite
// .ics do servidor (buildIcs): dia inteiro = das 00:00 do 1º dia às 00:00 do dia seguinte
// ao último; com hora de fim = até ela; sem hora de fim no mesmo dia = 1 h; sem hora de fim
// em vários dias = até 23:59 do último dia; fim que não fica depois do início = 1 h.
export const intervaloAgenda = (i: Pick<AgendaItemInput, 'inicioDia' | 'inicioHora' | 'fimDia' | 'fimHora'>): { inicio: Date; fim: Date } | null => {
  if (!parseDay(i.inicioDia)) return null;
  const fimDia = parseDay(i.fimDia) ? i.fimDia : i.inicioDia;
  const hi = normHour(i.inicioHora);
  if (!hi) {
    const a = brInstant(i.inicioDia, '00:00'), b = brInstant(addDaysStr(fimDia, 1), '00:00');
    return a && b ? { inicio: a, fim: b } : null;
  }
  const ini = brInstant(i.inicioDia, hi); if (!ini) return null;
  const hf = normHour(i.fimHora);
  let fim = hf ? brInstant(fimDia, hf) : fimDia > i.inicioDia ? brInstant(fimDia, '23:59') : null;
  if (!fim || fim.getTime() <= ini.getTime()) fim = new Date(ini.getTime() + 3600000);
  return { inicio: ini, fim };
};

// Linha da função do banco → objeto da tela (linha torta é descartada, nunca derruba a tela).
export const mapAgendaOcupado = (r: any): AgendaOcupado | null => {
  if (!r || !r.pessoa) return null;
  const a = new Date(String(r.inicio ?? '')), b = new Date(String(r.fim ?? ''));
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return { pessoa: String(r.pessoa), inicio: a.toISOString(), fim: b.toISOString(), diaInteiro: r.dia_inteiro === true };
};

// Dia e hora de um instante no relógio de Brasília (Joinville), qualquer que seja o do navegador.
const fmtPartesBR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const partesBR = (d: Date): { dia: string; hora: string } => {
  const p = fmtPartesBR.formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value || '';
  return { dia: `${g('year')}-${g('month')}-${g('day')}`, hora: `${g('hour')}:${g('minute')}` };
};
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

// UM intervalo ocupado, escrito em relação à janela do compromisso que está sendo montado.
// Compromisso de um dia só e intervalo nesse dia: só as horas ("14:00–15:30", "o dia todo");
// senão entra a data ("15/10 14:00–15:30", "09/10 22:00 → 10/10 02:00", "de 10/10 a 20/10").
export const fmtOcupado = (o: Pick<AgendaOcupado, 'inicio' | 'fim' | 'diaInteiro'>, janela: { inicio: Date; fim: Date }): string => {
  const a = new Date(o.inicio), b = new Date(o.fim);
  const jIni = partesBR(janela.inicio).dia, jFim = partesBR(new Date(janela.fim.getTime() - 1)).dia;
  const umDia = jIni === jFim ? jIni : null;
  if (o.diaInteiro) {
    const d1 = partesBR(a).dia, d2 = partesBR(new Date(b.getTime() - 1)).dia;   // o fim é exclusivo (00:00 do dia seguinte)
    if (umDia && d1 <= umDia && umDia <= d2) return 'o dia todo';
    return d1 === d2 ? `o dia todo em ${ddmm(d1)}` : `de ${ddmm(d1)} a ${ddmm(d2)}`;
  }
  const pa = partesBR(a), pb = partesBR(b);
  if (pa.dia === pb.dia) return umDia === pa.dia ? `${pa.hora}–${pb.hora}` : `${ddmm(pa.dia)} ${pa.hora}–${pb.hora}`;
  return `${ddmm(pa.dia)} ${pa.hora} → ${ddmm(pb.dia)} ${pb.hora}`;
};

// O selo de uma pessoa: o PRIMEIRO intervalo (o que começa antes; dia inteiro na frente) e
// quantos mais há. null = livre.
export const resumoOcupado = (lista: AgendaOcupado[] | null | undefined, janela: { inicio: Date; fim: Date }): { texto: string; mais: number; todos: string[] } | null => {
  if (!lista || !lista.length) return null;
  const ord = [...lista].sort((x, y) => Date.parse(x.inicio) - Date.parse(y.inicio)
    || Number(y.diaInteiro) - Number(x.diaInteiro) || Date.parse(x.fim) - Date.parse(y.fim));
  const todos = Array.from(new Set(ord.map(o => fmtOcupado(o, janela))));
  return { texto: `ocupado ${todos[0]}`, mais: todos.length - 1, todos };
};
