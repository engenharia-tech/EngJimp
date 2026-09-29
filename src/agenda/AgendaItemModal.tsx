import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plane, Handshake, Users, ListTodo, Ticket, CircleDot, X, Save, Loader2, CheckCircle2, RotateCcw, Ban, Trash2, Send,
  BellRing, CalendarClock, Mail, History, AlertTriangle, Eye, Check, MapPin, Clock, Info, Globe,
} from 'lucide-react';
import { User } from '../types';
import { useDialog } from '../hooks/useDialog';
import { useToast } from '../components/Toast';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  AgendaItem, AgendaItemInput, AgendaAlerta, AgendaTipo, AgendaStatus, AgendaLembrete, AgendaAlertaEstado, AgendaOcupado,
  AGENDA_TIPOS, AGENDA_LEMBRETES, AGENDA_ALERTAS_PADRAO, AGENDA_CODIGO_LABEL, AGENDA_ESTADO_LABEL, STATUS_LABEL, OCUPADO_JANELA_MAX_DIAS,
  tipoInfo, parseDay, todayBR, addDaysStr, dayDiffStr, brInstant, momentoAlerta, previewAlertas, normHour, toAgendaRow,
  fmtDayLong, fmtQuando, fmtFalta, fmtInstantBR, validarAgenda, novoAgendaInput, itemToInput, intervaloAgenda, resumoOcupado,
} from './agenda';
import { AgendaService, AgendaStaleError, agendaErrorMessage } from './agendaService';
import { ParticipantPicker, OcupacaoInfo, nomeCompleto, temEmail, recebeAlerta, emailForaDaEmpresa, dominiosEmpresaTexto } from './ParticipantPicker';
import { alertaAtrasado, foraDeBrasilia, fusoDoNavegador, fmtNoSeuFuso } from './AgendaList';

// O MODAL DO COMPROMISSO da agenda (29/09/2026) — criar, editar e ver.
//
// Pedido do Edson (29/09): compromissos futuros (viagem para a China, visita a cliente,
// reunião no dia tal) que "gerem alertas … disparados para os e-mails cadastrados".
// Decisões dele: alertas padrão 1 dia antes / no dia às 7h / 1 hora antes (muda item a
// item); e-mail para o dono + participantes escolhidos entre os usuários cadastrados; cada
// um altera só a SUA agenda — quem não é o dono (o Edson vendo a de outro) abre em 'view',
// só leitura. O admin de OKR e o convidado não enxergam agenda alheia (a RLS da 012 não
// devolve o item); o ramo "convidado" abaixo fica só como defesa, não é caminho normal.
//
// O que este painel NÃO decide: quem pode gravar (a RLS do banco) e quais e-mails saem de
// fato (o gatilho da migração 012 monta a fila). Aqui só se MOSTRA o que vai acontecer,
// com a mesma régua do banco (previewAlertas / momentoAlerta / gatilho 4b).
//
// Cuidados:
//  · a VERSÃO usada para gravar é a de quando o painel abriu — se a tela trocar o item por
//    baixo (releitura), a gravação não passa por cima do que outra pessoa gravou;
//  · Esc/Fechar com alteração não salva pede confirmação; enquanto grava, nada fecha e
//    nenhum botão aceita segundo clique;
//  · as confirmações são um mini-diálogo próprio (não window.confirm), com o teclado
//    capturado na JANELA (antes do useDialog do painel, que escuta no document).

// ---- Ícones dos tipos (os outros arquivos da agenda podem reusar) -----------------------

export const AGENDA_TIPO_ICON: Record<AgendaTipo, typeof Plane> = {
  viagem: Plane, visita: Handshake, reuniao: Users, tarefa: ListTodo, evento: Ticket, outro: CircleDot,
};

// ---- Contrato ---------------------------------------------------------------------------

type Mode = 'new' | 'edit' | 'view';
export interface AgendaItemModalProps {
  open: boolean;
  mode: Mode;
  item?: AgendaItem;
  initial?: AgendaItemInput;
  users: User[];
  currentUser: User;
  alertas: AgendaAlerta[];
  service: AgendaService;
  onClose: () => void;
  onSaved: (item: AgendaItem) => void;
  onDeleted: (id: string) => void;
}

// ---- Formulário -------------------------------------------------------------------------

// As horas ficam como TEXTO do campo enquanto a pessoa edita (o <input type="time"> fica
// vazio no meio da digitação) e "Dia inteiro" é um estado próprio: desligar e religar
// devolve as horas que estavam.
interface Form {
  titulo: string; tipo: AgendaTipo; local: string; descricao: string;
  inicioDia: string; fimDia: string; allDay: boolean; horaIni: string; horaFim: string;
  participantes: string[]; alertas: AgendaLembrete[]; status: AgendaStatus;
}

const toForm = (i: AgendaItemInput): Form => {
  const hoje = todayBR();
  const hi = normHour(i.inicioHora);
  const ini = parseDay(i.inicioDia) ? i.inicioDia : hoje;
  return {
    titulo: String(i.titulo || ''), tipo: tipoInfo(i.tipo).id, local: String(i.local || ''), descricao: String(i.descricao || ''),
    inicioDia: ini, fimDia: parseDay(i.fimDia) ? i.fimDia : ini,
    allDay: !hi, horaIni: hi || '', horaFim: hi ? (normHour(i.fimHora) || '') : '',
    participantes: Array.from(new Set((i.participantes || []).map(String))),
    alertas: AGENDA_LEMBRETES.map(l => l.id).filter(id => (i.alertas || []).includes(id)),
    status: (['ativo', 'concluido', 'cancelado'] as AgendaStatus[]).includes(i.status) ? i.status : 'ativo',
  };
};

const fromForm = (f: Form): AgendaItemInput => ({
  titulo: f.titulo, tipo: f.tipo, local: f.local, descricao: f.descricao,
  inicioDia: f.inicioDia, inicioHora: f.allDay ? null : normHour(f.horaIni),
  fimDia: f.fimDia, fimHora: f.allDay ? null : normHour(f.horaFim),
  participantes: f.participantes, alertas: f.alertas, status: f.status,
});

// Assinatura do que IRIA para o banco (espaço sobrando, ordem da lista, lembrete que não
// vale sem hora… não contam como alteração).
const sig = (i: AgendaItemInput) => {
  const r = toAgendaRow(i);
  return JSON.stringify({ ...r, participantes: [...r.participantes].sort(), alertas: [...r.alertas].sort() });
};

type Campo = 'titulo' | 'quando' | 'local' | 'descricao' | 'participantes';
const campoDoErro = (m: string): Campo =>
  /t[íi]tulo/i.test(m) ? 'titulo' : /local/i.test(m) ? 'local' : /descri/i.test(m) ? 'descricao' : /participante/i.test(m) ? 'participantes' : 'quando';

// ---- Pequenos auxiliares ----------------------------------------------------------------

const minOf = (h: string | null | undefined): number | null => {
  const n = normHour(h); if (!n) return null;
  const [a, b] = n.split(':').map(Number);
  return a * 60 + b;
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtDur = (m: number) => {
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  return `${h}h${r ? String(r).padStart(2, '0') : ''}`;
};
const uniq = (a: string[]) => Array.from(new Set(a));
const pessoas = (n: number) => `${n} participante${n === 1 ? '' : 's'}`;
// Instante vindo do banco pode vir torto: Intl.format de data inválida LANÇA (derrubaria o painel).
const safeInstant = (s: string | null | undefined): string => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : fmtInstantBR(d);
};
// O compromisso ainda não acabou (até o fim do último dia, em Joinville) — a mesma régua
// do gatilho (4b): só compromisso que não acabou manda convite/alteração/cancelamento.
const aindaNaoAcabou = (fimDia: string, inicioDia: string, now: Date): boolean => {
  const d = parseDay(fimDia) ? fimDia : inicioDia;
  if (!parseDay(d)) return false;
  const fim = brInstant(addDaysStr(d, 1), '00:00');
  return !!fim && fim.getTime() > now.getTime();
};
const relativo = (ini: string, fim: string, hoje: string): string => {
  if (!parseDay(ini)) return '';
  const f = parseDay(fim) ? fim : ini;
  if (dayDiffStr(hoje, ini) < 0 && dayDiffStr(hoje, f) >= 0) return 'em andamento';
  if (dayDiffStr(hoje, f) < 0) return `terminou ${fmtFalta(f, hoje)}`;
  return fmtFalta(ini, hoje);
};

// ---- Estilos ----------------------------------------------------------------------------

const inputCls = 'w-full min-w-0 px-3 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-base sm:text-sm text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [color-scheme:light] dark:[color-scheme:dark] disabled:opacity-60 aria-[invalid=true]:border-rose-400 dark:aria-[invalid=true]:border-rose-500';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1';
const kickerCls = 'font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400';
const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';
const btn = `inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold px-3 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`;
const btnGhost = `${btn} text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800`;

