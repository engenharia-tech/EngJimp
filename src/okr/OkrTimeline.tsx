import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withOkrSafe } from './OkrSafe';
import { createPortal } from 'react-dom';
import { CalendarRange, RefreshCw, Clock, MoveHorizontal, Lock, AlertTriangle } from 'lucide-react';
import { User } from '../types';
import { fetchAllOkrOrThrow, fetchOkrExecutors, mutateOkr, okrErrorMessage, addAuditLog } from '../services/storageService';
import { OkrStore, OkrPeriod, OkrKeyResult, OkrExecutor, OkrPersonRef, krProgress, krExecutores, refName, normName, toIsoDate, parseIsoDay, localDayOf, isBadDate } from './okr';
import { useToast } from '../components/Toast';

const activePeriod = (s: OkrStore) => s.periods.find(p => p.id === s.activePeriodId) || s.periods[0];
const barColor = (p: number, status: string) => status === 'Em risco' ? '#ef4444' : (p >= 1 || status === 'Concluído') ? '#10b981' : p >= 0.4 ? '#f59e0b' : '#3b82f6';
const monthLabel = (mk: number) => new Date(Math.floor(mk / 12), mk % 12, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
const fmtDay = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
// Soma dias no calendário LOCAL (construtor por partes — não soma milissegundos).
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const DAY = 86400000;
const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
const DEAD_ZONE_PX = 5;     // menos que isso é clique/tremida, não arraste
const HANDLE_IN_PX = 40;    // barra mais curta que isso: as alças ficam do lado de FORA
// O que estava gravado, como texto comparável (o dado do banco pode vir com tipo errado).
const raw = (v: unknown): string => typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);

