import React, { useState } from 'react';
import { Loader2, Trash2, X, Check, AlertTriangle } from 'lucide-react';
import { useToast } from '../components/Toast';
import { KpisCausa, KpisIndicador, fmtCarimbo, fmtDia, rotuloPeriodoLongo } from './kpis';
import { KpisService, kpisErrorMessage } from './kpisService';
import { CAUSA_AJUDA, CAUSA_CLASSE, CAUSA_ROTULO, CAUSA_TIPOS, CausaContagem, CausaTipo } from '../utils/causaDesvio';

// CAUSA DO DESVIO no KPI (03/11/2026, migração 036): o período que não bateu a meta ganha a causa — Processo, Pessoas ou
// Pontual —, o que aconteceu e a ação corretiva. Peças usadas no detalhe, no cartão e no painel.

const campo = 'w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500';
const hojeIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export const CausaChip: React.FC<{ tipo: CausaTipo; acaoAberta?: boolean; className?: string }> = ({ tipo, acaoAberta, className }) => (
  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${CAUSA_CLASSE[tipo]} ${className || ''}`}
    title={`Causa: ${CAUSA_ROTULO[tipo]} — ${CAUSA_AJUDA[tipo]}${acaoAberta ? ' · ação corretiva em aberto' : ''}`}>
    {CAUSA_ROTULO[tipo]}{acaoAberta && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="ação em aberto" />}
  </span>
);

// O período ficou fora da meta e ninguém disse por quê.
export const SemCausaChip: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-dashed border-rose-300 text-rose-600 dark:border-rose-700 dark:text-rose-400 ${className || ''}`}
    title="Fora da meta e sem causa registrada: abra o indicador e diga se foi processo, pessoas ou pontual">
    <AlertTriangle size={10} /> sem causa
  </span>
);

// "Processo 3 · Pessoas 1 · Pontual 2" — a régua dos painéis do KPI e do OKR.
export const CausasResumo: React.FC<{ c: CausaContagem; semCausa?: number; acoesAbertas?: number; titulo?: string }> = ({ c, semCausa, acoesAbertas, titulo }) => {
  const total = c.processo + c.pessoas + c.pontual;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} className="text-slate-400" />
        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{titulo || 'Por que não bateu'}</h4>
        {!!acoesAbertas && <span className="ml-auto text-[11px] font-semibold text-amber-600 dark:text-amber-400">{acoesAbertas} ação(ões) em aberto</span>}
      </div>
      {total === 0 && !semCausa ? <p className="text-xs text-slate-400">Nenhuma causa registrada.</p> : (
        <>
          {total > 0 && (
            <div className="h-2.5 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800 mb-2" role="img" aria-label={`${c.processo} processo, ${c.pessoas} pessoas, ${c.pontual} pontual`}>
              {CAUSA_TIPOS.map(t => c[t] > 0 && <div key={t} className={`h-full ${t === 'processo' ? 'bg-violet-500' : t === 'pessoas' ? 'bg-sky-500' : 'bg-slate-400'}`} style={{ width: `${(c[t] / total) * 100}%` }} />)}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {CAUSA_TIPOS.map(t => <span key={t} className="text-slate-600 dark:text-slate-300"><CausaChip tipo={t} /> <b className="tabular-nums">{c[t]}</b></span>)}
            {!!semCausa && <span className="text-rose-600 dark:text-rose-400 font-semibold">{semCausa} fora da meta sem causa</span>}
          </div>
        </>
      )}
    </div>
  );
};

