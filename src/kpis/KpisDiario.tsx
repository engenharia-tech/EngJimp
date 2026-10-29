import React, { useMemo, useState } from 'react';
import { Loader2, Check, X, PencilLine, Trash2, CalendarDays } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useToast } from '../components/Toast';
import { KpisIndicador, KpisLancamento, FECHA_ROTULO, fmtCarimbo, fmtValor, hojeSP, numeroExatoParaCampo, parseNumero, periodoDiario, rotuloDia, rotuloPeriodo } from './kpis';
import { KpisDados, KpisResumo, ritmoDo } from './kpisDados';
import { KpisService, kpisErrorMessage } from './kpisService';
import { FarolChip } from './KpisCartao';

// 035 (29/10/2026) — O PERÍODO LANÇADO TODO DIA, no desenho da Reunião de Gestão da Produção (ago/2026): o planejado
// (a meta repartida pelos dias úteis), o realizado e o projetado, por semana dentro do mês (por mês no trimestre, por
// dia na semana), fechando no período; e os dias lançados, com quem lançou, para corrigir ou apagar.
// Edson: "Preciso que seja diária a escolha e você faça o fluxo para as entregas diárias. O qual vai alimentando as
// entregas mensais. Conforme a apresentação."

const campo = 'px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500';
const Num: React.FC<{ v: number | null; i: KpisIndicador; casas?: number; forte?: boolean }> = ({ v, i, casas, forte }) =>
  <span className={`tabular-nums ${forte ? 'font-bold text-slate-800 dark:text-white' : ''}`}>{v === null ? '—' : fmtValor(v, '', casas ?? i.casas)}</span>;

