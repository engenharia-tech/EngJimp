import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, Loader2, Search, X, Link2, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { OkrKeyResult, parseIsoDay } from './okr';
import { kpisService as servicoPadrao, KpisService, kpisErrorMessage, KPIS_NAO_INSTALADO, kpisAusente } from '../kpis/kpisService';
import {
  KpisIndicador, KpisMeta, FREQ_ROTULO, SENTIDO_ROTULO, fmtValor, hojeSP, inicioPeriodo, metaVigente, numeroParaCampo,
  parseNumero, setorChave,
} from '../kpis/kpis';

// LIGAR UM KR AO KPI DOS SETORES (30/09/2026).
// O KR passa a mostrar, como "atual", o valor lançado no indicador — lido na hora, nunca
// gravado no OKR. Quem liga escolhe o indicador (só os que o DONO do OKR enxerga: o setor
// dele, ou todos se o dono for o Edson, um admin de OKR ou CEO) e a partida/meta do KR,
// na unidade do indicador. Para indicador que SOMA ao longo do tempo, o KR precisa de
// início e prazo (a soma é dos períodos entre os dois).

export interface KpisDonoOkr { nome: string; setor: string; veTodos: boolean; desligado?: boolean; }
export interface KpisLigacao {
  id: string; nome: string; baseline: number; target: number; start?: string; due?: string;
}

const campo = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]';