// O formulário (no detalhe, embaixo do período). Sem permissão: só lê.
export const KpisCausaEditor: React.FC<{
  i: KpisIndicador; periodo: string; causa?: KpisCausa; pode: boolean; service: KpisService; nomes: Map<string, string>;
  onGravou: () => void; onFechar: () => void;
}> = ({ i, periodo, causa, pode, service, nomes, onGravou, onFechar }) => {
  const { addToast } = useToast();
  const [tipo, setTipo] = useState<CausaTipo | null>(causa?.causa ?? null);
  const [descricao, setDescricao] = useState(causa?.descricao ?? '');
  const [acao, setAcao] = useState(causa?.acao ?? '');
  const [prazo, setPrazo] = useState(causa?.acaoPrazo ?? '');
  const [feita, setFeita] = useState(causa?.acaoFeita ?? false);
  const [gravando, setGravando] = useState(false);
  const rotulo = rotuloPeriodoLongo(i.frequencia, periodo);

  if (!pode) {
    if (!causa) return <p className="text-[11px] text-slate-500 dark:text-slate-400">Sem causa registrada para {rotulo}. Quem registra são as pessoas do setor do indicador.</p>;
    return (
      <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
        <p><CausaChip tipo={causa.causa} /> <span className="ml-1">{causa.descricao}</span></p>
        {causa.acao && <p><b>Ação:</b> {causa.acao}{causa.acaoPrazo ? ` · até ${fmtDia(causa.acaoPrazo)}` : ''} · {causa.acaoFeita ? 'feita' : 'em aberto'}</p>}
        <p className="text-slate-400">{nomes.get(causa.atualizadoPor || causa.criadoPor || '') || '—'}, {fmtCarimbo(causa.atualizadoEm, true)}</p>
      </div>
    );
  }

  const salvar = async () => {
    if (!tipo) { addToast('Escolha a causa: processo, pessoas ou pontual.', 'warning'); return; }
    if (descricao.trim().length < 3) { addToast('Diga o que aconteceu (pelo menos 3 letras).', 'warning'); return; }
    if (prazo && !acao.trim()) { addToast('O prazo é da ação corretiva: escreva a ação ou tire o prazo.', 'warning'); return; }
    setGravando(true);
    try {
      await service.salvarCausa(i.id, periodo, { causa: tipo, descricao, acao, acaoPrazo: acao.trim() ? (prazo || null) : null, acaoFeita: acao.trim() ? feita : false },
        causa ? { id: causa.id, versao: causa.atualizadoEm } : null);
      addToast(`Causa de ${rotulo} registrada.`, 'success');
      onFechar(); onGravou();
    } catch (e) { addToast(kpisErrorMessage(e, 'Não consegui registrar a causa.'), 'error'); onGravou(); }
    finally { setGravando(false); }
  };
  const apagar = async () => {
    if (!causa || !window.confirm(`Apagar a causa de ${rotulo}?`)) return;
    setGravando(true);
    try { await service.apagarCausa(causa.id, causa.atualizadoEm); addToast('Causa apagada.', 'success'); onFechar(); onGravou(); }
    catch (e) { addToast(kpisErrorMessage(e, 'Não consegui apagar a causa.'), 'error'); onGravou(); }
    finally { setGravando(false); }
  };

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Por que {rotulo} não bateu a meta?</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Causa">
        {CAUSA_TIPOS.map(t => (
          <button key={t} type="button" role="radio" aria-checked={tipo === t} aria-label={`${CAUSA_ROTULO[t]}: ${CAUSA_AJUDA[t]}`} onClick={() => setTipo(t)}
            className={`text-left rounded-xl border px-3 py-2 transition-colors ${tipo === t ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/60 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
            <CausaChip tipo={t} />
            <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{CAUSA_AJUDA[t]}</span>
          </button>
        ))}
      </div>
      <label className="block">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">O que aconteceu</span>
        <textarea value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={500} rows={2} className={`${campo} mt-0.5 resize-y`} placeholder="ex.: a prensa ficou parada 4 dias esperando peça" />
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_auto] gap-2 items-end">
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Ação corretiva <span className="font-normal">(opcional)</span></span>
          <input value={acao} onChange={e => setAcao(e.target.value)} maxLength={500} className={`${campo} mt-0.5`} placeholder="o que vai ser feito para não repetir" />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Prazo</span>
          <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} disabled={!acao.trim()} className={`${campo} mt-0.5 disabled:opacity-50`} />
        </label>
        <label className={`inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 pb-1.5 ${!acao.trim() ? 'opacity-50' : ''}`}>
          <input type="checkbox" checked={feita} onChange={e => setFeita(e.target.checked)} disabled={!acao.trim()} /> feita
        </label>
      </div>
      {prazo && !feita && acao.trim() && prazo < hojeIso() && <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">O prazo da ação já passou.</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={salvar} disabled={gravando} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
          {gravando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar causa
        </button>
        <button type="button" onClick={onFechar} disabled={gravando} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={13} /> Cancelar</button>
        {causa && <button type="button" onClick={apagar} disabled={gravando} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-rose-500"><Trash2 size={12} /> Apagar causa</button>}
      </div>
      {causa && <p className="text-[10px] text-slate-400">Registrada por {nomes.get(causa.criadoPor || '') || '—'} · última mudança {nomes.get(causa.atualizadoPor || '') || '—'}, {fmtCarimbo(causa.atualizadoEm, true)}</p>}
    </div>
  );
};
