// Os dados da aba KPI DOS SETORES (30/09/2026): lidos uma vez ao abrir, relidos depois de
// cada gravação (só o que mudou) — estado local, sem fetchAppState e sem Realtime.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KpisIndicador, KpisLancamento, KpisMeta, KpisPontoCalculado, KpisFarol, KpisPendencias, KpisTendencia,
  diaUtil, diasEntre, farol, fimPeriodo, fmtDia, hojeSP, inicioPeriodo, metaVigente, pendencias, periodoAnterior, periodoDiario, periodosEntre, proximoDia, proximoDiaUtil,
  proximoPeriodo, rotuloDia, rotuloPeriodo, semanaIso, tendencia, uteisEntre,
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

// dias (035): os lançamentos por dia do período, em ordem — o valor do período é a soma deles (ou a média, se não soma).
export interface KpisPonto { periodo: string; valor: number | null; lanc?: KpisLancamento; atividades?: number; dias?: KpisLancamento[]; }

// ---- 035: o período lançado TODO DIA, como na Reunião de Gestão da Produção (ago/2026): planejado × realizado ×
// projetado, por semana dentro do mês (por mês no trimestre; por dia na semana), fechando no período. -------------
export interface KpisParte {
  de: string; ate: string; rotulo: string;
  uteis: number;                     // dias úteis (seg–sex) que contam nesta parte
  planejado: number | null;          // a meta repartida pelos dias úteis (soma); a meta (média)
  realizado: number | null;          // o lançado nos dias desta parte (null = nada lançado)
  projetado: number | null;          // fechada: o realizado; em curso: o realizado + o ritmo até o fim dela; futura: o ritmo
  situacao: 'fechada' | 'atual' | 'futura';
}
export interface KpisRitmo {
  periodo: string;
  realizado: number | null;          // a soma (ou a média) dos dias lançados até agora
  dias: number;                      // quantos dias têm valor
  ultimoDia: string | null;
  ate: string | null;                // o último dia útil que já conta (null = nenhum ainda)
  uteisPassados: number;             // dias úteis que já contam: com valor, ou vencidos sem valor (valem zero)
  uteisNoPeriodo: number;
  meta: number | null;
  metaAteAgora: number | null;       // soma: a meta proporcional aos dias úteis que já contam; média: a meta
  projecao: number | null;           // soma: no fim do período, no ritmo de agora; média: a média até agora
  farol: KpisFarol;                  // da projeção contra a meta (o sinal de quem gerencia no meio do mês)
  partes: KpisParte[];
}
const somaOuMedia = (i: Pick<KpisIndicador, 'consolidacao'>, vs: number[]): number | null =>
  !vs.length ? null : i.consolidacao === 'soma' ? vs.reduce((s, v) => s + v, 0) : vs.reduce((s, v) => s + v, 0) / vs.length;
// Reparte `total` pelos pesos, arredondado às casas, e a soma das partes fecha exatamente no total (maior resto).
export const repartir = (total: number, pesos: number[], casas: number): number[] => {
  const somaP = pesos.reduce((s, p) => s + p, 0);
  if (!somaP) return pesos.map(() => 0);
  const esc = 10 ** Math.max(0, Math.min(4, casas));
  const alvo = Math.round(total * esc);
  const brutos = pesos.map(p => (alvo * p) / somaP);
  const base = brutos.map(Math.floor);
  let falta = alvo - base.reduce((s, b) => s + b, 0);
  brutos.map((b, k) => ({ k, r: b - Math.floor(b) })).sort((a, b) => b.r - a.r || a.k - b.k).forEach(({ k }) => { if (falta > 0 && pesos[k] > 0) { base[k]++; falta--; } });
  return base.map(b => b / esc);
};
// As partes de um período: mês → semanas (de segunda a domingo, cortadas no mês); trimestre → meses; semana → dias.
const partesDo = (i: Pick<KpisIndicador, 'frequencia'>, periodo: string): { de: string; ate: string; rotulo: string }[] => {
  const fim = fimPeriodo(i.frequencia, periodo);
  if (i.frequencia === 'semanal') return diasEntre(periodo, fim).map(d => ({ de: d, ate: d, rotulo: rotuloDia(d) }));
  if (i.frequencia === 'trimestral') return periodosEntre('mensal', periodo, fim).map(m => ({ de: m, ate: fimPeriodo('mensal', m), rotulo: rotuloPeriodo('mensal', m) }));
  const out: { de: string; ate: string; rotulo: string }[] = [];
  for (let de = periodo, k = 1; de <= fim && k <= 6; k++) {
    const dom = proximoDia(inicioPeriodo('semanal', de), 6);
    const ate = dom < fim ? dom : fim;
    out.push({ de, ate, rotulo: `Semana ${k} (${fmtDia(de).slice(0, 5)}–${fmtDia(ate).slice(0, 5)})` });
    de = proximoDia(ate);
  }
  return out;
};

