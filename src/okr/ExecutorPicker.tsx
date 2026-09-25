import React, { useMemo, useRef } from 'react';
import { UserRound, Users, X, CircleDashed } from 'lucide-react';
import { OkrExecutor, OkrPersonRef, refName } from './okr';

// Seletores do cadastro de executores. <select> nativo de propósito: acessível,
// sem dropdown próprio para quebrar, e com color-scheme escuro (a lista nativa não
// fica branca no tema escuro).
const selectCls = 'max-w-full min-w-0 px-2 py-0.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-md text-[11px] text-slate-600 dark:text-slate-300 outline-none focus:ring-1 focus:ring-blue-400 [color-scheme:light] dark:[color-scheme:dark]';

const byIdOf = (registry: OkrExecutor[]) => new Map(registry.map(e => [e.id, e] as const));

// No Windows, seta ou letra num <select> FECHADO já dispara 'change' — cada tecla
// gravava um executor/responsável. Mudança que vem de navegar pelo teclado é
// ignorada (o select volta sozinho); escolher com o mouse, ou abrir a lista
// (Alt+↓ / espaço) e confirmar com Enter, continua valendo.
const BROWSE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const useKeyGuard = () => {
  const last = useRef<{ key: string; t: number } | null>(null);
  return {
    onKeyDown: (e: React.KeyboardEvent) => { last.current = { key: e.key, t: Date.now() }; },
    fromBrowsing: () => { const l = last.current; if (!l || Date.now() - l.t > 400) return false; return BROWSE_KEYS.has(l.key) || (l.key.length === 1 && l.key !== ' '); },
  };
};

// Opções agrupadas (Equipes / Pessoas), só as ATIVAS e ainda não escolhidas.
const Options: React.FC<{ registry: OkrExecutor[]; exclude: Set<string> }> = ({ registry, exclude }) => {
  const act = registry.filter(e => e.active && !exclude.has(e.id));
  const equipes = act.filter(e => e.kind === 'equipe');
  const pessoas = act.filter(e => e.kind === 'pessoa');
  return (<>
    {equipes.length > 0 && <optgroup label="Equipes">{equipes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>}
    {pessoas.length > 0 && <optgroup label="Pessoas">{pessoas.map(e => <option key={e.id} value={e.id}>{e.name}{e.team ? ` · ${e.team}` : ''}</option>)}</optgroup>}
  </>);
};

// Chip de um executor (nome atual do cadastro; ícone de equipe/pessoa). Sem o
// cadastro (link público, executor excluído) vale o tipo guardado na referência;
// sem nenhum dos dois, ícone neutro — não chuta "pessoa".
export const ExecutorChip: React.FC<{ r: OkrPersonRef; byId: Map<string, OkrExecutor>; onRemove?: () => void }> = ({ r, byId, onRemove }) => {
  const e = r.id ? byId.get(r.id) : undefined;
  const orphan = !!r.id && !e && byId.size > 0; // tem id, o cadastro foi lido e ele não está lá: foi excluído
  const kind = e?.kind ?? r.kind;
  const isTeam = kind === 'equipe';
  const inactive = e && !e.active;
  const tone = kind === 'equipe' ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300'
    : kind === 'pessoa' ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300'
    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center gap-1 max-w-full text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${tone} ${inactive ? 'opacity-60 line-through' : ''} ${orphan || !r.id ? 'border-dashed' : ''}`}
      title={`${refName(r, byId)}${e?.team && !isTeam ? ` · ${e.team}` : ''}${inactive ? ' (inativo no cadastro)' : ''}${orphan ? ' (excluído do cadastro — nome da época)' : ''}${!r.id ? ' (nome antigo, fora do cadastro)' : ''}`}>
      {kind === 'equipe' ? <Users size={10} className="shrink-0" /> : kind === 'pessoa' ? <UserRound size={10} className="shrink-0" /> : <CircleDashed size={10} className="shrink-0" />}
      {refName(r, byId)}
      {onRemove && <button type="button" onClick={onRemove} className="ml-0.5 hover:text-rose-500" aria-label={`Remover ${refName(r, byId)}`}><X size={10} /></button>}
    </span>
  );
};

// KR: vários executores.
// Acrescenta/tira UM de cada vez (onAdd/onRemove): quem grava aplica isso sobre a
// lista ATUAL do banco — mandar a lista inteira da tela apagava o executor que
// outra pessoa tinha acabado de pôr.
export const ExecutorMultiPicker: React.FC<{ value: OkrPersonRef[]; registry: OkrExecutor[]; onAdd: (ref: OkrPersonRef) => void; onRemove: (ref: OkrPersonRef) => void; readOnly?: boolean }> = ({ value, registry, onAdd, onRemove, readOnly }) => {
  const byId = useMemo(() => byIdOf(registry), [registry]);
  const chosen = useMemo(() => new Set(value.map(r => r.id).filter(Boolean) as string[]), [value]);
  const guard = useKeyGuard();
  const add = (id: string) => {
    const e = byId.get(id); if (!e || chosen.has(id)) return;
    onAdd({ id: e.id, name: e.name, kind: e.kind });
  };
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {value.length === 0 && readOnly && <span className="text-[11px] text-slate-400">—</span>}
      {value.map((r, i) => <ExecutorChip key={(r.id || 'n:' + r.name) + i} r={r} byId={byId} onRemove={readOnly ? undefined : () => onRemove(r)} />)}
      {!readOnly && (
        <select value="" onKeyDown={guard.onKeyDown} onChange={e => { if (e.target.value && !guard.fromBrowsing()) add(e.target.value); }} className={selectCls} aria-label="Adicionar executor" title="Adicionar executor">
          <option value="">{value.length ? '+' : '+ executor'}</option>
          <Options registry={registry} exclude={chosen} />
        </select>
      )}
    </span>
  );
};

// Objetivo: um responsável.
export const ExecutorSinglePicker: React.FC<{ value?: OkrPersonRef | null; registry: OkrExecutor[]; onChange: (v: OkrPersonRef | null) => void; readOnly?: boolean }> = ({ value, registry, onChange, readOnly }) => {
  const byId = useMemo(() => byIdOf(registry), [registry]);
  const guard = useKeyGuard();
  if (readOnly) return value ? <ExecutorChip r={value} byId={byId} /> : <span className="text-[11px] text-slate-400">—</span>;
  // Um responsável legado/inativo ainda aparece como opção atual para não sumir do select.
  const current = value?.id || '';
  const currentMissing = value && (!value.id || !registry.some(e => e.id === value.id && e.active));
  return (
    <select value={currentMissing ? '__cur' : current} aria-label="Responsável pelo objetivo" onKeyDown={guard.onKeyDown}
      onChange={e => { const v = e.target.value; if (v === '__cur' || guard.fromBrowsing()) return; if (!v) return onChange(null); const ex = byId.get(v); if (ex) onChange({ id: ex.id, name: ex.name, kind: ex.kind }); }}
      className={selectCls}>
      <option value="">— sem responsável —</option>
      {currentMissing && <option value="__cur">{refName(value!, byId)}</option>}
      <Options registry={registry} exclude={new Set()} />
    </select>
  );
};
