import React, { useEffect, useMemo, useState } from 'react';
import { Save, Loader2, MessageSquarePlus, PencilLine, CheckCircle2, Clock, CalendarDays } from 'lucide-react';
import { useToast } from '../components/Toast';
import {
  KpisIndicador, KpisLancamento, FECHA_ROTULO, SENTIDO_ROTULO, diaUtil, diasEntre, farol, fmtCarimbo, fmtValor, hojeSP, inicioPeriodo, metaVigente, periodoDiario,
  numeroExatoParaCampo, numeroParaCampo, parseNumero, proximoDia, rotuloDia, rotuloPeriodo, rotuloPeriodoLongo,
} from './kpis';
import { KpisDados, KpisResumo, resumoDo } from './kpisDados';
import { KpisService, KpisJaLancadoError, kpisErrorMessage } from './kpisService';
import { AtrasoSelo, FarolChip, SetorChip } from './KpisCartao';

// LANÇAR — a tela de quem não é técnico: uma linha por indicador que a pessoa lança,
// primeiro os que faltam (os atrasados em cima), depois os em dia. Escolhe o período,
// digita o número (vírgula vale) e salva. Período que já tem valor vira "Corrigir", com
// o motivo (fica no histórico, com quem e quando).
// 035 (29/10/2026): o indicador lançado TODO DIA escolhe o DIA; o período (a meta) soma os dias.

const campo = 'px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]';

