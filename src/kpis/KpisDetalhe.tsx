import React, { useEffect, useMemo, useState } from 'react';
import { X, Pencil, Trash2, Loader2, History, Calculator, PencilLine, Check } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import {
  KpisHist, KpisIndicador, KpisLancamento, FREQ_ROTULO, SENTIDO_ROTULO, farol, fmtCarimbo, fmtValor, limiteEfetivo, metaVigente,
  numeroExatoParaCampo, parseNumero, prazoDias, rotuloPeriodo, rotuloPeriodoLongo, rotuloBase, rotuloCalculo,
} from './kpis';
import { KpisDados, resumoDo } from './kpisDados';
import { KpisService, kpisErrorMessage } from './kpisService';
import { FarolChip, SetorChip, AtrasoSelo, TendenciaIcon } from './KpisCartao';

// DETALHE de um indicador: o gráfico (até 36 períodos, com a meta em degrau e a faixa de
// atenção), a tabela período a período (quem lançou, quando, se foi corrigido) e o histórico
// de correções. Corrigir: quem lança. Apagar: só o Edson e os admins de OKR.

const campo = 'px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500';
// Carimbo no fuso de Joinville (o do "Criado em" e o do Lançar), não no do navegador.
const quando = (ts?: string | null) => ts ? fmtCarimbo(ts, true) : '';

