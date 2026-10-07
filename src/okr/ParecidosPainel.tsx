// Painel "Iniciativas parecidas" da Governança do OKR (07/10/2026) — ver parecidosService.ts.
// Só para o Edson, os admins de OKR e a visão do CEO (CEO / Diretor Industrial): a tela só não mostra o painel aos
// outros; quem barra de verdade é o servidor (403). Procura quando a pessoa pede (cada busca pode custar a IA).
import React, { useEffect, useRef, useState } from 'react';
import { Users, Search, RefreshCw, ArrowLeftRight, Sparkles, AlertTriangle } from 'lucide-react';
import { ParecidosPainel as Painel, ParecidoLado, ParecidosErro, buscarPainelParecidos, rotuloItem, rotuloTipo } from './parecidosService';

const quando = (iso: string) => {
  try { const d = new Date(iso); return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`; }
  catch { return iso; }
};

const Lado: React.FC<{ l: ParecidoLado }> = ({ l }) => {
  const rot = rotuloItem(l.tipo, l.ref);
  return (
    <div className="min-w-0 flex-1 rounded-lg bg-gray-50/70 dark:bg-slate-800/40 px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-slate-800 dark:text-white" title={l.dono ? `login: ${l.dono}` : undefined}>{l.nome}</span>
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-slate-400 dark:text-slate-500" title={l.ref ? `${rotuloTipo(l.tipo)} · ${l.ref}` : rotuloTipo(l.tipo)}>
          {rotuloTipo(l.tipo)}{rot !== rotuloTipo(l.tipo) ? ` · ${rot}` : ''}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-200 break-words">“{l.titulo}”</p>
    </div>
  );
};

export const ParecidosPainel: React.FC = () => {
  const [estado, setEstado] = useState<'parado' | 'procurando' | 'pronto' | 'erro'>('parado');
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState('');
  const pedido = useRef<AbortController | null>(null);
  useEffect(() => () => pedido.current?.abort(), []);

  const procurar = async () => {
    if (estado === 'procurando') return;
    pedido.current?.abort();
    const c = new AbortController(); pedido.current = c;
    setEstado('procurando'); setErro('');
    try {
      const p = await buscarPainelParecidos(c.signal);
      if (pedido.current !== c) return;
      setPainel(p); setEstado('pronto');
    } catch (e: any) {
      if (pedido.current !== c || c.signal.aborted) return;
      setErro(e instanceof ParecidosErro ? e.message : 'Não consegui procurar agora — tente de novo.');
      setEstado('erro');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700 border-l-4 border-l-amber-500" data-parecidos-painel>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-slate-400 dark:text-slate-500">OKR · <span className="text-orange-500 dark:text-orange-400">Iniciativas parecidas</span></p>
          <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2 mt-0.5"><Users size={18} className="text-amber-500" /> Iniciativas parecidas</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Compara os objetivos, os KRs e o portfólio do período ativo de todos os OKRs e mostra o que parece ser o mesmo assunto tocado por pessoas diferentes — para combinarem antes de fazer duas vezes.</p>
        </div>
        <button type="button" onClick={procurar} disabled={estado === 'procurando'}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 no-print">
          {estado === 'procurando' ? <><RefreshCw size={14} className="animate-spin" /> Procurando…</> : <><Search size={14} /> Procurar agora</>}
        </button>
      </div>

      {estado === 'erro' && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {erro}
        </p>
      )}

      {painel && estado !== 'procurando' && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-2">
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase">{painel.pares.length} {painel.pares.length === 1 ? 'par' : 'pares'}</span>
            <span>· gerado em {quando(painel.geradoEm)}</span>
            {painel.ia === 'ok'
              ? <span className="inline-flex items-center gap-1">· <Sparkles size={11} className="text-blue-500" /> conferido pela IA</span>
              : <span className="text-amber-600 dark:text-amber-400">· pelo texto — a IA não respondeu (só os muito parecidos)</span>}
          </div>
          {painel.pares.length === 0 && <p className="text-sm text-slate-400 italic py-2">Nenhuma iniciativa parecida entre pessoas diferentes.</p>}
          <ul className="space-y-2">
            {painel.pares.map((p, n) => (
              <li key={`${p.a.dono}|${p.a.ref}|${p.b.dono}|${p.b.ref}|${n}`} className="rounded-xl border border-amber-100 dark:border-amber-900/40 p-2.5">
                <div className="flex flex-col md:flex-row md:items-stretch gap-2">
                  <Lado l={p.a} />
                  <div className="self-center text-amber-500 shrink-0" aria-hidden><ArrowLeftRight size={16} /></div>
                  <Lado l={p.b} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
                  <span className={`font-mono text-[9px] font-bold tracking-[0.18em] uppercase rounded px-1.5 py-0.5 ${p.fonte === 'ia' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>{p.fonte === 'ia' ? 'IA' : 'Texto'}</span>
                  {p.motivo && <span className="text-[11px] text-slate-500 dark:text-slate-400">{p.motivo}</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
