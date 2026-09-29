// AGENDA (29/09/2026) — a visão em LINHA DO TEMPO. Irmã da linha do tempo do OKR
// (src/okr/OkrTimeline.tsx): eixo de meses com "hoje", coluna fixa à esquerda, barras do
// início ao fim e arraste com o mouse — mas SEPARADA dela (dados e tabela próprios).
//
// Datas: tudo em 'AAAA-MM-DD' de Joinville; a posição no eixo é conta de DIAS
// (dayDiffStr), nunca de milissegundos — um dia é um dia, qualquer que seja o fuso do
// navegador.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoveHorizontal, Lock, Crosshair, Check } from 'lucide-react';
import { User } from '../types';
import { AgendaItem, AgendaTipo, AGENDA_TIPOS, tipoInfo, parseDay, toDay, addDaysStr, dayDiffStr, fmtDay, fmtQuando, STATUS_LABEL } from './agenda';
import { TipoIcon, nomePorId, porInicio, ddmm } from './AgendaList';

export type AgendaJanela = 'mes' | 'quad' | 'sem' | 'ano';
export const JANELAS: { id: AgendaJanela; label: string; meses: number }[] = [
  { id: 'mes', label: 'Mês', meses: 1 },
  { id: 'quad', label: 'Quadrimestre', meses: 4 },
  { id: 'sem', label: 'Semestre', meses: 6 },
  { id: 'ano', label: 'Ano', meses: 12 },
];

type Mode = 'move' | 'start' | 'end';
interface Drag { key: string; pointerId: number; mode: Mode; x0: number; px: number; py: number; pxPerDay: number; dDays: number; started: boolean; minD: number; maxD: number; }
type Datas = { inicioDia: string; fimDia: string };
// Um bloco da linha do tempo: um TIPO (na agenda de uma pessoa) ou uma PESSOA (em "todas").
interface Grupo { key: string; tipo: AgendaTipo | null; title: string; sub: string; color: string; list: AgendaItem[] }

