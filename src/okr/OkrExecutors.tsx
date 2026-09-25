import React, { useEffect, useMemo, useRef, useState } from 'react';
import { withOkrSafe } from './OkrSafe';
import { Users, UserRound, Plus, Trash2, RefreshCw, Lock, Power } from 'lucide-react';
import { User } from '../types';
import { fetchOkrExecutors, createOkrExecutor, updateOkrExecutor, renameOkrExecutor, deleteOkrExecutor, fetchAllOkrOrThrow, addAuditLog, okrErrorMessage, OkrStaleError } from '../services/storageService';
import { OkrExecutor, OkrExecutorKind, OkrStore, krExecutores, normName } from './okr';
import { useToast } from '../components/Toast';

// Cadastro de EXECUTORES dos KRs (pessoas e equipes). Objetivos têm Responsável e
// KRs têm Executores — ambos saem daqui. Edita: Edson e admin de OKR (RLS no banco).
interface Props { currentUser: User; editable: boolean; }

const inputCls = 'px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]';

// Onde cada executor aparece: KRs (executores) e objetivos (responsável), em todos os
// OKRs. `kr` conta só os KRs ativos (o que a tela mostra); `krAll` inclui os
// arquivados (o que a exclusão deixaria desligado).
const countUsage = (rows: { ownerKey: string; store: OkrStore }[], registry: OkrExecutor[]) => {
  const kr = new Map<string, number>(); const krAll = new Map<string, number>(); const obj = new Map<string, number>();
  const inc = (m: Map<string, number>, id: string) => m.set(id, (m.get(id) || 0) + 1);
  rows.forEach(r => r.store.periods.forEach(p => p.objectives.forEach(o => {
    if (o.responsavel?.id) inc(obj, o.responsavel.id);
    o.keyResults.forEach(k => krExecutores(k, registry).forEach(ref => { if (!ref.id) return; inc(krAll, ref.id); if (!k.archived) inc(kr, ref.id); }));
  })));
  return { kr, krAll, obj };
};

// Campo com RASCUNHO: enquanto a pessoa DIGITA, nada de fora mexe no texto (antes o
// campo era remontado quando outra linha falhava ou uma equipe era renomeada, e o
// que estava sendo digitado sumia). Enquanto ela não digitou nada, o campo acompanha
// o banco mesmo com foco; e só grava se ela mudou o texto em relação ao que VIU —
// passar pelo campo (Tab) não regrava o valor velho por cima de outro admin.
// `reset` muda quando a gravação DESTE campo falhou: ele volta ao valor do banco.
const DraftInput: React.FC<Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & { value: string; reset: number; allowEmpty?: boolean; onCommit: (v: string) => void }> = ({ value, reset, allowEmpty, onCommit, ...rest }) => {
  const [draft, setDraft] = useState(value);
  const base = useRef(value);    // o valor que a pessoa viu quando começou a digitar
  const dirty = useRef(false);   // ela digitou algo desde então
  useEffect(() => { if (!dirty.current) { setDraft(value); base.current = value; } }, [value]);
  useEffect(() => { dirty.current = false; setDraft(value); base.current = value; }, [reset]);
  return <input {...rest} value={draft}
    onChange={e => { if (!dirty.current) { dirty.current = true; base.current = value; } setDraft(e.target.value); }}
    onBlur={() => {
      const v = draft.trim(); const wasDirty = dirty.current; dirty.current = false;
      if (!wasDirty || v === base.current || (!v && !allowEmpty)) { setDraft(value); base.current = value; return; }
      onCommit(v);
    }} />;
};