export const KpisDetalhe: React.FC<{
  i: KpisIndicador; dados: KpisDados; service: KpisService; nomes: Map<string, string>;
  administra: boolean; podeEditar?: boolean; mostrarSetor: boolean;
  onFechar: () => void; onEditar: () => void; onGravou: () => void;
}> = ({ i, dados, service, nomes, administra, podeEditar, mostrarSetor, onFechar, onEditar, onGravou }) => {
  const { addToast } = useToast();
  const r = useMemo(() => resumoDo(i, dados), [i, dados]);
  const metas = dados.metas.get(i.id) || [];
  const [hist, setHist] = useState<KpisHist[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);     // id do lançamento em correção
  const [valor, setValor] = useState(''); const [motivo, setMotivo] = useState('');
  const [gravando, setGravando] = useState(false);
  const [abrirHist, setAbrirHist] = useState<string | null>(null);  // período cujo histórico está aberto

  const lerHist = () => {
    if (i.tipo === 'calculado') { setHist([]); return; }
    service.listHist(i.id).then(setHist).catch(() => setHist(null));
  };
  useEffect(lerHist, [i.id, dados.lidoEm]); // eslint-disable-line react-hooks/exhaustive-deps

  const pontos = r.serie.slice(-36);
  // Calculado: o período em curso ainda não fechou (no dia 1º vale 0) — fica fora da linha "Valor" e
  // aparece como um ponto à parte, "em curso".
  const emCurso = (per: string) => !!r.parcial && r.parcial.periodo === per;
  const grafico = pontos.map(p => {
    const m = metaVigente(metas, p.periodo);
    return {
      nome: rotuloPeriodo(i.frequencia, p.periodo),
      valor: emCurso(p.periodo) ? null : p.valor,
      emCurso: emCurso(p.periodo) ? p.valor : null,
      meta: m ? m.meta : null,
      atencao: m ? limiteEfetivo(i.sentido, m) : null,
    };
  });
  const temMeta = grafico.some(g => g.meta !== null);
  // Calculado: período sem valor só some quando o cálculo falhou; média/% sem base aparece ("0 concluídos…").
  const linhas = [...r.serie].reverse().filter(p => p.valor !== null || i.tipo === 'manual' || !r.erroCalculo);

  const corrigir = async (l: KpisLancamento) => {
    const n = parseNumero(valor);
    if (n === null) { addToast('Número inválido — use só algarismos e vírgula (ex.: 92,5).', 'warning'); return; }
    if (n === l.valor) { setEditando(null); return; }
    if (motivo.trim().length < 3) { addToast('Diga o motivo da correção.', 'warning'); return; }
    setGravando(true);
    try {
      await service.corrigir(l.id, n, l.comentario, motivo, l.atualizadoEm);
      addToast(`${rotuloPeriodoLongo(i.frequencia, l.periodo)}: corrigido para ${fmtValor(n, i.unidade, i.casas)}.`, 'success');
      setEditando(null); onGravou();
    } catch (e) { addToast(kpisErrorMessage(e, 'Não consegui corrigir.'), 'error'); onGravou(); }
    finally { setGravando(false); }
  };
  const apagar = async (l: KpisLancamento) => {
    if (!window.confirm(`Apagar o valor de ${rotuloPeriodoLongo(i.frequencia, l.periodo)} (${fmtValor(l.valor, i.unidade, i.casas)})? Ele fica no histórico, com o seu nome.`)) return;
    setGravando(true);
    try { await service.apagarLancamento(l.id); addToast('Lançamento apagado (fica no histórico).', 'success'); onGravou(); }
    catch (e) { addToast(kpisErrorMessage(e, 'Não consegui apagar.'), 'error'); }
    finally { setGravando(false); }
  };

  const histDoPeriodo = (p: string) => (hist || []).filter(h => h.periodo === p);

  return (
    <Dialog onClose={() => { if (!gravando) onFechar(); }} label={`Indicador ${i.nome}`} panelClassName="w-full max-w-4xl outline-none">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3 border-l-4 border-l-blue-500 rounded-tl-2xl">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400">KPI · <span className="text-orange-500">Indicador</span></p>
            <h3 className="text-lg font-black text-slate-800 dark:text-white leading-tight">{i.nome}</h3>
            <div className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {mostrarSetor && <SetorChip setor={i.setor} />}
              <span>{SENTIDO_ROTULO[i.sentido]}</span><span>·</span><span>{FREQ_ROTULO[i.frequencia].toLowerCase()}</span>
              {i.unidade && <><span>·</span><span>em {i.unidade}</span></>}
              {i.consolidacao === 'soma' && <><span>·</span><span>soma ao longo do tempo</span></>}
              {i.tipo === 'calculado' ? <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400"><Calculator size={11} /> {rotuloCalculo(i)}</span>
                : <><span>·</span><span>lançar até {prazoDias(i)} dia(s) depois do fim do período</span></>}
              {!i.ativo && <span className="font-bold uppercase text-amber-600 dark:text-amber-400">arquivado</span>}
            </div>
            {i.descricao && <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 whitespace-pre-wrap"><b>Como medir:</b> {i.descricao}</p>}
          </div>
          {(podeEditar ?? administra) && <button onClick={onEditar} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-900/60 hover:bg-blue-50 dark:hover:bg-blue-900/20"><Pencil size={13} /> Editar indicador</button>}
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-black tabular-nums text-slate-800 dark:text-white">{r.ultimo ? fmtValor(r.ultimo.valor, i.unidade, i.casas) : '—'}</span>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {r.ultimo ? rotuloPeriodoLongo(i.frequencia, r.ultimo.periodo)
                : r.erroCalculo ? <span className="text-rose-600 dark:text-rose-400">não consegui calcular agora — tente Atualizar</span> : 'sem valor ainda'}
              {r.meta && <> · meta {fmtValor(r.meta.meta, i.unidade, i.casas)} (vale desde {rotuloPeriodo(i.frequencia, r.meta.valeDesde)})</>}
            </div>
            {r.noAno && <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full px-2.5 py-0.5" title="Soma dos períodos deste ano até agora (com o período em curso)">em {r.noAno.ano}: {fmtValor(r.noAno.valor, i.unidade, i.casas)}</span>}
            {!r.erroCalculo && <FarolChip f={r.farol} />}
            <TendenciaIcon t={r.tendencia} />
            <AtrasoSelo i={i} r={r} />
          </div>

          <div className="h-64">
            {grafico.some(g => g.valor !== null || g.emCurso !== null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={grafico} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                  <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} />
                  <Tooltip formatter={(v: any, n: any) => [v === null || v === undefined ? '—' : fmtValor(Number(v), i.unidade, i.casas), n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {temMeta && <Line type="stepAfter" dataKey="meta" name="Meta" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />}
                  {temMeta && <Line type="stepAfter" dataKey="atencao" name="Limite da atenção" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls />}
                  <Line type="monotone" dataKey="valor" name="Valor" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
                  {r.parcial && r.parcial.valor !== null && <Line dataKey="emCurso" name="Em curso (parcial)" stroke="#94a3b8" strokeWidth={0} dot={{ r: 4, fill: '#94a3b8' }} isAnimationActive={false} />}
                </ComposedChart>
              </ResponsiveContainer>
            ) : <div className="h-full grid place-items-center text-sm text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">{r.erroCalculo ? 'Não consegui calcular a série agora — tente Atualizar.' : 'Sem valores ainda para o gráfico.'}</div>}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 sticky top-0 z-10">
                  <tr>
                    <th className="text-left font-semibold px-4 py-2">Período</th>
                    <th className="text-right font-semibold px-4 py-2">Valor</th>
                    <th className="text-right font-semibold px-4 py-2">Meta</th>
                    <th className="text-left font-semibold px-4 py-2">Farol</th>
                    <th className="text-left font-semibold px-4 py-2">{i.tipo === 'calculado' ? 'Base' : 'Quem lançou'}</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {linhas.map(p => {
                    const m = metaVigente(metas, p.periodo); const l = p.lanc;
                    const hs = histDoPeriodo(p.periodo);
                    return (
                      <React.Fragment key={p.periodo}>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap">{rotuloPeriodoLongo(i.frequencia, p.periodo)}{r.parcial && r.parcial.periodo === p.periodo && <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-400" title="O período ainda está em curso: o número vai mudar">parcial</span>}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-800 dark:text-white">
                            {l && editando === l.id
                              ? <input autoFocus value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" aria-label={`Valor corrigido de ${rotuloPeriodoLongo(i.frequencia, p.periodo)}`} className={`${campo} w-24 text-right`} />
                              : fmtValor(p.valor, i.unidade, i.casas)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{m ? fmtValor(m.meta, i.unidade, i.casas) : '—'}</td>
                          <td className="px-4 py-2">{emCurso(p.periodo) ? <span className="text-[11px] font-semibold text-slate-400" title="O período ainda não fechou: o farol sai quando ele terminar">em curso</span>
                            : p.valor !== null ? <FarolChip f={farol(i.sentido, p.valor, m)} /> : <span className="text-[11px] text-slate-400">—</span>}</td>
                          <td className="px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                            {i.tipo === 'calculado' ? rotuloBase(i, p.atividades ?? 0) : l ? (
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                {nomes.get(l.lancadoPor || '') || '—'}, {quando(l.lancadoEm)}
                                {(l.alteradoEm || hs.length > 0) && <button type="button" onClick={() => setAbrirHist(a => a === p.periodo ? null : p.periodo)} className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-full px-1.5 py-0.5">corrigido</button>}
                              </span>
                            ) : hs.length ? <button type="button" onClick={() => setAbrirHist(a => a === p.periodo ? null : p.periodo)} className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400">apagado — ver</button> : <span>sem valor</span>}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            {l && i.podeLancar && (editando === l.id ? (
                              <span className="inline-flex items-center gap-1">
                                <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} placeholder="motivo" aria-label="Motivo da correção" className={`${campo} w-40`} />
                                <button onClick={() => corrigir(l)} disabled={gravando} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Salvar a correção">{gravando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}</button>
                                <button onClick={() => setEditando(null)} disabled={gravando} className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cancelar"><X size={14} /></button>
                              </span>
                            ) : (
                              <button onClick={() => { setEditando(l.id); setValor(numeroExatoParaCampo(l.valor)); setMotivo(''); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400"><PencilLine size={12} /> Corrigir</button>
                            ))}
                            {l && (podeEditar ?? administra) && editando !== l.id && <button onClick={() => apagar(l)} disabled={gravando} className="ml-2 text-slate-300 hover:text-rose-500" title="Apagar este lançamento (fica no histórico)"><Trash2 size={13} /></button>}
                          </td>
                        </tr>
                        {abrirHist === p.periodo && hs.length > 0 && (
                          <tr className="bg-amber-50/50 dark:bg-amber-900/10">
                            <td colSpan={6} className="px-4 py-2">
                              <ul className="space-y-1">
                                {hs.map(h => (
                                  <li key={h.id} className="text-[11px] text-slate-600 dark:text-slate-300">
                                    {quando(h.em)} · {nomes.get(h.por || '') || '—'} {h.acao === 'apagou' ? <>apagou o valor <b>{fmtValor(h.valorAntes, i.unidade, i.casas)}</b></> : <>corrigiu de <b>{fmtValor(h.valorAntes, i.unidade, i.casas)}</b> para <b>{fmtValor(h.valorDepois, i.unidade, i.casas)}</b></>}{h.motivo ? <> — “{h.motivo}”</> : null}
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {linhas.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">{r.erroCalculo ? 'Não consegui calcular os períodos agora — tente Atualizar.' : 'Nenhum período ainda.'}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {i.tipo === 'manual' && (
            <details className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <summary className="text-xs font-bold text-slate-500 dark:text-slate-400 cursor-pointer select-none inline-flex items-center gap-1.5"><History size={13} /> Histórico de correções {hist ? `(${hist.length})` : ''}</summary>
              {hist === null ? <p className="text-[11px] text-rose-500 mt-2">Não consegui ler o histórico.</p>
                : hist.length === 0 ? <p className="text-[11px] text-slate-400 mt-2">Nenhuma correção.</p>
                : <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {hist.map(h => (
                      <li key={h.id} className="text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="font-mono text-slate-400">{quando(h.em)}</span> · {rotuloPeriodo(i.frequencia, h.periodo)} · {nomes.get(h.por || '') || '—'}{' '}
                        {h.acao === 'apagou' ? <>apagou {fmtValor(h.valorAntes, i.unidade, i.casas)}</> : <>{fmtValor(h.valorAntes, i.unidade, i.casas)} → {fmtValor(h.valorDepois, i.unidade, i.casas)}</>}
                        {h.motivo ? <> — “{h.motivo}”</> : null}
                      </li>
                    ))}
                  </ul>}
            </details>
          )}
          <p className="text-[11px] text-slate-400">Criado em {fmtCarimbo(i.criadoEm)}{i.criadoPor ? ` por ${nomes.get(i.criadoPor) || '—'}` : ''}.</p>
        </div>
      </div>
    </Dialog>
  );
};