const DEAD_ZONE_PX = 5;     // menos que isso é clique/tremida, não arraste
const HANDLE_IN_PX = 40;    // barra mais curta que isso: as alças ficam do lado de FORA
const CLICK_AFTER_DRAG_MS = 400; // o "click" que o navegador solta depois de um arraste não abre o compromisso
const CANCEL_BG = 'repeating-linear-gradient(45deg, #94a3b8, #94a3b8 6px, #cbd5e1 6px, #cbd5e1 9px)';
const monthLabel = (mk: number) => new Date(Math.floor(mk / 12), mk % 12, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
const daysInMonth = (mk: number) => new Date(Math.floor(mk / 12), mk % 12 + 1, 0).getDate();

// Datas resultantes de arrastar `d` dias no modo dado (o início nunca passa do fim).
const previewDatas = (it: AgendaItem, mode: Mode, d: number): Datas => {
  if (mode === 'move') return { inicioDia: addDaysStr(it.inicioDia, d), fimDia: addDaysStr(it.fimDia, d) };
  if (mode === 'start') { const s = addDaysStr(it.inicioDia, d); return { inicioDia: s > it.fimDia ? it.fimDia : s, fimDia: it.fimDia }; }
  const e = addDaysStr(it.fimDia, d); return { inicioDia: it.inicioDia, fimDia: e < it.inicioDia ? it.inicioDia : e };
};

// Fins de semana sombreados (só quando cabe: dia com 8 px ou mais). Um gradiente que se
// repete a cada 7 dias, em % da largura do trilho — um só estilo por linha.
const weekendBg = (axisStartDay: string, totalDays: number): string | undefined => {
  const d0 = parseDay(axisStartDay); if (!d0 || totalDays <= 0) return undefined;
  const w0 = d0.getDay();                               // 0 = domingo … 6 = sábado
  const segs = [(6 - w0 + 7) % 7, (7 - w0) % 7].sort((a, b) => a - b); // sábado e domingo, em dias desde o início do ciclo
  const u = (x: number) => `${(x / totalDays * 100).toFixed(5)}%`;
  const c = 'rgba(148,163,184,0.12)';
  const stops: string[] = []; let p = 0;
  segs.forEach(s => { if (s > p) stops.push(`transparent ${u(p)} ${u(s)}`); stops.push(`${c} ${u(s)} ${u(s + 1)}`); p = s + 1; });
  if (p < 7) stops.push(`transparent ${u(p)} ${u(7)}`);
  return `repeating-linear-gradient(90deg, ${stops.join(', ')})`;
};

export interface AgendaTimelineProps {
  items: AgendaItem[];            // o que a tela mostra (já filtrado)
  axisItems: AgendaItem[];        // o que define a janela do eixo (sem o filtro de tipo: o eixo não pula ao filtrar)
  groupBy: 'tipo' | 'pessoa';
  janela: AgendaJanela;
  usersById: Map<string, User>;
  currentUserId: string;
  hoje: string;                   // 'AAAA-MM-DD' de Joinville
  savingId: string | null;        // gravando as datas de um item: ninguém arrasta até acabar
  onOpen: (item: AgendaItem) => void;
  onCommitDates: (item: AgendaItem, datas: Datas) => void;
}

export const AgendaTimeline: React.FC<AgendaTimelineProps> = ({ items, axisItems, groupBy, janela, usersById, currentUserId, hoje, savingId, onOpen, onCommitDates }) => {
  const [drag, setDrag] = useState<Drag | null>(null);
  // O ref é a verdade do arraste (muda na hora); o estado só redesenha. Nunca copiar o
  // estado para o ref no render (um render atrasado ressuscitava o arraste encerrado).
  const dragRef = useRef<Drag | null>(null);
  const lastDragEnd = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement | null>(null);
  const [trackW, setTrackW] = useState(0);
  const scrolledOnce = useRef(false);

  const span = (JANELAS.find(j => j.id === janela) || JANELAS[1]).meses;

  // Eixo: do mês do menor início (ou hoje, o que vier antes) − 1 ao mês do maior fim (ou
  // hoje) + 1, e no mínimo os meses da janela escolhida.
  const { mkStart, mkEnd } = useMemo(() => {
    let lo = hoje, hi = hoje;
    axisItems.forEach(i => {
      if (parseDay(i.inicioDia) && i.inicioDia < lo) lo = i.inicioDia;
      if (parseDay(i.fimDia) && i.fimDia > hi) hi = i.fimDia;
    });
    const lod = parseDay(lo) || new Date(), hid = parseDay(hi) || new Date();
    const a = lod.getFullYear() * 12 + lod.getMonth() - 1;
    let z = hid.getFullYear() * 12 + hid.getMonth() + 1;
    while (z - a + 1 < span) z++;
    return { mkStart: a, mkEnd: z };
  }, [axisItems, hoje, span]);
  const months = useMemo(() => { const arr: number[] = []; for (let m = mkStart; m <= mkEnd; m++) arr.push(m); return arr; }, [mkStart, mkEnd]);
  const axisStartDay = toDay(new Date(Math.floor(mkStart / 12), mkStart % 12, 1));
  const axisEndDay = toDay(new Date(Math.floor(mkEnd / 12), mkEnd % 12 + 1, 0));   // último dia do último mês
  const totalDays = dayDiffStr(axisStartDay, axisEndDay) + 1;
  const pct = (day: string) => Math.max(0, Math.min(100, dayDiffStr(axisStartDay, day) / totalDays * 100));
  const endPct = (day: string) => Math.max(0, Math.min(100, (dayDiffStr(axisStartDay, day) + 1) / totalDays * 100)); // a barra cobre o último dia inteiro
  // A janela diz quantos meses cabem na largura; o resto rola na horizontal.
  const scale = Math.max(1, months.length / span);
  const todayPct = hoje >= axisStartDay && hoje <= axisEndDay ? pct(hoje) : null;
  const pxPerDay = totalDays > 0 ? trackW / totalDays : 0;
  const monthCols = months.map(m => `${daysInMonth(m)}fr`).join(' '); // mês com a largura dos dias dele (as linhas batem com as barras)
  const bg = pxPerDay >= 8 ? weekendBg(axisStartDay, totalDays) : undefined;
  const showDays = pxPerDay >= 18;

  // Largura real do trilho (alças dentro/fora, marcação dos dias). Ref de função: o
  // eixo só existe depois que os dados chegam.
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

  // Rola até hoje: ao abrir e ao trocar a janela. O "hoje" fica a 1/4 da área visível.
  const scrollToToday = (smooth: boolean) => {
    const box = scrollRef.current, ax = axisRef.current;
    if (!box || !ax || todayPct === null) return;
    const labelW = ax.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft; // largura da coluna fixa
    const left = Math.max(0, ax.clientWidth * todayPct / 100 - (box.clientWidth - labelW) / 4);
    if (smooth && typeof box.scrollTo === 'function') box.scrollTo({ left, behavior: 'smooth' }); else box.scrollLeft = left;
  };
  useEffect(() => { scrolledOnce.current = false; }, [janela]);
  // O eixo ganhou/perdeu meses à ESQUERDA (mostrar concluídos, arrastar o item mais antigo,
  // releitura): compensa a rolagem para a vista não pular — o mesmo dia fica no mesmo lugar.
  const prevStart = useRef(axisStartDay);
  useLayoutEffect(() => {
    const old = prevStart.current; prevStart.current = axisStartDay;
    const box = scrollRef.current, ax = axisRef.current;
    if (old === axisStartDay || !scrolledOnce.current || !box || !ax || totalDays <= 0) return;
    const w = ax.getBoundingClientRect().width; if (w <= 0) return;
    box.scrollLeft += dayDiffStr(axisStartDay, old) * w / totalDays;
  }, [axisStartDay, totalDays]);
  useEffect(() => {
    if (scrolledOnce.current || !scrollRef.current || !axisRef.current || todayPct === null || scale <= 1) return;
    scrolledOnce.current = true;
    scrollToToday(false);
  });

  const groups = useMemo<Grupo[]>(() => {
    const valid = items.filter(i => parseDay(i.inicioDia) && parseDay(i.fimDia));
    if (groupBy === 'tipo') {
      return AGENDA_TIPOS.map((t): Grupo => ({ key: t.id, tipo: t.id, title: t.plural, sub: '', color: t.color, list: valid.filter(i => i.tipo === t.id).sort(porInicio) }))
        .filter(g => g.list.length > 0);
    }
    const g = new Map<string, AgendaItem[]>();
    valid.forEach(i => { const l = g.get(i.ownerId); if (l) l.push(i); else g.set(i.ownerId, [i]); });
    return Array.from(g.entries()).map(([ownerId, list]) => ({
      key: ownerId, tipo: null, title: nomePorId(usersById, ownerId), sub: (usersById.get(ownerId)?.sector || '').trim(), color: '', list: list.sort(porInicio),
    })).sort((a, b) => (a.sub || 'zz').localeCompare(b.sub || 'zz') || a.title.localeCompare(b.title));
  }, [items, groupBy, usersById]);

  // ---- Arrastar (só o DONO, só item ativo, só mouse) --------------------------
  const canDrag = (it: AgendaItem) => it.ownerId === currentUserId && it.status === 'ativo';

  const onDown = (ev: React.PointerEvent, it: AgendaItem, mode: Mode) => {
    // Toque não arrasta (no celular o dedo ROLA a tela; um deslize virava data nova).
    if (!canDrag(it) || savingId || dragRef.current || ev.button !== 0 || ev.pointerType === 'touch') return;
    const track = (ev.currentTarget as HTMLElement).closest('[data-track]') as HTMLElement | null;
    const w = track?.getBoundingClientRect().width || 0; if (w <= 0 || totalDays <= 0) return;
    ev.preventDefault(); ev.stopPropagation();
    try { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); } catch { /* sem captura, segue */ }
    const pxPerDayNow = w / totalDays;
    // Limites: a prévia não sai do eixo (para ir além, solte: o eixo cresce). E, no mesmo
    // dia, o fim não pode ficar antes do início (14:00 → 10:00): aí fica 1 dia de folga.
    const spanD = Math.max(0, dayDiffStr(it.inicioDia, it.fimDia));
    const gap = it.inicioHora && it.fimHora && it.fimHora < it.inicioHora ? 1 : 0;
    const toStart = dayDiffStr(it.inicioDia, axisStartDay), toEnd = dayDiffStr(it.fimDia, axisEndDay);
    const lim = mode === 'move' ? { minD: Math.min(0, toStart), maxD: Math.max(0, toEnd) }
      : mode === 'start' ? { minD: Math.min(0, toStart), maxD: Math.max(0, spanD - gap) }
      : { minD: Math.min(0, -(spanD - gap)), maxD: Math.max(0, toEnd) };
    const d: Drag = { key: it.id, pointerId: ev.pointerId, mode, x0: ev.clientX, px: ev.clientX, py: ev.clientY, pxPerDay: pxPerDayNow, dDays: 0, started: false, ...lim };
    dragRef.current = d; setDrag(d);
  };
  // Só o ponteiro que começou o arraste mexe nele.
  const onMove = (ev: React.PointerEvent) => {
    const d = dragRef.current; if (!d || ev.pointerId !== d.pointerId) return;
    ev.stopPropagation();
    if (ev.pointerType === 'mouse' && ev.buttons === 0) { dragRef.current = null; setDrag(null); return; } // botão já solto: não é arraste
    const dx = ev.clientX - d.x0;
    if (!d.started && Math.abs(dx) < DEAD_ZONE_PX) return;
    const dDays = Math.max(d.minD, Math.min(d.maxD, Math.round(dx / d.pxPerDay)));
    if (!d.started || dDays !== d.dDays || Math.abs(ev.clientX - d.px) > 2) { const n = { ...d, started: true, dDays, px: ev.clientX, py: ev.clientY }; dragRef.current = n; setDrag(n); }
  };
  const onUp = (ev: React.PointerEvent, it: AgendaItem) => {
    const d = dragRef.current; if (!d || d.key !== it.id || ev.pointerId !== d.pointerId) return;
    ev.stopPropagation();
    dragRef.current = null;               // antes de tudo: o pointerup que sobe da alça para a barra não grava de novo
    try { (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId); } catch { /* ok */ }
    setDrag(null);
    if (d.started) {
      lastDragEnd.current = Date.now();
      if (d.dDays !== 0) {
        const next = previewDatas(it, d.mode, d.dDays);
        if (next.inicioDia !== it.inicioDia || next.fimDia !== it.fimDia) onCommitDates(it, next);
      }
    }
  };
  // A barra arrastada sumiu da tela no meio (filtro trocado, releitura): o arraste
  // acaba sem gravar.
  useEffect(() => {
    const d = dragRef.current;
    if (d && !items.some(i => i.id === d.key && canDrag(i))) { dragRef.current = null; setDrag(null); }
  });
  useEffect(() => {
    if (!drag) return;
    const end = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (d && ev.pointerId === d.pointerId) { if (d.started) lastDragEnd.current = Date.now(); dragRef.current = null; setDrag(null); }
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
  }, [drag !== null]);
  // Cancelado pelo navegador ou perdeu a captura: não grava.
  const onCancel = (ev: React.PointerEvent) => {
    const d = dragRef.current; if (!d || ev.pointerId !== d.pointerId) return;
    if (d.started) lastDragEnd.current = Date.now();
    dragRef.current = null; setDrag(null);
  };
  // Clique sem arraste abre o compromisso (editar se é o dono; ver se não é).
  const onClickItem = (it: AgendaItem) => {
    if (dragRef.current || Date.now() - lastDragEnd.current < CLICK_AFTER_DRAG_MS) return;
    onOpen(it);
  };

  const labelCol = 'w-[var(--lab)] pl-5 shrink-0 sticky left-0 z-20 bg-white dark:bg-slate-900 self-stretch flex flex-col justify-center';
  const anyMine = items.some(canDrag);
  const anyOthers = items.some(i => i.ownerId !== currentUserId);

  // Marcação dos dias no eixo (só quando o dia é largo o bastante: janela "Mês").
  const dayTicks = useMemo(() => {
    if (!showDays) return [] as { day: string; n: number; wk: boolean; left: number }[];
    const d0 = parseDay(axisStartDay); if (!d0) return [];
    const out: { day: string; n: number; wk: boolean; left: number }[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
      out.push({ day: toDay(d), n: d.getDate(), wk: d.getDay() === 0 || d.getDay() === 6, left: (i + 0.5) / totalDays * 100 });
    }
    return out;
  }, [showDays, axisStartDay, totalDays]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2 text-[10px] text-slate-400 flex-wrap">
        <span className="inline-flex items-start gap-2 min-w-0 flex-1">
          {anyMine
            ? <><MoveHorizontal size={12} className="text-blue-500 shrink-0 mt-px" aria-hidden="true" />
                <span className="sm:hidden">Toque num compromisso para abrir. Para mudar as datas arrastando, use o computador.</span>
                <span className="hidden sm:inline">Com o mouse: arraste a barra para mudar as datas; puxe as bordas para mudar só o início ou só o fim (a hora fica). Clique para abrir.{anyOthers ? ' Compromissos de outras pessoas são só leitura.' : ''}</span></>
            : <><Lock size={11} className="shrink-0 mt-px" aria-hidden="true" /><span>Clique num compromisso para ver os detalhes. Só o dono muda as datas (e só de compromisso ativo).</span></>}
        </span>
        {scale > 1 && todayPct !== null && (
          <button type="button" onClick={() => scrollToToday(true)} aria-label="Rolar a linha do tempo até hoje"
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400 hover:underline shrink-0">
            <Crosshair size={11} aria-hidden="true" /> Hoje
          </button>
        )}
      </div>
      <div ref={scrollRef} className="overflow-x-auto pr-5 pb-3 pt-6 [contain:inline-size] [--lab:9.5rem] sm:[--lab:17.25rem]">
        <div style={{ width: scale > 1 ? `calc(var(--lab) + (100% - var(--lab)) * ${scale.toFixed(3)})` : '100%' }}>
          {/* eixo de meses */}
          <div className="flex items-stretch border-b border-gray-100 dark:border-slate-800 pb-2 mb-2">
            <div className={`${labelCol} !justify-end -mt-6 pt-6 text-[10px] font-bold text-slate-400 uppercase tracking-wide`}>Compromisso</div>
            <div ref={setAxisEl} className="flex-1 relative">
              <div className="grid" style={{ gridTemplateColumns: monthCols }}>
                {/* O nome do mês gruda à esquerda do trilho enquanto o mês está à vista (na
                    janela "Mês" o centro da coluna sai da tela ao rolar). */}
                {months.map(m => (
                  <div key={m} className="text-[10px] font-bold text-slate-400 uppercase text-center border-l border-gray-100 dark:border-slate-800 pb-0.5 whitespace-nowrap overflow-clip">
                    <span className="sticky inline-block px-1" style={{ left: 'calc(var(--lab) + 0.25rem)' }}>{monthLabel(m)}</span>
                  </div>
                ))}
              </div>
              {showDays && (
                <div className="relative h-3.5 mt-0.5" aria-hidden="true">
                  {dayTicks.map(t => (
                    <span key={t.day} className={`absolute top-0 -translate-x-1/2 text-[9px] tabular-nums ${t.day === hoje ? 'font-black text-orange-500' : t.wk ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`} style={{ left: `${t.left}%` }}>{t.n}</span>
                  ))}
                </div>
              )}
              {todayPct !== null && <span className="absolute -top-4 text-[9px] font-bold text-orange-500 -translate-x-1/2 pointer-events-none" style={{ left: `${todayPct}%` }}>hoje</span>}
            </div>
          </div>

          {groups.map(gr => (
            <div key={gr.key} className="mb-1.5">
              <div className="flex items-stretch py-1.5">
                <div className={`${labelCol} !flex-row !justify-start items-center gap-2 min-w-0`}>
                  {gr.tipo
                    ? <><TipoIcon tipo={gr.tipo} size={13} className="shrink-0" style={{ color: gr.color }} />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300 truncate">{gr.title}</span>
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 shrink-0">· {gr.list.length}</span></>
                    : <><span className="text-xs font-black text-slate-700 dark:text-slate-200 truncate">{gr.title}</span>
                        {gr.sub && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 shrink-0">{gr.sub}</span>}</>}
                </div>
              </div>
              {gr.list.map(it => {
                const tp = tipoInfo(it.tipo);
                const dragging = drag?.key === it.id;
                const moved = dragging && drag!.started;
                const { inicioDia: s, fimDia: e } = moved ? previewDatas(it, drag!.mode, drag!.dDays) : { inicioDia: it.inicioDia, fimDia: it.fimDia };
                const left = pct(s); const width = Math.max(0.3, endPct(e) - left);
                const widthPx = trackW * width / 100;
                const draggable = canDrag(it);
                const handlesInside = widthPx >= HANDLE_IN_PX;
                const cancel = it.status === 'cancelado';
                const concl = it.status === 'concluido';
                const dono = it.ownerId === currentUserId;
                const convidado = !dono && it.participantes.includes(currentUserId);
                const busy = savingId === it.id;
                // O que vai escrito: hora (um dia com hora), nº de dias (vários dias), ✓ (concluído).
                const nDias = dayDiffStr(s, e) + 1;
                const hora = it.inicioHora ? `${it.inicioHora}${it.fimHora && s === e ? `–${it.fimHora}` : ''}` : '';
                const txt = s === e ? hora : `${nDias} d`;
                const txtPx = txt.length * 6 + 14 + (concl ? 10 : 0);
                const txtInside = !!txt && widthPx >= txtPx;
                const quando = fmtQuando({ ...it, inicioDia: s, fimDia: e });
                const tip = `${it.titulo} · ${tp.label} · ${quando}${it.local ? ` · ${it.local}` : ''}${it.status !== 'ativo' ? ` · ${STATUS_LABEL[it.status].toLowerCase()}` : ''}${convidado ? ' · você é convidado' : !dono ? ` · de ${nomePorId(usersById, it.ownerId)} (só leitura)` : ''}${draggable ? ' · arraste para mudar as datas; clique para abrir' : ' · clique para abrir'}`;
                const handle = (mode: Mode, side: 'left' | 'right') => draggable && (
                  <span onPointerDown={ev => onDown(ev, it, mode)} onPointerMove={onMove} onPointerUp={ev => onUp(ev, it)} onPointerCancel={onCancel} onLostPointerCapture={onCancel}
                    className={`absolute top-0 bottom-0 z-10 cursor-ew-resize ${handlesInside
                      ? `${side === 'left' ? 'left-0 rounded-l-md' : 'right-0 rounded-r-md'} w-2 hover:bg-white/40`
                      : `${side === 'left' ? '-left-2.5 rounded-l-md' : '-right-2.5 rounded-r-md'} w-2.5 bg-slate-300/70 dark:bg-slate-600/70 hover:bg-blue-400`}`}
                    style={{ touchAction: 'manipulation' }} title={side === 'left' ? 'Puxe para mudar o início' : 'Puxe para mudar o fim'} aria-hidden="true" />
                );
                return (
                  <div key={it.id} className="flex items-stretch py-1">
                    <div className={`${labelCol} pr-2 min-w-0`}>
                      <div className={`truncate text-[11px] font-semibold ${cancel ? 'line-through text-slate-400 dark:text-slate-500' : concl ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`} title={it.titulo}>
                        {concl && <Check size={11} className="inline -mt-0.5 mr-0.5 text-emerald-500" aria-label="concluído" />}{it.titulo}
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-slate-400">
                        <span className="inline-flex items-center gap-1 font-bold shrink-0" style={{ color: cancel ? undefined : tp.color }}>
                          <TipoIcon tipo={it.tipo} size={10} /><span className="hidden sm:inline">{tp.label}</span>
                        </span>
                        {convidado && <span className="font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 rounded-full px-1.5 shrink-0">convidado</span>}
                        {it.local && <span className="truncate" title={it.local}>· {it.local}</span>}
                      </div>
                    </div>
                    <div className="flex-1 relative h-7 self-center" data-track style={bg ? { backgroundImage: bg } : undefined}>
                      <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: monthCols }}>
                        {months.map(m => <div key={m} className="border-l border-gray-100 dark:border-slate-800" />)}
                      </div>
                      {todayPct !== null && <div className="absolute top-0 bottom-0 w-px bg-orange-400/60 pointer-events-none" style={{ left: `${todayPct}%` }} />}
                      <div className={`absolute top-1/2 -translate-y-1/2 h-5 ${dragging ? 'z-10' : ''}`} style={{ left: `${left}%`, width: `${width}%`, minWidth: 6 }} onClick={() => onClickItem(it)}>
                        <div
                          role="button" tabIndex={0} aria-label={tip} title={tip}
                          onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(it); } }}
                          onPointerDown={ev => onDown(ev, it, 'move')} onPointerMove={onMove} onPointerUp={ev => onUp(ev, it)} onPointerCancel={onCancel} onLostPointerCapture={onCancel}
                          className={`absolute inset-0 rounded-md flex items-center justify-center px-1.5 shadow-sm overflow-hidden select-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${draggable ? (dragging ? 'cursor-grabbing ring-2 ring-white/70' : 'cursor-grab') : 'cursor-pointer'} ${concl ? 'opacity-50' : ''} ${busy ? 'opacity-60 animate-pulse' : ''}`}
                          style={{ background: cancel ? CANCEL_BG : tp.color, touchAction: 'manipulation' }}>
                          {txtInside && <span className="text-[10px] font-bold text-white/95 tabular-nums truncate pointer-events-none">{concl ? '✓ ' : ''}{txt}</span>}
                          {!txtInside && concl && widthPx >= 12 && <span className="text-[10px] font-bold text-white pointer-events-none">✓</span>}
                        </div>
                        {!txtInside && txt && !moved && (
                          <span className={`absolute top-1/2 -translate-y-1/2 text-[10px] font-semibold tabular-nums whitespace-nowrap pointer-events-none ${cancel ? 'line-through text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}
                            style={{ left: `calc(100% + ${draggable && !handlesInside ? 14 : 5}px)` }}>{txt}</span>
                        )}
                        {handle('start', 'left')}{handle('end', 'right')}
                        {/* Prévia da data colada no PONTEIRO, fora da caixa que rola (portal). */}
                        {moved && typeof document !== 'undefined' && createPortal(
                          <span role="status" className="fixed z-[9999] whitespace-nowrap text-[11px] font-bold tabular-nums text-white bg-slate-900 dark:bg-slate-700 rounded px-2 py-1 shadow-lg pointer-events-none"
                            style={{ left: Math.max(8, Math.min((typeof window !== 'undefined' ? window.innerWidth : 1200) - 190, drag!.px + 14)), top: Math.max(8, drag!.py - 38) }}>
                            {drag!.mode === 'start' ? `início ${fmtDay(s)}` : drag!.mode === 'end' ? `fim ${fmtDay(e)}` : s === e ? fmtDay(s) : `${fmtDay(s)} → ${fmtDay(e)}`}
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
      <p className="text-[10px] text-slate-400 px-5 pb-4">
        A barra vai do dia de início ao dia de fim (inteiro). Arrastar muda só as datas — a hora e os alertas acompanham (o banco refaz a fila de e-mails), e quem já recebeu o convite é avisado da mudança por e-mail.{bg ? ' Fins de semana sombreados.' : ''} Hoje: {ddmm(hoje)}.
      </p>
    </div>
  );
};

export default AgendaTimeline;