// O ritmo de um período diário: o que já entrou, a meta até aqui e a projeção para o fim — e as partes (semanas).
export const ritmoDo = (i: KpisIndicador, periodo: string, dias: KpisLancamento[], metas: KpisMeta[], hoje: string = hojeSP()): KpisRitmo => {
  const fim = fimPeriodo(i.frequencia, periodo);
  const soma = i.consolidacao === 'soma';
  const meta = metaVigente(metas, periodo)?.meta ?? null;
  const ds = dias.filter(l => !!l.dia).sort((a, b) => (a.dia as string).localeCompare(b.dia as string));
  // De quando os dias contam: do começo do período (ou do indicador). Ligar o "Todo dia" no meio do período não tira o
  // começo dele da conta — o que já foi feito se lança (dia a dia, ou o acumulado num dia só); senão vale zero.
  const base = periodo > i.inicio ? periodo : i.inicio;
  // Os dias úteis que JÁ CONTAM: os que têm valor e os que passaram do prazo (o dia útil seguinte) sem valor — esses valem
  // zero. O dia útil ainda no prazo sem valor (hoje; ontem, de manhã) fica de fora: não puxa a projeção para baixo.
  // Período fechado: todos.
  const ultimo = ds.length ? (ds[ds.length - 1].dia as string) : null;
  const comValor = new Set(ds.map(l => l.dia as string));
  const uteis = diasEntre(base, fim).filter(diaUtil);
  const contado = (d: string) => hoje > fim || (d <= hoje && (comValor.has(d) || proximoDiaUtil(d) < hoje));
  const contados = uteis.filter(contado);
  const uteisPassados = contados.length;
  const uteisNoPeriodo = uteis.length;
  const realizado = somaOuMedia(i, ds.map(l => l.valor));
  const taxa = soma && realizado !== null && uteisPassados > 0 ? realizado / uteisPassados : null;
  const projecao = !soma ? realizado : hoje > fim ? realizado : taxa !== null && realizado !== null ? realizado + taxa * (uteisNoPeriodo - uteisPassados) : null;
  const metaAteAgora = meta === null ? null : !soma ? meta : uteisNoPeriodo > 0 ? (meta * uteisPassados) / uteisNoPeriodo : null;
  const brutas = partesDo(i, periodo);
  const uteisDe = brutas.map(p => { const de = p.de > base ? p.de : base; return de <= p.ate ? uteisEntre(de, p.ate) : 0; });
  // Sem dia útil nenhum que conte (o diário começou num fim de semana no fim do período): reparte pelos dias corridos.
  const pesos = uteisDe.some(u => u > 0) ? uteisDe : brutas.map(p => { const de = p.de > base ? p.de : base; return de <= p.ate ? diasEntre(de, p.ate).length : 0; });
  const planejados = meta === null ? brutas.map(() => null) : soma ? repartir(meta, pesos, i.casas) : brutas.map(() => meta);
  const partes: KpisParte[] = brutas.map((p, k) => {
    const situacao: KpisParte['situacao'] = p.ate < hoje ? 'fechada' : p.de > hoje ? 'futura' : 'atual';
    const real = somaOuMedia(i, ds.filter(l => (l.dia as string) >= p.de && (l.dia as string) <= p.ate).map(l => l.valor));
    // Pela mesma regra do total (a soma das partes fecha na projeção): o realizado + o ritmo nos dias úteis dela que ainda
    // não contam. Parte sem valor e sem dia por contar: "—" (vale zero na soma).
    let projetado: number | null;
    if (!soma) projetado = situacao === 'fechada' ? real : real ?? projecao;
    else if (taxa === null) projetado = situacao === 'futura' ? null : real;
    else {
      const porContar = uteis.filter(d => d >= p.de && d <= p.ate && !contado(d)).length;
      projetado = real === null && porContar === 0 ? null : (real ?? 0) + taxa * porContar;
    }
    return { ...p, uteis: uteisDe[k], planejado: planejados[k], realizado: real, projetado, situacao };
  });
  return {
    periodo, realizado, dias: ds.length, ultimoDia: ultimo, ate: contados.length ? contados[contados.length - 1] : null,
    uteisPassados, uteisNoPeriodo, meta, metaAteAgora, projecao,
    farol: farol(i.sentido, projecao, meta === null ? null : metaVigente(metas, periodo)),
    partes,
  };
};
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
  parcial: KpisPonto | null;         // CALCULADO e DIÁRIO: o período em curso, ainda incompleto ("out/2026 até agora")
  ritmo: KpisRitmo | null;           // 035 DIÁRIO: o período em curso — realizado, meta até aqui, projeção, semanas
  erroCalculo: boolean;              // CALCULADO: a série não deu para ler (não é "sem valor")
  comecaEm: string | null;           // o 1º período ainda não começou (início no futuro)
  noAno: { ano: string; valor: number } | null; // SOMA: o total do ano de hoje até agora (com o período em curso); null = não soma ou nada no ano
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
    // Período que o banco não devolveu: horas/quantidade = 0; média e % = sem valor (sem base nunca vira 0).
    const semBase = d.calcErro.has(i.id) || i.calcMedida === 'media' || i.calcMedida === 'pct_estimado';
    serie = periodos.map(p => { const c = porPer.get(p); return { periodo: p, valor: c ? c.valor : (semBase ? null : 0), atividades: c?.atividades }; });
  } else {
    // 035: o lançamento de um DIA soma (ou faz média) no período dele; o de período vale sozinho (o banco não deixa os dois).
    const porPer = new Map<string, KpisLancamento>(); const diasPer = new Map<string, KpisLancamento[]>();
    for (const l of d.lancs.get(i.id) || []) {
      if (l.dia) { const xs = diasPer.get(l.periodo); if (xs) xs.push(l); else diasPer.set(l.periodo, [l]); }
      else porPer.set(l.periodo, l);
    }
    serie = periodos.map(p => {
      const ds = diasPer.get(p);
      if (ds && ds.length) return { periodo: p, valor: somaOuMedia(i, ds.map(l => l.valor)), dias: [...ds].sort((a, b) => (a.dia as string).localeCompare(b.dia as string)) };
      const l = porPer.get(p); return { periodo: p, valor: l ? l.valor : null, lanc: l };
    });
  }
  // Calculado e DIÁRIO: o período em curso ainda está acontecendo (no dia 1º o mês vale 0) — a tendência, o
  // "último" e o mini-gráfico olham os períodos FECHADOS; o em curso aparece à parte, como parcial.
  const atual = inicioPeriodo(i.frequencia, hoje);
  const emCurso = i.tipo === 'calculado' || (i.tipo === 'manual' && periodoDiario(i, atual));
  const parcial = emCurso ? (serie.find(p => p.periodo === atual) || null) : null;
  const comValor = serie.filter(p => p.valor !== null && (!emCurso || p.periodo < atual));
  const ultimo = comValor.length ? comValor[comValor.length - 1] : null;
  const antP = ultimo ? periodoAnterior(i.frequencia, ultimo.periodo) : null;
  const anterior = antP ? (serie.find(p => p.periodo === antP) || null) : null;
  // 035: no diário, o farol e a meta do cartão são os do período em curso, pela projeção (no meio do mês, o acumulado
  // sozinho fica sempre "fora da meta").
  const ritmo = i.tipo === 'manual' && emCurso && parcial ? ritmoDo(i, atual, parcial.dias || [], metas, hoje) : null;
  const usaRitmo = !!ritmo;   // mesmo sem projeção ainda (nada lançado no período): "sem valor", nunca o farol do período passado
  const meta = metaVigente(metas, usaRitmo ? atual : ultimo ? ultimo.periodo : inicioPeriodo(i.frequencia, hoje));
  // Só cobra o que a tela leu (36 meses): lançamento mais velho que isso não está na memória.
  const diasComValor = new Set((d.lancs.get(i.id) || []).filter(l => !!l.dia).map(l => l.dia as string));
  const pend = pendencias({ ...i, inicio: ini }, new Set(serie.filter(p => p.valor !== null).map(p => p.periodo)), hoje, diasComValor);
  return {
    serie, ultimo, anterior, meta,
    farol: usaRitmo && ritmo ? ritmo.farol : farol(i.sentido, ultimo ? ultimo.valor : null, meta),
    tendencia: tendencia(i.sentido, ultimo ? ultimo.valor : null, anterior ? anterior.valor : null),
    pend,
    spark: (() => {
      const fechados = serie.filter(p => !emCurso || p.periodo < atual).slice(-12).map(p => p.valor);
      const k = fechados.findIndex(v => v !== null);
      return k < 0 ? [] : fechados.slice(k);                          // começa no 1º com valor
    })(),
    semMeta: metas.length === 0,
    parcial, ritmo,
    erroCalculo: i.tipo === 'calculado' && d.calcErro.has(i.id),
    comecaEm: i.inicio > atual ? i.inicio : null,
    // O que se acumula (entregas, horas, faturamento): o último mês sozinho esconde o ano — "em 2026: 12".
    noAno: (() => {
      if (i.consolidacao !== 'soma') return null;
      // a semana é do ano ISO (o mesmo do rótulo "Sem 1/2027"); mês e trimestre, do ano em que começam
      const anoDe = (per: string) => i.frequencia === 'semanal' ? String(semanaIso(per).ano) : per.slice(0, 4);
      const ano = anoDe(atual);
      const vs = serie.filter(p => anoDe(p.periodo) === ano && p.valor !== null).map(p => p.valor as number);
      return vs.length ? { ano, valor: vs.reduce((s, v) => s + v, 0) } : null;
    })(),
  };
};