export const KpisLigarDialog: React.FC<{
  kr: OkrKeyResult;
  dono: KpisDonoOkr | null;          // null = não sei quem é o dono: vale o que o banco me mostra
  onConfirm: (l: KpisLigacao) => Promise<boolean>;
  onClose: () => void;
  service?: KpisService;             // injetável (tela de ensaio)
}> = ({ kr, dono, onConfirm, onClose, service: kpisService = servicoPadrao }) => {
  const [inds, setInds] = useState<KpisIndicador[] | null>(null);
  const [metas, setMetas] = useState<KpisMeta[]>([]);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<KpisIndicador | null>(null);
  const [partida, setPartida] = useState('');
  const [meta, setMeta] = useState('');
  const [ini, setIni] = useState(parseIsoDay(kr.start) ? String(kr.start) : '');
  const [fim, setFim] = useState(parseIsoDay(kr.due) ? String(kr.due) : '');
  const [sugestao, setSugestao] = useState<{ partida: string; meta: string }>({ partida: '', meta: '' });
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([kpisService.listIndicadores(), kpisService.listMetas()])
      .then(([is, ms]) => { if (vivo) { setInds(is.filter(i => i.ativo)); setMetas(ms); } })
      .catch(e => { if (vivo) { setInds([]); setErro(kpisAusente(e) ? KPIS_NAO_INSTALADO : kpisErrorMessage(e, 'Não consegui ler os indicadores.', true)); } });
    return () => { vivo = false; };
  }, []);

  // Só os que o DONO do OKR enxerga (o banco confere de novo: KR ligado a indicador que o
  // dono não vê não recebe valor).
  const visiveis = useMemo(() => (inds || []).filter(i => !dono || dono.veTodos || setorChave(i.setor) === setorChave(dono.setor)), [inds, dono]);
  const grupos = useMemo(() => {
    const q = setorChave(busca);
    const g = new Map<string, { setor: string; itens: KpisIndicador[] }>();
    visiveis.filter(i => !q || setorChave(`${i.nome} ${i.setor}`).includes(q)).forEach(i => {
      const k = setorChave(i.setor); const x = g.get(k) || { setor: i.setor, itens: [] }; x.itens.push(i); g.set(k, x);
    });
    return Array.from(g.values()).sort((a, b) => a.setor.localeCompare(b.setor, 'pt-BR'));
  }, [visiveis, busca]);

  // Escolheu: sugere a meta vigente do indicador e, como partida, o último valor antes do início do KR.
  useEffect(() => {
    if (!sel) return;
    let vivo = true;
    const hoje = hojeSP();
    const m = metaVigente(metas.filter(x => x.indicadorId === sel.id), inicioPeriodo(sel.frequencia, hoje));
    const sm = m ? numeroParaCampo(m.meta, sel.casas) : '';
    setSugestao({ partida: '', meta: sm });
    setMeta(sm); setPartida('');
    if (sel.tipo === 'manual') {
      kpisService.ultimoAntes(sel.id, parseIsoDay(ini) ? inicioPeriodo(sel.frequencia, ini) : inicioPeriodo(sel.frequencia, hoje))
        .then(l => { if (!vivo || !l) return; const sp = numeroParaCampo(l.valor, sel.casas); setSugestao(s => ({ ...s, partida: sp })); setPartida(v => v || sp); })
        .catch(() => { /* só sugestão */ });
    }
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const soma = sel?.consolidacao === 'soma';
  const nPartida = parseNumero(partida), nMeta = parseNumero(meta);
  const problema = !sel ? 'Escolha o indicador.'
    : nPartida === null ? 'Diga a partida do KR (o valor de onde ele sai).'
    : nMeta === null ? 'Diga a meta do KR.'
    : nMeta === nPartida ? 'A meta tem de ser diferente da partida.'
    : soma && (!parseIsoDay(ini) || !parseIsoDay(fim)) ? 'Este indicador SOMA ao longo do tempo: diga o início e o prazo do KR.'
    : (parseIsoDay(ini) && parseIsoDay(fim) && ini > fim) ? 'O início não pode ser depois do prazo.'
    : '';
  // Sentido do KR (partida → meta) contra o do indicador: só avisa (a meta do KR é da pessoa).
  const contraMao = !!sel && nPartida !== null && nMeta !== null && ((sel.sentido === 'maior') !== (nMeta > nPartida));

  const confirmar = async () => {
    if (!sel || problema || gravando) return;
    setGravando(true);
    try {
      const ok = await onConfirm({
        id: sel.id, nome: sel.nome, baseline: nPartida!, target: nMeta!,
        ...(parseIsoDay(ini) ? { start: ini } : {}), ...(parseIsoDay(fim) ? { due: fim } : {}),
      });
      if (ok) onClose();
    } finally { setGravando(false); }
  };

  return (
    <Dialog onClose={() => { if (!gravando) onClose(); }} label="Ligar resultado-chave ao KPI dos setores" panelClassName="w-full max-w-2xl outline-none">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-600 text-white"><Gauge size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400">OKR · <span className="text-orange-500">Ligar ao KPI</span></p>
            <h3 className="text-base font-black text-slate-800 dark:text-white leading-tight">{kr.id} — o "atual" passa a vir do KPI</h3>
            {dono && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">OKR de {dono.nome} · {dono.veTodos ? 'vê os indicadores de todos os setores' : `setor ${dono.setor || '— (sem setor: não vê indicador nenhum)'}`}</p>}
          </div>
          <button onClick={onClose} disabled={gravando} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {inds === null ? (
            <div className="py-8 text-center text-slate-400 text-sm"><Loader2 className="animate-spin inline mr-2" size={16} /> Lendo os indicadores…</div>
          ) : erro ? (
            <p className="text-sm text-rose-600 dark:text-rose-400">{erro}</p>
          ) : !visiveis.length ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Não há indicador que o dono deste OKR enxergue. Os indicadores são cadastrados pelo Edson e pelos admins de OKR, na aba KPI dos setores.</p>
          ) : (
            <>
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Indicador</label>
                <div className="relative mt-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="procurar pelo nome ou setor" className={`${campo} pl-8`} />
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {grupos.map(g => (
                    <div key={g.setor}>
                      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-50 dark:bg-slate-800/50">{g.setor}</p>
                      {g.itens.map(i => (
                        <button key={i.id} type="button" onClick={() => setSel(i)}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${sel?.id === i.id ? 'bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
                          {i.sentido === 'maior' ? <ArrowUp size={13} className="text-emerald-500 shrink-0" /> : <ArrowDown size={13} className="text-emerald-500 shrink-0" />}
                          <span className="font-semibold flex-1 min-w-0 truncate">{i.nome}</span>
                          <span className="text-[11px] text-slate-400 shrink-0">{i.unidade || 'número'} · {FREQ_ROTULO[i.frequencia].toLowerCase()}{i.tipo === 'calculado' ? ' · calculado' : ''}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {!grupos.length && <p className="px-3 py-4 text-sm text-slate-400">Nada com esse nome.</p>}
                </div>
              </div>

              {sel && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-slate-50/60 dark:bg-slate-800/30">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <b>{sel.nome}</b> · {SENTIDO_ROTULO[sel.sentido]} · {FREQ_ROTULO[sel.frequencia].toLowerCase()} ·{' '}
                    {soma ? 'o KR mostra a SOMA dos períodos entre o início e o prazo' : 'o KR mostra o último valor lançado até o prazo'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Partida do KR ({sel.unidade || 'número'})</label>
                      <input value={partida} onChange={e => setPartida(e.target.value)} inputMode="decimal" aria-label="Partida do KR" placeholder="ex.: 85" className={`${campo} mt-1`} />
                      {sugestao.partida && sugestao.partida !== partida && <button type="button" onClick={() => setPartida(sugestao.partida)} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1">usar o último valor antes do início: {sugestao.partida}</button>}
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Meta do KR ({sel.unidade || 'número'})</label>
                      <input value={meta} onChange={e => setMeta(e.target.value)} inputMode="decimal" aria-label="Meta do KR" placeholder="ex.: 95" className={`${campo} mt-1`} />
                      {sugestao.meta && sugestao.meta !== meta && <button type="button" onClick={() => setMeta(sugestao.meta)} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline mt-1">usar a meta do indicador: {sugestao.meta}</button>}
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Início do KR{soma ? '' : ' (opcional)'}</label>
                      <input type="date" min="2000-01-01" max="2100-12-31" value={ini} onChange={e => setIni(e.target.value)} aria-label="Início do KR" className={`${campo} mt-1`} />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prazo do KR{soma ? '' : ' (opcional)'}</label>
                      <input type="date" min="2000-01-01" max="2100-12-31" value={fim} onChange={e => setFim(e.target.value)} aria-label="Prazo do KR" className={`${campo} mt-1`} />
                    </div>
                  </div>
                  {contraMao && <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> Atenção: o indicador é "{SENTIDO_ROTULO[sel.sentido]}", mas a meta do KR vai no sentido contrário da partida.</p>}
                  {nMeta !== null && nPartida !== null && <p className="text-[11px] text-slate-500 dark:text-slate-400">O progresso do KR vai de {fmtValor(nPartida, sel.unidade, sel.casas)} (0%) a {fmtValor(nMeta, sel.unidade, sel.casas)} (100%).</p>}
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 bg-amber-50 dark:bg-amber-900/15 border border-amber-100 dark:border-amber-900/40 rounded-lg p-2.5">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                O valor lançado no indicador passa a ser o "atual" deste KR, e ninguém digita mais à mão. Quem vê este OKR — inclusive pelo link público do painel — vê esse número.
              </p>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-x-3 gap-y-2 justify-end">
          {sel && problema && <span className="text-[11px] text-slate-500 dark:text-slate-400 w-full sm:w-auto sm:mr-auto">{problema}</span>}
          <button onClick={onClose} disabled={gravando} className="px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancelar</button>
          <button onClick={confirmar} disabled={!!problema || gravando} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg">
            {gravando ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Ligar ao KPI
          </button>
        </div>
      </div>
    </Dialog>
  );
};