const OkrExecutorsInner: React.FC<Props> = ({ currentUser, editable }) => {
  const { addToast } = useToast();
  const [list, setListState] = useState<OkrExecutor[]>([]);
  const listRef = useRef<OkrExecutor[]>([]);
  const setList = (fn: (l: OkrExecutor[]) => OkrExecutor[]) => { listRef.current = fn(listRef.current).sort((a, b) => a.name.localeCompare(b.name)); setListState(listRef.current); };
  // Só uma gravação que DEU CERTO torna velha uma leitura em andamento (saveSeq).
  const merge = (saved: OkrExecutor[]) => { saveSeq.current++; setList(l => { const m = new Map(l.map(x => [x.id, x] as const)); saved.forEach(x => m.set(x.id, x)); return Array.from(m.values()); }); };
  const [rows, setRows] = useState<{ ownerKey: string; store: OkrStore }[]>([]);
  const [usageOk, setUsageOk] = useState(false);   // a contagem de uso foi LIDA (senão não se afirma "0 KRs")
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pendingN, setPendingN] = useState(0);
  const busy = pendingN > 0;
  const [showInactive, setShowInactive] = useState(false);
  const [nName, setNName] = useState(''); const [nKind, setNKind] = useState<OkrExecutorKind>('pessoa'); const [nTeam, setNTeam] = useState('');
  const who = `${currentUser.name}${currentUser.surname ? ' ' + currentUser.surname : ''}`.trim();

  // Remontagem POR LINHA: um salvamento que falhou devolve só aquela linha ao valor
  // do banco (antes um contador global remontava todos os campos e apagava o que a
  // pessoa estava digitando em outra linha).
  const [rowRev, setRowRev] = useState<Record<string, number>>({});
  const bumpRow = (id: string) => setRowRev(m => ({ ...m, [id]: (m[id] || 0) + 1 }));

  // Uma leitura que começou ANTES de uma gravação BEM-SUCEDIDA terminar chega com dado
  // velho: é descartada (senão desfazia na tela o que acabou de ser gravado). Falha
  // não conta — a releitura pedida pela própria falha era jogada fora e a tela
  // continuava velha ("atualizei a lista" sem ter atualizado).
  const saveSeq = useRef(0);
  const load = async () => {
    setLoading(true);
    const seqAtStart = saveSeq.current;
    try {
      const [ex, all] = await Promise.all([fetchOkrExecutors(), fetchAllOkrOrThrow().catch(() => null)]);
      // Uma gravação terminou no meio: esta leitura está velha — lê de novo (antes era
      // só descartada, e a tela ficava velha dizendo "atualizei a lista").
      if (saveSeq.current !== seqAtStart) { setTimeout(load, 0); return; }
      setList(() => ex); setLoadError(false);
      if (all) { setRows(all); setUsageOk(true); } else setUsageOk(false);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Gravações em FILA: a segunda edição espera a primeira (antes era descartada
  // calada enquanto a primeira estava no ar, e o texto novo ficava na tela sem gravar).
  const queue = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (fn: () => Promise<void>) => {
    setPendingN(n => n + 1);
    queue.current = queue.current.then(fn).catch(() => { /* cada tarefa trata o seu erro */ }).finally(() => setPendingN(n => n - 1));
  };
  const fail = (err: any, fallback: string, rowId?: string) => {
    addToast(okrErrorMessage(err, fallback), 'error');
    if (rowId) bumpRow(rowId);
    if (err instanceof OkrStaleError || rowId) load();
  };

  const usage = useMemo(() => countUsage(rows, list), [rows, list]);
  const equipeNames = useMemo<string[]>(() => list.filter(e => e.kind === 'equipe' && e.active).map(e => e.name), [list]);
  const visible = list.filter(e => showInactive || e.active);
  const equipes = visible.filter(e => e.kind === 'equipe');
  const pessoas = visible.filter(e => e.kind === 'pessoa');
  const membersOf = (team: OkrExecutor) => list.filter(x => x.id !== team.id && x.team && normName(x.team) === normName(team.name));
  // Mesmo nome sem acento/maiúscula/espaço (o banco também barra: índice okr_norm).
  const clash = (name: string, exceptId?: string) => listRef.current.find(x => x.id !== exceptId && normName(x.name) === normName(name));

  const audit = (action: 'CREATE' | 'UPDATE' | 'DELETE', e: { id?: string; name: string }, details: string) => {
    try { addAuditLog({ userId: currentUser.id, userName: who, action: action as any, entityType: 'OKR', entityId: e.id || 'okr_executor', entityName: `Executor: ${e.name}`, details }); } catch { /* auditoria nunca trava */ }
  };

  const rename = (id: string, name: string) => {
    const e0 = listRef.current.find(x => x.id === id); if (!e0) return;
    const c = clash(name, id);
    if (c) { addToast(`Já existe "${c.name}" no cadastro (o nome não diferencia acento, maiúscula nem espaço).`, 'warning'); bumpRow(id); return; }
    enqueue(async () => {
      const cur = listRef.current.find(x => x.id === id); if (!cur) return;
      try {
        // No banco, numa transação: renomear uma EQUIPE leva junto quem aponta para ela.
        const saved = await renameOkrExecutor(id, name, cur.updatedAt, who);
        merge(saved);
        const moved = saved.filter(x => x.id !== id).length;
        audit('UPDATE', { id, name }, `${who} renomeou "${cur.name}" para "${name}" no cadastro de executores do OKR${moved ? ` (${moved} membro(s) acompanharam)` : ''}`);
        if (moved) addToast(`Equipe renomeada — ${moved} pessoa(s) acompanharam.`, 'success');
      } catch (err) { fail(err, 'Não consegui renomear.', id); }
    });
  };

  const save = (id: string, patch: { team?: string; active?: boolean }, msg: string) => enqueue(async () => {
    const cur = listRef.current.find(x => x.id === id); if (!cur) return;
    try {
      // Só a coluna que mudou, e só se ninguém gravou esta linha depois que a tela leu.
      const saved = await updateOkrExecutor(id, patch, cur.updatedAt, who);
      merge([saved]);
      audit('UPDATE', saved, `${who} ${msg} no cadastro de executores do OKR`);
    } catch (err) { fail(err, 'Não consegui salvar.', id); }
  });

  const add = () => {
    const name = nName.trim(); if (!name) return;
    const c = clash(name);
    if (c) { addToast(`Já existe "${c.name}" no cadastro (o nome não diferencia acento, maiúscula nem espaço).`, 'warning'); return; }
    const kind = nKind, team = kind === 'equipe' ? name : nTeam.trim(); // equipe: a equipe dela é ela mesma
    setNName(''); setNTeam('');
    enqueue(async () => {
      try {
        const saved = await createOkrExecutor({ name, kind, team }, who);
        merge([saved]);
        audit('CREATE', saved, `${who} cadastrou o executor "${saved.name}" (${saved.kind}${saved.team ? ' · ' + saved.team : ''})`);
        addToast(`"${saved.name}" cadastrado.`, 'success');
      } catch (err) { fail(err, 'Não consegui cadastrar.'); setNName(v => v || name); if (kind === 'pessoa') setNTeam(v => v || team); }
    });
  };

  const remove = (e: OkrExecutor) => {
    const mem = e.kind === 'equipe' ? membersOf(e) : [];
    const parts: string[] = [];
    if (!usageOk) parts.push(`⚠ Não consegui conferir onde "${e.name}" está sendo usado (a leitura dos OKRs falhou). Se ele estiver em algum KR ou objetivo, o nome continua lá, desligado do cadastro.`);
    else {
      const nk = usage.krAll.get(e.id) || 0, no = usage.obj.get(e.id) || 0;
      if (nk + no > 0) parts.push(`"${e.name}" está em ${nk} KR(s) (contando arquivados) e ${no} objetivo(s). Nesses lugares o nome continua aparecendo, mas desligado do cadastro.`);
    }
    if (mem.length) parts.push(`${mem.length} pessoa(s) estão nesta equipe (${mem.map(m => m.name).join(', ')}) e deixam de entrar no filtro por ela.`);
    if (parts.length) parts.push('Para só parar de oferecer, prefira DESATIVAR.');
    if (!window.confirm(`Excluir "${e.name}" do cadastro?${parts.length ? '\n\n' + parts.join('\n\n') : ''}`)) return;
    enqueue(async () => {
      try { await deleteOkrExecutor(e.id); saveSeq.current++; setList(l => l.filter(x => x.id !== e.id)); audit('DELETE', e, `${who} excluiu o executor "${e.name}" do cadastro do OKR`); }
      catch (err) { fail(err, 'Não consegui excluir.'); }
    });
  };

  if (loading && !list.length && !loadError) return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Carregando o cadastro…</div>;
  if (loadError && !list.length) return (
    <div className="p-10 text-center text-slate-500 dark:text-slate-400">
      Não consegui ler o cadastro de executores (sem conexão?). <button onClick={load} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">Tentar de novo</button>
    </div>
  );

  // Funções de render (NÃO componentes definidos aqui dentro: seriam recriados a
  // cada render e remontariam os campos, perdendo foco).
  const renderRow = (e: OkrExecutor) => {
    const nk = usage.kr.get(e.id) || 0; const no = usage.obj.get(e.id) || 0;
    const rv = rowRev[e.id] || 0;
    return (
      <div key={e.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-x-2 gap-y-1.5 py-2 border-b border-gray-100 dark:border-slate-800 last:border-0 ${e.active ? '' : 'opacity-50'}`}>
        <span className={`shrink-0 ${e.kind === 'equipe' ? 'text-violet-500' : 'text-sky-500'}`}>{e.kind === 'equipe' ? <Users size={15} /> : <UserRound size={15} />}</span>
        {editable
          ? <DraftInput value={e.name} reset={rv} aria-label="Nome" onCommit={v => { if (v) rename(e.id, v); }} className={`${inputCls} flex-1 min-w-[9rem] font-semibold`} />
          : <span className="flex-1 min-w-[9rem] text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{e.name}</span>}
        {e.kind === 'equipe'
          ? <span className="w-32 sm:w-40 text-[11px] text-slate-400 truncate" title="Pessoas com esta equipe no cadastro">{membersOf(e).length} membro(s)</span>
          : editable
            ? <DraftInput value={e.team || ''} reset={rv} allowEmpty list="okr-exec-teams" aria-label="Equipe" placeholder="equipe" onCommit={v => save(e.id, { team: v }, `mudou a equipe de "${e.name}" para "${v || '—'}"`)} className={`${inputCls} w-32 sm:w-40`} />
            : <span className="w-32 sm:w-40 text-xs text-slate-500 dark:text-slate-400 truncate">{e.team || '—'}</span>}
        <span className="sm:w-28 text-[11px] text-slate-400 tabular-nums sm:text-right" title={usageOk ? 'Onde está alocado (todos os OKRs, KRs não arquivados)' : 'Não consegui ler os OKRs para contar'}>{usageOk ? <>{nk} KR{nk === 1 ? '' : 's'}{no ? ` · ${no} obj` : ''}</> : '— KRs'}</span>
        {editable && <span className="flex items-center gap-1 ml-auto sm:ml-0">
          <button onClick={() => save(e.id, { active: !e.active }, `${e.active ? 'desativou' : 'reativou'} "${e.name}"`)} className={`shrink-0 p-1.5 rounded-lg ${e.active ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`} title={e.active ? 'Ativo — clique para desativar (some das opções, continua nos KRs)' : 'Inativo — clique para reativar'} aria-label={e.active ? `Desativar ${e.name}` : `Reativar ${e.name}`}><Power size={14} /></button>
          <button onClick={() => remove(e)} className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20" title="Excluir do cadastro" aria-label={`Excluir ${e.name}`}><Trash2 size={14} /></button>
        </span>}
      </div>
    );
  };

  const renderSection = (title: string, icon: React.ReactNode, items: OkrExecutor[]) => (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-200 dark:border-slate-700 min-w-0">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-2">{icon}{title} <span className="text-slate-300 dark:text-slate-600">· {items.length}</span></h3>
      {items.length === 0 ? <p className="text-xs text-slate-400 italic py-2">Nenhum.</p> : items.map(e => renderRow(e))}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 border-l-4 border-l-blue-500 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><Users size={22} /></div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">OKR · <span className="text-orange-500 dark:text-orange-400">Executores</span></p>
            <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Cadastro de executores</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Objetivos têm <b>responsável</b>; KRs têm <b>executores</b> — pessoas e equipes daqui.</p>
          </div>
          {!editable && <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-1"><Lock size={11} /> Só leitura</span>}
        </div>
        <div className="flex items-center gap-3">
          {busy && <span className="text-[11px] text-slate-400" role="status">salvando…</span>}
          {!usageOk && !loading && <span className="text-[11px] text-amber-600 dark:text-amber-400" title="A leitura dos OKRs falhou; a contagem de uso não está disponível">sem contagem de uso</span>}
          <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-blue-600" /> mostrar inativos</label>
          <button onClick={load} disabled={busy || loading} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 disabled:opacity-50"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar</button>
        </div>
      </div>

      {editable && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 mr-1">Novo</span>
          <select value={nKind} onChange={e => { setNKind(e.target.value as OkrExecutorKind); setNTeam(''); }} className={inputCls} aria-label="Tipo">
            <option value="pessoa">Pessoa</option><option value="equipe">Equipe</option>
          </select>
          <input value={nName} onChange={e => setNName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={nKind === 'equipe' ? 'nome da equipe (ex.: Qualidade)' : 'nome da pessoa'} className={`${inputCls} flex-1 min-w-[180px]`} aria-label="Nome" />
          {nKind === 'pessoa' && <input value={nTeam} onChange={e => setNTeam(e.target.value)} list="okr-exec-teams" placeholder="equipe (opcional)" className={`${inputCls} w-44`} aria-label="Equipe" />}
          <button onClick={add} disabled={!nName.trim()} className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"><Plus size={14} /> Cadastrar</button>
        </div>
      )}
      <datalist id="okr-exec-teams">{equipeNames.map(t => <option key={t} value={t} />)}</datalist>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {renderSection('Equipes', <Users size={13} className="text-violet-500" />, equipes)}
        {renderSection('Pessoas', <UserRound size={13} className="text-sky-500" />, pessoas)}
      </div>
      <p className="text-[10px] text-slate-400 px-1">Renomear aqui muda o nome em todos os KRs e objetivos (no link público de um OKR aparece o nome da época) — e renomear uma equipe leva junto as pessoas dela. Desativar tira da lista de escolha, mas mantém onde já está. A contagem considera todos os períodos e ignora KRs arquivados.</p>
    </div>
  );
};

export const OkrExecutors = withOkrSafe<Props>(OkrExecutorsInner, 'o cadastro de executores');