const STATUS_CLS: Record<AgendaStatus, string> = {
  ativo: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  concluido: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  cancelado: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
};
const STATUS_ON: Record<AgendaStatus, string> = {
  ativo: 'bg-blue-600 text-white',
  concluido: 'bg-emerald-600 text-white',
  cancelado: 'bg-rose-600 text-white',
};
const ESTADO_CLS: Record<AgendaAlertaEstado, string> = {
  pendente: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  enviando: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  falhou: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
  expirado: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  sem_destinatario: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
};

// ---- Mini-diálogo de confirmação --------------------------------------------------------

type Tone = 'danger' | 'warn' | 'primary';
interface ConfirmSpec {
  title: string;
  body: React.ReactNode;
  cancelLabel?: string;
  actions: { label: string; tone: Tone; onClick: () => void }[];
}
const TONE_CLS: Record<Tone, string> = {
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  warn: 'bg-amber-500 hover:bg-amber-600 text-slate-950',
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
};

// Teclado na JANELA, fase de captura: roda antes do useDialog do painel (que escuta no
// document) e para a propagação de Esc/Tab — senão o Esc também tentava fechar o painel e
// o Tab do painel tirava o foco da confirmação.
const ConfirmBox: React.FC<ConfirmSpec & { onCancel: () => void; fallbackFocus: React.RefObject<HTMLElement | null> }> = ({ title, body, cancelLabel = 'Voltar', actions, onCancel, fallbackFocus }) => {
  const id = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const box = boxRef.current as HTMLDivElement | null; if (!box) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancelRef.current(); return; }
      if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        const f = Array.from(box.querySelectorAll<HTMLElement>('button:not([disabled])'));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
        f[n].focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      // Volta para quem abriu a confirmação; se ele sumiu ou ficou desabilitado (gravando), para o painel.
      const ok = prev && document.contains(prev) && !(prev as HTMLButtonElement).disabled;
      const alvo: HTMLElement | null = ok ? prev : (fallbackFocus.current as HTMLElement | null);
      alvo?.focus?.();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/50 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancelRef.current(); }}>
      <div ref={boxRef} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 border-l-4 border-l-orange-500 p-5">
        <span aria-hidden="true" className="absolute right-2 top-2 w-3 h-3 border-r-2 border-t-2 border-orange-500/50" />
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">Agenda · <span className="text-orange-500 dark:text-orange-400">Confirmar</span></p>
        <h3 id={`${id}-t`} className="mt-1 text-base font-black text-slate-800 dark:text-white leading-snug break-words">{title}</h3>
        <div id={`${id}-d`} className="mt-2 text-sm text-slate-600 dark:text-slate-300 space-y-2">{body}</div>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={() => onCancelRef.current()} className={`${btn} text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700`}>{cancelLabel}</button>
          {actions.map(a => (
            <button key={a.label} type="button" onClick={a.onClick} className={`${btn} ${TONE_CLS[a.tone]}`}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---- Se algo quebrar aqui dentro, o painel mostra o aviso e fecha (não prende a tela) ---

const ModalCrash: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const stable = useCallback(() => closeRef.current(), []);
  const ref = useDialog<HTMLDivElement>(stable);
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/60 flex items-center justify-center p-4">
      <div ref={ref} role="alertdialog" aria-modal="true" aria-label="Erro no compromisso" tabIndex={-1}
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-rose-200 dark:border-rose-900/50 p-6 text-center space-y-3 outline-none">
        <AlertTriangle className="mx-auto text-rose-500" size={26} aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Não consegui mostrar este compromisso.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Algum dado dele veio num formato inesperado. O resto da agenda continua funcionando.</p>
        <button type="button" onClick={stable} className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`}>Fechar</button>
      </div>
    </div>
  );
};

// ---- O painel ---------------------------------------------------------------------------

type Busy = null | 'save' | 'status' | 'cancel' | 'delete' | 'test';

// Livre/ocupado: parado 400 ms antes de perguntar; sem resposta em 10 s, a tela diz que não
// conseguiu conferir (se a resposta chegar depois, ela ainda vale).
const OCUPADO_PAUSA_MS = 400;
const OCUPADO_ESPERA_MS = 10000;
type Disp = { fase: 'conferindo' | 'erro'; chave: string } | { fase: 'ok'; chave: string; info: OcupacaoInfo };

const ModalBody: React.FC<AgendaItemModalProps> = ({ mode, item, initial, users: usersProp, currentUser, alertas, service, onClose, onSaved, onDeleted }) => {
  const { addToast } = useToast();
  const uid = useId();
  const users = usersProp || [];
  const readOnly = mode === 'view';
  const editando = mode === 'edit';

  // Fotografia de quando o painel abriu: base do "tem alteração?" e do "o que sai ao
  // salvar", e a VERSÃO que a gravação exige.
  const [base] = useState<AgendaItemInput>(() => mode === 'new'
    ? (initial ? { ...initial, participantes: [...(initial.participantes || [])], alertas: [...(initial.alertas || [])] } : novoAgendaInput())
    : itemToInput(item!));
  const [versao] = useState(() => item?.updatedAt || '');
  const [itemId] = useState(() => item?.id || '');
  const [form, setForm] = useState<Form>(() => toForm(base));
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  // No 'view' vale o item ATUAL (a tela pode ter relido); no edit, o formulário.
  const input = useMemo<AgendaItemInput>(() => (readOnly && item ? itemToInput(item) : fromForm(form)), [readOnly, item, form]);
  const baseSig = useMemo(() => sig(fromForm(toForm(base))), [base]);
  const dirty = !readOnly && sig(input) !== baseSig;
  // Alguém gravou este compromisso depois que o painel abriu (a tela releu e mandou o novo).
  const mudouPorFora = editando && !!item && !!versao && item.updatedAt !== versao;

  const userById = useMemo(() => new Map(users.filter(u => u && u.id).map(u => [u.id, u] as const)), [users]);
  const ownerId = mode === 'new' ? currentUser.id : (item?.ownerId || currentUser.id);
  const souDono = ownerId === currentUser.id;
  const owner: User | undefined = userById.get(ownerId) || (souDono ? currentUser : undefined);
  const donoNome = owner ? nomeCompleto(owner) : 'outra pessoa';
  const souConvidado = !souDono && !!item && item.participantes.includes(currentUser.id);
  const nomeDe = (id: string) => { const u = userById.get(id); return u ? nomeCompleto(u) : 'usuário fora do cadastro'; };

  // "Agora" anda sozinho: um alerta que passa enquanto o painel está aberto sai da prévia.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(t); }, []);
  const hoje = todayBR(now);

  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef<Busy>(null);                 // a verdade na hora (o estado só redesenha)
  const [notice, setNotice] = useState<{ tone: 'error' | 'ok'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [tentou, setTentou] = useState(false);        // já tentou salvar: a validação passa a aparecer
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved;
  const onDeletedRef = useRef(onDeleted); onDeletedRef.current = onDeleted;

  // Fechar: gravando, espera; com alteração, pergunta.
  const requestClose = () => {
    if (busyRef.current || confirm) return;
    if (!dirty) { onCloseRef.current(); return; }
    setConfirm({
      title: 'Descartar as alterações?',
      body: mode === 'new' ? 'Este compromisso ainda não foi salvo — o que você preencheu se perde.' : 'O que você mudou neste compromisso ainda não foi salvo.',
      cancelLabel: 'Continuar editando',
      actions: [{ label: 'Descartar', tone: 'danger', onClick: () => { setConfirm(null); onCloseRef.current(); } }],
    });
  };
  // O useDialog refaz o foco quando o onClose muda de identidade: entregar uma função estável.
  const closeRef = useRef(requestClose); closeRef.current = requestClose;
  const stableClose = useCallback(() => closeRef.current(), []);
  const panelRef = useDialog<HTMLDivElement>(stableClose);

  const tituloRef = useRef<HTMLInputElement>(null);
  const inicioDiaRef = useRef<HTMLInputElement>(null);
  const horaIniRef = useRef<HTMLInputElement>(null);
  const fimDiaRef = useRef<HTMLInputElement>(null);
  const horaFimRef = useRef<HTMLInputElement>(null);
  const localRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const partRef = useRef<HTMLElement>(null);
  const downOnBackdrop = useRef(false);

  // Novo: o cursor já no título (depois do foco inicial do useDialog).
  useEffect(() => { if (mode === 'new') tituloRef.current?.focus(); }, []);
  // A página por trás não rola enquanto o painel está aberto (celular).
  useEffect(() => {
    const b = document.body; const prev = b.style.overflow;
    b.style.overflow = 'hidden';
    return () => { b.style.overflow = prev; };
  }, []);

  // ---- Validação -------------------------------------------------------------------------
  const validar = (i: AgendaItemInput, f: Form): string | null => {
    if (!f.allDay && !normHour(f.horaIni)) return 'Informe a hora de início — ou ligue “Dia inteiro”.';
    return validarAgenda(i);
  };
  const erroAtual = tentou && !readOnly ? validar(input, form) : null;
  const campoErro: Campo | null = erroAtual ? campoDoErro(erroAtual) : null;
  const errId = `${uid}-erro`;
  const focar = (c: Campo, msg: string) => {
    const el: HTMLElement | null | undefined =
      c === 'titulo' ? tituloRef.current
      : c === 'local' ? localRef.current
      : c === 'descricao' ? descRef.current
      : c === 'participantes' ? partRef.current?.querySelector('input')
      : /hora de fim/i.test(msg) ? horaFimRef.current
      : /hora/i.test(msg) ? horaIniRef.current
      : /\bfim\b/i.test(msg) ? fimDiaRef.current
      : inicioDiaRef.current;
    (el || inicioDiaRef.current)?.focus();
  };

  // ---- Mudanças nos campos ---------------------------------------------------------------
  // Início passou do fim: o fim acompanha, mantendo a duração.
  const onInicioDia = (d: string) => setForm(f => {
    const n = { ...f, inicioDia: d };
    if (parseDay(d)) {
      if (!parseDay(f.fimDia)) n.fimDia = d;
      else if (f.fimDia < d) {
        const span = parseDay(f.inicioDia) ? Math.max(0, dayDiffStr(f.inicioDia, f.fimDia)) : 0;
        n.fimDia = addDaysStr(d, span);
      }
    }
    return n;
  });
  // Hora de início passou da de fim (mesmo dia): a de fim acompanha, mantendo a duração.
  const onHoraIni = (h: string) => setForm(f => {
    const n = { ...f, horaIni: h };
    const a = minOf(h), z = minOf(f.horaFim), a0 = minOf(f.horaIni);
    if (a !== null && z !== null && (f.fimDia || f.inicioDia) === f.inicioDia && z < a) {
      const dur = a0 !== null && z >= a0 ? z - a0 : 60;
      n.horaFim = hhmm(Math.min(a + dur, 23 * 60 + 59));
    }
    return n;
  });
  const toggleAllDay = () => setForm(f => f.allDay
    ? { ...f, allDay: false, horaIni: f.horaIni || '09:00', horaFim: f.horaIni ? f.horaFim : (f.fimDia === f.inicioDia ? '10:00' : '') }
    : { ...f, allDay: true });
  const toggleAlerta = (id: AgendaLembrete) => setForm(f => ({
    ...f,
    alertas: f.alertas.includes(id) ? f.alertas.filter(x => x !== id) : AGENDA_LEMBRETES.map(l => l.id).filter(x => x === id || f.alertas.includes(x)),
  }));

  // ---- O que vai sair por e-mail ---------------------------------------------------------
  const efetivos = input.alertas.filter(a => !(AGENDA_LEMBRETES.find(l => l.id === a)?.soComHora && !input.inicioHora));
  const previstos = useMemo(() => previewAlertas(input, now), [input, now]);
  const momentos = efetivos.map(c => ({ c, q: momentoAlerta(c, input.inicioDia, input.inicioHora) }));
  const notas: string[] = [];
  if (input.status === 'ativo' && efetivos.length) {
    const futuros = momentos.filter(m => m.q && m.q.getTime() > now.getTime());
    const passados = momentos.filter(m => m.q && m.q.getTime() <= now.getTime());
    if (passados.length && previstos.length) notas.push(`Já passou o horário de: ${passados.map(m => AGENDA_CODIGO_LABEL[m.c]).join(', ')}.`);
    if (futuros.length > previstos.length) notas.push('Lembretes no mesmo minuto viram um e-mail só.');
    if (efetivos.includes('dia7h') && input.inicioHora && input.inicioHora <= '07:00') notas.push('“No dia, às 7h” não vale para compromisso que começa às 7h ou antes.');
  }
  const motivoSemPrevisto = input.status !== 'ativo'
    ? `Compromisso ${STATUS_LABEL[input.status].toLowerCase()} não gera lembretes.`
    : !efetivos.length ? 'Nenhum lembrete escolhido.'
      : !momentos.some(m => m.q) ? 'Os lembretes escolhidos não se aplicam a este horário.'
        : 'Nenhum alerta fica no futuro — todos os horários de lembrete já passaram.';

  // "Os e-mails vão para" conta SÓ quem recebe de verdade: com e-mail E da empresa (decisão
  // do Edson, 29/09 à tarde — emailRecebeAlerta; o do Edson vale qualquer que seja). Quem
  // decide é o servidor, que também aceita os endereços de Configurações (esta tela não os
  // conhece): o "de fora" sai como "provavelmente não recebe".
  const partRecebe = input.participantes.filter(id => recebeAlerta(userById.get(id))).length;
  const partFora = input.participantes.filter(id => emailForaDaEmpresa(userById.get(id))).length;
  const partSemEmail = input.participantes.length - partRecebe - partFora;   // inclui quem saiu do cadastro
  const donoEmail = String(owner?.email || '').trim();
  const donoTemEmail = temEmail(owner);
  const donoRecebe = recebeAlerta(owner);

  // Avisos que o gatilho do banco põe na fila AO SALVAR (mesma lógica de agenda_item_depois).
  // Quem é TIRADO da lista recebe o aviso de REMOÇÃO (código 'removido' — decisão do Edson,
  // 29/09): só o título e as datas que ele já conhecia; também quando é tirado na mesma
  // gravação que cancela (os que ficam recebem o 'cancelado'). Cancelamento e remoção só vão
  // para quem já RECEBEU algum e-mail do compromisso DESDE QUE ENTROU NA LISTA (o banco confere
  // no disparo, pelo registro de quem o servidor de e-mail aceitou — 2º cético, 29/09; o que
  // recebeu antes de sair e voltar não conta), e a remoção leva o título e as datas do último
  // e-mail que a pessoa recebeu. A tela não sabe quem recebeu: diz a regra, não a contagem.
  const avisos = useMemo<string[]>(() => {
    if (readOnly) return [];
    const out: string[] = [];
    if (!aindaNaoAcabou(input.fimDia, input.inicioDia, now)) return out;
    if (mode === 'new') {
      if (input.status === 'ativo' && input.participantes.length) out.push(`convite para ${pessoas(input.participantes.length)}`);
      return out;
    }
    const antigos = base.participantes;
    const novos = input.participantes.filter(p => !antigos.includes(p));
    const saiu = antigos.filter(p => !input.participantes.includes(p));
    const ficou = input.participantes.filter(p => antigos.includes(p));
    const remocao = saiu.length ? `aviso de remoção para quem saiu (${saiu.map(nomeDe).join(', ')})` : '';
    if (input.status === 'cancelado' && base.status !== 'cancelado') {
      if (input.participantes.length) out.push('aviso de cancelamento para quem já recebeu algum e-mail');
      if (remocao) out.push(remocao);
      return out;
    }
    if (input.status !== 'ativo') return out;
    if (base.status !== 'ativo') {
      if (input.participantes.length) out.push(`convite de novo para ${pessoas(input.participantes.length)}`);
      return out;
    }
    if (remocao) out.push(remocao);
    if (novos.length) out.push(`convite para quem entrou (${novos.map(nomeDe).join(', ')})`);
    const a = toAgendaRow(input), b = toAgendaRow(base);
    const mudou = a.titulo !== b.titulo || a.local !== b.local || a.inicio_dia !== b.inicio_dia
      || a.inicio_hora !== b.inicio_hora || a.fim_dia !== b.fim_dia || a.fim_hora !== b.fim_hora;
    if (mudou && ficou.length) out.push(`aviso de alteração para ${ficou.length === 1 ? 'quem já estava convidado' : `os ${ficou.length} que já estavam convidados`}`);
    return out;
  }, [readOnly, input, now, mode, base, userById]);
  const avisoSoQuemSabe = avisos.some(a => a.startsWith('aviso de cancelamento') || a.startsWith('aviso de remoção'));

  const historico = useMemo(() => !itemId ? [] : (alertas || [])
    .filter(a => a && a.itemId === itemId)
    .sort((a, b) => (Date.parse(a.disparaEm) || 0) - (Date.parse(b.disparaEm) || 0) || a.id - b.id), [alertas, itemId]);

  // ---- Livre/ocupado (migração 016 — decisão do Edson, 29/09 fim da tarde) ---------------
  // Com data/hora válidas e o compromisso ativo, pergunta ao banco quem já está ocupado na
  // janela dele (a MESMA régua do .ics: intervaloAgenda): o dono, os escolhidos e todos os
  // candidatos do seletor (o serviço divide em lotes de 60). Volta SÓ o horário — nunca o
  // assunto. É aviso: nada aqui trava o salvar. Espera a pessoa parar de mexer (400 ms);
  // resposta de uma janela velha é descartada (rede lenta não mistura horários); no editar,
  // o próprio compromisso fica de fora (p_ignorar). A 016 ainda não rodada (null) desliga o
  // recurso calado até o painel fechar.
  const janelaOcup = useMemo(() => {
    if (readOnly || input.status !== 'ativo') return null;
    if (!form.allDay && !normHour(form.horaIni)) return null;                 // hora pela metade
    if (validarAgenda({ ...input, titulo: 'x', local: '', descricao: '', participantes: [] })) return null;   // data/hora inválida
    return intervaloAgenda(input);
  }, [readOnly, form.allDay, form.horaIni, input]);
  const janelaLonga = !!janelaOcup && janelaOcup.fim.getTime() - janelaOcup.inicio.getTime() > OCUPADO_JANELA_MAX_DIAS * 86400000;
  const idsOcup = useMemo(() => uniq([ownerId, ...users.map(u => u?.id), ...form.participantes].filter((x): x is string => !!x)).sort(),
    [ownerId, users, form.participantes]);
  const [tentarOcup, setTentarOcup] = useState(0);
  const [ocupAusente, setOcupAusente] = useState(false);
  const [disp, setDisp] = useState<Disp | null>(null);
  const chaveOcup = janelaOcup && !janelaLonga && !ocupAusente
    ? [janelaOcup.inicio.toISOString(), janelaOcup.fim.toISOString(), itemId, tentarOcup, idsOcup.join(',')].join('|') : '';
  const ocupSeq = useRef(0);
  const ocupReq = useRef({ ids: idsOcup, janela: janelaOcup });
  ocupReq.current = { ids: idsOcup, janela: janelaOcup };
  const serviceRef = useRef(service); serviceRef.current = service;
  useEffect(() => {
    const my = ++ocupSeq.current;
    if (!chaveOcup) { setDisp(null); return; }
    const chave = chaveOcup;
    setDisp({ fase: 'conferindo', chave });
    let limite = 0;
    const pausa = window.setTimeout(() => {
      const { ids, janela } = ocupReq.current;
      const svc = serviceRef.current;
      if (!janela || typeof svc?.ocupado !== 'function') { setDisp(null); return; }
      const vale = () => my === ocupSeq.current && mounted.current;
      limite = window.setTimeout(() => { if (vale()) setDisp(d => d && d.chave === chave && d.fase === 'conferindo' ? { fase: 'erro', chave } : d); }, OCUPADO_ESPERA_MS);
      Promise.resolve()
        .then(() => svc.ocupado(ids, janela.inicio, janela.fim, itemId || undefined))
        .then(r => {
          if (!vale()) return;
          if (r === null) { setOcupAusente(true); setDisp(null); return; }
          const porPessoa = new Map<string, AgendaOcupado[]>();
          (Array.isArray(r) ? r : []).forEach(o => { if (!o || !o.pessoa) return; const l = porPessoa.get(o.pessoa); if (l) l.push(o); else porPessoa.set(o.pessoa, [o]); });
          setDisp({ fase: 'ok', chave, info: { porPessoa, consultados: new Set(ids), janela } });
        }, () => { if (vale()) setDisp({ fase: 'erro', chave }); })
        .finally(() => window.clearTimeout(limite));
    }, OCUPADO_PAUSA_MS);
    return () => { window.clearTimeout(pausa); window.clearTimeout(limite); };
  }, [chaveOcup, itemId]);
  // Só vale o que foi conferido para a janela de AGORA (nunca o selo de um horário anterior).
  const dispAtual = disp && chaveOcup && disp.chave === chaveOcup ? disp : null;
  const ocupacao: OcupacaoInfo | null = dispAtual && dispAtual.fase === 'ok' ? dispAtual.info : null;
  const donoOcup = ocupacao && ocupacao.consultados.has(ownerId) ? resumoOcupado(ocupacao.porPessoa.get(ownerId), ocupacao.janela) : null;

  // ---- Gravações -------------------------------------------------------------------------
  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>, fallback: string) => {
    if (busyRef.current) return;                      // sem duplo clique
    busyRef.current = kind; setBusy(kind); setNotice(null);
    try {
      await fn();
    } catch (e: any) {
      const msg = agendaErrorMessage(e, fallback);
      if (e instanceof AgendaStaleError) {            // sumiu ou mudou por outra pessoa: a tela relê
        addToast(msg, 'warning');
        if (mounted.current) onCloseRef.current();
        return;
      }
      addToast(msg, 'error');
      // O toast fica POR BAIXO do painel: o erro aparece também aqui dentro.
      if (mounted.current) setNotice({ tone: 'error', msg });
    } finally {
      busyRef.current = null;
      if (mounted.current) setBusy(null);
    }
  };
  const terminou = (msg: string) => { addToast(msg, 'success'); if (mounted.current) onCloseRef.current(); };

  const salvar = () => {
    if (readOnly || busyRef.current || confirm) return;
    setTentou(true);
    const snap = input;
    const erro = validar(snap, form);
    if (erro) { setNotice(null); focar(campoDoErro(erro), erro); return; }
    if (editando && !dirty) { onCloseRef.current(); return; }
    const convite = mode === 'new' && avisos.length > 0;
    run('save', async () => {
      const saved = mode === 'new' ? await service.create(snap) : await service.update(itemId, snap, versao);
      onSavedRef.current(saved);
      terminou(mode === 'new'
        ? `“${saved.titulo}” entrou na agenda.${convite ? ' Os participantes recebem o convite por e-mail em alguns minutos.' : ''}`
        : 'Alterações salvas.');
    }, 'Não consegui salvar.');
  };

  // Concluir/reabrir/cancelar. Com alteração na tela, grava tudo junto (senão o que foi
  // mudado se perdia calado ao fechar).
  const mudarStatus = (status: AgendaStatus) => {
    if (!itemId || readOnly || busyRef.current) return;
    let payload: AgendaItemInput | null = null;
    if (dirty) {
      payload = { ...input, status };
      const erro = validar(payload, form);
      if (erro) { setTentou(true); focar(campoDoErro(erro), erro); return; }
    }
    const alvoCancel = uniq([...input.participantes, ...base.participantes]).length;
    const avisa = aindaNaoAcabou(input.fimDia, input.inicioDia, new Date());
    run(status === 'cancelado' ? 'cancel' : 'status', async () => {
      const saved = payload ? await service.update(itemId, payload, versao) : await service.setStatus(itemId, status, versao);
      onSavedRef.current(saved);
      terminou(status === 'concluido' ? 'Compromisso concluído — os lembretes que faltavam não saem mais.'
        // Só quem já recebeu algum e-mail do compromisso desde que entrou na lista é avisado: a
        // tela não sabe quantos são.
        : status === 'cancelado' ? `Compromisso cancelado.${alvoCancel && avisa ? ' Só é avisado quem já recebeu algum e-mail dele desde que entrou na lista.' : ''}`
          : 'Compromisso reaberto — os lembretes voltam a valer.');
    }, status === 'cancelado' ? 'Não consegui cancelar o compromisso.' : 'Não consegui mudar a situação.');
  };

  const pedirCancelar = () => {
    if (!itemId || busyRef.current) return;
    const n = uniq([...input.participantes, ...base.participantes]).length;
    const avisa = aindaNaoAcabou(input.fimDia, input.inicioDia, new Date());
    // Tirados da lista nesta mesma gravação: recebem o aviso de REMOÇÃO, não o de cancelamento.
    const saiuAgora = base.participantes.filter(p => !input.participantes.includes(p));
    setConfirm({
      title: `Cancelar “${input.titulo.trim() || 'este compromisso'}”?`,
      body: (<>
        <p>Os lembretes que ainda iam sair deixam de sair. Dá para reabrir depois.</p>
        {n > 0 && (avisa
          ? <>
              {input.participantes.length > 0 && <p>Quem continua na lista e já recebeu algum e-mail deste compromisso desde que entrou nela recebe o <b>aviso de cancelamento</b>. Quem ainda não recebeu nada desde que entrou não é avisado (e o convite deixa de sair).</p>}
              {saiuAgora.length > 0 && <p><b>{saiuAgora.map(nomeDe).join(', ')}</b> ({saiuAgora.length === 1 ? 'tirado' : 'tirados'} da lista agora) {saiuAgora.length === 1 ? 'recebe' : 'recebem'} só o <b>aviso de remoção</b>, com o título e as datas do último e-mail que {saiuAgora.length === 1 ? 'recebeu — e só se recebeu algum desde que entrou na lista' : 'cada um recebeu — e só quem recebeu algum desde que entrou na lista'}.</p>}
            </>
          : <p>O compromisso já passou: ninguém recebe aviso.</p>)}
        {dirty && <p className="text-xs text-slate-500 dark:text-slate-400">As alterações feitas nesta tela são salvas junto.</p>}
      </>),
      cancelLabel: 'Voltar',
      actions: [{ label: 'Cancelar compromisso', tone: 'warn', onClick: () => { setConfirm(null); mudarStatus('cancelado'); } }],
    });
  };

  const pedirReabrir = () => {
    if (!itemId || busyRef.current) return;
    const n = input.participantes.length;
    if (!n || !aindaNaoAcabou(input.fimDia, input.inicioDia, new Date())) { mudarStatus('ativo'); return; }
    setConfirm({
      title: `Reabrir “${input.titulo.trim() || 'este compromisso'}”?`,
      body: <p>{n === 1 ? 'O participante recebe' : <>Os <b>{pessoas(n)}</b> recebem</>} o <b>convite de novo</b> por e-mail, e os lembretes voltam a valer.</p>,
      cancelLabel: 'Voltar',
      actions: [{ label: 'Reabrir', tone: 'primary', onClick: () => { setConfirm(null); mudarStatus('ativo'); } }],
    });
  };

  const excluir = () => run('delete', async () => {
    await service.remove(itemId);
    onDeletedRef.current(itemId);
    terminou('Compromisso excluído.');
  }, 'Não consegui excluir.');

  // Excluir NÃO avisa ninguém (o gatilho só roda em insert/update). Com participantes e
  // compromisso ainda por vir, a sugestão é Cancelar — que avisa.
  const pedirExcluir = () => {
    if (!itemId || !item || busyRef.current) return;
    const n = base.participantes.length;
    const deviaAvisar = base.status === 'ativo' && n > 0 && aindaNaoAcabou(base.fimDia, base.inicioDia, new Date());
    const titulo = base.titulo.trim() || 'este compromisso';
    setConfirm(deviaAvisar ? {
      title: `Excluir “${titulo}”?`,
      body: (<>
        <p>Excluir <b>não avisa</b> ninguém — quem já recebeu o convite ({n === 1 ? 'o participante' : `entre os ${pessoas(n)}`}) continua contando com o compromisso.</p>
        <p>Para avisar, prefira <b>Cancelar</b>: quem já recebeu algum e-mail dele desde que entrou na lista recebe o aviso de cancelamento, e o compromisso fica no histórico.</p>
      </>),
      cancelLabel: 'Voltar',
      actions: [
        { label: 'Cancelar e avisar', tone: 'warn', onClick: () => { setConfirm(null); mudarStatus('cancelado'); } },
        { label: 'Excluir sem avisar', tone: 'danger', onClick: () => { setConfirm(null); excluir(); } },
      ],
    } : {
      title: `Excluir “${titulo}”?`,
      body: <p>O compromisso e o histórico dos alertas dele saem de vez. Não dá para desfazer.</p>,
      cancelLabel: 'Voltar',
      actions: [{ label: 'Excluir', tone: 'danger', onClick: () => { setConfirm(null); excluir(); } }],
    });
  };

  const testar = () => {
    if (!itemId || busyRef.current) return;
    run('test', async () => {
      const para = await service.sendTest(itemId);
      addToast(`Alerta de teste enviado para ${para}`, 'success');
      if (mounted.current) setNotice({ tone: 'ok', msg: `Alerta de teste enviado para ${para}. Confira a caixa de entrada (e o spam).` });
    }, 'Não consegui enviar o teste.');
  };

  const onPanelKey = (e: React.KeyboardEvent) => {
    // Ctrl+Enter salva — só do próprio painel (a confirmação é portal e o evento sobe pela árvore do React).
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !readOnly && panelRef.current?.contains(e.target as Node)) {
      e.preventDefault(); salvar();
    }
  };

  // ---- Desenho ---------------------------------------------------------------------------
  const tipo = tipoInfo(input.tipo);
  const TipoIcon = AGENDA_TIPO_ICON[tipo.id];
  const kicker = mode === 'new' ? 'Novo compromisso' : mode === 'edit' ? 'Editar' : souConvidado ? 'Convite' : 'Só leitura';
  const titleId = `${uid}-titulo`;
  const tituloTela = input.titulo.trim() || (mode === 'new' ? 'Novo compromisso' : 'Sem título');
  const isBusy = busy !== null;
  const rel = relativo(input.inicioDia, input.fimDia, hoje);
  const jaAcabou = parseDay(input.inicioDia) && !aindaNaoAcabou(input.fimDia, input.inicioDia, now);
  // "Voltar ao padrão" só quando o que VALE difere do padrão (dia inteiro: "1 hora antes" não conta).
  const valem = (a: AgendaLembrete[]) => a.filter(x => !(form.allDay && AGENDA_LEMBRETES.find(l => l.id === x)?.soComHora)).sort().join();
  const padrao = valem([...AGENDA_ALERTAS_PADRAO]) === valem([...form.alertas]);
  const spin = (k: Busy) => busy === k;

  const resumoQuando = (() => {
    if (!parseDay(input.inicioDia)) return 'Escolha a data de início.';
    const fim = parseDay(input.fimDia) ? input.fimDia : input.inicioDia;
    const dias = dayDiffStr(input.inicioDia, fim) + 1;
    const ini = fmtDayLong(input.inicioDia);
    if (dias < 1) return 'O fim está antes do início.';
    if (dias > 1) return `de ${ini}${input.inicioHora ? ` às ${input.inicioHora}` : ''} a ${fmtDayLong(fim)}${input.fimHora ? ` às ${input.fimHora}` : ''} · ${dias} dias`;
    if (!input.inicioHora) return `${ini} · o dia inteiro`;
    if (!input.fimHora) return `${ini} · às ${input.inicioHora} (sem hora de fim)`;
    const dur = (minOf(input.fimHora) ?? 0) - (minOf(input.inicioHora) ?? 0);
    return `${ini} · das ${input.inicioHora} às ${input.fimHora}${dur > 0 ? ` (${fmtDur(dur)})` : ''}`;
  })();
  const quandoOk = !!parseDay(input.inicioDia) && dayDiffStr(input.inicioDia, parseDay(input.fimDia) ? input.fimDia : input.inicioDia) >= 0;

  // Fuso (achado D2, 29/09): toda hora da agenda é de Brasília (Joinville). Navegador com
  // outro deslocamento NAQUELE instante (viagem à China, participante em Oslo) → aviso com a
  // hora equivalente no relógio dele. Compara o deslocamento, não o nome do fuso (Recife,
  // Bahia e Fortaleza também são UTC−3 e não precisam de aviso).
  const iniInst = quandoOk ? brInstant(input.inicioDia, input.inicioHora) : null;
  const fimInst = iniInst && input.inicioHora && input.fimHora ? brInstant(parseDay(input.fimDia) ? input.fimDia : input.inicioDia, input.fimHora) : null;
  const fusoFora = (form.allDay || !!input.inicioHora) && (foraDeBrasilia(iniInst) || foraDeBrasilia(fimInst));
  const fusoNome = fusoFora ? fusoDoNavegador() : '';

  const erroCampo = (c: Campo) => campoErro === c && erroAtual ? (
    <p id={errId} role="alert" className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />{erroAtual}
    </p>
  ) : null;
  const inv = (c: Campo) => ({ 'aria-invalid': campoErro === c || undefined, 'aria-describedby': campoErro === c ? errId : undefined });

  const renderForm = () => (
    <fieldset disabled={isBusy} className="min-w-0 m-0 p-0 border-0 space-y-6">
      {/* O QUÊ */}
      <section className="space-y-3" aria-labelledby={`${uid}-s-oque`}>
        <h3 id={`${uid}-s-oque`} className={kickerCls}>O quê</h3>
        <div>
          <label htmlFor={`${uid}-tit`} className={labelCls}>Título <span className="text-rose-500" aria-hidden="true">*</span></label>
          <input id={`${uid}-tit`} ref={tituloRef} type="text" value={form.titulo} onChange={e => set({ titulo: e.target.value })}
            maxLength={200} required autoComplete="off" placeholder="Ex.: Viagem à China" className={inputCls} {...inv('titulo')} />
          {erroCampo('titulo')}
        </div>
        <fieldset className="min-w-0 m-0 p-0 border-0">
          <legend className={labelCls}>Tipo</legend>
          <div className="flex flex-wrap gap-1.5">
            {AGENDA_TIPOS.map(t => {
              const Icon = AGENDA_TIPO_ICON[t.id];
              const on = form.tipo === t.id;
              return (
                <label key={t.id}
                  className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer select-none transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 ${on ? 'text-slate-800 dark:text-white shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  style={on ? { borderColor: t.color, backgroundColor: `${t.color}24` } : undefined}>
                  <input type="radio" name={`${uid}-tipo`} value={t.id} checked={on} onChange={() => set({ tipo: t.id })} className="sr-only" />
                  <Icon size={14} style={{ color: t.color }} aria-hidden="true" />
                  {t.label}
                  {on && <Check size={12} className="text-slate-500 dark:text-slate-300" aria-hidden="true" />}
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      {/* QUANDO */}
      <section className="space-y-3" aria-labelledby={`${uid}-s-quando`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 id={`${uid}-s-quando`} className={kickerCls}>Quando</h3>
          <button type="button" role="switch" aria-checked={form.allDay} onClick={toggleAllDay}
            className={`inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 rounded-full pr-1 ${focusRing}`}>
            <span aria-hidden="true" className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${form.allDay ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.allDay ? 'translate-x-4' : ''}`} />
            </span>
            Dia inteiro
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={`${uid}-ini`} className={labelCls}>Início</label>
            <div className="flex gap-2">
              <input id={`${uid}-ini`} ref={inicioDiaRef} type="date" value={form.inicioDia} min="2000-01-01" max="2100-12-31" required
                onChange={e => onInicioDia(e.target.value)} className={`${inputCls} flex-1`} {...inv('quando')} />
              {!form.allDay && (
                // Largura na CAIXA (o inputCls tem w-full, que venceria um w-28 no próprio campo).
                <div className="w-28 sm:w-32 shrink-0">
                  <input ref={horaIniRef} type="time" value={form.horaIni} onChange={e => onHoraIni(e.target.value)} required
                    aria-label="Hora de início" className={inputCls} {...inv('quando')} />
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${uid}-fim`} className={labelCls}>
              Fim{!form.allDay && <span className="ml-1 normal-case font-normal tracking-normal text-slate-400 dark:text-slate-500">(hora opcional)</span>}
            </label>
            <div className="flex gap-2">
              <input id={`${uid}-fim`} ref={fimDiaRef} type="date" value={form.fimDia} min={parseDay(form.inicioDia) ? form.inicioDia : '2000-01-01'} max="2100-12-31"
                onChange={e => set({ fimDia: e.target.value })} className={`${inputCls} flex-1`} {...inv('quando')} />
              {!form.allDay && (
                <div className="relative w-28 sm:w-32 shrink-0">
                  <input ref={horaFimRef} type="time" value={form.horaFim} onChange={e => set({ horaFim: e.target.value })}
                    aria-label="Hora de fim (opcional)" className={inputCls} {...inv('quando')} />
                  {form.horaFim && (
                    <button type="button" onClick={() => { set({ horaFim: '' }); horaFimRef.current?.focus(); }} aria-label="Tirar a hora de fim" title="Sem hora de fim"
                      className={`absolute -right-1.5 -top-1.5 w-5 h-5 grid place-items-center rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40 dark:hover:text-rose-300 ${focusRing}`}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <Clock size={13} className="shrink-0 mt-px text-blue-500" aria-hidden="true" />
          <span>{resumoQuando}{rel ? <> · <b className="font-semibold text-slate-600 dark:text-slate-300">{rel}</b></> : null}{quandoOk ? <span className="text-slate-400 dark:text-slate-500"> · horário de Brasília (Joinville)</span> : null}</span>
        </p>
        {fusoFora && iniInst && (
          <p role="note" className="text-xs text-amber-800 dark:text-amber-200 flex items-start gap-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2">
            <Globe size={13} className="shrink-0 mt-px text-amber-500" aria-hidden="true" />
            <span className="min-w-0 break-words">{form.allDay
              ? <>Datas e horas da agenda são de Brasília. Você está em outro fuso{fusoNome ? ` (${fusoNome})` : ''}: os lembretes de dia inteiro saem às 7h de Brasília — veja em “Alertas previstos” a hora no seu relógio.</>
              : <>Hora de Brasília. No seu fuso{fusoNome ? ` (${fusoNome})` : ''}: <b className="tabular-nums">{fmtNoSeuFuso(iniInst)}</b>{fimInst ? <> até <b className="tabular-nums">{fmtNoSeuFuso(fimInst)}</b></> : null}. Se você pensou na hora daí, ajuste para a de Brasília.</>}</span>
          </p>
        )}
        {erroCampo('quando')}
        {jaAcabou && form.status === 'ativo' && (
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
            Este compromisso já terminou — nenhum lembrete nem aviso vai sair.
          </p>
        )}
      </section>

      {/* ONDE E DETALHES */}
      <section className="space-y-3" aria-labelledby={`${uid}-s-onde`}>
        <h3 id={`${uid}-s-onde`} className={kickerCls}>Onde e detalhes</h3>
        <div>
          <label htmlFor={`${uid}-local`} className={labelCls}>Local</label>
          <div className="relative">
            <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
            <input id={`${uid}-local`} ref={localRef} type="text" value={form.local} onChange={e => set({ local: e.target.value })}
              maxLength={200} autoComplete="off" placeholder="Cidade, cliente, sala…" className={`${inputCls} pl-9`} {...inv('local')} />
          </div>
          {erroCampo('local')}
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`${uid}-desc`} className={labelCls}>Descrição</label>
            <span className={`text-[10px] font-mono tabular-nums ${form.descricao.length > 3800 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`} aria-hidden="true">{form.descricao.length}/4000</span>
          </div>
          <textarea id={`${uid}-desc`} ref={descRef} value={form.descricao} onChange={e => set({ descricao: e.target.value })}
            maxLength={4000} rows={3} placeholder="Pauta, voo, hotel, o que levar…" className={`${inputCls} resize-y min-h-20`} {...inv('descricao')} />
          {erroCampo('descricao')}
        </div>
      </section>

      {/* PARTICIPANTES */}
      <section ref={partRef} className="space-y-2" aria-labelledby={`${uid}-s-part`}>
        <h3 id={`${uid}-s-part`} className={kickerCls}>Participantes</h3>
        {donoOcup && (
          <p className="text-xs text-amber-800 dark:text-amber-200 flex items-start gap-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-2">
            <AlertTriangle size={13} className="shrink-0 mt-px text-amber-500" aria-hidden="true" />
            <span className="min-w-0 break-words"><b>{souDono ? 'Você já tem' : `${donoNome} já tem`} compromisso neste horário</b> <span className="tabular-nums">({donoOcup.todos.join(' · ')})</span>. É só um aviso — dá para salvar assim mesmo.</span>
          </p>
        )}
        {/* Leitor de tela: o conflito do dono é anunciado quando aparece (região viva sempre presente). */}
        <p className="sr-only" aria-live="polite">{donoOcup ? `${souDono ? 'Você já tem' : `${donoNome} já tem`} compromisso neste horário.` : ''}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Escolha entre os usuários cadastrados. Eles recebem no e-mail cadastrado o convite, os lembretes e os avisos de mudança — mas não veem o compromisso no app.</p>
        {dispAtual && dispAtual.fase === 'conferindo' && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
            <Loader2 size={11} className="shrink-0 animate-spin" aria-hidden="true" />Conferindo quem está livre neste horário…
          </p>
        )}
        {ocupacao && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
            <Clock size={11} className="shrink-0 mt-px" aria-hidden="true" />“Livre” e “ocupado” valem para o horário acima e mostram só o horário ocupado — nunca o assunto do compromisso.
          </p>
        )}
        {dispAtual && dispAtual.fase === 'erro' && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <Info size={11} className="shrink-0" aria-hidden="true" />
            <span>Não consegui conferir quem está livre neste horário — dá para salvar assim mesmo.</span>
            <button type="button" onClick={() => setTentarOcup(n => n + 1)} className={`font-semibold text-blue-600 dark:text-blue-400 hover:underline rounded ${focusRing}`}>Tentar de novo</button>
          </p>
        )}
        {janelaLonga && !ocupAusente && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
            <Info size={11} className="shrink-0 mt-px" aria-hidden="true" />Compromisso com mais de {OCUPADO_JANELA_MAX_DIAS} dias: não dá para conferir quem está livre.
          </p>
        )}
        {/* Gravando: a lista fica visível (sem pular o layout), mas não aceita clique; a busca o fieldset desliga. */}
        <div className={isBusy ? 'pointer-events-none opacity-70' : ''}>
          <ParticipantPicker users={users} value={form.participantes} onChange={ids => set({ participantes: ids })} excludeId={ownerId} ocupacao={ocupacao} />
        </div>
        {erroCampo('participantes')}
      </section>

      {/* LEMBRETES */}
      <section className="space-y-2" aria-labelledby={`${uid}-s-lemb`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 id={`${uid}-s-lemb`} className={kickerCls}>Lembretes por e-mail</h3>
          {!padrao && (
            <button type="button" onClick={() => set({ alertas: [...AGENDA_ALERTAS_PADRAO] })} className={`text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline rounded ${focusRing}`}>
              Voltar ao padrão
            </button>
          )}
        </div>
        <div role="group" aria-labelledby={`${uid}-s-lemb`} className="flex flex-wrap gap-1.5">
          {AGENDA_LEMBRETES.map(l => {
            const off = l.soComHora && form.allDay;
            const on = form.alertas.includes(l.id) && !off;
            return (
              <button key={l.id} type="button" aria-pressed={on} disabled={off} onClick={() => toggleAlerta(l.id)}
                title={off ? 'Só vale com hora marcada — desligue “Dia inteiro”.' : undefined}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${focusRing} ${off
                  ? 'border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : on ? 'bg-blue-600 border-blue-600 text-white shadow-sm hover:bg-blue-700'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                {on ? <Check size={12} aria-hidden="true" /> : <BellRing size={12} className="opacity-60" aria-hidden="true" />}
                {l.label}
              </button>
            );
          })}
        </div>
        {form.allDay && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">“1 hora antes” e “30 minutos antes” só valem com hora marcada — desligue “Dia inteiro” para usar. Sem hora, os lembretes saem às 7h (de Brasília).</p>
        )}
      </section>

      {/* SITUAÇÃO (só no edit) */}
      {editando && (
        <section className="space-y-2" aria-labelledby={`${uid}-s-sit`}>
          <h3 id={`${uid}-s-sit`} className={kickerCls}>Situação</h3>
          <div role="radiogroup" aria-labelledby={`${uid}-s-sit`} className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-clip">
            {(['ativo', 'concluido', 'cancelado'] as AgendaStatus[]).map(s => {
              const on = form.status === s;
              return (
                <label key={s} className={`relative text-xs font-bold px-3 py-1.5 cursor-pointer select-none transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-blue-500 ${on ? STATUS_ON[s] : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                  <input type="radio" name={`${uid}-status`} value={s} checked={on} onChange={() => set({ status: s })} className="sr-only" />
                  {STATUS_LABEL[s]}
                </label>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Concluído e cancelado não geram lembretes. Cancelar avisa só quem já recebeu algum e-mail do compromisso desde que entrou na lista; excluir não avisa ninguém.</p>
        </section>
      )}
    </fieldset>
  );

  const renderFicha = () => {
    const it = item!;
    const linha = (rotulo: string, conteudo: React.ReactNode) => (
      <div className="flex flex-col sm:flex-row sm:gap-4 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
        <dt className="sm:w-28 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 sm:pt-0.5">{rotulo}</dt>
        <dd className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{conteudo}</dd>
      </div>
    );
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-200">
          {souConvidado ? <Mail size={14} className="shrink-0 mt-px" aria-hidden="true" /> : <Eye size={14} className="shrink-0 mt-px" aria-hidden="true" />}
          <p>{souConvidado
            ? <>Você foi convidado por <b>{donoNome}</b>. Os lembretes deste compromisso chegam no seu e-mail cadastrado; só {donoNome} altera.</>
            : <>Agenda de <b>{donoNome}</b> — só leitura. Só o dono altera os compromissos dele.</>}</p>
        </div>
        <dl>
          {linha('Quando', <span className="tabular-nums">{fmtQuando(it)}{rel ? <span className="text-slate-500 dark:text-slate-400"> · {rel}</span> : null}</span>)}
          {linha('Tipo', <span className="inline-flex items-center gap-1.5"><TipoIcon size={14} style={{ color: tipo.color }} aria-hidden="true" />{tipo.label}</span>)}
          {it.local && linha('Local', <span className="inline-flex items-start gap-1.5 break-words"><MapPin size={14} className="shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />{it.local}</span>)}
          {it.descricao && linha('Descrição', <p className="whitespace-pre-wrap break-words">{it.descricao}</p>)}
          {linha('Dono', donoNome)}
          {linha('Participantes', <ParticipantPicker users={users} value={it.participantes} onChange={() => { /* só leitura */ }} excludeId={it.ownerId} disabled />)}
          {linha('Lembretes', efetivos.length
            ? <span className="flex flex-wrap gap-1.5">{AGENDA_LEMBRETES.filter(l => efetivos.includes(l.id)).map(l => (
              <span key={l.id} className="inline-flex items-center gap-1 text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5"><BellRing size={11} className="text-blue-500" aria-hidden="true" />{l.label}</span>
            ))}</span>
            : <span className="text-slate-400">nenhum</span>)}
          {linha('Situação', <span className={`inline-block text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_CLS[it.status]}`}>{STATUS_LABEL[it.status]}</span>)}
        </dl>
      </div>
    );
  };

  const renderPrevistos = () => (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 p-3 sm:p-4 space-y-2.5" aria-labelledby={`${uid}-s-prev`}>
      <h3 id={`${uid}-s-prev`} className={`${kickerCls} flex flex-wrap items-center gap-x-1.5`}><CalendarClock size={12} className="text-orange-500" aria-hidden="true" /> Alertas previstos <span className="normal-case tracking-normal font-semibold text-slate-400 dark:text-slate-500">· horário de Brasília</span></h3>
      {previstos.length ? (
        <ul className="space-y-1">
          {previstos.map(p => (
            <li key={p.codigo} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-mono tabular-nums font-bold text-slate-700 dark:text-slate-200 shrink-0">{fmtInstantBR(p.quando)}</span>
              <span className="text-slate-500 dark:text-slate-400">{AGENDA_CODIGO_LABEL[p.codigo]}</span>
              {foraDeBrasilia(p.quando) && <span className="text-[11px] text-amber-700 dark:text-amber-400 tabular-nums">(no seu fuso: {fmtNoSeuFuso(p.quando)})</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5"><Info size={12} className="shrink-0 mt-0.5" aria-hidden="true" />{motivoSemPrevisto}</p>
      )}
      {notas.map(n => <p key={n} className="text-[11px] text-slate-500 dark:text-slate-400">{n}</p>)}
      <p className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-800">
        <Mail size={12} className="shrink-0 mt-0.5 text-blue-500" aria-hidden="true" />
        <span className="min-w-0 break-words">
          {donoRecebe || partRecebe > 0 ? (
            <>
              Os e-mails vão para:{' '}
              {donoRecebe && <><b>{souDono ? 'você' : donoNome}</b> <span className="text-slate-500 dark:text-slate-400">({souDono ? donoEmail : 'e-mail cadastrado'})</span></>}
              {donoRecebe && partRecebe > 0 && ' + '}
              {partRecebe > 0 && <><b>{partRecebe}</b> participante{partRecebe === 1 ? '' : 's'}</>}.
            </>
          ) : <b className="text-rose-600 dark:text-rose-400">Nenhum e-mail sai deste compromisso.</b>}
          {(!donoRecebe || partSemEmail > 0 || partFora > 0) && (() => {
            const n = (donoRecebe ? 0 : 1) + partSemEmail + partFora;
            const itens: React.ReactNode[] = [];
            if (!donoRecebe) itens.push(<span key="dono" className="font-bold text-rose-600 dark:text-rose-400">{souDono ? 'você' : donoNome} ({donoTemEmail ? 'e-mail fora da empresa' : 'sem e-mail cadastrado!'})</span>);
            if (partSemEmail > 0) itens.push(<span key="sem">{partSemEmail} participante{partSemEmail === 1 ? '' : 's'} sem e-mail</span>);
            if (partFora > 0) itens.push(<span key="fora">{partFora} participante{partFora === 1 ? '' : 's'} com e-mail fora da empresa</span>);
            return <span className="text-amber-700 dark:text-amber-400"> Não recebe{n === 1 ? '' : 'm'}: {itens.map((x, i) => <React.Fragment key={i}>{i > 0 ? ' · ' : ''}{x}</React.Fragment>)}.</span>;
          })()}
        </span>
      </p>
      {((donoTemEmail && !donoRecebe) || partFora > 0) && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          E-mail fora da empresa provavelmente não recebe: a agenda só manda para {dominiosEmpresaTexto()} (fora esses, só para um endereço liberado em Configurações, que esta tela não enxerga).
        </p>
      )}
      {!donoTemEmail && souDono && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">Cadastre seu e-mail em “Meu Perfil” para receber os lembretes.</p>
      )}
      {donoTemEmail && !donoRecebe && souDono && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">Cadastre o e-mail da empresa em “Meu Perfil” para receber os lembretes.</p>
      )}
      {avisos.length > 0 && (
        <div className="text-xs text-slate-600 dark:text-slate-300">
          <p className="font-semibold">Ao salvar, entra na fila de e-mails:</p>
          <ul className="mt-0.5 space-y-0.5">
            {avisos.map(a => <li key={a} className="flex items-start gap-1.5"><Send size={11} className="shrink-0 mt-0.5 text-orange-500" aria-hidden="true" />{a}</li>)}
          </ul>
          {avisoSoQuemSabe && (
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Cancelamento e remoção só vão para quem já recebeu algum e-mail deste compromisso desde que entrou na lista. Quem saiu da lista recebe só o título e as datas do último e-mail que recebeu.</p>
          )}
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">O envio roda a cada 5 minutos.</p>
        </div>
      )}
    </section>
  );

  const renderHistorico = () => (
    <section className="space-y-2" aria-labelledby={`${uid}-s-hist`}>
      <h3 id={`${uid}-s-hist`} className={`${kickerCls} flex items-center gap-1.5`}>
        <History size={12} aria-hidden="true" /> Histórico dos alertas <span className="text-slate-300 dark:text-slate-600">· {historico.length}</span>
      </h3>
      {historico.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">Nenhum e-mail na fila deste compromisso ainda.</p>
      ) : (
        <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {historico.map(a => {
            const quando = a.estado === 'enviado' && a.enviadoEm ? a.enviadoEm : a.disparaEm;
            // Fila parada (achado D4): a mesma régua da lista e do resumo.
            const atrasado = alertaAtrasado(a, now.getTime());
            return (
              <li key={a.id} className="px-3 py-2 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ${atrasado ? ESTADO_CLS.enviando : (ESTADO_CLS[a.estado] || ESTADO_CLS.expirado)}`}>
                  {atrasado ? 'atrasado' : (AGENDA_ESTADO_LABEL[a.estado] || String(a.estado || '?'))}
                </span>
                <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">{AGENDA_CODIGO_LABEL[a.codigo] || String(a.codigo || '?')}</span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0"
                  title={a.estado === 'enviado' ? `enviado em ${safeInstant(a.enviadoEm)} (previsto ${safeInstant(a.disparaEm)})` : `previsto para ${safeInstant(a.disparaEm)}`}>
                  {safeInstant(quando)}
                </span>
                {a.tentativas > 1 && <span className="shrink-0 text-slate-400">{a.tentativas} tentativas</span>}
                {a.destinatarios && <span className="min-w-0 flex-1 basis-40 truncate text-slate-500 dark:text-slate-400" title={a.destinatarios}>{a.destinatarios}</span>}
                {a.erro && (
                  <span className="basis-full min-w-0 truncate text-rose-600 dark:text-rose-400" title={a.erro}>
                    <AlertTriangle size={11} className="inline -mt-0.5 mr-1" aria-hidden="true" />{a.erro}
                  </span>
                )}
                {atrasado && (
                  <span className="basis-full min-w-0 break-words text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={11} className="inline -mt-0.5 mr-1" aria-hidden="true" />devia ter saído em {safeInstant(a.disparaEm)} — o disparador não está rodando
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <div
        className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
        onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget; }}
        onClick={e => { if (downOnBackdrop.current && e.target === e.currentTarget) requestClose(); downOnBackdrop.current = false; }}
        inert={confirm ? true : undefined}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-busy={isBusy || undefined}
          tabIndex={-1}
          onKeyDown={onPanelKey}
          className="relative w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 outline-none overflow-clip"
        >
          {/* Cabeçalho */}
          <div className="relative shrink-0 px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 dark:border-slate-800 border-l-4" style={{ borderLeftColor: tipo.color }}>
            <span aria-hidden="true" className="absolute left-2 top-2 w-3 h-3 border-l-2 border-t-2 border-orange-500/50" />
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl text-white shadow-md shrink-0" style={{ backgroundColor: tipo.color }}><TipoIcon size={20} aria-hidden="true" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">Agenda · <span className="text-orange-500 dark:text-orange-400">{kicker}</span></p>
                <h2 id={titleId} className={`text-lg sm:text-xl font-black leading-tight break-words ${input.titulo.trim() ? 'text-slate-800 dark:text-white' : 'text-slate-400 dark:text-slate-500'} ${input.status === 'cancelado' ? 'line-through decoration-2 decoration-rose-400/70' : ''}`}>
                  {tituloTela}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="tabular-nums">{fmtQuando(input)}</span>
                  {rel && <span>· {rel}</span>}
                  {mode !== 'new' && <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_CLS[input.status]}`}>{STATUS_LABEL[input.status]}</span>}
                  {dirty && <span className="text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">· não salvo</span>}
                </p>
              </div>
              <button type="button" onClick={requestClose} disabled={isBusy} aria-label="Fechar" title="Fechar (Esc)"
                className={`shrink-0 -mr-1.5 -mt-1 p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 ${focusRing}`}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Corpo (rola) */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-6">
            {mudouPorFora && (
              <div role="status" className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200">
                <AlertTriangle size={14} className="shrink-0 mt-px" aria-hidden="true" />
                <p>Este compromisso foi alterado em outra tela depois que você abriu. Salvar daqui não passa por cima: feche e abra de novo para ver a versão nova.</p>
              </div>
            )}
            {readOnly ? renderFicha() : renderForm()}
            {renderPrevistos()}
            {itemId && renderHistorico()}
          </div>

          {/* Rodapé */}
          <div className="relative shrink-0 border-t border-gray-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-5 sm:px-6 py-3 space-y-2">
            <span aria-hidden="true" className="absolute right-2 bottom-2 w-3 h-3 border-r-2 border-b-2 border-orange-500/50" />
            {notice && (
              <div role={notice.tone === 'error' ? 'alert' : 'status'}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${notice.tone === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300'}`}>
                {notice.tone === 'error' ? <AlertTriangle size={13} className="shrink-0 mt-px" aria-hidden="true" /> : <CheckCircle2 size={13} className="shrink-0 mt-px" aria-hidden="true" />}
                <span className="min-w-0 flex-1 break-words">{notice.msg}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className={`shrink-0 rounded opacity-70 hover:opacity-100 ${focusRing}`}><X size={13} /></button>
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0 sm:flex-1">
                {/* Pela situação GRAVADA quando o painel abriu (a mesma versão que a gravação exige). */}
                {editando && item && (
                  <>
                    {base.status === 'ativo' ? (
                      <button type="button" onClick={() => mudarStatus('concluido')} disabled={isBusy}
                        title={dirty ? 'Marca como concluído e salva também as alterações desta tela' : 'Marca como concluído — os lembretes que faltam não saem'}
                        className={`${btn} text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30`}>
                        {spin('status') ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}<span className="sm:hidden">Concluir</span><span className="hidden sm:inline">Marcar como concluído</span>
                      </button>
                    ) : (
                      <button type="button" onClick={pedirReabrir} disabled={isBusy}
                        title={dirty ? 'Reabre e salva também as alterações desta tela' : 'Volta a ativo — os lembretes voltam a valer'}
                        className={`${btn} text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30`}>
                        {spin('status') ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />} Reabrir
                      </button>
                    )}
                    {base.status === 'ativo' && (
                      <button type="button" onClick={pedirCancelar} disabled={isBusy} title="Cancela e avisa quem já recebeu algum e-mail dele desde que entrou na lista"
                        className={`${btn} text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30`}>
                        {spin('cancel') ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Ban size={14} aria-hidden="true" />} Cancelar compromisso
                      </button>
                    )}
                    <button type="button" onClick={pedirExcluir} disabled={isBusy} title="Apaga de vez (não avisa ninguém)"
                      className={`${btn} text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30`}>
                      {spin('delete') ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />} Excluir
                    </button>
                  </>
                )}
                {itemId && (
                  <button type="button" onClick={testar} disabled={isBusy}
                    title={dirty ? 'Manda agora um alerta deste compromisso para o SEU e-mail cadastrado — com o que está SALVO (não com o que foi mudado aqui)' : 'Manda agora um alerta deste compromisso para o SEU e-mail cadastrado'}
                    className={`${btn} text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800`}>
                    {spin('test') ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}<span className="sm:hidden">Enviar teste</span><span className="hidden sm:inline">Enviar teste para mim</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 sm:ml-auto sm:shrink-0">
                <button type="button" onClick={requestClose} disabled={isBusy} className={`${btnGhost} flex-1 sm:flex-none`}>Fechar</button>
                {!readOnly && (
                  <button type="button" onClick={salvar} disabled={isBusy || (editando && !dirty)}
                    title={editando && !dirty ? 'Nada mudou' : 'Salvar (Ctrl+Enter)'}
                    className={`${btn} flex-1 sm:flex-none px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-sm`}>
                    {spin('save') ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
                    {spin('save') ? 'Salvando…' : mode === 'new' ? 'Salvar compromisso' : 'Salvar alterações'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {confirm && <ConfirmBox {...confirm} onCancel={() => setConfirm(null)} fallbackFocus={panelRef} />}
    </>
  );
};

// ---- Export ------------------------------------------------------------------------------

export const AgendaItemModal: React.FC<AgendaItemModalProps> = (props) => {
  if (!props.open || typeof document === 'undefined') return null;
  // 'edit'/'view' sem item é engano de quem chamou: abre como novo (nunca grava por cima de nada).
  const mode: Mode = props.mode !== 'new' && !props.item ? 'new' : props.mode;
  return createPortal(
    <ErrorBoundary fallback={<ModalCrash onClose={props.onClose} />}>
      <ModalBody key={`${mode}:${props.item?.id || 'novo'}`} {...props} mode={mode} />
    </ErrorBoundary>,
    document.body,
  );
};
