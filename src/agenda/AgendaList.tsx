// AGENDA (29/09/2026) — a visão em LISTA: "Em andamento", depois dia a dia a partir de
// hoje, e "Anteriores" recolhido no fim. Cada cartão mostra o compromisso e os ALERTAS
// dele (o que está agendado, o que já saiu, o que falhou) — lidos da fila do banco.
//
// Também moram aqui os pedaços que a linha do tempo usa igual (ícone do tipo, nome da
// pessoa, ordem dos itens), para as duas visões nunca divergirem.
import React, { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Plane, Handshake, Users, ListTodo, Ticket, CircleDot, Clock, MapPin, User as UserIcon,
  Check, TriangleAlert, Ban, MailX, Bell, ChevronDown, ChevronRight, History, Eye, RefreshCw,
} from 'lucide-react';
import { User } from '../types';
import {
  AgendaItem, AgendaAlerta, AgendaAlertaEstado, AgendaTipo,
  AGENDA_LEMBRETES, AGENDA_CODIGO_LABEL, AGENDA_ESTADO_LABEL,
  tipoInfo, fmtQuando, fmtDay, fmtDayLong, fmtFalta, fmtInstantBR, dayDiffStr, previewAlertas,
} from './agenda';

// ---- Pedaços comuns às duas visões ----------------------------------------

export const TIPO_ICON: Record<AgendaTipo, LucideIcon> = {
  viagem: Plane, visita: Handshake, reuniao: Users, tarefa: ListTodo, evento: Ticket, outro: CircleDot,
};

export const TipoIcon: React.FC<{ tipo: AgendaTipo; size?: number; className?: string; style?: React.CSSProperties }> = ({ tipo, size = 14, className, style }) => {
  const I = TIPO_ICON[tipo] || CircleDot;
  return <I size={size} className={className} style={style} aria-hidden="true" />;
};

// Nome de gente = nome + sobrenome do cadastro (o login só se não houver nome).
export const nomeDe = (u?: User | null): string =>
  u ? (`${u.name || ''}${u.surname ? ' ' + u.surname : ''}`.trim() || u.username || '') : '';
export const nomePorId = (byId: Map<string, User>, id: string): string => nomeDe(byId.get(id)) || 'usuário excluído';

// Ordem de sempre: dia, depois hora (o "dia inteiro" primeiro), depois título.
export const porInicio = (a: AgendaItem, b: AgendaItem): number =>
  a.inicioDia.localeCompare(b.inicioDia) || (a.inicioHora || '').localeCompare(b.inicioHora || '') || a.titulo.localeCompare(b.titulo);

// 'AAAA-MM-DD' → 'dd/mm'.
export const ddmm = (day: string): string => fmtDay(day).slice(0, 5);

// Instante vindo do banco → "09/10 17:00". Texto que não é data não derruba a tela
// (o Intl lança RangeError com data inválida).
export const instante = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : fmtInstantBR(d).replace(',', '');
};

// ---- Fuso (achado D2, 29/09) --------------------------------------------------
// Toda hora da agenda é hora de Brasília (Joinville, UTC−3 fixo desde 2019). Quem abre de
// outro fuso (a viagem à China) precisa ser avisado. Compara-se o DESLOCAMENTO do navegador
// naquele instante, não o nome do fuso: Recife, Bahia e Fortaleza também são UTC−3.
export const fusoDoNavegador = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
};
export const foraDeBrasilia = (d: Date | null | undefined): boolean =>
  !!d && !isNaN(d.getTime()) && d.getTimezoneOffset() !== 180;
// O instante no relógio de quem está olhando: "qui, 02/10, 01:00".
export const fmtNoSeuFuso = (d: Date): string => {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
  const tz = fusoDoNavegador();
  try { return new Intl.DateTimeFormat('pt-BR', tz ? { ...opts, timeZone: tz } : opts).format(d).replace(/\./g, ''); }
  catch { return d.toLocaleString('pt-BR', opts).replace(/\./g, ''); }
};

// ---- Fila parada (achado D4, 29/09) ---------------------------------------------
// O disparador roda a cada 5 min. Um e-mail pendente que devia ter saído há mais de 10 min,
// sem tentativa com erro, quer dizer que ele não está rodando (segredo diferente, variável
// faltando na Vercel, 013 não rodada) — não é espera normal.
const ATRASO_MS = 10 * 60000;
// Pendente com erro = já tentou e vai tentar de novo (espera crescente, até 5 vezes).
export const alertaRetentando = (a: AgendaAlerta): boolean => a.estado === 'pendente' && a.tentativas > 0 && !!a.erro;
export const alertaAtrasado = (a: AgendaAlerta, agoraMs: number = Date.now()): boolean => {
  if (a.estado !== 'pendente' || alertaRetentando(a)) return false;
  const t = Date.parse(a.disparaEm);
  return !isNaN(t) && t < agoraMs - ATRASO_MS;
};

// ---- Chip de um alerta da fila ---------------------------------------------

