import React from 'react';
import { ArrowDown, ArrowUp, Clock, Minus, TrendingDown, TrendingUp, Link2, Calculator, Archive } from 'lucide-react';
import { FAROL_CLASSE, FAROL_ROTULO, KpisFarol, KpisIndicador, KpisTendencia, SENTIDO_ROTULO, fmtDia, fmtValor, rotuloPeriodo } from './kpis';
import { KpisResumo } from './kpisDados';

// Peças pequenas da aba, usadas no painel, no detalhe e no lançar.

// O mini-gráfico leva cada série à sua própria faixa (entre 91% e 98% a linha saía chata: o desenho
// é de TENDÊNCIA; o número exato está ao lado) e QUEBRA onde o período não tem valor — ligar mar a
// jun por cima de abr e mai sem lançamento contava uma história que não aconteceu.
const MiniGrafico: React.FC<{ v: (number | null)[]; className?: string }> = ({ v, className }) => {
  const nums = v.filter((x): x is number => x !== null);
  if (v.length < 2 || nums.length < 1) return null;
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const W = 100, H = 28;
  const pt = (x: number, k: number) => [Number(((k / (v.length - 1)) * W).toFixed(1)), Number((hi === lo ? H / 2 : H - ((x - lo) / (hi - lo)) * (H - 4) - 2).toFixed(1))] as const;
  const trechos: (readonly [number, number])[][] = []; let atual: (readonly [number, number])[] = [];
  v.forEach((x, k) => { if (x === null) { if (atual.length) trechos.push(atual); atual = []; } else atual.push(pt(x, k)); });
  if (atual.length) trechos.push(atual);
  const ult = v[v.length - 1] !== null ? pt(v[v.length - 1] as number, v.length - 1) : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      {trechos.map((t, k) => t.length > 1
        ? <polyline key={k} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" points={t.map(([x, y]) => `${x},${y}`).join(' ')} vectorEffect="non-scaling-stroke" />
        : <circle key={k} cx={t[0][0]} cy={t[0][1]} r={1.8} fill="currentColor" vectorEffect="non-scaling-stroke" />)}
      {ult && <circle cx={ult[0]} cy={ult[1]} r={2.5} fill="currentColor" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
};

// Farol SEMPRE com a palavra (quem não distingue cor lê o texto).
export const FarolChip: React.FC<{ f: KpisFarol; className?: string }> = ({ f, className }) => (
  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${FAROL_CLASSE[f].chip} ${className || ''}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${FAROL_CLASSE[f].dot}`} />{FAROL_ROTULO[f]}
  </span>
);

export const SentidoIcon: React.FC<{ i: Pick<KpisIndicador, 'sentido'>; size?: number }> = ({ i, size = 12 }) =>
  i.sentido === 'maior'
    ? <ArrowUp size={size} className="text-slate-400 shrink-0" aria-label={SENTIDO_ROTULO.maior} />
    : <ArrowDown size={size} className="text-slate-400 shrink-0" aria-label={SENTIDO_ROTULO.menor} />;

// Seta contra o período anterior: verde quando andou para o lado bom, vermelha quando para o ruim.
export const TendenciaIcon: React.FC<{ t: KpisTendencia }> = ({ t }) => {
  if (!t) return null;
  if (t.dir === 'igual') return <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400" title="Igual ao período anterior"><Minus size={13} /> igual</span>;
  const cls = t.boa ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  const Ico = t.dir === 'sobe' ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${cls}`} title={`${t.dir === 'sobe' ? 'Subiu' : 'Caiu'} em relação ao período anterior (${t.boa ? 'bom' : 'ruim'})`}><Ico size={14} /> {t.dir === 'sobe' ? 'subiu' : 'caiu'}</span>;
};

export const SetorChip: React.FC<{ setor: string }> = ({ setor }) => (
  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 truncate max-w-[160px]" title={setor}>{setor}</span>
);

// "ATRASADO — falta ago/2026" (e "3 períodos sem valor") ou "Lançar até 05/10".
export const AtrasoSelo: React.FC<{ i: KpisIndicador; r: KpisResumo }> = ({ i, r }) => {
  if (i.tipo === 'calculado' || !i.ativo) return null;
  if (r.pend.situacao === 'atrasado') {
    const n = r.pend.atrasados.length;
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/25 border border-orange-200 dark:border-orange-900/50 rounded-full px-2 py-0.5">
        <Clock size={11} /> Atrasado — falta {rotuloPeriodo(i.frequencia, r.pend.atrasados[0])}{n > 1 ? ` (${n} períodos sem valor)` : ''}
      </span>
    );
  }
  if (r.pend.situacao === 'no_prazo' && r.pend.proximoPrazo) {
    return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400"><Clock size={11} /> Lançar {rotuloPeriodo(i.frequencia, r.pend.noPrazo[0])} até {fmtDia(r.pend.proximoPrazo).slice(0, 5)}</span>;
  }
  return null;
};

export const KpisCartao: React.FC<{ i: KpisIndicador; r: KpisResumo; ligados?: number; mostrarSetor?: boolean; onAbrir: () => void }> = ({ i, r, ligados, mostrarSetor, onAbrir }) => {
  const cor = FAROL_CLASSE[r.farol];
  return (
    <button type="button" onClick={onAbrir}
      className={`text-left bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md transition-all flex flex-col gap-2 min-w-0 ${!i.ativo ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <SentidoIcon i={i} />
            <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate" title={i.nome}>{i.nome}</h4>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {mostrarSetor && <SetorChip setor={i.setor} />}
            {i.tipo === 'calculado' && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400"><Calculator size={11} /> calculado</span>}
            {!i.ativo && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400"><Archive size={11} /> arquivado</span>}
          </div>
        </div>
        {!r.erroCalculo && <FarolChip f={r.farol} className="shrink-0" />}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-2xl font-black tabular-nums leading-tight ${r.ultimo ? cor.text : 'text-slate-300 dark:text-slate-600'}`}>
            {r.ultimo ? fmtValor(r.ultimo.valor, i.unidade, i.casas) : '—'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {r.ultimo ? rotuloPeriodo(i.frequencia, r.ultimo.periodo)
              : r.erroCalculo ? <span className="text-rose-600 dark:text-rose-400">não consegui calcular agora</span>
              : r.comecaEm ? `começa em ${rotuloPeriodo(i.frequencia, r.comecaEm)}` : 'sem valor ainda'}
            {r.meta ? <> · meta {fmtValor(r.meta.meta, i.unidade, i.casas)}</> : r.semMeta ? <> · <span className="text-amber-600 dark:text-amber-400">sem meta — defina</span></> : null}
          </div>
          {r.parcial && r.parcial.valor !== null && <div className="text-[11px] text-slate-400 dark:text-slate-500">{rotuloPeriodo(i.frequencia, r.parcial.periodo)} até agora: {fmtValor(r.parcial.valor, i.unidade, i.casas)}</div>}
        </div>
        <div className="w-24 h-8 shrink-0" style={{ color: cor.hex }}>
          <MiniGrafico v={r.spark} className="w-full h-full" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap min-h-[18px]">
        <TendenciaIcon t={r.tendencia} />
        <AtrasoSelo i={i} r={r} />
        {!!ligados && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 ml-auto"><Link2 size={11} /> ligado a {ligados} KR</span>}
      </div>
    </button>
  );
};