// O formulário de UM valor (de um período ou de um dia): o campo, o comentário, o Salvar/Corrigir e o motivo.
// `chave` é o período ou o dia escolhido; `existente`, o que já está gravado nele.
const useFormulario = (i: KpisIndicador, dados: KpisDados, service: KpisService, chave: string, daProp: KpisLancamento | null, rotuloDoValor: string,
  gravar: (n: number, coment: string) => Promise<KpisLancamento>, onGravou: () => Promise<void> | void) => {
  const { addToast } = useToast();
  // O que acabou de ser gravado, POR PERÍODO (ou dia), vale até pousar uma leitura feita DEPOIS da resposta do
  // banco (se a releitura falhar, o 2º clique viraria "alguém lançou enquanto a tela estava aberta").
  // O carimbo é a hora da resposta, não a da leitura que a tela mostrava no clique: uma leitura que
  // pousa durante a gravação não anula o que foi gravado; uma posterior manda (inclusive um valor
  // apagado por fora depois, que não pode "ressuscitar"). Leitura que começou antes da gravação e
  // pousaria depois é descartada pelo seq da carga (a releitura nasce logo depois de guardar).
  const [local, setLocal] = useState<Map<string, { l: KpisLancamento; em: number }>>(() => new Map());
  const meu = local.get(chave);
  const existente = meu && dados.lidoEm <= meu.em ? meu.l : daProp;
  const guardar = (k: string, l: KpisLancamento) => { const em = Date.now(); setLocal(m => new Map(m).set(k, { l, em })); };
  const [valor, setValor] = useState('');
  const [coment, setComent] = useState('');
  const [abreComent, setAbreComent] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [gravando, setGravando] = useState(false);
  // Trocou de período (ou dia): o campo mostra o que já está lá (para corrigir) ou fica vazio.
  useEffect(() => {
    setValor(existente ? numeroExatoParaCampo(existente.valor) : '');
    setComent(existente?.comentario || ''); setAbreComent(!!existente?.comentario); setMotivo('');
  }, [chave, existente?.id, existente?.atualizadoEm]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = parseNumero(valor);
  const mudouValor = !!existente && n !== null && n !== existente.valor;
  const mudouComent = !!existente && coment.trim() !== (existente.comentario || '').trim();
  const problema = !chave ? 'Escolha o período.' : valor.trim() && n === null ? 'Número inválido — use só algarismos e vírgula (ex.: 92,5).'
    : n === null ? '' : existente && !mudouValor && !mudouComent ? '' : mudouValor && motivo.trim().length < 3 ? 'Diga o motivo da correção.' : '';
  const pode = !!chave && n !== null && !problema && (!existente || mudouValor || mudouComent) && !gravando;

  const salvar = async () => {
    if (!pode || n === null) return;
    setGravando(true);
    try {
      if (existente) {
        const novo = await service.corrigir(existente.id, n, coment, mudouValor ? motivo : '', existente.atualizadoEm);
        guardar(chave, novo);
        addToast(`${i.nome} · ${rotuloDoValor}: corrigido para ${fmtValor(n, i.unidade, i.casas)}.`, 'success');
      } else {
        const novo = await gravar(n, coment);
        guardar(chave, novo);
        addToast(`${i.nome} · ${rotuloDoValor}: ${fmtValor(n, i.unidade, i.casas)} lançado.`, 'success');
      }
      await onGravou();
    } catch (e) {
      addToast(kpisErrorMessage(e, 'Não consegui salvar o valor.'), e instanceof KpisJaLancadoError ? 'warning' : 'error');
      // O período já tinha valor (de outra pessoa, ou um seu que a tela não chegou a mostrar): a linha
      // passa a mostrá-lo, com quem lançou, e o botão vira Corrigir — mesmo que a releitura falhe.
      if (e instanceof KpisJaLancadoError && e.existente) guardar(chave, e.existente);
      await onGravou();                                        // relê: mostra o que está no banco
    } finally { setGravando(false); }
  };
  return { existente, valor, setValor, coment, setComent, abreComent, setAbreComent, motivo, setMotivo, gravando, n, mudouValor, problema, pode, salvar };
};
type Formulario = ReturnType<typeof useFormulario>;

// O campo do valor, o farol, o comentário e o botão — e, embaixo, o "já lançado" com o motivo da correção.
const CamposDoValor: React.FC<{ i: KpisIndicador; f: Formulario; farolDoValor: ReturnType<typeof farol> | null }> = ({ i, f, farolDoValor }) => (
  <>
    <label className="flex flex-col gap-1 w-36">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Valor{i.unidade ? ` (${i.unidade})` : ''}</span>
      <input value={f.valor} onChange={e => f.setValor(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') f.salvar(); }} inputMode="decimal" placeholder={i.casas ? `ex.: ${numeroParaCampo(92.5, Math.min(i.casas, 2))}` : 'ex.: 12'} className={`${campo} tabular-nums`} aria-invalid={!!f.valor.trim() && f.n === null} />
    </label>
    {f.n !== null && farolDoValor && <FarolChip f={farolDoValor} className="mb-2" />}
    <button type="button" onClick={() => { if (f.abreComent) f.setComent(f.existente?.comentario || ''); f.setAbreComent(a => !a); }} className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
      <MessageSquarePlus size={13} /> {f.abreComent ? (f.existente ? 'esconder comentário' : 'sem comentário') : 'comentário'}
    </button>
    <button type="button" onClick={f.salvar} disabled={!f.pode}
      className={`ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-40 ${f.existente ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
      {f.gravando ? <Loader2 size={15} className="animate-spin" /> : f.existente ? <PencilLine size={15} /> : <Save size={15} />} {f.existente ? 'Corrigir' : 'Salvar'}
    </button>
  </>
);
const RodapeDoValor: React.FC<{ i: KpisIndicador; f: Formulario; nomes: Map<string, string> }> = ({ i, f, nomes }) => (
  <>
    {f.abreComent && <input value={f.coment} onChange={e => f.setComent(e.target.value)} maxLength={500} placeholder="Comentário (opcional): o que explica este número" className={`${campo} w-full`} />}
    {f.existente && (
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>já lançado: <b className="text-slate-700 dark:text-slate-200">{fmtValor(f.existente.valor, i.unidade, i.casas)}</b> — {nomes.get(f.existente.alteradoPor || f.existente.lancadoPor || '') || 'alguém'}, {fmtCarimbo(f.existente.alteradoEm || f.existente.lancadoEm).slice(0, 5)}{f.existente.alteradoEm ? ' (corrigido)' : ''}</span>
        {f.mudouValor && <input value={f.motivo} onChange={e => f.setMotivo(e.target.value)} maxLength={300} placeholder="Motivo da correção (obrigatório)" className={`${campo} flex-1 min-w-[220px] py-1.5 text-xs`} />}
      </div>
    )}
    {f.problema && <p className="text-[11px] text-amber-600 dark:text-amber-400">{f.problema}</p>}
  </>
);

const Cabecalho: React.FC<{ i: KpisIndicador; r: KpisResumo; meta: { meta: number } | null; mostrarSetor: boolean }> = ({ i, r, meta, mostrarSetor }) => (
  <div className="flex items-start gap-2 flex-wrap">
    <div className="min-w-0 flex-1">
      <p className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2 flex-wrap">{i.nome}{mostrarSetor && <SetorChip setor={i.setor} />}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        {meta ? <>meta {fmtValor(meta.meta, i.unidade, i.casas)}{i.diarioDesde ? ` ${FECHA_ROTULO[i.frequencia]}` : ''}</> : <span className="text-amber-600 dark:text-amber-400">sem meta</span>} · {SENTIDO_ROTULO[i.sentido]}{i.diarioDesde ? <> · <b className="text-slate-600 dark:text-slate-300">lança todo dia{i.diarioDesde > hojeSP() ? ` a partir de ${rotuloDia(i.diarioDesde)}` : ''}</b></> : null}{i.descricao ? <> · <span title={i.descricao} className="underline decoration-dotted cursor-help">como medir</span></> : null}
      </p>
    </div>
    <AtrasoSelo i={i} r={r} />
  </div>
);

// Um valor por PERÍODO (o de sempre). `antesDoDiario`: só os períodos de antes do lançamento diário (compacto).
const Linha: React.FC<{ i: KpisIndicador; r: KpisResumo; dados: KpisDados; service: KpisService; nomes: Map<string, string>; mostrarSetor: boolean; onGravou: () => Promise<void> | void; antesDoDiario?: string }> = ({ i, r, dados, service, nomes, mostrarSetor, onGravou, antesDoDiario }) => {
  // Os períodos que dá para lançar: do início (ou 36 meses atrás) até o atual — o mais novo em cima.
  const periodos = useMemo(() => r.serie.map(p => p.periodo).filter(p => !antesDoDiario || p < antesDoDiario).reverse(), [r.serie, antesDoDiario]);
  const falta = r.pend.atrasados[0] || r.pend.noPrazo[0] || '';
  const [per, setPer] = useState(falta || periodos[0] || '');
  useEffect(() => { if (!periodos.includes(per)) setPer(falta || periodos[0] || ''); }, [periodos.join(','), falta]); // eslint-disable-line react-hooks/exhaustive-deps
  // Acabou de lançar o que faltava: o seletor pula para o próximo que falta (escolher um
  // período já lançado, para corrigir, não mexe no "que falta" e não pula).
  useEffect(() => { if (falta && r.serie.find(p => p.periodo === per)?.lanc) setPer(falta); }, [falta]); // eslint-disable-line react-hooks/exhaustive-deps
  const ponto = r.serie.find(p => p.periodo === per);
  const f = useFormulario(i, dados, service, per, ponto?.lanc || null, rotuloPeriodoLongo(i.frequencia, per),
    (n, coment) => service.lancar(i.id, per, n, coment), onGravou);
  const meta = per ? metaVigente(dados.metas.get(i.id) || [], per) : null;

  return (
    <div className={antesDoDiario ? 'flex flex-col gap-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-3' : 'bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex flex-col gap-3'}>
      {antesDoDiario ? <p className="text-[11px] text-slate-500 dark:text-slate-400">Antes do lançamento diário ({rotuloPeriodo(i.frequencia, antesDoDiario)} em diante), o valor é o do período inteiro:</p>
        : <Cabecalho i={i} r={r} meta={meta} mostrarSetor={mostrarSetor} />}
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
        <CamposDoValor i={i} f={f} farolDoValor={farol(i.sentido, f.n, meta)} />
      </div>
      <RodapeDoValor i={i} f={f} nomes={nomes} />
    </div>
  );
};

// 035 — um valor por DIA. Em cima, o período em curso como na Reunião de Gestão: o que já entrou, a meta até aqui e a
// projeção para o fim; os dias úteis da semana (os que faltam em laranja) para escolher com um toque.
const LinhaDiaria: React.FC<{ i: KpisIndicador; r: KpisResumo; dados: KpisDados; service: KpisService; nomes: Map<string, string>; mostrarSetor: boolean; onGravou: () => Promise<void> | void }> = ({ i, r, dados, service, nomes, mostrarSetor, onGravou }) => {
  const hoje = hojeSP();
  const desde = (i.diarioDesde as string) > i.inicio ? (i.diarioDesde as string) : i.inicio;
  // Dá para lançar desde o começo do período em que o diário começou (o banco aceita): quem liga o "Todo dia" no meio do
  // mês lança o que já foi feito — dia a dia, ou o acumulado num dia só. Só se COBRA de `desde` em diante.
  const minDia = inicioPeriodo(i.frequencia, i.diarioDesde as string) > i.inicio ? inicioPeriodo(i.frequencia, i.diarioDesde as string) : i.inicio;
  const lancsDia = useMemo(() => new Map((dados.lancs.get(i.id) || []).filter(l => !!l.dia).map(l => [l.dia as string, l] as const)), [dados, i.id]);
  const falta = r.pend.diasAtrasados[0] || r.pend.diasNoPrazo[0] || '';
  const padrao = falta || (desde <= hoje ? hoje : '');
  const [dia, setDia] = useState(padrao);
  // Acabou de lançar o dia que faltava: pula para o próximo que falta (corrigir um dia já lançado não pula).
  useEffect(() => { if (falta && lancsDia.has(dia)) setDia(falta); }, [falta]); // eslint-disable-line react-hooks/exhaustive-deps
  const diaOk = !!dia && dia >= minDia && dia <= hoje;
  const f = useFormulario(i, dados, service, diaOk ? dia : '', diaOk ? lancsDia.get(dia) || null : null, rotuloDia(dia),
    (n, coment) => service.lancar(i.id, inicioPeriodo(i.frequencia, dia), n, coment, dia), onGravou);
  const metas = dados.metas.get(i.id) || [];
  const meta = metaVigente(metas, inicioPeriodo(i.frequencia, diaOk ? dia : hoje));
  const rt = r.ritmo;
  // Os dias úteis dos últimos 7 dias (e os de fim de semana lançados), para escolher com um toque.
  const atalhos = diasEntre(proximoDia(hoje, -9) > desde ? proximoDia(hoje, -9) : desde, hoje).filter(d => diaUtil(d) || lancsDia.has(d));
  const atrasado = new Set(r.pend.diasAtrasados);
  const cobrado = new Set([...r.pend.diasAtrasados, ...r.pend.diasNoPrazo]);
  const antes = r.pend.atrasados.length + r.pend.noPrazo.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-4 flex flex-col gap-3">
      <Cabecalho i={i} r={r} meta={meta} mostrarSetor={mostrarSetor} />
      {rt && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
          <span><b className="text-slate-800 dark:text-white">{rotuloPeriodo(i.frequencia, rt.periodo)}</b> até agora: <b className="text-sm tabular-nums text-slate-800 dark:text-white">{fmtValor(rt.realizado, i.unidade, i.casas)}</b>{rt.meta !== null && <> de {fmtValor(rt.meta, i.unidade, i.casas)}</>}</span>
          {i.consolidacao === 'soma' && rt.metaAteAgora !== null && <span>· meta até aqui {fmtValor(rt.metaAteAgora, i.unidade, Math.max(i.casas, 1))} ({rt.uteisPassados} de {rt.uteisNoPeriodo} dias úteis já contam{rt.ate ? `, até ${rotuloDia(rt.ate)}` : ''})</span>}
          {rt.projecao !== null && <span>· {i.consolidacao === 'soma' ? <>projeção para o fim: <b className="tabular-nums">{fmtValor(rt.projecao, i.unidade, Math.max(i.casas, 0))}</b></> : <>média até agora</>}</span>}
          {rt.meta !== null && rt.projecao !== null && <FarolChip f={rt.farol} />}
        </div>
      )}
      {atalhos.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dias">
          {atalhos.map(d => {
            const l = lancsDia.get(d);
            const sel = d === dia;
            const cls = sel ? 'bg-blue-600 text-white border-blue-600'
              : l ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50'
              : atrasado.has(d) ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900/50'
              : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';
            return (
              <button key={d} type="button" onClick={() => setDia(d)} aria-pressed={sel} title={l ? `lançado: ${fmtValor(l.valor, i.unidade, i.casas)}` : d === hoje ? 'hoje' : atrasado.has(d) ? 'falta — atrasado' : 'sem valor'}
                className={`px-2 py-1 rounded-lg border text-[11px] font-semibold tabular-nums ${cls}`}>
                {rotuloDia(d)}{d === hoje ? ' (hoje)' : ''} · {l ? fmtValor(l.valor, '', i.casas) : d === hoje ? 'a lançar' : cobrado.has(d) ? 'falta' : '—'}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 min-w-[170px] flex-1 sm:flex-none">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 inline-flex items-center gap-1"><CalendarDays size={11} /> Dia</span>
          <input type="date" value={dia} min={minDia} max={hoje} onChange={e => setDia(e.target.value)} className={campo} aria-invalid={!!dia && !diaOk} />
        </label>
        <CamposDoValor i={i} f={f} farolDoValor={null} />
      </div>
      {dia && !diaOk && <p className="text-[11px] text-amber-600 dark:text-amber-400">{dia > hoje ? 'Este dia ainda não chegou — lance até hoje.' : `O lançamento diário começa em ${rotuloDia(minDia)}.`}</p>}
      <RodapeDoValor i={i} f={f} nomes={nomes} />
      {r.pend.diasAtrasados.length > 1 && <p className="text-[11px] text-orange-600 dark:text-orange-400">Faltam {r.pend.diasAtrasados.length} dias úteis: {r.pend.diasAtrasados.slice(0, 8).map(rotuloDia).join(', ')}{r.pend.diasAtrasados.length > 8 ? '…' : ''}. Dia sem produção (feriado, parada): lance 0 com o comentário.</p>}
      {antes && <Linha i={i} r={r} dados={dados} service={service} nomes={nomes} mostrarSetor={false} onGravou={onGravou} antesDoDiario={inicioPeriodo(i.frequencia, i.diarioDesde as string)} />}
    </div>
  );
};

export const KpisLancar: React.FC<{ dados: KpisDados; inds: KpisIndicador[]; service: KpisService; nomes: Map<string, string>; mostrarSetor: boolean; onGravou: () => Promise<void> | void }> = ({ dados, inds, service, nomes, mostrarSetor, onGravou }) => {
  const itens = useMemo(() => inds.filter(i => i.ativo && i.tipo === 'manual' && i.podeLancar).map(i => ({ i, r: resumoDo(i, dados) })), [inds, dados]);
  const falta = itens.filter(x => x.r.pend.situacao !== 'em_dia')
    .sort((a, b) => (a.r.pend.situacao === 'atrasado' ? 0 : 1) - (b.r.pend.situacao === 'atrasado' ? 0 : 1) || a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
  const emDia = itens.filter(x => x.r.pend.situacao === 'em_dia').sort((a, b) => a.i.nome.localeCompare(b.i.nome, 'pt-BR'));
  if (!itens.length) return <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-400">Não há indicador para você lançar aqui.</div>;
  // O diário só a partir do período em que ele começa: marcado para o mês que vem, o mês em curso ainda se lança inteiro.
  const umaLinha = ({ i, r }: { i: KpisIndicador; r: KpisResumo }) => periodoDiario(i, inicioPeriodo(i.frequencia, hojeSP()))
    ? <LinhaDiaria key={i.id} i={i} r={r} dados={dados} service={service} nomes={nomes} mostrarSetor={mostrarSetor} onGravou={onGravou} />
    : <Linha key={i.id} i={i} r={r} dados={dados} service={service} nomes={nomes} mostrarSetor={mostrarSetor} onGravou={onGravou} />;
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400"><Clock size={14} /> Falta lançar ({falta.length})</h3>
        {falta.length ? falta.map(umaLinha)
          : <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={15} /> Tudo lançado — nada atrasado.</p>}
      </section>
      {emDia.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><CheckCircle2 size={14} /> Em dia ({emDia.length})</h3>
          {emDia.map(({ i, r }) => r.comecaEm
            ? <div key={i.id} className="bg-white dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap"><b className="text-slate-700 dark:text-slate-200">{i.nome}</b>{mostrarSetor && <SetorChip setor={i.setor} />}<span>· começa em {rotuloPeriodo(i.frequencia, r.comecaEm)} — ainda não há período para lançar</span></div>
            : umaLinha({ i, r }))}
        </section>
      )}
    </div>
  );
};
