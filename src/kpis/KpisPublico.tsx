import React, { useMemo } from 'react';
import { KpisPontoCalculado, mapIndicador, mapLancamento, mapMeta } from './kpis';
import { KpisDados } from './kpisDados';
import { KpisPainel } from './KpisPainel';

// KPI DO SETOR NO LINK PÚBLICO DO OKR (30/10/2026). Edson, a pedido do Leonardo: um link só, com OKR e KPI.
// O servidor (/api/okr/public, setorKpi) manda os indicadores ativos do setor do dono do OKR, as metas e os valores
// (sem comentário nem quem lançou); aqui viram o mesmo KpisDados da aba e os mesmos cartões, só para ver.

export interface KpisSetorPublico { setor: string; dados: KpisDados; }

const agrupa = <T,>(xs: T[], chave: (x: T) => string): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  xs.forEach(x => { const k = chave(x); const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); });
  return m;
};

// null = o link não trouxe KPI (dono sem setor, setor sem indicador, servidor não conseguiu ler).
export const setorKpiDoServidor = (raw: any): KpisSetorPublico | null => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.indicadores) || !raw.indicadores.length) return null;
  try {
    const indicadores = raw.indicadores.map(mapIndicador).filter(i => i.id && i.ativo);
    if (!indicadores.length) return null;
    const metas = (Array.isArray(raw.metas) ? raw.metas : []).map(mapMeta).sort((a, b) => a.valeDesde.localeCompare(b.valeDesde));
    const lancs = (Array.isArray(raw.lancamentos) ? raw.lancamentos : []).map(mapLancamento).sort((a, b) => a.periodo.localeCompare(b.periodo));
    const calc = new Map<string, KpisPontoCalculado[]>();
    Object.entries(raw.calc && typeof raw.calc === 'object' ? raw.calc : {}).forEach(([id, xs]) => calc.set(id, (Array.isArray(xs) ? xs : []).map((r: any) => ({
      periodo: String(r.periodo || '').slice(0, 10),
      valor: r.valor === null || r.valor === undefined || !Number.isFinite(Number(r.valor)) ? null : Number(r.valor),
      atividades: Number(r.atividades) || 0,
    }))));
    const calcErro = new Set<string>((Array.isArray(raw.calcErro) ? raw.calcErro : []).map(String));
    // O que o servidor não calculou conta como erro de cálculo ("não consegui calcular"), nunca como zero.
    indicadores.filter(i => i.tipo === 'calculado' && !calc.has(i.id)).forEach(i => calcErro.add(i.id));
    return {
      setor: String(raw.setor || ''),
      dados: {
        indicadores, metas: agrupa(metas, m => m.indicadorId), lancs: agrupa(lancs, l => l.indicadorId),
        calc, calcErro, ligados: null, desde: String(raw.desde || '').slice(0, 10), lidoEm: Date.now(),
      },
    };
  } catch { return null; }
};

export const KpisPublicoPainel: React.FC<{ kpi: KpisSetorPublico }> = ({ kpi }) => {
  const inds = useMemo(() => kpi.dados.indicadores, [kpi]);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-slate-800 dark:text-white">KPI · {kpi.setor}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Indicadores do setor, atualizados ao abrir o link.</p>
      </div>
      <KpisPainel dados={kpi.dados} inds={inds} visaoPorSetor={false} mostrarSetor={false} onAbrir={() => {}} onFiltrarSetor={() => {}} />
    </div>
  );
};
