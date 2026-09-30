// AGENDA (29/09/2026) — a visão em LINHA DO TEMPO. Irmã da linha do tempo do OKR
// (src/okr/OkrTimeline.tsx): eixo de meses com "hoje", coluna fixa à esquerda, barras do
// início ao fim e arraste com o mouse — mas SEPARADA dela (dados e tabela próprios).
//
// Datas: tudo em 'AAAA-MM-DD' de Joinville; a posição no eixo é conta de DIAS
// (dayDiffStr), nunca de milissegundos do navegador — um dia é um dia, qualquer que seja o
// fuso dele. A HORA entra como fração do dia, pela mesma régua do livre/ocupado e do
// convite (intervaloAgenda, hora de Brasília fixa em UTC−3).
//
// ZOOM (30/09/2026) — Edson, com a tela na mão: "a janela de exibição deve poder ampliar
// visão por dia, semana, mês e trimestre". A janela diz QUANTO cabe na largura visível
// (Dia = 1 dia … Ano = 12 meses); o resto rola na horizontal. O eixo se adapta ao que
// cabe (horas, blocos de dia, números, segundas, meses) e a barra vai do início ao fim do
// HORÁRIO (07:00–12:00 = 5/24 do dia), não mais do dia inteiro.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoveHorizontal, Lock, Crosshair, Check } from 'lucide-react';
import { User } from '../types';
import { AgendaItem, AgendaTipo, AGENDA_TIPOS, tipoInfo, parseDay, toDay, addDaysStr, dayDiffStr, fmtDay, fmtQuando, STATUS_LABEL, brInstant, intervaloAgenda, normHour, todayBR } from './agenda';
import { TipoIcon, nomePorId, porInicio, ddmm } from './AgendaList';

