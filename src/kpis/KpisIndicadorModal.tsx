import React, { useMemo, useState } from 'react';
import { X, Save, Loader2, AlertTriangle, Trash2, Calculator, PencilLine } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import {
  KpisFrequencia, KpisIndicador, KpisIndicadorInput, KpisMedida, KpisEscopo, KpisSentido, KpisSetor, KpisTipoAtividade,
  FREQ_ROTULO, PRAZO_PADRAO, UNIDADES, fmtValor, hojeSP, inicioPeriodo, metaVigente, numeroExatoParaCampo, numeroParaCampo, parseNumero,
  periodosEntre, proximoPeriodo, rotuloPeriodoLongo, setorChave, validarIndicador, rotuloPeriodo,
} from './kpis';
import { KpisDados } from './kpisDados';
import { KpisService, kpisErrorMessage } from './kpisService';

// CADASTRAR / EDITAR um indicador — só o Edson e os admins de OKR (o banco confere).
// A meta é por VIGÊNCIA: "esta meta vale a partir de [período]" — mudar a meta não reescreve
// o farol dos períodos passados. A frequência (e o tipo) travam depois do 1º lançamento.

const campo = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark] disabled:opacity-60';
const rotulo = 'text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400';
const OUTRO = '__outro__';

export const KpisIndicadorModal: React.FC<{
  indicador?: KpisIndicador;          // ausente = novo
  dados: KpisDados;
  service: KpisService;
  setores: KpisSetor[] | null;        // null = não deu para ler a lista (digita)
  tipos: KpisTipoAtividade[] | null | undefined; // undefined = lendo
  onFechar: () => void;
  onGravou: () => void;
  ceoSoVe?: boolean;                  // CEO (visão macro, 01/10): o setor das pessoas ele pede ao Edson
}> = ({ indicador: ind, dados, service, setores, tipos, onFechar, onGravou, ceoSoVe }) => {
  const { addToast } = useToast();
  const hoje = hojeSP();
  const temLanc = !!ind && (dados.lancs.get(ind.id)?.length || 0) > 0;
  const metas = ind ? dados.metas.get(ind.id) || [] : [];

  const setorLista = setores || [];
  const setorInicial = ind ? (setorLista.some(s => s.chave === setorChave(ind.setor)) ? setorChave(ind.setor) : OUTRO) : (setorLista[0]?.chave || OUTRO);
  const [setorSel, setSetorSel] = useState(setorInicial);
  const [setorTxt, setSetorTxt] = useState(ind && setorInicial === OUTRO ? ind.setor : '');
  const [nome, setNome] = useState(ind?.nome || '');
  const [descricao, setDescricao] = useState(ind?.descricao || '');
  const [unidadeSel, setUnidadeSel] = useState(ind ? (UNIDADES.includes(ind.unidade) ? ind.unidade : ind.unidade ? OUTRO : '') : '%');
  const [unidadeTxt, setUnidadeTxt] = useState(ind && !UNIDADES.includes(ind.unidade) ? ind.unidade : '');
  const [casas, setCasas] = useState(ind ? ind.casas : 1);
  const [sentido, setSentido] = useState<KpisSentido>(ind?.sentido || 'maior');
  const [frequencia, setFrequencia] = useState<KpisFrequencia>(ind?.frequencia || 'mensal');
  const [soma, setSoma] = useState(ind?.consolidacao === 'soma');
  const [prazo, setPrazo] = useState(ind?.prazoDias === null || ind?.prazoDias === undefined ? '' : String(ind.prazoDias));
  const [inicio, setInicio] = useState(ind?.inicio || inicioPeriodo('mensal', hoje));
  const [tipo, setTipo] = useState<'manual' | 'calculado'>(ind?.tipo || 'manual');
  const [calcTipos, setCalcTipos] = useState<string[]>(ind?.calcTipos || []);
  const [calcMedida, setCalcMedida] = useState<KpisMedida>(ind?.calcMedida || 'horas');
  const [calcEscopo, setCalcEscopo] = useState<KpisEscopo>(ind?.calcEscopo || 'setor');

  // Meta: na criação vale desde o início; na edição, desde o período atual (pode escolher).
  const perAtual = inicioPeriodo(frequencia, hoje);
  const inicioAlinhado = inicioPeriodo(frequencia, inicio || hoje);
  const opcoesVigencia = useMemo(() => {
    const ps = periodosEntre(frequencia, inicioAlinhado, proximoPeriodo(frequencia, perAtual));
    return ps.reverse();
  }, [frequencia, inicioAlinhado, perAtual]);
  const vigPadrao = ind ? (perAtual < inicioAlinhado ? inicioAlinhado : perAtual) : inicioAlinhado;
  const [valeDesde, setValeDesde] = useState(vigPadrao);
  // Trocou a frequência ou o início: a escolha antiga pode não ser mais um período da lista — vale
  // o padrão de agora. O que o seletor mostra é o que se grava.
  const valeDesdeEf = opcoesVigencia.includes(valeDesde) ? valeDesde : vigPadrao;
  const metaAtual = ind ? metaVigente(metas, valeDesdeEf) : null;
  // #13: só grava meta se a pessoa mexeu nos campos da meta (o número arredondado na tela, regravado
  // a cada "Salvar" do nome, criava uma vigência nova).
  const [metaTocada, setMetaTocada] = useState(false);
  // O número EXATO gravado (não o arredondado às casas): mexer só no "amarelo até" não pode regravar a
  // meta arredondada numa vigência nova.
  const [metaTxt, setMetaTxt] = useState(metaAtual ? numeroExatoParaCampo(metaAtual.meta) : '');
  const [limTxt, setLimTxt] = useState(metaAtual && metaAtual.limiteAlerta !== null ? numeroExatoParaCampo(metaAtual.limiteAlerta) : '');
  const [gravando, setGravando] = useState(false);

  const setor = setorSel === OUTRO ? setorTxt.trim() : (setorLista.find(s => s.chave === setorSel)?.nome || '');
  const setorSemNinguem = !!setor && !setorLista.some(s => s.chave === setorChave(setor));
  const unidade = unidadeSel === OUTRO ? unidadeTxt.trim() : unidadeSel;
  const input: KpisIndicadorInput = {
    setor, nome, descricao, unidade, casas, sentido, frequencia, consolidacao: soma ? 'soma' : 'ultimo',
    prazoDias: prazo.trim() === '' ? null : Math.round(Number(prazo)), inicio: inicioAlinhado, tipo,
    calcTipos: tipo === 'calculado' ? calcTipos : [], calcMedida: tipo === 'calculado' ? calcMedida : null, calcEscopo: tipo === 'calculado' ? calcEscopo : null,
  };
  const nMeta = parseNumero(metaTxt), nLim = limTxt.trim() ? parseNumero(limTxt) : null;
  const erroMeta = metaTxt.trim() && nMeta === null ? 'A meta não é um número.'
    : limTxt.trim() && nLim === null ? '"Fica amarelo até" não é um número.'
    : nMeta !== null && nLim !== null && (sentido === 'maior' ? nLim > nMeta : nLim < nMeta) ? `"Fica amarelo até" tem de ficar ${sentido === 'maior' ? 'abaixo' : 'acima'} da meta.`
    : !metaTxt.trim() && limTxt.trim() ? 'Diga a meta antes do "fica amarelo até".' : '';
  const erro = validarIndicador(input) || (Number.isNaN(input.prazoDias as number) ? 'O prazo para lançar é um número de dias.' : '') || erroMeta;
  // Grava meta só se o número mudou em relação ao que valia no período escolhido (editar o
  // nome não pode criar uma vigência repetida a cada vez).
  const metaMudou = metaTocada && nMeta !== null && (!metaAtual || metaAtual.meta !== nMeta || (metaAtual.limiteAlerta ?? null) !== nLim);

  const salvar = async () => {
    if (erro || gravando) return;
    setGravando(true);
    try {
      const salvo = ind ? await service.editarIndicador(ind.id, input, ind.atualizadoEm) : await service.criarIndicador(input);
      if (metaMudou && nMeta !== null) {
        try { await service.salvarMeta(salvo.id, inicioPeriodo(salvo.frequencia, ind ? valeDesdeEf : salvo.inicio), nMeta, nLim); }
        catch (e) { addToast(`${ind ? 'Indicador salvo' : 'Indicador criado'}, mas a meta NÃO foi gravada: ${kpisErrorMessage(e, 'erro')}. Abra de novo e defina a meta.`, 'warning'); onGravou(); onFechar(); return; }
      }
      addToast(ind ? `"${salvo.nome}" salvo.` : `"${salvo.nome}" criado${nMeta === null ? ' — sem meta ainda (farol cinza até definir)' : ''}.`, 'success');
      onGravou(); onFechar();
    } catch (e) {
      addToast(kpisErrorMessage(e, 'Não consegui salvar o indicador.'), 'error');
    } finally { setGravando(false); }
  };
  const apagarMeta = async (valeDesdeX: string) => {
    if (!ind || !window.confirm(`Tirar a meta que vale desde ${rotuloPeriodo(ind.frequencia, valeDesdeX)}? Os períodos dela passam a usar a meta anterior (ou ficam sem meta).`)) return;
    try { await service.apagarMeta(ind.id, valeDesdeX); addToast('Meta retirada.', 'success'); onGravou(); }
    catch (e) { addToast(kpisErrorMessage(e, 'Não consegui tirar a meta.'), 'error'); onGravou(); }   // relê: a lista mostra o que está no banco
  };
  const alternaTipo = (id: string) => setCalcTipos(ts => ts.includes(id) ? ts.filter(x => x !== id) : [...ts, id]);

  return (
    <Dialog onClose={() => { if (!gravando) onFechar(); }} label={ind ? `Editar ${ind.nome}` : 'Novo indicador'} panelClassName="w-full max-w-3xl outline-none">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400">KPI · <span className="text-orange-500">Cadastro</span></p>
            <h3 className="text-base font-black text-slate-800 dark:text-white">{ind ? 'Editar indicador' : 'Novo indicador'}</h3>
          </div>
          <button onClick={onFechar} disabled={gravando} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Setor</span>
            <select value={setorSel} onChange={e => setSetorSel(e.target.value)} className={campo}>
              {setorLista.map(s => <option key={s.chave} value={s.chave}>{s.nome} · {s.pessoas} pessoa(s){s.grafias.length > 1 ? ` · também escrito ${s.grafias.slice(1).map(g => `"${g}"`).join(', ')}` : ''}</option>)}
              <option value={OUTRO}>outro (digitar)</option>
            </select>
            {setorSel === OUTRO && <input value={setorTxt} onChange={e => setSetorTxt(e.target.value)} maxLength={60} placeholder="nome do setor" className={campo} />}
            {setorSemNinguem && <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Ninguém do cadastro está neste setor — ninguém vai conseguir lançar (só o Edson e os admins de OKR). {ceoSoVe ? 'Peça ao Edson para dar o setor às pessoas.' : 'Dê o setor às pessoas em "Pessoas e setores", no Cadastro.'}</span>}
            {!setores && <span className="text-[11px] text-slate-400">Não consegui ler a lista de setores — digite.</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Nome do indicador</span>
            <input value={nome} onChange={e => setNome(e.target.value)} maxLength={120} placeholder="ex.: Prazo médio de compra" className={campo} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={rotulo}>Como medir</span>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={1000} rows={2} placeholder="de onde vem o número e como se calcula" className={`${campo} resize-none`} />
          </label>

          <div className="flex flex-col gap-1">
            <span className={rotulo}>Unidade e casas decimais</span>
            <div className="flex gap-2">
              <select value={unidadeSel} onChange={e => setUnidadeSel(e.target.value)} aria-label="Unidade" className={campo}>
                {UNIDADES.map(u => <option key={u} value={u}>{u === 'h' ? 'horas (h)' : u === 'un' ? 'unidades (un)' : u}</option>)}
                <option value="">sem unidade</option>
                <option value={OUTRO}>outra…</option>
              </select>
              {unidadeSel === OUTRO && <input value={unidadeTxt} onChange={e => setUnidadeTxt(e.target.value)} maxLength={12} placeholder="ex.: kg" className={`${campo} w-28`} />}
              <select value={casas} onChange={e => setCasas(Number(e.target.value))} className={`${campo} w-24`} title="Casas decimais">
                {[0, 1, 2, 3, 4].map(c => <option key={c} value={c}>{c} casa{c === 1 ? '' : 's'}</option>)}
              </select>
            </div>
            <span className="text-[11px] text-slate-400">aparece assim: {fmtValor(1234.5678, unidade, casas)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className={rotulo}>Sentido</span>
            <div className="flex gap-2">
              {(['maior', 'menor'] as KpisSentido[]).map(s => (
                <button key={s} type="button" onClick={() => setSentido(s)} className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold border ${sentido === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                  {s === 'maior' ? 'Quanto maior, melhor' : 'Quanto menor, melhor'}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className={rotulo}>Frequência</span>
            <select value={frequencia} onChange={e => setFrequencia(e.target.value as KpisFrequencia)} disabled={temLanc} className={campo}>
              {(Object.keys(FREQ_ROTULO) as KpisFrequencia[]).map(f => <option key={f} value={f}>{FREQ_ROTULO[f]}</option>)}
            </select>
            {temLanc && <span className="text-[11px] text-slate-400">Travada: já há lançamentos (mudar a frequência baralharia os períodos). Para mudar, crie outro e arquive este.</span>}
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>A partir de</span>
            <input type="date" min="2000-01-01" max="2100-12-31" value={inicio} onChange={e => setInicio(e.target.value)} className={campo} />
            <span className="text-[11px] text-slate-400">começa em {rotuloPeriodoLongo(frequencia, inicioAlinhado)}</span>
          </label>

          <label className="flex items-start gap-2 sm:col-span-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={soma} onChange={e => setSoma(e.target.checked)} className="mt-1 w-4 h-4 accent-blue-600" />
            <span>Os valores se <b>somam</b> ao longo do tempo? <span className="text-slate-400">(faturamento, economia, horas — o KR ligado mostra a soma dos períodos, e não o último)</span></span>
          </label>

          <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <button type="button" disabled={temLanc && tipo === 'manual'} onClick={() => setTipo('manual')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${tipo === 'manual' ? 'bg-blue-600 text-white border-blue-600' : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}><PencilLine size={12} className="inline -mt-0.5 mr-1" />Lançado pelo setor</button>
              <button type="button" disabled={temLanc} onClick={() => setTipo('calculado')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border disabled:opacity-50 ${tipo === 'calculado' ? 'bg-blue-600 text-white border-blue-600' : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}><Calculator size={12} className="inline -mt-0.5 mr-1" />Calculado pelas atividades</button>
              {temLanc && <span className="text-[11px] text-slate-400 self-center">tipo travado: já há lançamentos</span>}
            </div>
            {tipo === 'calculado' && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">O número sai sozinho das atividades lançadas no Desempenho Operacional (só as concluídas, contadas no dia em que começaram). Ninguém lança à mão.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className={rotulo}>Conta</span>
                    <select value={calcMedida} onChange={e => setCalcMedida(e.target.value as KpisMedida)} className={campo}>
                      <option value="horas">as horas das atividades</option>
                      <option value="quantidade">quantas atividades</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={rotulo}>De quem</span>
                    <select value={calcEscopo} onChange={e => setCalcEscopo(e.target.value as KpisEscopo)} className={campo}>
                      <option value="setor">das pessoas do setor do indicador</option>
                      <option value="todos">de todo mundo</option>
                    </select>
                  </label>
                </div>
                <div>
                  <span className={rotulo}>Tipos de atividade</span>
                  {tipos === undefined ? <p className="text-[11px] text-slate-400 mt-1">Lendo os tipos de atividade…</p> : !tipos ? <p className="text-[11px] text-rose-500 mt-1">Não consegui ler os tipos de atividade.</p> : (
                    <div className="mt-1 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                      {tipos.filter(t => t.ativo || calcTipos.includes(t.id)).map(t => (
                        <label key={t.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                          <input type="checkbox" checked={calcTipos.includes(t.id)} onChange={() => alternaTipo(t.id)} className="w-3.5 h-3.5 accent-blue-600" />{t.nome}{!t.ativo && <span className="text-slate-400">(inativo)</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className={rotulo}>Meta{unidade ? ` (${unidade})` : ''}</span>
                <input value={metaTxt} onChange={e => { setMetaTxt(e.target.value); setMetaTocada(true); }} inputMode="decimal" placeholder="ex.: 95" className={campo} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotulo}>Fica amarelo até (opcional)</span>
                <input value={limTxt} onChange={e => { setLimTxt(e.target.value); setMetaTocada(true); }} inputMode="decimal" placeholder={nMeta !== null ? `padrão: ${numeroParaCampo(sentido === 'maior' ? nMeta - Math.abs(nMeta) * 0.1 : nMeta + Math.abs(nMeta) * 0.1, casas)}` : 'padrão: 10% da meta'} className={campo} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={rotulo}>Esta meta vale a partir de</span>
                {ind ? (
                  <select value={valeDesdeEf} onChange={e => { setValeDesde(e.target.value); setMetaTocada(true); }} className={campo}>
                    {opcoesVigencia.map(p => <option key={p} value={p}>{rotuloPeriodoLongo(frequencia, p)}</option>)}
                  </select>
                ) : <span className="px-3 py-2 text-sm text-slate-600 dark:text-slate-300">{rotuloPeriodoLongo(frequencia, inicioAlinhado)} (o início)</span>}
              </label>
            </div>
            <p className="text-[11px] text-slate-400">Sem meta, o indicador fica com o farol cinza ("sem meta — defina"). Mudar a meta não muda o farol dos períodos antes da vigência nova.</p>
            {ind && metas.length > 0 && (
              <ul className="space-y-1">
                {[...metas].reverse().map(m => (
                  <li key={m.valeDesde} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
                    <span>desde {rotuloPeriodo(ind.frequencia, m.valeDesde)}: meta <b>{fmtValor(m.meta, ind.unidade, ind.casas)}</b>{m.limiteAlerta !== null ? <>, amarelo até {fmtValor(m.limiteAlerta, ind.unidade, ind.casas)}</> : null}</span>
                    <button type="button" onClick={() => apagarMeta(m.valeDesde)} className="text-slate-300 hover:text-rose-500" title="Tirar esta vigência"><Trash2 size={12} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {tipo === 'manual' && (
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Prazo para lançar (dias depois do fim do período)</span>
              <input value={prazo} onChange={e => setPrazo(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder={`padrão: ${PRAZO_PADRAO[frequencia]}`} className={campo} />
            </label>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-3 gap-y-2 justify-end">
          {erro && <span className="text-[11px] text-amber-600 dark:text-amber-400 w-full sm:w-auto sm:mr-auto">{erro}</span>}
          <button onClick={onFechar} disabled={gravando} className="px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancelar</button>
          <button onClick={salvar} disabled={!!erro || gravando} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg">
            {gravando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {ind ? 'Salvar' : 'Criar indicador'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
