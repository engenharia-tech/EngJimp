import React, { useEffect, useState } from 'react';
import { Compass, Activity, Gauge, Users as UsersIcon, Plus, Trash2, RefreshCw, CalendarClock, CheckSquare, Lock } from 'lucide-react';
import { fetchOkr, saveOkr, addAuditLog } from '../services/storageService';
import { OkrStore, OkrGovState, OkrGovReview } from './okr';
import { User } from '../types';
import { useToast } from '../components/Toast';

const CADENCE = [
  { icon: Activity, tag: 'Operação', freq: 'Semanal', desc: 'Tratar bloqueios, incidentes e pendências com os responsáveis de cada setor.' },
  { icon: Gauge, tag: 'Performance', freq: 'Mensal', desc: 'Atualizar os KRs, revisar os desvios e repriorizar as iniciativas do ciclo.' },
  { icon: UsersIcon, tag: 'Direção', freq: 'Trimestral', desc: 'Avaliar o impacto, decidir correções de rota e confirmar o próximo ciclo.' },
];
const SCALE = [
  { range: '0,0 – 0,3', label: 'Sem avanço', color: '#ef4444' },
  { range: '0,4 – 0,6', label: 'Parcial / risco', color: '#f59e0b' },
  { range: '0,7 – 0,9', label: 'Consistente', color: '#10b981' },
  { range: '1,0', label: 'Meta atingida', color: '#3b82f6' },
];
const CADENCE_OPTS: OkrGovReview['cadence'][] = ['Semanal', 'Mensal', 'Trimestral'];
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const fmt = (iso: string) => { try { const [y, m, d] = iso.split('-'); return d ? `${d}/${m}/${y}` : iso; } catch { return iso; } };

