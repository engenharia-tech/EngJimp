import React, { useState } from 'react';
import { Check, X, Pencil, Trash2, AlertTriangle, Gauge } from 'lucide-react';
import { OkrDesvio, OkrKeyResult } from './okr';
import { KpisCausa, fmtDia } from '../kpis/kpis';
import { CausaChip, SemCausaChip } from '../kpis/KpisCausa';
import { CAUSA_AJUDA, CAUSA_ROTULO, CAUSA_TIPOS, CausaTipo } from '../utils/causaDesvio';

// CAUSA DO DESVIO no KR (03/11/2026). Edson: "quando os objetivos não são atingidos por causa de processos, por causa de
// pessoas ou por um item … pontual". O KR em risco (ou com o prazo vencido sem a meta) diz por quê — as mesmas três causas
// do KPI. KR ligado ao KPI: a causa que o setor registrou no indicador aparece junto (só leitura aqui; muda-se no KPI).

const campo = 'w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500';

export const KrDesvio: React.FC<{
  k: OkrKeyResult; pede: boolean; readOnly: boolean; nomeQuem: string;
  kpiCausas?: KpisCausa[];              // as causas do indicador ligado, dentro do período do KR (a mais nova primeiro)
  rotuloPeriodoKpi?: (periodo: string) => string;
  onSalvar: (d: OkrDesvio | undefined) => Promise<unknown> | void;
}> = ({ k, pede, readOnly, nomeQuem, kpiCausas, rotuloPeriodoKpi, onSalvar }) => {
  const d = k.desvio;
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState<CausaTipo | null>(d?.causa ?? null);
  const [texto, setTexto] = useState(d?.texto ?? '');
  const [acao, setAcao] = useState(d?.acao ?? '');
  const [prazo, setPrazo] = useState(d?.prazo ?? '');
  const [feita, setFeita] = useState(!!d?.feita);
  const [erro, setErro] = useState('');
  const kc = (kpiCausas || [])[0];

  if (!d && !pede && !kc) return null;

  const abrir = () => { setTipo(d?.causa ?? null); setTexto(d?.texto ?? ''); setAcao(d?.acao ?? ''); setPrazo(d?.prazo ?? ''); setFeita(!!d?.feita); setErro(''); setEditando(true); };
  const salvar = async () => {
    if (!tipo) { setErro('Escolha a causa: processo, pessoas ou pontual.'); return; }
    if (texto.trim().length < 3) { setErro('Diga o que aconteceu (pelo menos 3 letras).'); return; }
    const a = acao.trim();
    await onSalvar({ causa: tipo, texto: texto.trim().slice(0, 500), ...(a ? { acao: a.slice(0, 500) } : {}), ...(a && prazo ? { prazo } : {}), ...(a && feita ? { feita: true } : {}),
      em: new Date().toISOString(), por: nomeQuem });
    setEditando(false);
  };
  const apagar = async () => { if (window.confirm(`Apagar a causa do ${k.id}?`)) { await onSalvar(undefined); setEditando(false); } };

  return (
    <div className="mt-3 rounded-lg border border-rose-100 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-900/10 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide inline-flex items-center gap-1"><AlertTriangle size={11} /> Causa do desvio</span>
        {d && !editando && <CausaChip tipo={d.causa} acaoAberta={!!d.acao && !d.feita} />}
        {!d && !editando && pede && <SemCausaChip />}
        {!readOnly && !editando && (
          <button type="button" onClick={abrir} className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline no-print">
            {d ? <><Pencil size={11} /> Editar</> : '+ Registrar causa'}
          </button>
        )}
      </div>

      {d && !editando && (
        <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
          <p>{d.texto}</p>
          {d.acao && <p><b>Ação:</b> {d.acao}{d.prazo ? ` · até ${fmtDia(d.prazo)}` : ''} · <span className={d.feita ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{d.feita ? 'feita' : 'em aberto'}</span></p>}
          {(d.por || d.em) && <p className="text-slate-400">{d.por || ''}{d.em ? `, ${fmtDia(d.em.slice(0, 10))}` : ''}</p>}
        </div>
      )}

      {editando && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Causa">
            {CAUSA_TIPOS.map(t => (
              <button key={t} type="button" role="radio" aria-checked={tipo === t} aria-label={`${CAUSA_ROTULO[t]}: ${CAUSA_AJUDA[t]}`} onClick={() => setTipo(t)}
                className={`text-left rounded-xl border px-3 py-2 bg-white dark:bg-slate-900 transition-colors ${tipo === t ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}>
                <CausaChip tipo={t} />
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">{CAUSA_AJUDA[t]}</span>
              </button>
            ))}
          </div>
          <textarea value={texto} onChange={e => setTexto(e.target.value)} maxLength={500} rows={2} className={`${campo} resize-y`} placeholder="O que aconteceu" aria-label="O que aconteceu" />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_auto] gap-2 items-center">
            <input value={acao} onChange={e => setAcao(e.target.value)} maxLength={500} className={campo} placeholder="Ação corretiva (opcional)" aria-label="Ação corretiva" />
            <input type="date" value={prazo} onChange={e => setPrazo(e.target.value)} disabled={!acao.trim()} className={`${campo} disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]`} aria-label="Prazo da ação" />
            <label className={`inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 ${!acao.trim() ? 'opacity-50' : ''}`}><input type="checkbox" checked={feita} onChange={e => setFeita(e.target.checked)} disabled={!acao.trim()} /> feita</label>
          </div>
          {erro && <p className="text-[11px] font-semibold text-rose-600">{erro}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={salvar} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"><Check size={13} /> Salvar causa</button>
            <button type="button" onClick={() => setEditando(false)} className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={13} /> Cancelar</button>
            {d && <button type="button" onClick={apagar} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-rose-500"><Trash2 size={12} /> Apagar causa</button>}
          </div>
        </div>
      )}

      {kc && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 flex-wrap" title="A causa que o setor registrou no indicador ligado (muda-se na aba KPI)">
          <Gauge size={12} className="mt-0.5 shrink-0" />
          <span>No KPI{rotuloPeriodoKpi ? ` (${rotuloPeriodoKpi(kc.periodo)})` : ''}:</span>
          <CausaChip tipo={kc.causa} acaoAberta={!!kc.acao && !kc.acaoFeita} />
          <span className="text-slate-600 dark:text-slate-300">{kc.descricao}</span>
          {(kpiCausas || []).length > 1 && <span className="text-slate-400">(+{(kpiCausas || []).length - 1} período(s) com causa)</span>}
        </p>
      )}
    </div>
  );
};
