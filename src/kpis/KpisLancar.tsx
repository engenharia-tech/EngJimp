import React, { useEffect, useMemo, useState } from 'react';
import { Save, Loader2, MessageSquarePlus, PencilLine, CheckCircle2, Clock } from 'lucide-react';
import { useToast } from '../components/Toast';
import {
  KpisIndicador, KpisLancamento, SENTIDO_ROTULO, farol, fmtCarimbo, fmtValor, metaVigente, numeroExatoParaCampo, numeroParaCampo, parseNumero, rotuloPeriodo, rotuloPeriodoLongo,
} from './kpis';
import { KpisDados, KpisResumo, resumoDo } from './kpisDados';
import { KpisService, KpisJaLancadoError, kpisErrorMessage } from './kpisService';
import { AtrasoSelo, FarolChip, SetorChip } from './KpisCartao';

// LANÇAR — a tela de quem não é técnico: uma linha por indicador que a pessoa lança,
// primeiro os que faltam (os atrasados em cima), depois os em dia. Escolhe o período,
// digita o número (vírgula vale) e salva. Período que já tem valor vira "Corrigir", com
// o motivo (fica no histórico, com quem e quando).

const campo = 'px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]';

const Linha: React.FC<{ i: KpisIndicador; r: KpisResumo; dados: KpisDados; service: KpisService; nomes: Map<string, string>; mostrarSetor: boolean; onGravou: () => Promise<void> | void }> = ({ i, r, dados, service, nomes, mostrarSetor, onGravou }) => {
  const { addToast } = useToast();
  // Os períodos que dá para lançar: do início (ou 36 meses atrás) até o atual — o mais novo em cima.
  const periodos = useMemo(() => r.serie.map(p => p.periodo).reverse(), [r.serie]);
  const falta = r.pend.atrasados[0] || r.pend.noPrazo[0] || '';
  const [per, setPer] = useState(falta || periodos[0] || '');
  useEffect(() => { if (!periodos.includes(per)) setPer(falta || periodos[0] || ''); }, [periodos.join(','), falta]); // eslint-disable-line react-hooks/exhaustive-deps
  // Acabou de lançar o que faltava: o seletor pula para o próximo que falta (escolher um
  // período já lançado, para corrigir, não mexe no "que falta" e não pula).
  useEffect(() => { if (falta && r.serie.find(p => p.periodo === per)?.lanc) setPer(falta); }, [falta]); // eslint-disable-line react-hooks/exhaustive-deps
  const ponto = r.serie.find(p => p.periodo === per);
  // O que acabou de ser gravado, POR PERÍODO, vale até pousar uma leitura feita DEPOIS da resposta do
  // banco (se a releitura falhar, o 2º clique viraria "alguém lançou enquanto a tela estava aberta").
  // O carimbo é a hora da resposta, não a da leitura que a tela mostrava no clique: uma leitura que
  // pousa durante a gravação não anula o que foi gravado; uma posterior manda (inclusive um valor
  // apagado por fora depois, que não pode "ressuscitar"). Leitura que começou antes da gravação e
  // pousaria depois é descartada pelo seq da carga (a releitura nasce logo depois de guardar).
  const [local, setLocal] = useState<Map<string, { l: KpisLancamento; em: number }>>(() => new Map());
  const daProp = ponto?.lanc || null;
  const meu = local.get(per);
  const existente = meu && dados.lidoEm <= meu.em ? meu.l : daProp;
  const guardar = (l: KpisLancamento) => { const em = Date.now(); setLocal(m => new Map(m).set(l.periodo, { l, em })); };
  const [valor, setValor] = useState('');
  const [coment, setComent] = useState('');
  const [abreComent, setAbreComent] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [gravando, setGravando] = useState(false);
  // Trocou de período: o campo mostra o que já está lá (para corrigir) ou fica vazio.
  useEffect(() => {
    setValor(existente ? numeroExatoParaCampo(existente.valor) : '');
    setComent(existente?.comentario || ''); setAbreComent(!!existente?.comentario); setMotivo('');
  }, [per, existente?.id, existente?.atualizadoEm]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = parseNumero(valor);
  const meta = per ? metaVigente(dados.metas.get(i.id) || [], per) : null;
  const f = farol(i.sentido, n, meta);
  const mudouValor = !!existente && n !== null && n !== existente.valor;
  const mudouComent = !!existente && coment.trim() !== (existente.comentario || '').trim();
  const problema = !per ? 'Escolha o período.' : valor.trim() && n === null ? 'Número inválido — use só algarismos e vírgula (ex.: 92,5).'
    : n === null ? '' : existente && !mudouValor && !mudouComent ? '' : mudouValor && motivo.trim().length < 3 ? 'Diga o motivo da correção.' : '';
  const pode = !!per && n !== null && !problema && (!existente || mudouValor || mudouComent) && !gravando;

  const salvar = async () => {
    if (!pode || n === null) return;
    setGravando(true);
    try {
      if (existente) {
        const novo = await service.corrigir(existente.id, n, coment, mudouValor ? motivo : '', existente.atualizadoEm);
        guardar(novo);
        addToast(`${i.nome} · ${rotuloPeriodoLongo(i.frequencia, per)}: corrigido para ${fmtValor(n, i.unidade, i.casas)}.`, 'success');
      } else {
        const novo = await service.lancar(i.id, per, n, coment);
        guardar(novo);
        addToast(`${i.nome} · ${rotuloPeriodoLongo(i.frequencia, per)}: ${fmtValor(n, i.unidade, i.casas)} lançado.`, 'success');
      }
      await onGravou();
    } catch (e) {
      addToast(kpisErrorMessage(e, 'Não consegui salvar o valor.'), e instanceof KpisJaLancadoError ? 'warning' : 'error');
      // O período já tinha valor (de outra pessoa, ou um seu que a tela não chegou a mostrar): a linha
      // passa a mostrá-lo, com quem lançou, e o botão vira Corrigir — mesmo que a releitura falhe.
      if (e instanceof KpisJaLancadoError && e.existente) guardar(e.existente);
      await onGravou();                                        // relê: mostra o que está no banco
    } finally { setGravando(false); }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">{i.nome}{mostrarSetor && <SetorChip setor={i.setor} />}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {meta ? <>meta {fmtValor(meta.meta, i.unidade, i.casas)}</> : <span className="text-amber-600 dark:text-amber-400">sem meta</span>} · {SENTIDO_ROTULO[i.sentido]}{i.descricao ? <> · <span title={i.descricao} className="underline decoration-dotted cursor-help">como medir</span></> : null}
          </p>
        </div>
        <AtrasoSelo i={i} r={r} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 min-w-[190px] flex-1 sm:flex-none">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Período</span>
          <select value={per} onChange={e => setPer(e.target.value)} className={campo}>
            {periodos.map(p => {
              const tem = r.serie.find(x => x.periodo === p)?.lanc;
              const atrasado = r.pend.atrasados.includes(p);
              return <option key={p} value={p}>{rotuloPeriodoLongo(i.frequencia, p)}{tem ? ' · lançado' : atrasado ? ' · ATRASADO' : ''}</option>;
            })}
          </select>
        </label>
        <label className="flex flex-col gap-1 w-36">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Valor{i.unidade ? ` (${i.unidade})` : ''}</span>
          <input value={valor} onChange={e => setValor(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') salvar(); }} inputMode="decimal" placeholder={i.casas ? `ex.: ${numeroParaCampo(92.5, Math.min(i.casas, 2))}` : 'ex.: 12'} className={`${campo} tabular-nums`} aria-invalid={!!valor.trim() && n === null} />
        </label>
        {n !== null && <FarolChip f={f} className="mb-2" />}
        <button type="button" onClick={() => { if (abreComent) setComent(existente?.comentario || ''); setAbreComent(a => !a); }} className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
          <MessageSquarePlus size={13} /> {abreComent ? (existente ? 'esconder comentário' : 'sem comentário') : 'comentário'}
        </button>
        <button type="button" onClick={salvar} disabled={!pode}
          className={`ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 ${existente ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {gravando ? <Loader2 size={15} className="animate-spin" /> : existente ? <PencilLine size={15} /> : <Save size={15} />} {existente ? 'Corrigir' : 'Salvar'}
        </button>
      </div>

      {abreComent && <input value={coment} onChange={e => setComent(e.target.value)} maxLength={500} placeholder="Comentário (opcional): o que explica este número" className={`${campo} w-full`} />}
      {existente && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span>já lançado: <b className="text-slate-700 dark:text-slate-200">{fmtValor(existente.valor, i.unidade, i.casas)}</b> — {nomes.get(existente.alteradoPor || existente.lancadoPor || '') || 'alguém'}, {fmtCarimbo(existente.alteradoEm || existente.lancadoEm).slice(0, 5)}{existente.alteradoEm ? ' (corrigido)' : ''}</span>
          {mudouValor && <input value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo da correção (obrigatório)" className={`${campo} flex-1 min-w-[220px] py-1.5 text-xs`} />}
        </div>
      )}
      {problema && <p className="text-[11px] text-amber-600 dark:text-amber-400">{problema}</p>}
    </div>
  );
};

export const KpisLancar: React.FC<{ dados: KpisDados; inds: KpisIndicador[]; service: KpisService; nomes: Map<string, string>; mostrarSetor: boolean; onGravou: () => Promise<void> | void }> = ({ dados, inds, service, nomes, mostrarSetor, onGravou }) => {
  const itens = useMemo(() => inds.filter(i => i.ativo && i.tipo === 'manual' && i.podeLancar).map(i => ({ i, r: resumoDo(i, dados) })), [inds, dados]);
  const falta = itens.filter(x => x.r.pend.situacao !== 'em_dia')
    .sort((a, b) => (a.r.pend.situacao === 'atrasado' ? 0 : 1) - (b.r.pend.situacao === 'atrasado' ? 0 : 1) || a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
  const emDia = itens.filter(x => x.r.pend.situacao === 'em_dia').sort((a, b) => a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
  if (!itens.length) return <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-400">Não há indicador para você lançar aqui.</div>;
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400"><Clock size={14} /> Falta lançar ({falta.length})</h3>
        {falta.length ? falta.map(({ i, r }) => <Linha key={i.id} i={i} r={r} dados={dados} service={service} nomes={nomes} mostrarSetor={mostrarSetor} onGravou={onGravou} />)
          : <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={15} /> Tudo lançado — nada atrasado.</p>}
      </section>
      {emDia.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><CheckCircle2 size={14} /> Em dia ({emDia.length})</h3>
          {emDia.map(({ i, r }) => r.comecaEm
            ? <div key={i.id} className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap"><b className="text-slate-700 dark:text-slate-200">{i.nome}</b>{mostrarSetor && <SetorChip setor={i.setor} />}<span>· começa em {rotuloPeriodo(i.frequencia, r.comecaEm)} — ainda não há período para lançar</span></div>
            : <Linha key={i.id} i={i} r={r} dados={dados} service={service} nomes={nomes} mostrarSetor={mostrarSetor} onGravou={onGravou} />)}
        </section>
      )}
    </div>
  );
};