export const OkrGovernance: React.FC<{ editable: boolean; currentUser: User }> = ({ editable, currentUser }) => {
  const { addToast } = useToast();
  const [store, setStore] = useState<OkrStore | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { setLoading(true); try { setStore(await fetchOkr('edson')); } finally { setLoading(false); } })(); }, []);

  const logDelete = (entity: string, name: string) => {
    try {
      addAuditLog({
        userId: currentUser.id,
        userName: `${currentUser.name}${currentUser.surname ? ' ' + currentUser.surname : ''}`.trim(),
        action: 'DELETE' as any, entityType: 'OKR', entityId: 'edson', entityName: name || entity,
        details: `${currentUser.name} excluiu ${entity}${name ? ` "${name}"` : ''} na Governança do ciclo`,
      });
    } catch { /* auditoria nunca trava a ação */ }
  };

  const gov: OkrGovState = store?.governance || { reviews: [], actions: [] };
  const persist = async (g: OkrGovState) => {
    if (!store || !editable) return;
    const next: OkrStore = { ...store, governance: g };
    setStore(next);
    try { await saveOkr(next, 'edson'); } catch { addToast('Não consegui salvar.', 'error'); }
  };

  // ---- revisões ----
  const [rDate, setRDate] = useState(today());
  const [rCad, setRCad] = useState<OkrGovReview['cadence']>('Mensal');
  const [rNotes, setRNotes] = useState('');
  const [rNext, setRNext] = useState('');
  const addReview = () => {
    if (!rNotes.trim()) { addToast('Escreva a pauta / decisão da revisão.', 'warning'); return; }
    persist({ ...gov, reviews: [{ id: newId(), date: rDate, cadence: rCad, notes: rNotes.trim(), next: rNext.trim() }, ...gov.reviews] });
    setRNotes(''); setRNext('');
  };
  const delReview = (id: string) => { const r = gov.reviews.find(x => x.id === id); if (window.confirm('Excluir esta revisão?')) { logDelete('revisão do ciclo', r ? `${r.cadence} · ${r.notes.slice(0, 40)}` : ''); persist({ ...gov, reviews: gov.reviews.filter(x => x.id !== id) }); } };

  // ---- decisões & ações ----
  const [aText, setAText] = useState('');
  const [aOwner, setAOwner] = useState('');
  const [aDue, setADue] = useState('');
  const addAction = () => {
    if (!aText.trim()) return;
    persist({ ...gov, actions: [{ id: newId(), text: aText.trim(), owner: aOwner.trim(), due: aDue, done: false }, ...gov.actions] });
    setAText(''); setAOwner(''); setADue('');
  };
  const toggleAction = (id: string) => persist({ ...gov, actions: gov.actions.map(a => a.id === id ? { ...a, done: !a.done } : a) });
  const delAction = (id: string) => { const a = gov.actions.find(x => x.id === id); if (window.confirm('Excluir esta ação?')) { logDelete('ação da governança', a?.text || ''); persist({ ...gov, actions: gov.actions.filter(x => x.id !== id) }); } };

  const openActions = gov.actions.filter(a => !a.done).length;

  if (loading) return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Carregando a governança…</div>;

  const inputCls = 'px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]';

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 border-l-4 border-l-blue-500 flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><Compass size={22} /></div>
        <div className="flex-1">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">OKR · <span className="text-orange-500 dark:text-orange-400">Governança</span></p>
          <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Governança do ciclo</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Registre as revisões e conduza as decisões — a cadência vira ação.</p>
        </div>
        {!editable && <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-1"><Lock size={11} /> Só leitura</span>}
      </div>

      {/* Referência: cadência + régua de nota */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
          <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">Reuniões que mantêm o foco</h4>
          <div className="grid sm:grid-cols-3 gap-3">
            {CADENCE.map(c => (
              <div key={c.freq} className="p-3 rounded-xl bg-gray-50/70 dark:bg-slate-800/40">
                <div className="p-2 w-fit rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 mb-2"><c.icon size={18} /></div>
                <div className="text-sm font-bold text-slate-800 dark:text-white">{c.freq}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{c.tag}</div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-900 dark:bg-black rounded-2xl p-5 shadow-sm border border-slate-800">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">Como interpretar a nota</h4>
          <div className="space-y-2.5">
            {SCALE.map(s => (
              <div key={s.range} className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <div><div className="text-sm font-bold text-white tabular-nums">{s.range}</div><div className="text-[11px] text-slate-400">{s.label}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Registro de revisões */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><CalendarClock size={18} className="text-blue-600" /> Revisões do ciclo · {gov.reviews.length}</h3>
        {editable && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4">
            <input type="date" value={rDate} max={today()} onChange={e => setRDate(e.target.value)} className={`${inputCls} md:col-span-2`} />
            <select value={rCad} onChange={e => setRCad(e.target.value as OkrGovReview['cadence'])} className={`${inputCls} md:col-span-2`}>{CADENCE_OPTS.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <input value={rNotes} onChange={e => setRNotes(e.target.value)} placeholder="Pauta / decisões da reunião" className={`${inputCls} md:col-span-4`} />
            <input value={rNext} onChange={e => setRNext(e.target.value)} placeholder="Próximos passos" className={`${inputCls} md:col-span-3`} />
            <button onClick={addReview} className="md:col-span-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold"><Plus size={16} /></button>
          </div>
        )}
        <div className="space-y-2">
          {gov.reviews.length === 0 && <p className="text-sm text-slate-400 italic py-2">Nenhuma revisão registrada ainda.</p>}
          {gov.reviews.map(r => (
            <div key={r.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/70 dark:bg-slate-800/40 group">
              <div className="text-center shrink-0 w-16">
                <div className="text-xs font-black text-slate-700 dark:text-slate-200 tabular-nums">{fmt(r.date)}</div>
                <span className="text-[9px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">{r.cadence}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 dark:text-slate-200">{r.notes}</p>
                {r.next && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5"><span className="font-bold">Próximo:</span> {r.next}</p>}
              </div>
              {editable && <button onClick={() => delReview(r.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 shrink-0 transition-all"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      </div>

      {/* Decisões & ações */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
        <h3 className="text-base font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><CheckSquare size={18} className="text-blue-600" /> Decisões &amp; ações {openActions > 0 && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-full px-2 py-0.5">{openActions} em aberto</span>}</h3>
        {editable && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4">
            <input value={aText} onChange={e => setAText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addAction()} placeholder="O que foi decidido / o que fazer" className={`${inputCls} md:col-span-6`} />
            <input value={aOwner} onChange={e => setAOwner(e.target.value)} placeholder="Responsável" className={`${inputCls} md:col-span-3`} />
            <input type="date" value={aDue} onChange={e => setADue(e.target.value)} className={`${inputCls} md:col-span-2`} />
            <button onClick={addAction} className="md:col-span-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold"><Plus size={16} /></button>
          </div>
        )}
        <div className="space-y-1.5">
          {gov.actions.length === 0 && <p className="text-sm text-slate-400 italic py-2">Nenhuma ação registrada ainda.</p>}
          {gov.actions.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50/70 dark:bg-slate-800/40 group">
              <input type="checkbox" checked={a.done} disabled={!editable} onChange={() => toggleAction(a.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${a.done ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>{a.text}</span>
                <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-0.5">
                  {a.owner && <span className="font-bold uppercase tracking-wide">{a.owner}</span>}
                  {a.due && <span className="tabular-nums">prazo {fmt(a.due)}</span>}
                </div>
              </div>
              {editable && <button onClick={() => delAction(a.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 shrink-0 transition-all"><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