const AVISO_CURTO: Record<string, string> = { convite: 'convite', alterado: 'alteração', cancelado: 'cancelamento', removido: 'remoção' };
const CINZA = 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
const ESTADO_CLS: Record<AgendaAlertaEstado, string> = {
  pendente: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  enviando: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  falhou: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800',
  expirado: CINZA,
  sem_destinatario: CINZA,
};

export const AlertaChip: React.FC<{ a: AgendaAlerta }> = ({ a }) => {
  const lemb = AGENDA_LEMBRETES.find(l => l.id === a.codigo);
  const nome = lemb ? lemb.curto : (AVISO_CURTO[a.codigo] || String(a.codigo));
  const quando = instante(a.estado === 'enviado' && a.enviadoEm ? a.enviadoEm : a.disparaEm);
  const retentando = alertaRetentando(a);
  const atrasado = alertaAtrasado(a);
  const cls = retentando || atrasado ? ESTADO_CLS.enviando : (ESTADO_CLS[a.estado] || CINZA);
  const Icon = a.estado === 'enviado' ? Check
    : a.estado === 'falhou' || retentando || atrasado ? TriangleAlert
    : a.estado === 'expirado' ? Ban
    : a.estado === 'sem_destinatario' ? MailX
    : Clock;
  const oque = AGENDA_CODIGO_LABEL[a.codigo] || String(a.codigo);
  const estado = atrasado ? 'atrasado' : (AGENDA_ESTADO_LABEL[a.estado] || String(a.estado));
  const detalhe =
    a.estado === 'enviado' ? `saiu em ${quando}${a.destinatarios ? ` para ${a.destinatarios}` : ''}`
    : a.estado === 'falhou' ? `${a.tentativas} tentativa(s)${a.erro ? ` · erro: ${a.erro}` : ''}`
    : a.estado === 'expirado' ? 'o disparador não mandou antes do compromisso'
    : a.estado === 'sem_destinatario' ? 'ninguém da lista tem e-mail da empresa cadastrado'
    : retentando ? `não saiu na ${a.tentativas}ª tentativa (${a.erro}) — vai tentar de novo`
    : a.estado === 'enviando' ? 'saindo agora'
    : atrasado ? `devia ter saído em ${quando} — o disparador não está rodando`
    : `sai em ${quando}`;
  const tip = `${oque} — ${estado}: ${detalhe}`;
  return (
    <span title={tip} aria-label={tip}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold tabular-nums rounded-full border px-2 py-0.5 whitespace-nowrap ${cls} ${a.estado === 'expirado' || a.estado === 'sem_destinatario' ? 'line-through decoration-slate-400/60' : ''}`}>
      <Icon size={10} className={`shrink-0 ${a.estado === 'enviando' ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {nome}{quando ? ` · ${quando}` : ''}{atrasado ? ' · atrasado' : ''}
    </span>
  );
};

// ---- A lista ----------------------------------------------------------------

export interface AgendaListProps {
  items: AgendaItem[];                        // já filtrados pela tela
  alertasPorItem: Map<string, AgendaAlerta[]>;
  alertasOk: boolean;                         // a fila foi lida (senão não se afirma "sem alerta")
  usersById: Map<string, User>;
  currentUserId: string;
  hoje: string;                               // 'AAAA-MM-DD' de Joinville
  onOpen: (item: AgendaItem) => void;
}

export const AgendaList: React.FC<AgendaListProps> = ({ items, alertasPorItem, alertasOk, usersById, currentUserId, hoje, onOpen }) => {
  const [showPast, setShowPast] = useState(false);

  const { andamento, dias, anteriores } = useMemo(() => {
    const andamento: AgendaItem[] = [];
    const anteriores: AgendaItem[] = [];
    const porDia = new Map<string, AgendaItem[]>();
    items.forEach(it => {
      if (it.fimDia < hoje) anteriores.push(it);
      else if (it.inicioDia < hoje) andamento.push(it);
      else { const l = porDia.get(it.inicioDia); if (l) l.push(it); else porDia.set(it.inicioDia, [it]); }
    });
    andamento.sort(porInicio);
    anteriores.sort((a, b) => -porInicio(a, b));   // o mais recente primeiro
    const dias = Array.from(porDia.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([dia, l]) => ({ dia, list: l.sort(porInicio) }));
    return { andamento, dias, anteriores };
  }, [items, hoje]);

  // Função de render (não componente interno: seria recriado a cada render).
  const renderCard = (it: AgendaItem) => {
    const tp = tipoInfo(it.tipo);
    const dono = it.ownerId === currentUserId;
    const convidado = !dono && it.participantes.includes(currentUserId);
    const cancel = it.status === 'cancelado';
    const concl = it.status === 'concluido';
    const partNomes = it.participantes.map(id => (id === currentUserId ? 'você' : nomePorId(usersById, id)));
    const alertas = (alertasPorItem.get(it.id) || []);
    const multi = it.fimDia !== it.inicioDia;
    const open = () => onOpen(it);
    return (
      <div key={it.id} role="button" tabIndex={0} onClick={open}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
        aria-label={`${it.titulo} — ${tp.label}, ${fmtQuando(it)}${it.local ? `, ${it.local}` : ''}. ${dono ? 'Abrir para editar' : 'Abrir (só leitura)'}`}
        className={`group flex gap-3 items-stretch rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 cursor-pointer transition-colors hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${concl ? 'opacity-60' : ''}`}>
        <span className="w-1 rounded-full shrink-0" style={{ background: cancel ? '#94a3b8' : tp.color }} aria-hidden="true" />
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${cancel ? '#94a3b8' : tp.color}1f`, color: cancel ? '#94a3b8' : tp.color }} aria-hidden="true">
          <TipoIcon tipo={it.tipo} size={16} />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={`text-sm font-bold text-slate-800 dark:text-slate-100 break-words ${cancel ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>{concl && <Check size={13} className="inline -mt-0.5 mr-1 text-emerald-500" aria-hidden="true" />}{it.titulo}</span>
            {multi && <span className="text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">até {ddmm(it.fimDia)}</span>}
            {concl && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-full px-2 py-0.5">concluído</span>}
            {cancel && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">cancelado</span>}
            {convidado && <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 rounded-full px-2 py-0.5">convidado</span>}
            {!dono && !convidado && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5" title="Compromisso de outra pessoa — só leitura"><Eye size={10} aria-hidden="true" /> leitura</span>}
          </div>
          <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 tabular-nums"><Clock size={12} className="shrink-0" aria-hidden="true" />{fmtQuando(it)}</span>
            {it.local && <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={12} className="shrink-0" aria-hidden="true" /><span className="truncate max-w-[16rem]">{it.local}</span></span>}
            {!dono && <span className="inline-flex items-center gap-1"><UserIcon size={12} className="shrink-0" aria-hidden="true" />de {nomePorId(usersById, it.ownerId)}</span>}
          </div>
          {partNomes.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 min-w-0" title={`Participantes: ${partNomes.join(', ')}`}>
              <Users size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{partNomes.slice(0, 3).join(', ')}{partNomes.length > 3 ? ` +${partNomes.length - 3}` : ''}</span>
            </div>
          )}
          {alertasOk && alertas.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-0.5">
              <Bell size={11} className="text-slate-400 shrink-0 mr-0.5" aria-label="Alertas por e-mail" />
              {alertas.map(a => <AlertaChip key={a.id} a={a} />)}
            </div>
          )}
          {/* Fila vazia: só se afirma o motivo quando ele é certo (sem lembrete escolhido, ou
              todos já no passado). Lembrete previsto e ainda fora da fila = não se diz nada. */}
          {alertasOk && alertas.length === 0 && it.status === 'ativo' && it.fimDia >= hoje && (!it.alertas.length || !previewAlertas(it).length) && (
            <p className="text-[10px] text-slate-400 italic">{it.alertas.length ? 'Sem alerta por vir (os horários escolhidos já passaram).' : 'Sem alerta por e-mail.'}</p>
          )}
        </div>
      </div>
    );
  };

  const kicker = 'font-mono text-[10px] font-bold tracking-[0.18em] uppercase';

  return (
    <div className="space-y-5">
      {andamento.length > 0 && (
        <section aria-label="Em andamento" className="space-y-2">
          <h3 className={`${kicker} text-orange-500 dark:text-orange-400 flex items-center gap-2 px-1`}><RefreshCw size={12} aria-hidden="true" /> Em andamento <span className="text-slate-300 dark:text-slate-600">· {andamento.length}</span></h3>
          <div className="space-y-2">{andamento.map(renderCard)}</div>
        </section>
      )}

      {dias.map(({ dia, list }) => {
        const n = dayDiffStr(hoje, dia);
        const rot = n === 0 ? `Hoje · ${fmtDayLong(dia)}` : n === 1 ? `Amanhã · ${fmtDayLong(dia)}` : fmtDayLong(dia);
        return (
          <section key={dia} aria-label={rot} className="space-y-2">
            <h3 className={`${kicker} flex items-center gap-2 px-1 ${n === 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {n === 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" aria-hidden="true" />}
              {rot}
              {n > 1 && <span className="text-slate-300 dark:text-slate-600 normal-case tracking-normal font-semibold">· {fmtFalta(dia, hoje)}</span>}
            </h3>
            <div className="space-y-2">{list.map(renderCard)}</div>
          </section>
        );
      })}

      {andamento.length === 0 && dias.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-6">Nada marcado de hoje em diante{anteriores.length ? ' — só compromissos anteriores.' : '.'}</p>
      )}

      {anteriores.length > 0 && (
        <section aria-label="Anteriores" className="space-y-2">
          <button type="button" onClick={() => setShowPast(v => !v)} aria-expanded={showPast}
            className={`${kicker} w-full flex items-center gap-2 px-1 py-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}>
            {showPast ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
            <History size={12} aria-hidden="true" /> Anteriores ({anteriores.length})
          </button>
          {showPast && <div className="space-y-2">{anteriores.map(renderCard)}</div>}
        </section>
      )}
    </div>
  );
};

export default AgendaList;
