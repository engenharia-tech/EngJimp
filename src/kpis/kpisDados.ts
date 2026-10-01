// Os dados da aba KPI DOS SETORES (30/09/2026): lidos uma vez ao abrir, relidos depois de
// cada gravação (só o que mudou) — estado local, sem fetchAppState e sem Realtime.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KpisIndicador, KpisLancamento, KpisMeta, KpisPontoCalculado, KpisFarol, KpisPendencias, KpisTendencia,
  farol, hojeSP, inicioPeriodo, metaVigente, pendencias, periodoAnterior, periodosEntre, proximoPeriodo, tendencia,
} from './kpis';
import { KpisService } from './kpisService';

// Até onde para trás a tela lê (36 meses): mais que isso não cabe num gráfico e não é cobrado.
export const kpisDesde = (hoje: string = hojeSP()): string => {
  const d = new Date(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1 - 36, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

export interface KpisDados {
  indicadores: KpisIndicador[];
  metas: Map<string, KpisMeta[]>;            // por indicador, em ordem de vigência
  lancs: Map<string, KpisLancamento[]>;      // por indicador, em ordem de período
  calc: Map<string, KpisPontoCalculado[]>;   // série dos indicadores calculados
  calcErro: Set<string>;                     // calculados cuja série não deu para ler
  ligados: Map<string, number> | null;       // quantos KRs apontam para cada indicador (só quem vê tudo)
  desde: string;
  lidoEm: number;
}

const agrupa = <T,>(xs: T[], chave: (x: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  xs.forEach(x => { const k = chave(x); const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); });
  return m;
};

export function useKpisDados(service: KpisService, ativo: boolean, veTodos: boolean) {
  const [dados, setDados] = useState<KpisDados | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  const [lendo, setLendo] = useState(false);
  const seq = useRef(0);

  const ler = useCallback(async () => {
    if (!ativo) return;
    const my = ++seq.current;
    setLendo(true);
    try {
      const desde = kpisDesde();
      const [indicadores, metas, lancs, ligados] = await Promise.all([
        service.listIndicadores(), service.listMetas(), service.listLancamentos(desde), veTodos ? service.contarLigados() : Promise.resolve(null),
      ]);
      const calc = new Map<string, KpisPontoCalculado[]>(); const calcErro = new Set<string>();
      await Promise.all(indicadores.filter(i => i.tipo === 'calculado').map(async i => {
        try { calc.set(i.id, await service.serieCalculada(i.id, desde, null)); } catch { calcErro.add(i.id); }
      }));
      if (my !== seq.current) return;
      setDados({
        indicadores,
        metas: agrupa(metas.sort((a, b) => a.valeDesde.localeCompare(b.valeDesde)), m => m.indicadorId),
        lancs: agrupa(lancs.sort((a, b) => a.periodo.localeCompare(b.periodo)), l => l.indicadorId),
        calc, calcErro, ligados, desde, lidoEm: Date.now(),
      });
      setErro(null);
    } catch (e) {
      if (my === seq.current) setErro(e);            // "não consegui ler" nunca vira "não tem nada"
    } finally { if (my === seq.current) setLendo(false); }
  }, [service, ativo, veTodos]);

  useEffect(() => { ler(); }, [ler]);
  return { dados, erro, lendo, reler: ler };
}

// ---- A leitura de UM indicador, pronta para o cartão, o detalhe e o lançar -------------

export interface KpisPonto { periodo: string; valor: number | null; lanc?: KpisLancamento; atividades?: number; }
export interface KpisResumo {
  serie: KpisPonto[];                // período a período, do início (ou de 36 meses atrás) até o atual
  ultimo: KpisPonto | null;          // o último período COM valor
  anterior: KpisPonto | null;        // o período antes do último (com ou sem valor)
  meta: KpisMeta | null;             // a meta que valia no período do último valor (ou hoje)
  farol: KpisFarol;
  tendencia: KpisTendencia;
  pend: KpisPendencias;
  spark: (number | null)[];          // os últimos 12 períodos FECHADOS (null = sem valor: a linha quebra ali)
  semMeta: boolean;                  // o indicador não tem meta nenhuma
  parcial: KpisPonto | null;         // CALCULADO: o período em curso, ainda incompleto ("out/2026 até agora")
  erroCalculo: boolean;              // CALCULADO: a série não deu para ler (não é "sem valor")
  comecaEm: string | null;           // o 1º período ainda não começou (início no futuro)
}

export const resumoDo = (i: KpisIndicador, d: KpisDados, hoje: string = hojeSP()): KpisResumo => {
  const metas = d.metas.get(i.id) || [];
  // A série começa no 1º período INTEIRO dentro do que a tela leu (36 meses): começar no período que
  // contém `desde` (uma semana ou trimestre que começou antes) cobrava um valor que não foi lido.
  const a = inicioPeriodo(i.frequencia, d.desde);
  const ini = i.inicio > d.desde ? i.inicio : (a < d.desde ? proximoPeriodo(i.frequencia, a) : a);
  const periodos = periodosEntre(i.frequencia, ini, hoje);
  let serie: KpisPonto[];
  if (i.tipo === 'calculado') {
    const porPer = new Map((d.calc.get(i.id) || []).map(p => [p.periodo, p] as const));
    serie = periodos.map(p => { const c = porPer.get(p); return { periodo: p, valor: c ? c.valor : (d.calcErro.has(i.id) ? null : 0), atividades: c?.atividades }; });
  } else {
    const porPer = new Map((d.lancs.get(i.id) || []).map(l => [l.periodo, l] as const));
    serie = periodos.map(p => { const l = porPer.get(p); return { periodo: p, valor: l ? l.valor : null, lanc: l }; });
  }
  // Calculado: o período em curso ainda está acontecendo (no dia 1º o mês vale 0) — o farol, a
  // tendência e o "último" olham os períodos FECHADOS; o em curso aparece à parte, como parcial.
  const atual = inicioPeriodo(i.frequencia, hoje);
  const parcial = i.tipo === 'calculado' ? (serie.find(p => p.periodo === atual) || null) : null;
  const comValor = serie.filter(p => p.valor !== null && (i.tipo !== 'calculado' || p.periodo < atual));
  const ultimo = comValor.length ? comValor[comValor.length - 1] : null;
  const antP = ultimo ? periodoAnterior(i.frequencia, ultimo.periodo) : null;
  const anterior = antP ? (serie.find(p => p.periodo === antP) || null) : null;
  const meta = metaVigente(metas, ultimo ? ultimo.periodo : inicioPeriodo(i.frequencia, hoje));
  // Só cobra o que a tela leu (36 meses): lançamento mais velho que isso não está na memória.
  const pend = pendencias({ ...i, inicio: ini }, new Set(serie.filter(p => p.valor !== null).map(p => p.periodo)), hoje);
  return {
    serie, ultimo, anterior, meta,
    farol: farol(i.sentido, ultimo ? ultimo.valor : null, meta),
    tendencia: tendencia(i.sentido, ultimo ? ultimo.valor : null, anterior ? anterior.valor : null),
    pend,
    spark: (() => {
      const fechados = serie.filter(p => i.tipo !== 'calculado' || p.periodo < atual).slice(-12).map(p => p.valor);
      const k = fechados.findIndex(v => v !== null);
      return k < 0 ? [] : fechados.slice(k);                          // começa no 1º com valor
    })(),
    semMeta: metas.length === 0,
    parcial,
    erroCalculo: i.tipo === 'calculado' && d.calcErro.has(i.id),
    comecaEm: i.inicio > atual ? i.inicio : null,
  };
};