export const KpisDiario: React.FC<{
  i: KpisIndicador; r: KpisResumo; dados: KpisDados; service: KpisService; nomes: Map<string, string>;
  podeApagar: boolean; periodo: string | null; onPeriodo: (p: string) => void; onGravou: () => void;
}> = ({ i, r, dados, service, nomes, podeApagar, periodo, onPeriodo, onGravou }) => {
  const { addToast } = useToast();
  const hoje = hojeSP();
  const metas = dados.metas.get(i.id) || [];
  // Os períodos diários que a tela leu (o em curso primeiro).
  const periodos = useMemo(() => r.serie.filter(p => periodoDiario(i, p.periodo)).map(p => p.periodo).reverse(), [r.serie, i]);
  const per = periodo && periodos.includes(periodo) ? periodo : periodos[0] || null;
  const ponto = per ? r.serie.find(p => p.periodo === per) : undefined;
  const rt = useMemo(() => per ? ritmoDo(i, per, ponto?.dias || [], metas, hoje) : null, [i, per, ponto, metas, hoje]);
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState(''); const [motivo, setMotivo] = useState('');
  const [gravando, setGravando] = useState(false);
  if (!per || !rt) return null;
  const soma = i.consolidacao === 'soma';
  const emCurso = hoje <= rt.partes[rt.partes.length - 1].ate;
  const unid = i.unidade ? ` (${i.unidade})` : '';
  const grafico = rt.partes.map(p => ({
    nome: i.frequencia === 'mensal' ? p.rotulo.replace(/ \(.*\)$/, '') : p.rotulo,
    Planejado: p.planejado, Realizado: p.situacao === 'futura' ? null : p.realizado,
    Projetado: soma && p.situacao !== 'fechada' ? p.projetado : null,
  }));
  const somaPartes = (k: 'planejado' | 'realizado' | 'projetado') => {
    const vs = rt.partes.map(p => p[k]).filter((v): v is number => v !== null);
    return vs.length ? vs.reduce((s, v) => s + v, 0) : null;
  };

  const corrigir = async (l: KpisLancamento) => {
    const n = parseNumero(valor);
    if (n === null) { addToast('Número inválido — use só algarismos e vírgula (ex.: 92,5).', 'warning'); return; }
    if (n === l.valor) { setEditando(null); return; }
    if (motivo.trim().length < 3) { addToast('Diga o motivo da correção.', 'warning'); return; }
    setGravando(true);
    try {
      await service.corrigir(l.id, n, l.comentario, motivo, l.atualizadoEm);
      addToast(`${rotuloDia(l.dia as string)}: corrigido para ${fmtValor(n, i.unidade, i.casas)}.`, 'success');
      setEditando(null); onGravou();
    } catch (e) { addToast(kpisErrorMessage(e, 'Não consegui corrigir.'), 'error'); onGravou(); }
    finally { setGravando(false); }
  };
  const apagar = async (l: KpisLancamento) => {
    if (!window.confirm(`Apagar o valor de ${rotuloDia(l.dia as string)} (${fmtValor(l.valor, i.unidade, i.casas)})? Ele fica no histórico, com o seu nome.`)) return;
    setGravando(true);
    try { await service.apagarLancamento(l.id); addToast('Lançamento apagado (fica no histórico).', 'success'); onGravou(); }
    catch (e) { addToast(kpisErrorMessage(e, 'Não consegui apagar.'), 'error'); }
    finally { setGravando(false); }
  };

  return (
    <section className="rounded-xl border border-blue-200 dark:border-blue-900/60 overflow-hidden" aria-label="Lançado todo dia">
      <div className="px-4 py-3 bg-blue-50/60 dark:bg-blue-900/10 flex items-center gap-2 flex-wrap">
        <CalendarDays size={15} className="text-blue-600 dark:text-blue-400" />
        <h4 className="text-sm font-black text-slate-800 dark:text-white">Lançado todo dia · a meta fecha {FECHA_ROTULO[i.frequencia]}</h4>
        <select value={per} onChange={e => onPeriodo(e.target.value)} className={`${campo} ml-auto`} aria-label="Período">
          {periodos.map(p => <option key={p} value={p}>{rotuloPeriodo(i.frequencia, p)}{p === r.pend.atual ? ' (em curso)' : ''}</option>)}
        </select>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Planejado{unid}</p>
            <p className="text-xl font-black tabular-nums text-slate-800 dark:text-white">{rt.meta === null ? '—' : fmtValor(rt.meta, '', i.casas)}</p>
            <p className="text-[10px] text-slate-400">{rt.meta === null ? 'sem meta — defina' : `a meta ${FECHA_ROTULO[i.frequencia]}`}</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Realizado{emCurso ? ' até agora' : ''}</p>
            <p className="text-xl font-black tabular-nums text-slate-800 dark:text-white">{fmtValor(rt.realizado, '', i.casas)}</p>
            <p className="text-[10px] text-slate-400">{rt.dias} dia(s) lançado(s){rt.ultimoDia ? `, o último ${rotuloDia(rt.ultimoDia)}` : ''}</p>
          </div>
          {soma && emCurso && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Meta até aqui</p>
              <p className="text-xl font-black tabular-nums text-slate-800 dark:text-white">{rt.metaAteAgora === null ? '—' : fmtValor(rt.metaAteAgora, '', Math.max(1, i.casas))}</p>
              <p className="text-[10px] text-slate-400">{rt.ate ? `${rt.uteisPassados} de ${rt.uteisNoPeriodo} dias úteis já contam, até ${rotuloDia(rt.ate)}` : `nenhum dos ${rt.uteisNoPeriodo} dias úteis conta ainda`}</p>
            </div>
          )}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{soma ? (emCurso ? 'Projetado para o fim' : 'Fechou em') : 'Média dos dias'}</p>
            <p className="text-xl font-black tabular-nums text-slate-800 dark:text-white">{fmtValor(rt.projecao, '', i.casas)}</p>
            <div className="mt-0.5">{rt.meta !== null && rt.projecao !== null ? <FarolChip f={rt.farol} /> : <span className="text-[10px] text-slate-400">{soma && emCurso ? 'no ritmo dos dias úteis que já contam' : ''}</span>}</div>
          </div>
        </div>
        {soma && emCurso && rt.meta !== null && rt.projecao !== null && (
          <p className="text-[11px] text-slate-600 dark:text-slate-300">
            No ritmo de agora, {rotuloPeriodo(i.frequencia, per)} fecha em <b>{fmtValor(rt.projecao, i.unidade, i.casas)}</b> — {
              rt.projecao === rt.meta ? <>exatamente a meta.</>
              : (i.sentido === 'maior') === (rt.projecao > rt.meta)
                ? <>{fmtValor(Math.abs(rt.projecao - rt.meta), i.unidade, i.casas)} {rt.projecao > rt.meta ? 'acima' : 'abaixo'} da meta (no verde).</>
                : i.sentido === 'maior'
                  ? <>faltam <b>{fmtValor(rt.meta - rt.projecao, i.unidade, i.casas)}</b> para a meta.</>
                  : <><b>{fmtValor(rt.projecao - rt.meta, i.unidade, i.casas)}</b> acima da meta (quanto menor, melhor).</>}
          </p>
        )}

        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={grafico} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={44} allowDecimals={i.casas > 0} />
              <Tooltip formatter={(v: any, n: any) => [v === null || v === undefined ? '—' : fmtValor(Number(v), i.unidade, i.casas), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Planejado" fill="#94a3b8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Realizado" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              {soma && emCurso && <Bar dataKey="Projetado" fill="#f97316" fillOpacity={0.55} radius={[3, 3, 0, 0]} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-semibold px-3 py-2">{i.frequencia === 'mensal' ? 'Semana' : i.frequencia === 'trimestral' ? 'Mês' : 'Dia'}</th>
                <th className="text-right font-semibold px-3 py-2">Dias úteis</th>
                <th className="text-right font-semibold px-3 py-2">Planejado</th>
                <th className="text-right font-semibold px-3 py-2">Realizado</th>
                {soma && <th className="text-right font-semibold px-3 py-2">Projetado</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rt.partes.map(p => (
                <tr key={p.de} className={p.situacao === 'atual' ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">{p.rotulo}{p.situacao === 'atual' && <span className="ml-1.5 text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">agora</span>}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500 dark:text-slate-400 tabular-nums">{p.uteis}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500 dark:text-slate-400"><Num v={p.planejado} i={i} /></td>
                  <td className="px-3 py-1.5 text-right"><Num v={p.situacao === 'futura' ? null : p.realizado} i={i} forte /></td>
                  {soma && <td className="px-3 py-1.5 text-right text-orange-600 dark:text-orange-400">{p.situacao === 'fechada' ? <span className="text-slate-400"><Num v={p.projetado} i={i} /></span> : <Num v={p.projetado} i={i} />}</td>}
                </tr>
              ))}
            </tbody>
            {soma && (
              <tfoot className="bg-slate-50 dark:bg-slate-900 font-bold">
                <tr>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{rt.uteisNoPeriodo}</td>
                  <td className="px-3 py-2 text-right"><Num v={somaPartes('planejado')} i={i} forte /></td>
                  <td className="px-3 py-2 text-right"><Num v={rt.realizado} i={i} forte /></td>
                  <td className="px-3 py-2 text-right text-orange-600 dark:text-orange-400"><Num v={rt.projecao} i={i} /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-[11px] text-slate-400">Planejado: a meta {FECHA_ROTULO[i.frequencia]} repartida pelos dias úteis (seg–sex). {soma ? 'Projetado: o realizado mais, nos dias úteis que ainda não contam, o ritmo dos que já contam (dia útil vencido sem valor conta como zero; o dia ainda no prazo, não). ' : ''}Sábado e domingo lançam se houver, e não atrasam.</p>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Os dias lançados em {rotuloPeriodo(i.frequencia, per)}</p>
          {!(ponto?.dias || []).length ? <p className="text-[11px] text-slate-400">Nenhum dia lançado neste período ainda.</p> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              {[...(ponto?.dias || [])].reverse().map(l => (
                <li key={l.id} className="px-3 py-1.5 flex items-center gap-2 flex-wrap text-xs">
                  <span className="w-24 font-semibold text-slate-700 dark:text-slate-200">{rotuloDia(l.dia as string)}</span>
                  {editando === l.id
                    ? <>
                        <input autoFocus value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" aria-label={`Valor corrigido de ${rotuloDia(l.dia as string)}`} className={`${campo} w-20 text-right`} />
                        <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} placeholder="motivo" aria-label="Motivo da correção" className={`${campo} w-40`} />
                        <button onClick={() => corrigir(l)} disabled={gravando} className="p-1 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Salvar a correção">{gravando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}</button>
                        <button onClick={() => setEditando(null)} disabled={gravando} className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Cancelar"><X size={14} /></button>
                      </>
                    : <span className="w-16 text-right font-bold tabular-nums text-slate-800 dark:text-white">{fmtValor(l.valor, '', i.casas)}</span>}
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-1 min-w-[140px]">{nomes.get(l.alteradoPor || l.lancadoPor || '') || '—'}, {fmtCarimbo(l.alteradoEm || l.lancadoEm, true)}{l.alteradoEm ? ' (corrigido)' : ''}{l.comentario ? <> — “{l.comentario}”</> : null}</span>
                  {editando !== l.id && i.podeLancar && <button onClick={() => { setEditando(l.id); setValor(numeroExatoParaCampo(l.valor)); setMotivo(''); }} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400"><PencilLine size={12} /> Corrigir</button>}
                  {editando !== l.id && podeApagar && <button onClick={() => apagar(l)} disabled={gravando} className="text-slate-300 hover:text-rose-500" title="Apagar este dia (fica no histórico)"><Trash2 size={13} /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};