// Janela de um período: lê o "range" (dd/mm/aaaa a dd/mm/aaaa, anos 2000–2100);
// se não der, usa o quadrimestre que termina em dez/2026 (01/09 a 31/12/2026).
const periodBounds = (p?: OkrPeriod): { ps: Date; pe: Date } => {
  const m = (typeof p?.range === 'string' ? p.range : '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const pad = (n: string) => n.padStart(2, '0');
  const ps = m ? parseIsoDay(`${m[3]}-${pad(m[2])}-${pad(m[1])}`) : null;
  const pe = m ? parseIsoDay(`${m[6]}-${pad(m[5])}-${pad(m[4])}`) : null;
  if (ps && pe) return { ps, pe };
  return { ps: new Date(2026, 8, 1), pe: new Date(2026, 11, 31) };
};

interface Bar {
  key: string; ownerKey: string; periodId: string; oi: number; ki: number; objId: string; krId: string;
  person: string; sector: string; title: string; s: Date; e: Date; swapped: boolean;
  progress: number; status: string; concl: boolean; executores: OkrPersonRef[];
  srcStart: string; srcDue: string;   // como estava gravado quando a tela leu
  srcUid: string; srcTitle: string;   // identidade: o KR que a tela mostrava (não outro com o mesmo rótulo)
  badDate: string;                    // "" ou a data gravada que não é data (ex.: ano 0026) — sem arraste
}
type Mode = 'move' | 'start' | 'end';
interface Drag { key: string; pointerId: number; mode: Mode; x0: number; px: number; py: number; pxPerDay: number; dDays: number; started: boolean; minD: number; maxD: number; }
interface Props { currentUser: User; users: User[]; canEdit?: boolean; }

// Datas resultantes de arrastar `d` dias no modo dado (início nunca passa do fim).
const preview = (b: Bar, mode: Mode, d: number): { s: Date; e: Date } => {
  if (mode === 'move') return { s: addDays(b.s, d), e: addDays(b.e, d) };
  if (mode === 'start') { const s = addDays(b.s, d); return { s: s > b.e ? b.e : s, e: b.e }; }
  const e = addDays(b.e, d); return { s: b.s, e: e < b.s ? b.s : e };
};

// Acha o KR da barra no período: pela posição (se ainda bate com os ids) ou, se
// o OKR mudou de ordem, pelo par (objetivo, KR) — só se for ÚNICO. Id repetido
// sem a posição batendo = não mexe em nada (mexeria nos dois).
const locate = (p: OkrPeriod, b: Bar): { oi: number; ki: number } | null => {
  const o = p.objectives[b.oi]; const k = o?.keyResults[b.ki];
  if (o && k && o.id === b.objId && k.id === b.krId) return { oi: b.oi, ki: b.ki };
  const hits: { oi: number; ki: number }[] = [];
  p.objectives.forEach((o2, oi) => { if (o2.id === b.objId) o2.keyResults.forEach((k2, ki) => { if (k2.id === b.krId) hits.push({ oi, ki }); }); });
  return hits.length === 1 ? hits[0] : null;
};

const OkrTimelineInner: React.FC<Props> = ({ currentUser, users, canEdit = false }) => {
  const { addToast } = useToast();
  const [rows, setRows] = useState<{ ownerKey: string; store: OkrStore }[] | null>(null);
  const [registry, setRegistry] = useState<OkrExecutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);   // a leitura dos OKRs falhou e não há nada na tela
  const [view, setView] = useState<'quad' | 'sem' | 'ano'>('quad'); // quantos meses cabem na tela: 4 / 6 / 12
  const [filterId, setFilterId] = useState('');                    // executor/equipe escolhido
  const [drag, setDrag] = useState<Drag | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // O ref é a verdade do arraste (muda na hora); o estado só redesenha. Nunca copiar
  // o estado para o ref no render: um render atrasado ressuscitava o arraste já
  // encerrado e o prazo era gravado duas vezes.
  const dragRef = useRef<Drag | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement | null>(null);
  const [trackW, setTrackW] = useState(0);
  const scrolledOnce = useRef(false);

  // Leitura que falha NÃO troca o gráfico por "nada andou": fica o que estava na
  // tela, com o aviso de que não deu para atualizar.
  const load = async () => {
    setLoading(true);
    try {
      const [all, ex] = await Promise.all([fetchAllOkrOrThrow().catch(() => null), fetchOkrExecutors().catch(() => null)]);
      if (all) { setRows(all); setLoadFailed(false); }
      else { if (!rows) setLoadFailed(true); addToast(rows ? 'Não consegui atualizar a linha do tempo (sem conexão?) — mostrando o que já estava na tela.' : 'Não consegui ler os OKRs (sem conexão?). Tente "Atualizar" em instantes.', 'error'); }
      if (ex) setRegistry(ex); else addToast('Não consegui ler o cadastro de executores — o filtro por executor fica incompleto.', 'warning');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const byKey = useMemo(() => { const m: Record<string, User> = {}; (users || []).forEach(u => { m[(u.username || '').trim().toLowerCase()] = u; }); return m; }, [users]);
  const byId = useMemo(() => new Map(registry.map(e => [e.id, e] as const)), [registry]);

  const { bars, waiting } = useMemo(() => {
    const bars: Bar[] = []; let waiting = 0;
    (rows || []).forEach(r => {
      const u = byKey[r.ownerKey]; const person = u?.name || r.store.owner || r.ownerKey; const sector = (u?.sector || '').trim();
      const ap = activePeriod(r.store); if (!ap) return; const { ps, pe } = periodBounds(ap);
      ap.objectives.forEach((o, oi) => o.keyResults.forEach((k, ki) => {
        if (k.archived) return;
        const p = krProgress(k);
        const concl = p >= 1 || String(k.status) === 'Concluído';
        const due = parseIsoDay(k.due);
        // Data gravada que não é data (ex.: "0026-09-20"): a barra aparece, marcada,
        // e sem arraste — arrastar trocaria calado a data ruim por outra inventada.
        const badDate = [isBadDate(k.start) ? `início "${raw(k.start)}"` : '', isBadDate(k.due) ? `prazo "${raw(k.due)}"` : ''].filter(Boolean).join(' e ');
        // "Aguardando": não começou (0%), sem data de FIM e não concluído — fica FORA do gráfico.
        if (!due && !badDate && p <= 0 && !concl) { waiting++; return; }
        // início: o preenchido, senão o começo do período.
        const start = parseIsoDay(k.start) || ps;
        // fim: o preenchido; senão, concluído termina quando foi dado como feito
        // (último ponto do histórico) e em andamento corre até o fim do período.
        let end = due;
        if (!end) {
          const h = Array.isArray(k.history) ? k.history : [];
          end = (concl && h.length ? localDayOf(h[h.length - 1]?.date) : null) || pe; // dia LOCAL (o histórico é gravado em UTC)
        }
        let s = start, e = end, swapped = false;
        if (e < s) { const t = s; s = e; e = t; swapped = true; }
        bars.push({ key: `${r.ownerKey}|${ap.id}|${oi}.${ki}|${o.id}|${k.id}`, ownerKey: r.ownerKey, periodId: ap.id, oi, ki, objId: String(o.id), krId: String(k.id),
          person, sector, title: raw(k.title), s, e, swapped, progress: p, status: raw(k.status), concl, executores: krExecutores(k, registry),
          srcStart: raw(k.start), srcDue: raw(k.due), srcUid: raw(k.uid), srcTitle: raw(k.title), badDate });
      }));
    });
    return { bars, waiting };
  }, [rows, byKey, registry]);

  // Filtro por executor/equipe. Escolher uma EQUIPE traz os KRs da própria equipe
  // e os das pessoas que pertencem a ela (campo "equipe" do cadastro).
  const sel = filterId ? byId.get(filterId) : undefined;
  const matches = (b: Bar) => {
    if (!sel) return true;
    return b.executores.some(r => {
      if (r.id === sel.id) return true;
      if (sel.kind !== 'equipe' || !r.id) return false;
      const e = byId.get(r.id); return !!e && normName(e.team) === normName(sel.name);
    });
  };
  const shown = bars.filter(matches);
  const usedIds = useMemo(() => { const s = new Set<string>(); bars.forEach(b => b.executores.forEach(r => { if (r.id) { s.add(r.id); const t = byId.get(r.id)?.team; if (t) registry.forEach(x => { if (x.kind === 'equipe' && normName(x.name) === normName(t)) s.add(x.id); }); } })); return s; }, [bars, byId, registry]);
  // O escolhido fica na lista mesmo se deixou de estar em uso — senão o seletor
  // mostrava "Todos" com o gráfico ainda filtrado.
  const filterOpts = registry.filter(e => usedIds.has(e.id) || e.id === filterId);

  // Eixo = do mês do início mais cedo ao mês do fim mais tarde (de TODOS os KRs, para
  // não pular ao filtrar), com um mês de folga de cada lado para dar onde arrastar.
  // Antes a janela terminava sempre em dezembro do maior ano: um prazo em 2027
  // empurrava tudo para 2027 e as barras de 2026 viravam uma lasca na borda.
  const span = view === 'ano' ? 12 : view === 'sem' ? 6 : 4;
  const { mkStart, mkEnd } = useMemo(() => {
    const now = new Date();
    let lo = bars.length ? bars[0].s : now, hi = bars.length ? bars[0].e : now;
    bars.forEach(b => { if (b.s < lo) lo = b.s; if (b.e > hi) hi = b.e; });
    const a = lo.getFullYear() * 12 + lo.getMonth() - 1;
    let z = hi.getFullYear() * 12 + hi.getMonth() + 1;
    while (z - a + 1 < span) z++;
    return { mkStart: a, mkEnd: z };
  }, [bars, span]);
  const months = useMemo(() => { const arr: number[] = []; for (let m = mkStart; m <= mkEnd; m++) arr.push(m); return arr; }, [mkStart, mkEnd]);
  const axisStartD = new Date(Math.floor(mkStart / 12), mkStart % 12, 1);
  const axisEndD = new Date(Math.floor(mkEnd / 12), mkEnd % 12 + 1, 0);  // último dia do último mês
  const axisStart = axisStartD.getTime();
  const axisEnd = axisEndD.getTime() + DAY;                               // fim do último dia
  const pct = (d: Date) => { const w = axisEnd - axisStart; return w <= 0 ? 0 : Math.max(0, Math.min(100, (d.getTime() - axisStart) / w * 100)); };
  const endPct = (d: Date) => pct(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)); // a barra cobre o último dia inteiro
  // A visão diz quantos meses cabem na largura; o que passar disso rola na horizontal.
  const scale = Math.max(1, months.length / span);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayPct = today.getTime() >= axisStart && today.getTime() <= axisEnd ? pct(today) : null;

  // Largura real do trilho (para decidir onde ficam as alças). Ref de função: o eixo
  // só existe depois que os dados chegam.
  const roRef = useRef<ResizeObserver | null>(null);
  const setAxisEl = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect(); roRef.current = null;
    axisRef.current = node;
    if (!node) return;
    const upd = () => setTrackW(node.getBoundingClientRect().width);
    upd();
    if (typeof ResizeObserver !== 'undefined') { roRef.current = new ResizeObserver(upd); roRef.current.observe(node); }
  }, []);
  useEffect(() => () => roRef.current?.disconnect(), []);
  // Na primeira vez, rola até perto de hoje.
  useEffect(() => {
    if (scrolledOnce.current || !scrollRef.current || !axisRef.current || todayPct === null || scale <= 1) return;
    scrolledOnce.current = true;
    const box = scrollRef.current, ax = axisRef.current;
    const axLeftInBox = ax.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    const label = ax.getBoundingClientRect().left - box.getBoundingClientRect().left; // largura da coluna fixa à esquerda
    box.scrollLeft = Math.max(0, axLeftInBox + ax.clientWidth * todayPct / 100 - label - (box.clientWidth - label) / 4);
  });

  const groups = useMemo(() => {
    const g: Record<string, Bar[]> = {};
    shown.forEach(b => { (g[b.person] = g[b.person] || []).push(b); });
    return Object.entries(g).map(([person, list]) => ({ person, sector: list[0].sector, list: list.sort((a, b) => a.s.getTime() - b.s.getTime()) }))
      .sort((a, b) => (a.sector || 'zz').localeCompare(b.sector || 'zz') || a.person.localeCompare(b.person));
  }, [shown]);

  // ---- Arrastar ----------------------------------------------------------
  const onDown = (ev: React.PointerEvent, b: Bar, mode: Mode) => {
    // Toque não arrasta (no celular o dedo ROLA a tela; um deslize virava prazo novo).
    if (!canEdit || savingKey || dragRef.current || ev.button !== 0 || ev.pointerType === 'touch' || b.badDate) return;
    const track = (ev.currentTarget as HTMLElement).closest('[data-track]') as HTMLElement | null;
    const w = track?.getBoundingClientRect().width || 0; if (w <= 0) return;
    ev.preventDefault(); ev.stopPropagation();
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch { /* sem captura, segue */ }
    const pxPerDay = w / ((axisEnd - axisStart) / DAY);
    // Limites: a prévia não sai do eixo (fora dele a barra ficaria presa na borda e
    // gravaria uma data que ninguém viu). Para ir além, solte: o eixo cresce.
    const toStart = dayDiff(b.s, axisStartD), toEnd = dayDiff(b.e, axisEndD);
    const lim = mode === 'move' ? { minD: toStart, maxD: toEnd }
      : mode === 'start' ? { minD: toStart, maxD: dayDiff(b.s, b.e) }
      : { minD: dayDiff(b.e, b.s), maxD: toEnd };
    const d: Drag = { key: b.key, pointerId: ev.pointerId, mode, x0: ev.clientX, px: ev.clientX, py: ev.clientY, pxPerDay, dDays: 0, started: false, ...lim };
    dragRef.current = d; setDrag(d);
  };
  // Só o ponteiro que começou o arraste mexe nele (um segundo dedo/mouse em outra
  // barra movia a primeira, e a data era gravada).
  const onMove = (ev: React.PointerEvent) => {
    const d = dragRef.current; if (!d || ev.pointerId !== d.pointerId) return;
    ev.stopPropagation();
    if (ev.pointerType === 'mouse' && ev.buttons === 0) { dragRef.current = null; setDrag(null); return; } // botão já solto: não é arraste
    const dx = ev.clientX - d.x0;
    if (!d.started && Math.abs(dx) < DEAD_ZONE_PX) return;
    const dDays = Math.max(d.minD, Math.min(d.maxD, Math.round(dx / d.pxPerDay)));
    if (!d.started || dDays !== d.dDays || Math.abs(ev.clientX - d.px) > 2) { const n = { ...d, started: true, dDays, px: ev.clientX, py: ev.clientY }; dragRef.current = n; setDrag(n); }
  };
  const onUp = (ev: React.PointerEvent, b: Bar) => {
    const d = dragRef.current; if (!d || d.key !== b.key || ev.pointerId !== d.pointerId) return;
    ev.stopPropagation();
    dragRef.current = null;               // antes de tudo: o pointerup que sobe da alça para a barra não grava de novo
    try { (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch { /* ok */ }
    setDrag(null);
    if (d.started && d.dDays !== 0) commit(b, d.mode, d.dDays);
  };
  // A barra arrastada sumiu da tela no meio (filtro trocado pelo teclado, releitura):
  // o arraste acaba sem gravar — antes ficava preso, e o próximo movimento sem botão
  // gravava uma data que ninguém arrastou.
  useEffect(() => {
    const d = dragRef.current;
    if (d && !shown.some(b => b.key === d.key)) { dragRef.current = null; setDrag(null); }
  });
  useEffect(() => {
    if (!drag) return;
    const end = (ev: PointerEvent) => { const d = dragRef.current; if (d && ev.pointerId === d.pointerId) { dragRef.current = null; setDrag(null); } };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
  }, [drag !== null]);
  // Cancelado pelo navegador ou perdeu a captura (janela trocou, etc.): não grava.
  const onCancel = (ev: React.PointerEvent) => { const d = dragRef.current; if (!d || ev.pointerId !== d.pointerId) return; dragRef.current = null; setDrag(null); };

  // Grava SÓ as datas deste KR, sobre o OKR relido do banco e com trava de versão.
  // Se o prazo foi mudado por outra pessoa depois que esta tela leu, não grava por
  // cima: avisa e atualiza.
  const commit = async (b: Bar, mode: Mode, d: number) => {
    const { s, e } = preview(b, mode, d);
    // Barra com início depois do fim no dado (invertida) → grava as duas pontas.
    const patch: Partial<OkrKeyResult> = (mode === 'move' || b.swapped) ? { start: toIsoDate(s), due: toIsoDate(e) }
      : mode === 'start' ? { start: toIsoDate(s) } : { due: toIsoDate(e) };
    const why: { v: '' | 'sumiu' | 'mudou' } = { v: '' }; // objeto: o apply() (closure) escreve aqui
    const apply = (st: OkrStore): OkrStore | null => {
      const pi = st.periods.findIndex(p => p.id === b.periodId);
      const loc = pi >= 0 ? locate(st.periods[pi], b) : null;
      if (!loc) { why.v = 'sumiu'; return null; }
      const p = st.periods[pi]; const o = p.objectives[loc.oi]; const k = o.keyResults[loc.ki];
      if (raw(k.uid) !== b.srcUid || raw(k.title) !== b.srcTitle) { why.v = 'sumiu'; return null; }  // outro KR com o mesmo rótulo
      if (raw(k.start) !== b.srcStart || raw(k.due) !== b.srcDue) { why.v = 'mudou'; return null; }
      const keyResults = o.keyResults.slice(); keyResults[loc.ki] = { ...k, ...patch };
      const objectives = p.objectives.slice(); objectives[loc.oi] = { ...o, keyResults };
      const periods = st.periods.slice(); periods[pi] = { ...p, objectives };
      return { ...st, periods };
    };
    setSavingKey(b.key);
    const before = (rows || []).find(r => r.ownerKey === b.ownerKey)?.store;   // para desfazer o otimista se não gravar
    setRows(rs => (rs || []).map(r => { if (r.ownerKey !== b.ownerKey) return r; const n = apply(r.store); return n ? { ...r, store: n } : r; })); // otimista
    try {
      why.v = '' as typeof why.v; // o otimista acima pode ter escrito; vale o que o banco disser
      const res = await mutateOkr(b.ownerKey, apply);
      if (!res) {
        throw new Error(why.v === 'mudou'
          ? `O prazo do ${b.krId} (${b.person}) foi mudado por outra pessoa enquanto a tela estava aberta — nada foi gravado. Atualizei; confira e arraste de novo.`
          : `O ${b.krId} não é mais o mesmo no OKR de ${b.person} (foi excluído, trocado, renomeado ou tem o id repetido) — nada foi gravado. Atualizei a tela.`);
      }
      setRows(rs => (rs || []).map(r => r.ownerKey === b.ownerKey ? { ...r, store: res.store } : r));
      try {
        addAuditLog({ userId: currentUser.id, userName: `${currentUser.name}${currentUser.surname ? ' ' + currentUser.surname : ''}`.trim(), action: 'UPDATE' as any, entityType: 'OKR', entityId: b.ownerKey, entityName: `${b.krId} — prazo`,
          details: `${currentUser.name} ajustou na linha do tempo o ${b.krId} do OKR de ${b.person}: ${fmtDay(b.s)} → ${fmtDay(b.e)} passou a ${fmtDay(s)} → ${fmtDay(e)}` });
      } catch { /* auditoria nunca trava */ }
      addToast(`${b.krId}: ${fmtDay(s)} → ${fmtDay(e)}`, 'success');
    } catch (err: any) {
      addToast(why.v ? err.message : okrErrorMessage(err, 'Não consegui salvar o novo prazo.'), 'error');
      // Não gravou: a barra volta para o que estava (se a releitura também falhar, a
      // tela não pode ficar na data que "não foi salva").
      if (before) setRows(rs => (rs || []).map(r => r.ownerKey === b.ownerKey ? { ...r, store: before } : r));
      await load();
    } finally { setSavingKey(null); }
  };

  if (loading && !rows) return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Carregando a linha do tempo…</div>;

  const selectCls = 'text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark] max-w-full';
  const labelCol = 'w-[var(--lab)] pl-5 shrink-0 sticky left-0 z-20 bg-white dark:bg-slate-900 self-stretch flex flex-col justify-center';

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 border-l-4 border-l-blue-500 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><CalendarRange size={22} /></div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">OKR · <span className="text-orange-500 dark:text-orange-400">Linha do tempo</span></p>
            <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Linha do tempo dos KRs</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quando cada resultado-chave corre — do início até a conclusão{rows ? <> · {shown.length}{sel ? ` de ${bars.length}` : ''} KRs</> : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <select value={filterId} onChange={e => setFilterId(e.target.value)} className={selectCls} aria-label="Filtrar por executor ou equipe">
            <option value="">Todos os executores</option>
            {filterOpts.some(e => e.kind === 'equipe') && <optgroup label="Equipes">{filterOpts.filter(e => e.kind === 'equipe').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>}
            {filterOpts.some(e => e.kind === 'pessoa') && <optgroup label="Pessoas">{filterOpts.filter(e => e.kind === 'pessoa').map(e => <option key={e.id} value={e.id}>{e.name}{e.team ? ` · ${e.team}` : ''}</option>)}</optgroup>}
          </select>
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden" role="group" aria-label="Quantos meses cabem na tela">
            {([['quad', 'Quadrimestre'], ['sem', 'Semestre'], ['ano', 'Ano']] as const).map(([v, lb]) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`text-xs font-bold px-3 py-1.5 transition-colors ${view === v ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{lb}</button>
            ))}
          </div>
          <button onClick={load} disabled={loading} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 disabled:opacity-50"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
        </div>
      </div>

      {loadFailed && !rows ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 shadow-sm border border-gray-200 dark:border-slate-700 text-center text-slate-500 dark:text-slate-400">
          Não consegui ler os OKRs (sem conexão?). <button onClick={load} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">Tentar de novo</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 shadow-sm border border-gray-200 dark:border-slate-700 text-center text-slate-400">
          <Clock size={28} className="mx-auto mb-3 opacity-50" />
          {sel ? <>Nenhum KR no gráfico com <b>{sel.name}</b> como executor.</> : <>Nenhum KR andou ainda — todos aguardando (sem data e sem progresso).{waiting > 0 ? ` (${waiting} aguardando)` : ''}</>}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4 pb-2 text-[10px] text-slate-400">
            {canEdit
              ? <><MoveHorizontal size={12} className="text-blue-500 shrink-0" /> Com o mouse: arraste a barra para mover o KR inteiro; puxe as bordas para mudar só o início ou só o prazo. No celular, ajuste as datas pelo OKR.{scale > 1 ? ' Role para os lados para ver o resto do período.' : ''}</>
              : <><Lock size={11} className="shrink-0" /> Só leitura — o ajuste por arraste é do Edson e do admin de OKR.</>}
          </div>
          <div ref={scrollRef} className="overflow-x-auto pr-5 pb-3 pt-6 [contain:inline-size] [--lab:9.5rem] sm:[--lab:17.25rem]">
            <div style={{ width: scale > 1 ? `calc(var(--lab) + (100% - var(--lab)) * ${scale.toFixed(3)})` : '100%' }}>
              {/* eixo de meses */}
              <div className="flex items-stretch border-b border-gray-100 dark:border-slate-800 pb-2 mb-2">
                <div className={`${labelCol} !justify-end -mt-6 pt-6 text-[10px] font-bold text-slate-400 uppercase tracking-wide`}>Resultado-chave</div>
                <div ref={setAxisEl} className="flex-1 grid relative" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                  {months.map(m => <div key={m} className="text-[10px] font-bold text-slate-400 uppercase text-center border-l border-gray-100 dark:border-slate-800 pb-0.5">{monthLabel(m)}</div>)}
                  {todayPct !== null && <span className="absolute -top-4 text-[9px] font-bold text-orange-500 -translate-x-1/2 pointer-events-none" style={{ left: `${todayPct}%` }}>hoje</span>}
                </div>
              </div>
              {groups.map(gr => (
                <div key={gr.person} className="mb-1.5">
                  <div className="flex items-stretch py-1.5">
                    <div className={`${labelCol} !flex-row !justify-start items-center gap-2 min-w-0`}>
                      <span className="text-xs font-black text-slate-700 dark:text-slate-200 truncate">{gr.person}</span>
                      {gr.sector && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 shrink-0">{gr.sector}</span>}
                    </div>
                  </div>
                  {gr.list.map(b => {
                    const dragging = drag?.key === b.key;
                    const moved = dragging && drag!.started;
                    const { s, e } = moved ? preview(b, drag!.mode, drag!.dDays) : { s: b.s, e: b.e };
                    const left = pct(s); const width = Math.max(1.2, endPct(e) - left);
                    const widthPx = trackW * width / 100;
                    const handlesInside = widthPx >= HANDLE_IN_PX;
                    const col = barColor(b.progress, b.status);
                    const ex = b.executores.map(r => refName(r, byId));
                    const busy = savingKey === b.key;
                    const tip = `${b.krId} · ${fmtDay(s)} → ${fmtDay(e)} · ${Math.round(b.progress * 100)}%${b.concl ? ' · concluído' : ''}${ex.length ? ` · executores: ${ex.join(', ')}` : ''}${b.badDate ? ` · ⚠ data gravada inválida (${b.badDate}) — corrija no OKR; sem arraste até lá` : canEdit ? ' · arraste para ajustar' : ''}`;
                    const draggable = canEdit && !b.badDate;
                    const handle = (mode: Mode, side: 'left' | 'right') => draggable && (
                      <span onPointerDown={ev => onDown(ev, b, mode)} onPointerMove={onMove} onPointerUp={ev => onUp(ev, b)} onPointerCancel={onCancel} onLostPointerCapture={onCancel}
                        className={`absolute top-0 bottom-0 z-10 cursor-ew-resize ${handlesInside
                          ? `${side === 'left' ? 'left-0 rounded-l-md' : 'right-0 rounded-r-md'} w-2 hover:bg-white/40`
                          : `${side === 'left' ? '-left-2.5 rounded-l-md' : '-right-2.5 rounded-r-md'} w-2.5 bg-slate-300/70 dark:bg-slate-600/70 hover:bg-blue-400`}`}
                        style={{ touchAction: 'manipulation' }} title={side === 'left' ? 'Puxe para mudar o início' : 'Puxe para mudar o prazo'} aria-hidden="true" />
                    );
                    return (
                      <div key={b.key} className="flex items-stretch py-1">
                        <div className={`${labelCol} pr-2 min-w-0`}>
                          <div className="truncate text-[11px] text-slate-600 dark:text-slate-300"><span className="font-bold text-blue-600 dark:text-blue-400 mr-1">{b.krId}</span>{b.badDate && <AlertTriangle size={11} className="inline -mt-0.5 mr-1 text-rose-500" aria-label="data inválida" />}{b.title}</div>
                          {b.badDate && <div className="truncate text-[10px] font-semibold text-rose-500" title={`Data gravada inválida: ${b.badDate}. Corrija no OKR do dono.`}>data inválida: {b.badDate}</div>}
                          {ex.length > 0 && <div className="truncate text-[10px] text-slate-400" title={ex.join(', ')}>{ex.join(' · ')}</div>}
                        </div>
                        <div className="flex-1 relative h-6 self-center" data-track>
                          <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                            {months.map(m => <div key={m} className="border-l border-gray-100 dark:border-slate-800" />)}
                          </div>
                          {todayPct !== null && <div className="absolute top-0 bottom-0 w-px bg-orange-400/60 pointer-events-none" style={{ left: `${todayPct}%` }} />}
                          <div className={`absolute top-1/2 -translate-y-1/2 h-4 ${dragging ? 'z-10' : ''}`} style={{ left: `${left}%`, width: `${width}%` }}>
                            <div
                              aria-label={tip} title={tip}
                              onPointerDown={ev => onDown(ev, b, 'move')} onPointerMove={onMove} onPointerUp={ev => onUp(ev, b)} onPointerCancel={onCancel} onLostPointerCapture={onCancel}
                              className={`absolute inset-0 rounded-md flex items-center justify-between px-2 shadow-sm overflow-hidden select-none ${draggable ? (dragging ? 'cursor-grabbing ring-2 ring-white/70' : 'cursor-grab') : ''} ${b.badDate ? 'ring-2 ring-rose-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''} ${busy ? 'opacity-60 animate-pulse' : ''}`}
                              style={{ background: b.badDate ? `repeating-linear-gradient(45deg, ${col}, ${col} 6px, #f43f5e 6px, #f43f5e 9px)` : col, touchAction: 'manipulation' }}>
                              <span className="text-[9px] font-bold text-white/95 tabular-nums truncate pointer-events-none">{Math.round(b.progress * 100)}%</span>
                              {!moved && !b.concl && width > 12 && <span className="text-[9px] font-semibold text-white/80 truncate hidden sm:inline pointer-events-none">em andamento</span>}
                            </div>
                            {handle('start', 'left')}{handle('end', 'right')}
                            {/* Prévia da data colada no PONTEIRO, desenhada fora da caixa que rola
                                (portal): antes ficava presa à ponta da barra e sumia com a rolagem
                                ou por baixo da coluna fixa. */}
                            {moved && typeof document !== 'undefined' && createPortal(
                              <span role="status" className="fixed z-[9999] whitespace-nowrap text-[11px] font-bold tabular-nums text-white bg-slate-900 dark:bg-slate-700 rounded px-2 py-1 shadow-lg pointer-events-none"
                                style={{ left: Math.max(8, Math.min((typeof window !== 'undefined' ? window.innerWidth : 1200) - 190, drag!.px + 14)), top: Math.max(8, drag!.py - 38) }}>
                                {drag!.mode === 'start' ? `início ${fmtDay(s)}` : drag!.mode === 'end' ? `prazo ${fmtDay(e)}` : `${fmtDay(s)} → ${fmtDay(e)}`}
                              </span>, document.body)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-slate-400 px-5 pb-4">Só entram KRs que já andaram (com progresso, com data ou concluídos). Um KR em andamento sem fim corre até o fim do período; concluído termina quando foi feito.{waiting > 0 ? ` · ${waiting} KR(s) aguardando (sem data e sem progresso) fora do gráfico.` : ''}</p>
        </div>
      )}
    </div>
  );
};

export const OkrTimeline = withOkrSafe<Props>(OkrTimelineInner, 'a linha do tempo');
