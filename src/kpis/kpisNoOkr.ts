// O KR LIGADO a um indicador do KPI dos setores (30/09/2026).
// A única coisa gravada no OKR é o ponteiro `kpiId`. O valor é lido NA HORA
// (kpis_valores_ligados) e sobreposto ao que a tela mostra — nunca volta para o
// okr_state. A sobreposição vive num useMemo de RENDER: o estado do useOkrWriter e os
// mutators trabalham sempre sobre o OKR cru relido do banco.
import { useEffect, useMemo, useRef, useState } from 'react';
import { OkrKeyResult, OkrStore } from '../okr/okr';
import { kpisService, KpisPedido } from './kpisService';
import { KpisFrequencia } from './kpis';

// O que o banco (ou o servidor, no link público) disse de UM KR ligado.
export interface KpiNoKr {
  valor: number | null;         // null = ainda sem lançamento na janela do KR
  periodo: string | null;       // o período do valor mostrado
  periodos?: number;
  nome?: string; unidade?: string; casas?: number;
  consolidacao?: 'ultimo' | 'soma'; arquivado?: boolean; tipo?: 'manual' | 'calculado';
  frequencia?: KpisFrequencia;  // ausente no link público (o servidor manda só o número e o período)
}
// null = não deu para ler (023 ausente, rede): a tela mostra o que está gravado no KR.
export type KpisMapa = Map<string, KpiNoKr> | null;

// O início/prazo do KR como estão gravados (o banco recebe o texto cru e decide).
const cru = (v: unknown): string => typeof v === 'string' ? v : '';
export const chaveKpi = (dono: string, id: string, de: string, ate: string) => `${dono.trim().toLowerCase()}|${id.toLowerCase()}|${de}|${ate}`;
export const chaveDoKr = (dono: string, k: OkrKeyResult) => chaveKpi(dono, String(k.kpiId || ''), cru(k.start), cru(k.due));
export const krLigado = (k: OkrKeyResult): boolean => typeof k.kpiId === 'string' && k.kpiId !== '';

// Os pedidos de um OKR: todo KR ligado, de todos os períodos (a pessoa troca de período na tela).
export const pedidosDoStore = (store: OkrStore | null | undefined, dono: string): KpisPedido[] => {
  const out: KpisPedido[] = []; const vistos = new Set<string>();
  (store?.periods || []).forEach(p => p.objectives.forEach(o => o.keyResults.forEach(k => {
    if (!krLigado(k)) return;
    const ped = { dono: dono.trim().toLowerCase(), id: String(k.kpiId).toLowerCase(), de: cru(k.start), ate: cru(k.due) };
    const ch = chaveKpi(ped.dono, ped.id, ped.de, ped.ate);
    if (!vistos.has(ch)) { vistos.add(ch); out.push(ped); }
  })));
  return out;
};

// O estado de um KR ligado, para o chip:
//  - 'valor': o KPI deu o número;
//  - 'aguardando': ligado, mas sem lançamento na janela do KR (mostra a partida);
//  - 'fora': o banco não devolveu — o dono não enxerga mais o indicador (mudou de setor)
//    ou o indicador foi excluído: "religue"; mostra o que está gravado no KR;
//  - 'sem': não deu para ler (023 ausente, sem rede): mostra o que está gravado.
//  - 'lendo': a leitura deste KR ainda está a caminho.
export type KpiEstado = { estado: 'valor' | 'aguardando' | 'fora' | 'sem' | 'lendo'; info: KpiNoKr | null };
export const estadoKpi = (k: OkrKeyResult, dono: string, mapa: KpisMapa, lendo = false): KpiEstado => {
  if (!mapa) return { estado: lendo ? 'lendo' : 'sem', info: null };
  const info = mapa.get(chaveDoKr(dono, k)) || null;
  if (!info) return { estado: lendo ? 'lendo' : 'fora', info: null };
  return { estado: info.valor === null ? 'aguardando' : 'valor', info };
};

// CÓPIA do OKR com o "atual" dos KRs ligados trocado pelo do KPI. Sem mapa (não leu) =
// o mesmo objeto (nada muda). Sem lançamento = a partida (o progresso começa do zero).
// KR que o banco não devolveu fica como está gravado.
export const aplicarKpis = (store: OkrStore | null, dono: string, mapa: KpisMapa): OkrStore | null => {
  if (!store || !mapa || !mapa.size) return store;
  let mudou = false;
  const periods = store.periods.map(p => {
    let mp = false;
    const objectives = p.objectives.map(o => {
      let mo = false;
      const keyResults = o.keyResults.map(k => {
        if (!krLigado(k)) return k;
        const info = mapa.get(chaveDoKr(dono, k));
        if (!info) return k;
        const current = info.valor === null ? k.baseline : info.valor;
        if (current === k.current) return k;
        mo = true; return { ...k, current };
      });
      if (!mo) return o;
      mp = true; return { ...o, keyResults };
    });
    if (!mp) return p;
    mudou = true; return { ...p, objectives };
  });
  return mudou ? { ...store, periods } : store;
};

