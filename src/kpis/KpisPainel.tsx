import React, { useMemo, useState } from 'react';
import { Gauge, CheckCircle2, AlertTriangle, XCircle, Clock, Layers, Archive } from 'lucide-react';
import { KpisIndicador, setorChave } from './kpis';
import { KpisDados, KpisResumo, resumoDo } from './kpisDados';
import { KpisCartao } from './KpisCartao';

// PAINEL: os quadros do topo, a visão por setor (para quem vê todos) e um cartão por
// indicador. Clique no cartão abre o detalhe; clique num setor filtra.

const Quadro: React.FC<{ label: string; value: number; icon: React.ReactNode; cls: string }> = ({ label, value, icon, cls }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
    <div className="flex items-center gap-1.5 text-slate-400 mb-1">{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
    <div className={`text-2xl font-black tabular-nums ${cls}`}>{value}</div>
  </div>
);

export const KpisPainel: React.FC<{
  dados: KpisDados;
  inds: KpisIndicador[];            // já filtrados pelo setor escolhido
  visaoPorSetor: boolean;           // quem vê todos, com "Todos" escolhido
  mostrarSetor: boolean;
  onAbrir: (i: KpisIndicador) => void;
  onFiltrarSetor: (chave: string) => void;
}> = ({ dados, inds, visaoPorSetor, mostrarSetor, onAbrir, onFiltrarSetor }) => {
  const [verArquivados, setVerArquivados] = useState(false);
  const itens = useMemo(() => inds.map(i => ({ i, r: resumoDo(i, dados) })), [inds, dados]);
  const ativos = itens.filter(x => x.i.ativo);
  const conta = (f: (r: KpisResumo) => boolean) => ativos.filter(x => f(x.r)).length;

  const setores = useMemo(() => {
    const g = new Map<string, { chave: string; nome: string; n: number; verde: number; amarelo: number; vermelho: number; sem: number; atrasados: number }>();
    ativos.forEach(({ i, r }) => {
      const k = setorChave(i.setor);
      const s = g.get(k) || { chave: k, nome: i.setor, n: 0, verde: 0, amarelo: 0, vermelho: 0, sem: 0, atrasados: 0 };
      s.n++;
      if (r.farol === 'verde') s.verde++; else if (r.farol === 'amarelo') s.amarelo++; else if (r.farol === 'vermelho') s.vermelho++; else s.sem++;
      if (r.pend.situacao === 'atrasado') s.atrasados++;
      g.set(k, s);
    });
    return Array.from(g.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [ativos]);

  const mostrados = itens.filter(x => x.i.ativo || verArquivados)
    .sort((a, b) => (a.i.ativo === b.i.ativo ? 0 : a.i.ativo ? -1 : 1) || a.i.setor.localeCompare(b.i.setor, 'pt-BR') || a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
  const nArq = itens.length - ativos.length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Quadro label="Indicadores" value={ativos.length} icon={<Gauge size={14} />} cls="text-blue-600 dark:text-blue-400" />
        <Quadro label="No verde" value={conta(r => r.farol === 'verde')} icon={<CheckCircle2 size={14} />} cls="text-emerald-600 dark:text-emerald-400" />
        <Quadro label="Atenção" value={conta(r => r.farol === 'amarelo')} icon={<AlertTriangle size={14} />} cls="text-amber-600 dark:text-amber-400" />
        <Quadro label="Fora da meta" value={conta(r => r.farol === 'vermelho')} icon={<XCircle size={14} />} cls="text-rose-600 dark:text-rose-400" />
        <Quadro label="Atrasados" value={conta(r => r.pend.situacao === 'atrasado')} icon={<Clock size={14} />} cls="text-orange-600 dark:text-orange-400" />
      </div>

      {visaoPorSetor && setores.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
            <Layers size={14} className="text-slate-400" />
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Visão por setor</h4>
            <span className="text-[11px] text-slate-400 ml-auto">clique num setor para ver só ele</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {setores.map(s => (
              <button key={s.chave} type="button" onClick={() => onFiltrarSetor(s.chave)}
                className="w-full text-left px-5 py-3 grid grid-cols-[1fr_auto] sm:grid-cols-[10rem_4rem_1fr_6rem] items-center gap-x-3 gap-y-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate min-w-0" title={s.nome}>{s.nome}<span className="sm:hidden text-[11px] font-normal text-slate-500 dark:text-slate-400"> · {s.n} ind.</span></span>
                <span className="hidden sm:block text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">{s.n} ind.</span>
                <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto h-2.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800" role="img"
                  aria-label={`${s.verde} no verde, ${s.amarelo} em atenção, ${s.vermelho} fora da meta, ${s.sem} sem dado`}>
                  {s.verde > 0 && <div className="h-full bg-emerald-500" style={{ width: `${(s.verde / s.n) * 100}%` }} title={`${s.verde} no verde`} />}
                  {s.amarelo > 0 && <div className="h-full bg-amber-500" style={{ width: `${(s.amarelo / s.n) * 100}%` }} title={`${s.amarelo} em atenção`} />}
                  {s.vermelho > 0 && <div className="h-full bg-rose-500" style={{ width: `${(s.vermelho / s.n) * 100}%` }} title={`${s.vermelho} fora da meta`} />}
                  {s.sem > 0 && <div className="h-full bg-slate-300 dark:bg-slate-600" style={{ width: `${(s.sem / s.n) * 100}%` }} title={`${s.sem} sem dado ou sem meta`} />}
                </div>
                <span className={`text-right text-[11px] font-semibold whitespace-nowrap ${s.atrasados ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'}`}>{s.atrasados ? `${s.atrasados} atrasado(s)` : 'em dia'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mostrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-400">
          Nenhum indicador {inds.length ? 'ativo ' : ''}por aqui ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {mostrados.map(({ i, r }) => (
            <KpisCartao key={i.id} i={i} r={r} mostrarSetor={mostrarSetor} ligados={dados.ligados?.get(i.id)} onAbrir={() => onAbrir(i)} />
          ))}
        </div>
      )}
      {nArq > 0 && (
        <button type="button" onClick={() => setVerArquivados(v => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <Archive size={12} /> {verArquivados ? 'Ocultar arquivados' : `Mostrar ${nArq} arquivado(s)`}
        </button>
      )}
    </div>
  );
};