export type AgendaJanela = 'dia' | 'semana' | 'mes' | 'tri' | 'sem' | 'ano';
const MES_DIAS = 365.25 / 12;
// `dias` = quanto cabe na largura visível; `curto` = o rótulo no celular (o do botão
// "Semestre" continua "Sem.", como antes de 30/09; "Semana" vai por extenso).
export const JANELAS: { id: AgendaJanela; label: string; curto: string; dias: number }[] = [
  { id: 'dia', label: 'Dia', curto: 'Dia', dias: 1 },
  { id: 'semana', label: 'Semana', curto: 'Semana', dias: 7 },
  { id: 'mes', label: 'Mês', curto: 'Mês', dias: MES_DIAS },
  { id: 'tri', label: 'Trimestre', curto: 'Trim.', dias: 3 * MES_DIAS },
  { id: 'sem', label: 'Semestre', curto: 'Sem.', dias: 6 * MES_DIAS },
  { id: 'ano', label: 'Ano', curto: 'Ano', dias: 12 * MES_DIAS },
];
export const JANELA_PADRAO: AgendaJanela = 'mes';
// O que o navegador guardou. Até 29/09 havia "Quadrimestre" ('quad'): vira Trimestre.
export const lerJanela = (v: string | null | undefined): AgendaJanela => {
  if (v === 'quad') return 'tri';
  return JANELAS.some(j => j.id === v) ? (v as AgendaJanela) : JANELA_PADRAO;
};

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
const DIA_MS = 86400000;
const MIN_BAR_PX = 6;       // a barra mais curta que se vê (1 h na janela "Ano" teria 0,1 px)
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const p2 = (n: number) => String(n).padStart(2, '0');
// O eixo se adapta ao que CABE (px por dia), não ao nome da janela: a "Semana" num celular
// vira números de dia, e a "Dia" num monitor largo ganha marca de hora em hora.
const PX_HORAS = 160;       // ≥: nome do dia + marcas de hora (janela Dia)
const PX_DIA_NOME = 40;     // ≥: um bloco por dia, "seg 06/10" (janela Semana)
const PX_DIA_NUM = 18;      // ≥: o número de cada dia (janela Mês)
const PX_SEGUNDA = 5;       // ≥: o número das segundas-feiras (janela Trimestre)
const PX_SEIS_H = 80;       // ≥: linhas de 6 em 6 h nos blocos de dia
// De quantas em quantas horas vai o rótulo "07:00" (cada rótulo com ≥ 44 px de folga).
const passoHora = (pxPerDay: number): number => [1, 2, 3, 6, 12].find(s => s * pxPerDay / 24 >= 44) || 24;
// Linhas de dia (mais fortes) e de hora, desenhadas SÓ numa faixa de poucos dias em volta do
// que está à vista (nunca no trilho inteiro: na janela "Dia" ele tem centenas de milhares de
// px, e um gradiente repetido em % de tudo isso escorrega na conta de ponto flutuante).
const gradeDias = (nDias: number, passoH: number | null): string => {
  const dia = `repeating-linear-gradient(90deg, rgba(148,163,184,0.40) 0 1px, transparent 1px ${(100 / nDias).toFixed(6)}%)`;
  if (!passoH || passoH >= 24) return dia;
  return `${dia}, repeating-linear-gradient(90deg, rgba(148,163,184,0.16) 0 1px, transparent 1px ${(passoH / 24 / nDias * 100).toFixed(6)}%)`;
};

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

  const jan = JANELAS.find(j => j.id === janela) || JANELAS[2];
  const mesesMin = Math.max(1, Math.round(jan.dias / MES_DIAS));   // Dia e Semana: 1

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
    while (z - a + 1 < mesesMin) z++;
    return { mkStart: a, mkEnd: z };
  }, [axisItems, hoje, mesesMin]);
  const months = useMemo(() => { const arr: number[] = []; for (let m = mkStart; m <= mkEnd; m++) arr.push(m); return arr; }, [mkStart, mkEnd]);
  const axisStartDay = toDay(new Date(Math.floor(mkStart / 12), mkStart % 12, 1));
  const axisEndDay = toDay(new Date(Math.floor(mkEnd / 12), mkEnd % 12 + 1, 0));   // último dia do último mês
  const totalDays = dayDiffStr(axisStartDay, axisEndDay) + 1;
  const axis0 = brInstant(axisStartDay, '00:00')?.getTime() ?? 0;                  // 00:00 de Brasília do 1º dia
  const pctOf = (d: number) => Math.max(0, Math.min(100, d / totalDays * 100));   // d = dias (com fração) desde o início do eixo
  // A janela diz quanto cabe na largura; o resto rola na horizontal.
  // Cabe inteiro com até 3% de sobra: não rola (senão o botão Hoje aparecia para mover 7 px no Semestre).
  const escala = totalDays / jan.dias;
  const scale = escala <= 1.03 ? 1 : escala;
  const pxPerDay = totalDays > 0 ? trackW / totalDays : 0;
  const monthCols = months.map(m => `${daysInMonth(m)}fr`).join(' '); // mês com a largura dos dias dele (as linhas batem com as barras)
  const bg = pxPerDay >= 8 ? weekendBg(axisStartDay, totalDays) : undefined;
  const modo: 'hora' | 'diaNome' | 'diaNum' | 'segunda' | 'mes' =
    pxPerDay >= PX_HORAS ? 'hora' : pxPerDay >= PX_DIA_NOME ? 'diaNome' : pxPerDay >= PX_DIA_NUM ? 'diaNum' : pxPerDay >= PX_SEGUNDA ? 'segunda' : 'mes';
  const passoH = modo === 'hora' ? passoHora(pxPerDay) : 24;                             // rótulos "07:00"
  const passoLinha = modo === 'hora' ? (pxPerDay / 24 >= 16 ? 1 : passoH) : modo === 'diaNome' && pxPerDay >= PX_SEIS_H ? 6 : null;

  // "Hoje" e "agora": a linha fica na HORA de agora (Brasília), não no começo do dia.
  // Relê o relógio a cada minuto.
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setAgoraMs(Date.now()), 60000); return () => window.clearInterval(t); }, []);
  // O 'hoje' da tela só muda quando ela redesenha; o relógio (agoraMs) anda sozinho. Passou da
  // meia-noite com a tela aberta: vale o dia do relógio (senão a linha de agora voltava um dia).
  const hojeVivo = todayBR(new Date(agoraMs));
  const hojeEf = hojeVivo > hoje ? hojeVivo : hoje;
  const hojeIdx = hojeEf >= axisStartDay && hojeEf <= axisEndDay ? dayDiffStr(axisStartDay, hojeEf) : null;
  const hoje0 = brInstant(hojeEf, '00:00')?.getTime();
  const fracAgora = hoje0 !== undefined && agoraMs >= hoje0 && agoraMs < hoje0 + DIA_MS ? (agoraMs - hoje0) / DIA_MS : null;
  const todayPct = hojeIdx === null ? null : pctOf(hojeIdx + (fracAgora ?? 0));
  const agoraMin = fracAgora === null ? null : Math.floor(fracAgora * 1440);
  const agoraTxt = agoraMin === null ? '' : `${p2(Math.floor(agoraMin / 60))}:${p2(agoraMin % 60)}`;

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
  // Trocou a janela: mede a largura nova ANTES de pintar (o observador só avisa no quadro
  // seguinte, e o eixo pintaria um quadro com as marcas da janela anterior).
  useLayoutEffect(() => {
    const ax = axisRef.current; if (!ax) return;
    const w = ax.getBoundingClientRect().width;
    setTrackW(p => (Math.abs(p - w) > 0.5 ? w : p));
  }, [scale, totalDays]);

  // Rola até hoje: ao abrir e ao trocar a janela. O "hoje" fica a 1/4 da área visível; onde
  // o dia é largo (Dia, Semana, Mês) a vista começa na VIRADA de um dia: "Dia" mostra hoje
  // de 00:00 a 24:00, "Semana" começa ontem, "Mês" uma semana antes.
  const scrollToToday = (smooth: boolean) => {
    const box = scrollRef.current, ax = axisRef.current;
    if (!box || !ax || hojeIdx === null || totalDays <= 0) return;
    const r = ax.getBoundingClientRect(); if (r.width <= 0) return;
    const labelW = r.left - box.getBoundingClientRect().left + box.scrollLeft; // largura da coluna fixa
    const ppd = r.width / totalDays;
    const visDias = Math.max(0, (box.clientWidth - labelW) / ppd);
    const alvo = ppd >= PX_DIA_NUM ? hojeIdx - Math.floor(visDias / 4) : hojeIdx + (fracAgora ?? 0) - visDias / 4;
    const left = Math.max(0, alvo * ppd);
    if (smooth && typeof box.scrollTo === 'function') box.scrollTo({ left, behavior: 'smooth' }); else box.scrollLeft = left;
  };
  // (de layout, e nesta ordem: zera, depois rola — antes de pintar, sem um quadro fora de hoje)
  useLayoutEffect(() => { scrolledOnce.current = false; }, [janela]);
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
  useLayoutEffect(() => {
    if (scrolledOnce.current || !scrollRef.current || !axisRef.current || todayPct === null || scale <= 1) return;
    scrolledOnce.current = true;
    scrollToToday(false);
  });

  // A FAIXA À VISTA, em dias inteiros (só quando o dia é largo: Dia e Semana). Marcas de
  // hora, blocos de dia e linhas de grade só se desenham nela — na janela "Dia" o eixo tem
  // centenas de dias, e desenhar milhares de marcas fora da vista pesaria na rolagem. A
  // faixa anda em saltos de uma tela (uma tela antes, a da vista e uma depois): ao rolar,
  // a tela só se redesenha a cada tela inteira percorrida.
  const janelaViva = pxPerDay >= PX_DIA_NOME;
  const [vis, setVis] = useState<[number, number] | null>(null);
  const calcVis = useCallback(() => {
    const box = scrollRef.current, ax = axisRef.current;
    if (!box || !ax || totalDays <= 0) return;
    const r = ax.getBoundingClientRect(); if (r.width <= 0) return;
    const ppd = r.width / totalDays;
    const labelW = r.left - box.getBoundingClientRect().left + box.scrollLeft;
    const c = Math.max(1, Math.ceil(Math.max(1, (box.clientWidth - labelW) / ppd)));   // dias numa tela
    const k = Math.floor(box.scrollLeft / ppd / c);
    const a = Math.max(0, Math.min(totalDays, (k - 1) * c)), b = Math.max(a, Math.min(totalDays, (k + 2) * c));
    setVis(p => (p && p[0] === a && p[1] === b ? p : [a, b]));
  }, [totalDays]);
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!janelaViva || !box) return;
    let raf = 0;
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(() => { raf = 0; calcVis(); }); };
    calcVis();
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => { box.removeEventListener('scroll', onScroll); if (raf) window.cancelAnimationFrame(raf); };
  }, [janelaViva, calcVis, trackW]);
  const faixa: [number, number] | null = janelaViva && vis && vis[0] < Math.min(vis[1], totalDays) ? [vis[0], Math.min(vis[1], totalDays)] : null;
  const f0 = faixa ? faixa[0] : -1, f1 = faixa ? faixa[1] : -1;
  const diasFaixa = useMemo(() => {
    const d0 = parseDay(axisStartDay);
    const out: { i: number; day: string; wd: number; n: number; mo: number }[] = [];
    if (f0 < 0 || !d0) return out;
    for (let i = f0; i < f1; i++) {
      const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
      out.push({ i, day: toDay(d), wd: d.getDay(), n: d.getDate(), mo: d.getMonth() + 1 });
    }
    return out;
  }, [f0, f1, axisStartDay]);
  // A grade da faixa (linhas de dia e de hora), a mesma em todas as linhas.
  const gradeStyle: React.CSSProperties | undefined = faixa ? {
    left: `${faixa[0] / totalDays * 100}%`, width: `${(faixa[1] - faixa[0]) / totalDays * 100}%`,
    backgroundImage: gradeDias(faixa[1] - faixa[0], passoLinha),
  } : undefined;

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

  // Número dos dias no eixo: todos (janela "Mês") ou só as segundas-feiras (janela
  // "Trimestre", onde o dia tem poucos px). Em Dia e Semana quem marca o dia é a faixa.
  const dayTicks = useMemo(() => {
    const out: { day: string; n: number; wk: boolean; left: number }[] = [];
    if (modo !== 'diaNum' && modo !== 'segunda') return out;
    const d0 = parseDay(axisStartDay); if (!d0) return out;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i);
      if (modo === 'segunda' && d.getDay() !== 1) continue;
      out.push({ day: toDay(d), n: d.getDate(), wk: d.getDay() === 0 || d.getDay() === 6, left: (i + 0.5) / totalDays * 100 });
    }
    return out;
  }, [modo, axisStartDay, totalDays]);
  // Rótulos de hora da faixa ("07:00"; a meia-noite é marcada pelo nome do dia).
  const horasFaixa = useMemo(() => {
    const out: { k: string; txt: string; left: number }[] = [];
    if (modo !== 'hora') return out;
    diasFaixa.forEach(dj => { for (let h = passoH; h < 24; h += passoH) out.push({ k: `${dj.day}-${h}`, txt: `${p2(h)}:00`, left: (dj.i + h / 24) / totalDays * 100 }); });
    return out;
  }, [modo, diasFaixa, passoH, totalDays]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-2 px-5 pt-4 pb-2 text-[10px] text-slate-400 flex-wrap">
        <span className="inline-flex items-start gap-2 min-w-0 flex-1">
          {anyMine
            ? <><MoveHorizontal size={12} className="text-blue-500 shrink-0 mt-px" aria-hidden="true" />
                <span className="sm:hidden">Toque num compromisso para abrir. Para mudar as datas arrastando, use o computador.</span>
                <span className="hidden sm:inline">Com o mouse: arraste a barra para mudar as datas, de dia em dia; puxe as bordas para mudar só o início ou só o fim (a hora fica). Clique para abrir.{anyOthers ? ' Compromissos de outras pessoas são só leitura.' : ''}</span></>
            : <><Lock size={11} className="shrink-0 mt-px" aria-hidden="true" /><span>Clique num compromisso para ver os detalhes. Só o dono muda as datas (e só de compromisso ativo).</span></>}
        </span>
        {scale > 1 && todayPct !== null && (
          <button type="button" onClick={() => scrollToToday(true)} aria-label={modo === 'hora' ? 'Rolar a linha do tempo até hoje (de 00:00 a 24:00)' : 'Rolar a linha do tempo até hoje'}
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400 hover:underline shrink-0">
            <Crosshair size={11} aria-hidden="true" /> Hoje
          </button>
        )}
      </div>
      <div ref={scrollRef} className="overflow-x-auto pr-5 pb-3 pt-6 [contain:inline-size] [--lab:9.5rem] sm:[--lab:17.25rem]">
        <div style={{ width: scale > 1 ? `calc(var(--lab) + (100% - var(--lab)) * ${scale.toFixed(3)})` : '100%' }}>
          {/* eixo: meses sempre; embaixo, o que couber (dias com horas, blocos de dia,
              números de dia, segundas) */}
          <div className="flex items-stretch border-b border-gray-100 dark:border-slate-800 pb-2 mb-2">
            <div className={`${labelCol} !justify-end -mt-6 pt-6 text-[10px] font-bold text-slate-400 uppercase tracking-wide`}>Compromisso</div>
            <div ref={setAxisEl} className="flex-1 relative">
              <div className="grid" style={{ gridTemplateColumns: monthCols }}>
                {/* O nome do mês gruda à esquerda do trilho enquanto o mês está à vista (na
                    janela "Mês" o centro da coluna sai da tela ao rolar). Onde o mês é bem
                    mais largo que a tela (Dia, Semana), o nome começa à esquerda: centrado,
                    ele ficaria a meio mês de distância. */}
                {months.map(m => (
                  <div key={m} className={`text-[10px] font-bold text-slate-400 uppercase ${janelaViva ? 'text-left' : 'text-center'} border-l border-gray-100 dark:border-slate-800 pb-0.5 whitespace-nowrap overflow-clip`}>
                    <span className="sticky inline-block px-1" style={{ left: 'calc(var(--lab) + 0.25rem)' }}>{monthLabel(m)}</span>
                  </div>
                ))}
              </div>
              {modo === 'hora' && (
                <>
                  {/* Janela "Dia": o nome do dia (gruda à esquerda, como o do mês) e as horas. */}
                  <div className="relative h-4 mt-0.5" aria-hidden="true">
                    {diasFaixa.map(dj => (
                      <div key={dj.day} className={`absolute top-0 bottom-0 border-l border-slate-300 dark:border-slate-600 whitespace-nowrap overflow-clip text-[10px] font-bold uppercase tracking-wide ${dj.day === hojeEf ? 'text-orange-500' : dj.wd === 0 || dj.wd === 6 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}
                        style={{ left: `${dj.i / totalDays * 100}%`, width: `${100 / totalDays}%` }}>
                        <span className="sticky inline-block px-1" style={{ left: 'calc(var(--lab) + 0.25rem)' }}>{DIAS_SEMANA[dj.wd]} {p2(dj.n)}/{p2(dj.mo)}{dj.day === hojeEf ? ' · hoje' : ''}</span>
                      </div>
                    ))}
                  </div>
                  <div className="relative h-3.5 mt-0.5" aria-hidden="true">
                    {horasFaixa.map(h => (
                      <span key={h.k} className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-slate-400" style={{ left: `${h.left}%` }}>{h.txt}</span>
                    ))}
                  </div>
                </>
              )}
              {modo === 'diaNome' && (
                // Janela "Semana": um bloco por dia, "seg 06/10".
                <div className="relative h-4 mt-0.5" aria-hidden="true">
                  {diasFaixa.map(dj => (
                    <div key={dj.day} className={`absolute top-0 bottom-0 border-l border-slate-300 dark:border-slate-600 whitespace-nowrap overflow-clip text-center text-[10px] tabular-nums ${dj.day === hojeEf ? 'font-black text-orange-500' : dj.wd === 0 || dj.wd === 6 ? 'font-semibold text-slate-300 dark:text-slate-600' : 'font-semibold text-slate-500 dark:text-slate-400'}`}
                      style={{ left: `${dj.i / totalDays * 100}%`, width: `${100 / totalDays}%` }}>
                      {pxPerDay >= 64 ? `${DIAS_SEMANA[dj.wd]} ${p2(dj.n)}/${p2(dj.mo)}` : `${DIAS_SEMANA[dj.wd]} ${dj.n}`}
                    </div>
                  ))}
                </div>
              )}
              {(modo === 'diaNum' || modo === 'segunda') && (
                <div className="relative h-3.5 mt-0.5" aria-hidden="true">
                  {dayTicks.map(t => (
                    <span key={t.day} className={`absolute top-0 -translate-x-1/2 text-[9px] tabular-nums ${t.day === hojeEf ? 'font-black text-orange-500' : t.wk ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`} style={{ left: `${t.left}%` }}>{t.n}</span>
                  ))}
                </div>
              )}
              {todayPct !== null && (
                <span className="absolute -top-4 text-[9px] font-bold text-orange-500 -translate-x-1/2 pointer-events-none whitespace-nowrap tabular-nums" style={{ left: `${todayPct}%` }}>
                  {janelaViva && agoraTxt ? `agora ${agoraTxt}` : 'hoje'}
                </span>
              )}
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
                // Do início ao fim do HORÁRIO — a mesma régua do livre/ocupado e do convite
                // (intervaloAgenda): dia inteiro = o(s) dia(s) inteiro(s); com hora = do início
                // ao fim dela (07:00–12:00 = 5/24 do dia); sem hora de fim = 1 h (ou até o fim
                // do último dia); virando a meia-noite = até a hora de fim do dia seguinte.
                const iv = intervaloAgenda({ inicioDia: s, inicioHora: it.inicioHora, fimDia: e, fimHora: it.fimHora });
                const aD = iv ? (iv.inicio.getTime() - axis0) / DIA_MS : dayDiffStr(axisStartDay, s);
                const bD = iv ? (iv.fim.getTime() - axis0) / DIA_MS : dayDiffStr(axisStartDay, e) + 1;
                const left = pctOf(aD); const width = Math.max(0, pctOf(bD) - left);
                const widthPx = Math.max(MIN_BAR_PX, trackW * width / 100);
                const draggable = canDrag(it);
                const handlesInside = widthPx >= HANDLE_IN_PX;
                const cancel = it.status === 'cancelado';
                const concl = it.status === 'concluido';
                const dono = it.ownerId === currentUserId;
                const convidado = !dono && it.participantes.includes(currentUserId);
                const busy = savingId === it.id;
                // O que vai escrito: hora (um dia com hora, ou virando a meia-noite), nº de dias
                // (vários dias), ✓ (concluído); com a barra larga (Dia, Semana), o título junto.
                const nDias = dayDiffStr(s, e) + 1;
                const hi = normHour(it.inicioHora), hf = normHour(it.fimHora);
                const hora = !hi ? '' : s === e ? `${hi}${hf ? `–${hf}` : ''}` : nDias === 2 && hf && hf < hi ? `${hi}–${hf}` : '';
                const txt = hora || (s === e ? '' : `${nDias} d`);
                const comTitulo = widthPx >= 160;
                const txtBarra = comTitulo ? (txt ? `${txt} · ${it.titulo}` : it.titulo) : txt;
                const txtPx = txt.length * 6 + 14 + (concl ? 10 : 0);
                const txtInside = comTitulo || (!!txt && widthPx >= txtPx);
                // Barra mais larga que um bom pedaço da tela: o texto gruda à esquerda do que
                // está à vista (centrado, ele ficaria fora da tela na janela "Dia").
                const longa = widthPx > 320;
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
                      {gradeStyle && <div className="absolute top-0 bottom-0 pointer-events-none" style={gradeStyle} aria-hidden="true" />}
                      {todayPct !== null && <div className="absolute top-0 bottom-0 w-px bg-orange-400/60 pointer-events-none" style={{ left: `${todayPct}%` }} />}
                      <div className={`absolute top-1/2 -translate-y-1/2 h-5 ${dragging ? 'z-10' : ''}`} style={{ left: `${left}%`, width: `${width}%`, minWidth: MIN_BAR_PX }} onClick={() => onClickItem(it)}>
                        <div
                          role="button" tabIndex={0} aria-label={tip} title={tip}
                          onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(it); } }}
                          onPointerDown={ev => onDown(ev, it, 'move')} onPointerMove={onMove} onPointerUp={ev => onUp(ev, it)} onPointerCancel={onCancel} onLostPointerCapture={onCancel}
                          className={`absolute inset-0 rounded-md flex items-center ${longa ? 'justify-start' : 'justify-center'} px-1.5 shadow-sm overflow-clip select-none outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${draggable ? (dragging ? 'cursor-grabbing ring-2 ring-white/70' : 'cursor-grab') : 'cursor-pointer'} ${concl ? 'opacity-50' : ''} ${busy ? 'opacity-60 animate-pulse' : ''}`}
                          style={{ background: cancel ? CANCEL_BG : tp.color, touchAction: 'manipulation' }}>
                          {txtInside && <span className={`text-[10px] font-bold text-white/95 tabular-nums truncate pointer-events-none ${longa ? 'sticky' : ''}`} style={longa ? { left: 'calc(var(--lab) + 0.5rem)' } : undefined}>{concl ? '✓ ' : ''}{txtBarra}</span>}
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
        A barra vai do início ao fim do horário (07:00–12:00 ocupa 5 horas do dia); compromisso de dia inteiro ocupa o dia inteiro, e sem hora de fim vale 1 hora (ou até o fim do último dia). Arrastar muda só as datas, de dia em dia — também nas janelas Dia e Semana; para mudar a hora, abra o compromisso. A hora fica, os alertas acompanham (o banco refaz a fila de e-mails) e quem já recebeu o convite é avisado da mudança por e-mail.{bg ? ' Fins de semana sombreados.' : ''} Hoje: {ddmm(hojeEf)}{janelaViva && agoraTxt ? `, agora ${agoraTxt} (hora de Brasília)` : ''}.
      </p>
    </div>
  );
};

export default AgendaTimeline;