// Vários OKRs de uma vez (Indicadores do OKR, Linha do tempo): UMA chamada ao banco.
// Falhou = devolve as linhas como estão (o número gravado), nunca some com elas.
export const lerKpisDasLinhas = async (rows: { ownerKey: string; store: OkrStore }[]): Promise<KpisMapa> => {
  const pedidos = rows.flatMap(r => pedidosDoStore(r.store, r.ownerKey));
  if (!pedidos.length) return new Map();
  try {
    const vals = await kpisService.valoresLigados(pedidos);
    if (!vals) return null;
    return new Map(vals.map(v => [chaveKpi(v.dono, v.id, v.de, v.ate), v] as const));
  } catch { return null; }
};
export const comKpis = async <R extends { ownerKey: string; store: OkrStore }>(rows: R[]): Promise<R[]> => {
  const mapa = await lerKpisDasLinhas(rows);
  if (!mapa || !mapa.size) return rows;
  return rows.map(r => { const s = aplicarKpis(r.store, r.ownerKey, mapa); return s === r.store ? r : { ...r, store: s! }; });
};

// O que o SERVIDOR manda nos links públicos: [{dono, k, de, ate, valor, periodo}], com a
// chave opaca `k` no lugar do indicador (o esqueleto do KR leva o mesmo `k` em kpiId).
export const mapaDoServidor = (kpi: unknown): KpisMapa => {
  if (!Array.isArray(kpi)) return null;
  const m = new Map<string, KpiNoKr>();
  kpi.forEach((x: any) => {
    if (!x || typeof x !== 'object' || typeof x.k !== 'string') return;
    const valor = x.valor === null || x.valor === undefined || x.valor === '' ? null : Number(x.valor);
    m.set(chaveKpi(String(x.dono || ''), x.k, String(x.de ?? ''), String(x.ate ?? '')), {
      valor: valor !== null && Number.isFinite(valor) ? valor : null,
      periodo: typeof x.periodo === 'string' ? x.periodo.slice(0, 10) : null,
      ...(x.frequencia === 'semanal' || x.frequencia === 'mensal' || x.frequencia === 'trimestral' ? { frequencia: x.frequencia } : {}),
      ...(x.consolidacao === 'ultimo' || x.consolidacao === 'soma' ? { consolidacao: x.consolidacao } : {}),
    });
  });
  return m;
};

// Meu OKR / OKR de outra pessoa: uma leitura por abertura, e de novo quando o OKR
// relê (o store muda) — só se a lista de KRs ligados mudou. Sem KR ligado = nada a ler.
// `pausado` (o OKR está gravando): não lê agora — uma leitura no meio da gravação acharia o OKR do
// banco ainda sem o kpiId novo e o KR ligado apareceria "fora — religue". Quando a gravação
// confirma, a pausa acaba e a leitura acontece (com o kpiId já no banco).
export function useKpisNoOkr(store: OkrStore | null, ownerKey: string, enabled: boolean, pausado = false): { mapa: KpisMapa; lendo: boolean } {
  const [mapa, setMapa] = useState<KpisMapa>(new Map());
  const [lido, setLido] = useState<string | null>(null);
  const pedidos = useMemo(() => enabled ? pedidosDoStore(store, ownerKey) : [], [store, ownerKey, enabled]);
  const assinatura = useMemo(() => pedidos.map(p => chaveKpi(p.dono, p.id, p.de, p.ate)).sort().join('\n'), [pedidos]);
  const seq = useRef(0);
  // Relê também quando o store é relido do banco (voltar para a aba), para pegar um
  // lançamento novo — mas no máximo a cada 20 s, para não martelar o banco a cada edição.
  const ultima = useRef(0);
  const [tick, setTick] = useState(0);
  // O que já foi lido (assinatura + tick): a pausa de cada gravação não pode virar uma leitura nova
  // quando nada mudou — senão marcar 10 tarefas eram 10 leituras (e o cálculo das atividades 10 vezes).
  const lidoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const volta = () => { if (document.visibilityState === 'visible' && Date.now() - ultima.current > 20000) setTick(t => t + 1); };
    window.addEventListener('focus', volta);
    document.addEventListener('visibilitychange', volta);
    return () => { window.removeEventListener('focus', volta); document.removeEventListener('visibilitychange', volta); };
  }, [enabled]);
  useEffect(() => {
    const marca = `${enabled}|${tick}|${assinatura}`;
    if (enabled && pedidos.length && pausado) return;          // grava agora; lê quando confirmar (se mudou)
    if (lidoRef.current === marca) return;                       // a pausa acabou e nada mudou
    lidoRef.current = marca;
    const my = ++seq.current;
    if (!enabled || !pedidos.length) { setMapa(new Map()); setLido(assinatura); return; }
    ultima.current = Date.now();
    kpisService.valoresLigados(pedidos)
      .then(vals => { if (my !== seq.current) return; setMapa(vals ? new Map(vals.map(v => [chaveKpi(v.dono, v.id, v.de, v.ate), v] as const)) : null); })
      .catch(() => { if (my === seq.current) setMapa(null); })
      .finally(() => { if (my === seq.current) setLido(assinatura); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, enabled, tick, pausado]);
  // "Lendo" é calculado no render (não num estado posto pelo efeito): o KR ligado nunca
  // aparece por um instante como "fora do setor" enquanto a primeira leitura viaja.
  // A releitura de quem volta para a aba mantém os números velhos na tela até chegar.
  return { mapa, lendo: enabled && pedidos.length > 0 && lido !== assinatura };
}
