import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Target, Flag, CheckCircle2, AlertTriangle, Clock, Plus, Lock, RefreshCw, Layers, Trash2, Share2, Printer, Activity as ActivityIcon, Copy, CalendarDays, ChevronDown, Link2, ExternalLink } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid, Legend } from 'recharts';
import { User, ProjectSession, OperationalActivity, ActivityType } from '../types';
import { fetchOkr, saveOkr, addAuditLog, enableOkrShare, fetchPublicOkr } from '../services/storageService';
import {
  OkrStore, OkrPeriod, OkrKeyResult, OkrObjective, OkrCheckin, PortfolioItem, OkrTask,
  DEFAULT_STORE, EMPTY_STORE, DEFAULT_PORTFOLIO, clonePeriodStructure, emptyKr,
  krProgress, objProgress, progressColor, fmtValue, OkrFormat,
} from './okr';
import { useToast } from '../components/Toast';

const STATUS_OPTIONS = ['Não iniciado', 'Em andamento', 'Em risco', 'Concluído'];
const FORMAT_OPTIONS: { v: OkrFormat; l: string }[] = [{ v: 'bin', l: 'Sim/Não' }, { v: 'pct', l: 'Percentual' }, { v: 'num', l: 'Contagem' }];
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

const barColor = (p: number) => { const c = progressColor(p); return c === 'green' ? 'bg-emerald-500' : c === 'amber' ? 'bg-amber-500' : 'bg-rose-500'; };
const textColor = (p: number) => { const c = progressColor(p); return c === 'green' ? 'text-emerald-600 dark:text-emerald-400' : c === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'; };
const fmtDue = (iso: string) => { try { const [y, m, d] = iso.split('-'); return d ? `${d}/${m}/${y}` : iso; } catch { return iso; } };
const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const periodProgress = (p?: OkrPeriod) => { const krs = (p?.objectives || []).flatMap(o => o.keyResults); return krs.length ? krs.reduce((a, k) => a + krProgress(k), 0) / krs.length : 0; };

// Campo editável inline (vira texto no modo leitura).
const EditField: React.FC<{ value: string; onCommit: (v: string) => void; readOnly?: boolean; multiline?: boolean; placeholder?: string; className?: string }> = ({ value, onCommit, readOnly, multiline, placeholder, className }) => {
  if (readOnly) return <span className={className}>{value || placeholder || ''}</span>;
  const common = `bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-900 rounded px-1 -mx-1 outline-none focus:ring-1 focus:ring-blue-400 w-full ${className || ''}`;
  return multiline
    ? <textarea defaultValue={value} placeholder={placeholder} rows={2} onBlur={e => { if (e.target.value !== value) onCommit(e.target.value); }} className={`${common} resize-none`} />
    : <input defaultValue={value} placeholder={placeholder} onBlur={e => { if (e.target.value !== value) onCommit(e.target.value); }} className={common} />;
};

const StatTile: React.FC<{ label: string; value: string; color: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
    <div className="flex items-center gap-1.5 text-slate-400 mb-1">{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
    <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
  </div>
);
const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{title}</h4>
    {children}
  </div>
);

interface OkrViewProps {
  currentUser: User;
  projects?: ProjectSession[];
  activities?: OperationalActivity[];
  activityTypes?: ActivityType[];
  readOnly?: boolean;
  external?: OkrStore;
  ownerKey?: string;          // qual OKR (owner_key) carregar/salvar. Padrão: 'edson'.
  heading?: string;           // título no cabeçalho. Padrão: 'Meu OKR'.
  canShare?: boolean;         // mostra o botão de link público. Padrão: !readOnly.
  privacyNote?: string;       // selo de privacidade. Padrão: 'Só você vê'.
  seedEmpty?: boolean;        // ao não existir, cria VAZIO (dono preenche) em vez do padrão do Edson.
}

export const OkrView: React.FC<OkrViewProps> = ({ currentUser, projects = [], activities = [], activityTypes = [], readOnly = false, external, ownerKey = 'edson', heading = 'Meu OKR', canShare, privacyNote = 'Só você vê', seedEmpty = false }) => {
  const { addToast } = useToast();
  const [store, setStore] = useState<OkrStore | null>(external || null);
  const [loading, setLoading] = useState(!external);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [shareLink, setShareLink] = useState('');
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (external) { setStore(external); setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const s = await fetchOkr(ownerKey);
        if (s && s.periods?.length) setStore(s);
        else if (readOnly) setStore(null); // quem só olha não cria; mostra "ainda não criou"
        else { const d = seedEmpty ? EMPTY_STORE(currentUser.name || currentUser.username) : DEFAULT_STORE(); setStore(d); try { await saveOkr(d, ownerKey); } catch {} }
      } finally { setLoading(false); }
    })();
  }, [ownerKey, readOnly, seedEmpty]);

  const persist = useCallback(async (next: OkrStore) => {
    if (readOnly) return;
    setStore(next); setSaving('saving');
    try { await saveOkr(next, ownerKey); setSaving('saved'); setTimeout(() => setSaving('idle'), 1500); }
    catch (e) { console.error('saveOkr', e); setSaving('error'); addToast('Não consegui salvar o OKR.', 'error'); }
  }, [readOnly, ownerKey, addToast]);

  const active = useMemo(() => store?.periods.find(p => p.id === store.activePeriodId) || store?.periods[0], [store]);

  // Atualiza o período ativo dentro do store.
  const patchActive = (fn: (p: OkrPeriod) => OkrPeriod) => {
    if (!store || !active) return;
    persist({ ...store, periods: store.periods.map(p => p.id === active.id ? fn(p) : p) });
  };
  const updateKr = (objId: string, krId: string, patch: Partial<OkrKeyResult>) =>
    patchActive(p => ({ ...p, objectives: p.objectives.map(o => o.id !== objId ? o : { ...o, keyResults: o.keyResults.map(k => k.id !== krId ? k : { ...k, ...patch }) }) }));
  const updateObj = (objId: string, patch: Partial<OkrObjective>) =>
    patchActive(p => ({ ...p, objectives: p.objectives.map(o => o.id === objId ? { ...o, ...patch } : o) }));
  const addKr = (objId: string) => patchActive(p => ({ ...p, objectives: p.objectives.map(o => o.id !== objId ? o : { ...o, keyResults: [...o.keyResults, emptyKr(`KR${o.id.replace(/\D/g, '')}.${o.keyResults.length + 1}`)] }) }));
  const removeKr = (objId: string, krId: string) => patchActive(p => ({ ...p, objectives: p.objectives.map(o => o.id !== objId ? o : { ...o, keyResults: o.keyResults.filter(k => k.id !== krId) }) }));
  const addObjective = () => patchActive(p => ({ ...p, objectives: [...p.objectives, { id: `O${p.objectives.length + 1}`, title: 'Novo objetivo', keyResults: [] }] }));
  const removeObjective = (objId: string) => patchActive(p => ({ ...p, objectives: p.objectives.filter(o => o.id !== objId) }));

  // Períodos
  const switchPeriod = (id: string) => { if (store) persist({ ...store, activePeriodId: id }); };
  const addPeriod = () => {
    if (!store || !active) return;
    const label = window.prompt('Nome do novo período (ex.: Q1 2027):', 'Q1 2027');
    if (!label) return;
    const range = window.prompt('Intervalo (ex.: 01/01/2027 a 31/03/2027):', '') || '';
    const np = clonePeriodStructure(active, label.trim(), range.trim());
    persist({ ...store, periods: [...store.periods, np], activePeriodId: np.id });
    addToast(`Período "${label}" criado (estrutura copiada, progresso zerado).`, 'success');
  };
  const removePeriod = () => {
    if (!store || !active || store.periods.length <= 1) return;
    if (!window.confirm(`Excluir o período "${active.label}"?`)) return;
    const rest = store.periods.filter(p => p.id !== active.id);
    persist({ ...store, periods: rest, activePeriodId: rest[0].id });
  };
  const updatePeriodMeta = (patch: Partial<OkrPeriod>) => patchActive(p => ({ ...p, ...patch }));

  const handleShare = async () => {
    if (sharing) return; setSharing(true);
    try {
      const token = await enableOkrShare();
      const link = `${window.location.origin}/?okr=${token}`;
      setShareLink(link);
      try { await navigator.clipboard.writeText(link); addToast('Link copiado! Quem abrir só visualiza.', 'success'); } catch { addToast('Link gerado.', 'success'); }
    } catch { addToast('Não consegui gerar o link.', 'error'); } finally { setSharing(false); }
  };
  const handleExport = () => window.print();

  // ---- métricas de atividade (minhas) ----
  const activity = useMemo(() => {
    const uid = currentUser.id;
    const myProjects = (projects || []).filter(p => p.userId === uid && p.status === 'COMPLETED');
    const myActs = (activities || []).filter(a => a.userId === uid);
    const typeName: Record<string, string> = {}; (activityTypes || []).forEach(t => { typeName[t.id] = t.name; });
    const byType: Record<string, number> = {}; myActs.forEach(a => { const k = typeName[a.activityTypeId] || 'Outros'; byType[k] = (byType[k] || 0) + (a.durationSeconds || 0); });
    const hoursByType = Object.entries(byType).map(([name, s]) => ({ name, horas: +(s / 3600).toFixed(1) })).sort((a, b) => b.horas - a.horas).slice(0, 8);
    const months: { key: string; label: string; n: number }[] = []; const now = new Date();
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('pt-BR', { month: 'short' }), n: 0 }); }
    myProjects.forEach(p => { const d = p.endTime ? new Date(p.endTime) : new Date(p.startTime); const m = months.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`); if (m) m.n++; });
    const totalHoras = myActs.reduce((a, x) => a + (x.durationSeconds || 0), 0) / 3600 + myProjects.reduce((a, x) => a + (x.totalActiveSeconds || 0), 0) / 3600;
    const horasExtra = (myActs.filter(a => a.isOvertime).reduce((a, x) => a + (x.durationSeconds || 0), 0) + myProjects.filter(p => p.isOvertime).reduce((a, x) => a + (x.totalActiveSeconds || 0), 0)) / 3600;
    return { liberacoes: myProjects.length, totalHoras: Math.round(totalHoras), horasExtra: +horasExtra.toFixed(1), hoursByType, libByMonth: months.map(m => ({ name: m.label, liberações: m.n })) };
  }, [projects, activities, activityTypes, currentUser.id]);

  const overall = useMemo(() => periodProgress(active), [active]);
  const objChart = useMemo(() => (active?.objectives || []).map(o => ({ name: o.id, progresso: Math.round(objProgress(o) * 100) })), [active]);
  const krStatusChart = useMemo(() => {
    const krs = (active?.objectives || []).flatMap(o => o.keyResults);
    const b = { 'Concluído': 0, 'Em andamento': 0, 'Em risco': 0, 'Não iniciado': 0 } as Record<string, number>;
    krs.forEach(k => { const p = krProgress(k); if (p >= 1 || k.status === 'Concluído') b['Concluído']++; else if (k.status === 'Em risco') b['Em risco']++; else if (k.status === 'Em andamento' || p > 0) b['Em andamento']++; else b['Não iniciado']++; });
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [active]);
  const pfChart = useMemo(() => { const b: Record<string, number> = {}; (store?.portfolio || []).forEach(i => { b[i.status] = (b[i.status] || 0) + 1; }); return Object.entries(b).map(([name, value]) => ({ name, value })); }, [store]);
  const totals = useMemo(() => { const krs = (active?.objectives || []).flatMap(o => o.keyResults); return { krs: krs.length, done: krs.filter(k => krProgress(k) >= 1 || k.status === 'Concluído').length, risk: krs.filter(k => k.status === 'Em risco').length }; }, [active]);

  if (loading) return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Carregando o OKR…</div>;
  if (!store || !active) return (
    <div className="p-10 text-center text-slate-400">
      {readOnly ? <>Este colaborador ainda não criou o OKR dele.</> : <>Não consegui carregar o OKR.</>}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><Target size={22} /></div>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">{heading}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{store.owner}</p>
            </div>
            {readOnly
              ? <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-1"><Lock size={11} /> Só leitura</span>
              : privacyNote && <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-full px-2 py-1"><Lock size={11} /> {privacyNote}</span>}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className={`text-3xl font-black tabular-nums ${textColor(overall)}`}>{Math.round(overall * 100)}%</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Progresso · {active.label}</div>
            </div>
            <div className="w-14 h-14 rounded-full grid place-items-center" style={{ background: `conic-gradient(currentColor ${overall * 360}deg, rgba(148,163,184,.2) 0deg)` }}>
              <div className={`w-11 h-11 rounded-full bg-white dark:bg-slate-900 grid place-items-center ${textColor(overall)}`}><Flag size={16} /></div>
            </div>
          </div>
        </div>

        {/* Seletor de período + ações */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <CalendarDays size={16} className="text-slate-400" />
          <select value={active.id} onChange={e => switchPeriod(e.target.value)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">
            {store.periods.map(p => <option key={p.id} value={p.id}>{p.label} · {Math.round(periodProgress(p) * 100)}%</option>)}
          </select>
          {!readOnly && <button onClick={addPeriod} className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline no-print"><Plus size={14} /> Novo período</button>}
          {!readOnly && store.periods.length > 1 && <button onClick={removePeriod} className="text-xs text-slate-400 hover:text-rose-500 no-print" title="Excluir período"><Trash2 size={13} /></button>}
          <span className="text-[11px] text-slate-400 ml-1">
            {!readOnly && <><EditField value={active.range} onCommit={v => updatePeriodMeta({ range: v })} placeholder="intervalo…" className="text-[11px] text-slate-400 inline-block max-w-[220px]" /></>}
            {readOnly && active.range}
          </span>

          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ml-auto">{active.objectives.length} obj · {totals.krs} KRs</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">{totals.done} feitos</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">{totals.risk} em risco</span>
          <span className="text-[11px] font-medium text-slate-400">{saving === 'saving' ? 'salvando…' : saving === 'saved' ? 'salvo ✓' : saving === 'error' ? 'erro' : ''}</span>
          {!readOnly && (
            <div className="flex items-center gap-2 no-print">
              <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"><Printer size={14} /> Exportar</button>
              {canShare && <button onClick={handleShare} disabled={sharing} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"><Share2 size={14} /> {sharing ? 'Gerando…' : 'Compartilhar'}</button>}
            </div>
          )}
        </div>
        {shareLink && (
          <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 no-print">
            <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 shrink-0">Link (só leitura):</span>
            <input readOnly value={shareLink} onFocus={e => e.target.select()} className="flex-1 min-w-0 bg-transparent text-xs text-slate-600 dark:text-slate-300 outline-none" />
            <button onClick={() => { navigator.clipboard?.writeText(shareLink); addToast('Copiado!', 'success'); }} className="shrink-0 text-blue-600 dark:text-blue-400"><Copy size={14} /></button>
          </div>
        )}
      </div>

      {/* Painel visual */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Progresso" value={`${Math.round(overall * 100)}%`} color={textColor(overall)} icon={<Flag size={16} />} />
        {!readOnly && <StatTile label="Liberações (minhas)" value={`${activity.liberacoes}`} color="text-blue-600 dark:text-blue-400" icon={<CheckCircle2 size={16} />} />}
        {!readOnly && <StatTile label="Horas no período" value={`${activity.totalHoras}h`} color="text-slate-700 dark:text-slate-200" icon={<Clock size={16} />} />}
        {!readOnly && <StatTile label="Horas extra" value={`${activity.horasExtra}h`} color="text-amber-600 dark:text-amber-400" icon={<ActivityIcon size={16} />} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Progresso por objetivo">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={objChart} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Bar dataKey="progresso" radius={[6, 6, 0, 0]}>{objChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Status dos KRs">
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={krStatusChart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2}>
                {krStatusChart.map((e, i) => <Cell key={i} fill={e.name === 'Concluído' ? '#10b981' : e.name === 'Em andamento' ? '#f59e0b' : e.name === 'Em risco' ? '#ef4444' : '#94a3b8'} />)}
              </Pie><Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Portfólio por status">
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={pfChart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2}>{pfChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
        {!readOnly && (<>
          <ChartCard title="Minhas horas por atividade">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={activity.hoursByType} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={40} /><YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => `${v} h`} /><Bar dataKey="horas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Minhas liberações por mês">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={activity.libByMonth} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="liberações" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>)}
      </div>

      {/* Objetivos (editáveis) */}
      {active.objectives.map(o => {
        const op = objProgress(o);
        return (
          <div key={o.id} className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 grid place-items-center font-black">{o.id}</div>
              <div className="flex-1 min-w-0">
                <EditField value={o.title} onCommit={v => updateObj(o.id, { title: v })} readOnly={readOnly} className="text-base font-bold text-slate-800 dark:text-white leading-snug" placeholder="Objetivo…" />
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${barColor(op)} transition-all duration-500`} style={{ width: `${op * 100}%` }} /></div>
                  <span className={`text-sm font-black tabular-nums ${textColor(op)}`}>{Math.round(op * 100)}%</span>
                </div>
              </div>
              {!readOnly && <button onClick={() => { if (window.confirm(`Excluir o objetivo ${o.id}?`)) removeObjective(o.id); }} className="text-slate-300 hover:text-rose-500 shrink-0" title="Excluir objetivo"><Trash2 size={15} /></button>}
            </div>

            <div className="space-y-3">
              {o.keyResults.map(k => {
                const p = krProgress(k);
                return (
                  <div key={k.id} className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-black text-blue-600 dark:text-blue-400">{k.id}</span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1"><Clock size={11} />
                            {readOnly ? fmtDue(k.due) : <input type="date" defaultValue={k.due} onBlur={e => e.target.value !== k.due && updateKr(o.id, k.id, { due: e.target.value })} className="bg-transparent text-[11px] text-slate-400 outline-none [color-scheme:light] dark:[color-scheme:dark]" />}
                          </span>
                        </div>
                        <EditField value={k.title} onCommit={v => updateKr(o.id, k.id, { title: v })} readOnly={readOnly} multiline className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5 block" placeholder="Resultado-chave…" />
                        <EditField value={k.metric} onCommit={v => updateKr(o.id, k.id, { metric: v })} readOnly={readOnly} className="text-[11px] text-slate-400 mt-0.5 block" placeholder="métrica (ex.: % concluído)" />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-black tabular-nums ${textColor(p)}`}>{Math.round(p * 100)}%</span>
                        {!readOnly && <button onClick={() => removeKr(o.id, k.id)} className="text-slate-300 hover:text-rose-500" title="Excluir KR"><Trash2 size={13} /></button>}
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${barColor(p)} transition-all duration-500`} style={{ width: `${p * 100}%` }} /></div>

                    {/* Edição de progresso */}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Atual</span>
                        {k.format === 'bin' ? (
                          <button disabled={readOnly} onClick={() => updateKr(o.id, k.id, { current: k.current >= 1 ? 0 : 1, status: k.current >= 1 ? 'Em andamento' : 'Concluído' })} className={`px-3 py-1 rounded-lg text-xs font-bold ${k.current >= 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'} ${readOnly ? 'cursor-default' : ''}`}>{k.current >= 1 ? 'Feito' : 'Marcar feito'}</button>
                        ) : k.format === 'pct' ? (
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={100} disabled={readOnly} defaultValue={Math.round(k.current * 100)} onBlur={e => updateKr(o.id, k.id, { current: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) / 100 })} className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" /><span className="text-slate-400 text-sm">%</span>
                          </div>
                        ) : (
                          <input type="number" min={0} disabled={readOnly} defaultValue={k.current} onBlur={e => updateKr(o.id, k.id, { current: Math.max(0, parseFloat(e.target.value) || 0) })} className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                        )}
                        {!readOnly ? (
                          <span className="flex items-center gap-1 text-[11px] text-slate-400">meta <input type="number" disabled={readOnly} defaultValue={k.target} onBlur={e => updateKr(o.id, k.id, { target: parseFloat(e.target.value) || 1 })} className="w-14 px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded text-[11px] outline-none" /></span>
                        ) : <span className="text-[11px] text-slate-400">meta {fmtValue(k.target, k.format)}</span>}
                      </div>
                      {!readOnly && (
                        <select value={k.format} onChange={e => updateKr(o.id, k.id, { format: e.target.value as OkrFormat })} className="px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-[11px] text-slate-500 outline-none [color-scheme:light] dark:[color-scheme:dark]" title="Tipo da métrica">
                          {FORMAT_OPTIONS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
                        </select>
                      )}
                      <select value={k.status} disabled={readOnly} onChange={e => updateKr(o.id, k.id, { status: e.target.value })} className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        {!STATUS_OPTIONS.includes(k.status) && <option value={k.status}>{k.status}</option>}
                      </select>
                    </div>

                    {/* Iniciativas e Observações (editáveis) */}
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Iniciativas</span>
                        <EditField value={k.initiatives} onCommit={v => updateKr(o.id, k.id, { initiatives: v })} readOnly={readOnly} multiline placeholder="—" className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 block" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Observações</span>
                        <EditField value={k.notes || ''} onCommit={v => updateKr(o.id, k.id, { notes: v })} readOnly={readOnly} multiline placeholder="—" className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 block" />
                      </div>
                    </div>

                    <KrTasks kr={k} readOnly={readOnly} onChange={tasks => updateKr(o.id, k.id, { tasks })} />
                  </div>
                );
              })}
              {!readOnly && <button onClick={() => addKr(o.id)} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline mt-1"><Plus size={14} /> Adicionar resultado-chave</button>}
            </div>
          </div>
        );
      })}

      {!readOnly && <button onClick={addObjective} className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"><Plus size={16} /> Adicionar objetivo</button>}

      <PortfolioPanel portfolio={store.portfolio} onChange={pf => persist({ ...store, portfolio: pf })} readOnly={readOnly} />

      {!readOnly && <CheckinsPanel period={active} allKrs={active.objectives.flatMap(o => o.keyResults)} onAdd={c => patchActive(p => ({ ...p, checkins: [c, ...(p.checkins || [])] }))} currentUser={currentUser} />}
    </div>
  );
};

// Checklist de atividades por KR
const KrTasks: React.FC<{ kr: OkrKeyResult; readOnly?: boolean; onChange: (tasks: OkrTask[]) => void }> = ({ kr, readOnly, onChange }) => {
  const [text, setText] = useState('');
  const tasks = kr.tasks || [];
  const add = () => { if (!text.trim()) return; onChange([...tasks, { id: newId(), text: text.trim(), done: false }]); setText(''); };
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Atividades {tasks.length > 0 && `· ${tasks.filter(t => t.done).length}/${tasks.length}`}</span>
      <div className="space-y-1 mt-1.5">
        {tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2 group/task">
            <input type="checkbox" checked={t.done} disabled={readOnly} onChange={() => onChange(tasks.map(x => x.id === t.id ? { ...x, done: !x.done } : x))} className="w-3.5 h-3.5 accent-blue-600 shrink-0" />
            <span className={`text-xs flex-1 min-w-0 ${t.done ? 'line-through text-slate-400' : 'text-slate-600 dark:text-slate-300'}`}>{t.text}</span>
            {!readOnly && <button onClick={() => onChange(tasks.filter(x => x.id !== t.id))} className="opacity-0 group-hover/task:opacity-100 text-slate-300 hover:text-rose-500 shrink-0 transition-all"><Trash2 size={12} /></button>}
          </div>
        ))}
        {tasks.length === 0 && <p className="text-[11px] text-slate-400 italic">Nenhuma atividade cadastrada.</p>}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-2 mt-2">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="+ nova atividade / entrega" className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
          <button onClick={add} className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1.5 rounded-lg"><Plus size={14} /></button>
        </div>
      )}
    </div>
  );
};

const PF_STATUS = ['Concluído', 'Produção', 'Desenvolvimento', 'Protótipo', 'Ferramenta', 'Pausado'];
const statusStyle = (s: string) => s === 'Produção' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : s === 'Concluído' ? 'bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400' : s === 'Desenvolvimento' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : s === 'Ferramenta' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : s === 'Pausado' ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
const statusDot = (s: string) => s === 'Produção' ? 'bg-emerald-500' : s === 'Concluído' ? 'bg-teal-500' : s === 'Desenvolvimento' ? 'bg-amber-500' : s === 'Ferramenta' ? 'bg-blue-500' : s === 'Pausado' ? 'bg-rose-500' : 'bg-slate-400';

// Seletor de status legível (pílula colorida fechada; menu com texto escuro).
const StatusDropdown: React.FC<{ value: string; onChange: (v: string) => void; readOnly?: boolean }> = ({ value, onChange, readOnly }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  if (readOnly) return <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${statusStyle(value)}`}><span className={`w-1.5 h-1.5 rounded-full ${statusDot(value)}`} />{value}</span>;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${statusStyle(value)}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${statusDot(value)}`} />{value}<ChevronDown size={12} className="opacity-70" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 left-0 w-44 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-1">
          {PF_STATUS.map(s => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${s === value ? 'bg-slate-50 dark:bg-slate-700/60' : ''}`}>
              <span className={`w-2 h-2 rounded-full ${statusDot(s)}`} />{s}{s === value && <CheckCircle2 size={13} className="ml-auto text-blue-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const PortfolioPanel: React.FC<{ portfolio: PortfolioItem[]; onChange: (pf: PortfolioItem[]) => void; readOnly?: boolean }> = ({ portfolio, onChange, readOnly }) => {
  const items = portfolio || [];
  const update = (id: string, patch: Partial<PortfolioItem>) => onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const add = () => onChange([...items, { id: `p${Date.now().toString(36)}`, name: 'Novo projeto', what: '', category: 'Sistemas', status: 'Desenvolvimento', nextMilestone: '' }]);
  const prod = items.filter(i => i.status === 'Produção').length;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2"><Layers size={18} className="text-blue-600" /> Portfólio de Inovação</h3>
        {!readOnly && <button onClick={add} className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"><Plus size={14} /> Adicionar</button>}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Os projetos/apps que você construiu (é o KR1.2). {items.length} projetos · {prod} em produção.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {items.map(i => (
          <div key={i.id} className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30 p-4 group">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <EditField value={i.name} onCommit={v => update(i.id, { name: v })} readOnly={readOnly} className="text-sm font-bold text-slate-800 dark:text-white block" placeholder="Nome" />
                <EditField value={i.what} onCommit={v => update(i.id, { what: v })} readOnly={readOnly} className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block" placeholder="o que é" />
              </div>
              {!readOnly && <button onClick={() => remove(i.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 shrink-0 transition-all"><Trash2 size={14} /></button>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <StatusDropdown value={i.status} readOnly={readOnly} onChange={v => update(i.id, { status: v })} />
              <span className="text-[10px] text-slate-400">{i.category}</span>
            </div>
            <div className="mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Próximo marco</span>
              <EditField value={i.nextMilestone} onCommit={v => update(i.id, { nextMilestone: v })} readOnly={readOnly} placeholder="—" className="text-xs text-slate-700 dark:text-white mt-0.5 block" />
            </div>
            <div className="mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1"><Link2 size={11} /> Link</span>
              {readOnly ? (
                i.url
                  ? <a href={/^https?:\/\//.test(i.url) ? i.url : `https://${i.url}`} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5 inline-flex items-center gap-1 break-all">{i.url.replace(/^https?:\/\//, '')} <ExternalLink size={11} /></a>
                  : <span className="text-xs text-slate-400 mt-0.5 block">—</span>
              ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <EditField value={i.url || ''} onCommit={v => update(i.id, { url: v.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || undefined })} readOnly={false} placeholder="cole o endereço (ex.: cmms.jimpnexus.com)" className="text-xs text-blue-600 dark:text-blue-400 block flex-1 min-w-0" />
                  {i.url && <a href={/^https?:\/\//.test(i.url) ? i.url : `https://${i.url}`} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600 shrink-0" title="Abrir"><ExternalLink size={13} /></a>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CheckinsPanel: React.FC<{ period: OkrPeriod; allKrs: OkrKeyResult[]; onAdd: (c: OkrCheckin) => void; currentUser: User }> = ({ period, allKrs, onAdd, currentUser }) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [kr, setKr] = useState(allKrs[0]?.id || '');
  const [comment, setComment] = useState('');
  const [next, setNext] = useState('');
  const add = () => {
    if (!comment.trim()) return;
    const krObj = allKrs.find(k => k.id === kr);
    const entry: OkrCheckin = { id: newId(), date, kr, current: krObj?.current ?? 0, comment: comment.trim(), next: next.trim() };
    onAdd(entry);
    try { addAuditLog({ userId: currentUser.id, userName: currentUser.name, action: 'CREATE', entityType: 'OKR_CHECKIN', entityId: entry.id, entityName: kr, details: `Check-in OKR ${kr} (${date}) por ${currentUser.name}` }); } catch {}
    setComment(''); setNext('');
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700 no-print">
      <h3 className="text-base font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><CheckCircle2 size={18} className="text-blue-600" /> Check-ins · {period.label}</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
        <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]" />
        <select value={kr} onChange={e => setKr(e.target.value)} className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">{allKrs.map(k => <option key={k.id} value={k.id}>{k.id}</option>)}</select>
        <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentário / decisão" className="md:col-span-2 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={next} onChange={e => setNext(e.target.value)} placeholder="Próximo passo (opcional)" className="md:col-span-3 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={add} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold"><Plus size={16} /> Registrar</button>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {(period.checkins || []).length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sem check-ins ainda.</p>}
        {(period.checkins || []).map(c => (
          <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/40 border border-gray-100 dark:border-slate-800">
            <span className="text-[11px] font-black text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">{c.kr}</span>
            <div className="min-w-0 flex-1"><p className="text-sm text-slate-700 dark:text-slate-200">{c.comment}</p>{c.next && <p className="text-[11px] text-slate-400 mt-0.5"><AlertTriangle size={10} className="inline mr-1" />Próximo: {c.next}</p>}</div>
            <span className="text-[11px] text-slate-400 shrink-0">{fmtDue(c.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Página pública (sem login): abre o OKR pelo token do link, somente leitura.
export const OkrPublicPage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<OkrStore | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => { (async () => { const d = await fetchPublicOkr(token); if (d && d.periods?.length) { setData(d); setState('ok'); } else setState('error'); })(); }, [token]);
  if (state === 'loading') return <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-slate-950 text-slate-400"><RefreshCw className="animate-spin" size={20} /></div>;
  if (state === 'error' || !data) return <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-slate-950 text-slate-500 p-6 text-center">Link inválido ou indisponível.</div>;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <OkrView external={data} readOnly currentUser={{ id: '', name: data.owner } as User} />
        <p className="text-center text-[11px] text-slate-400 mt-6">Visualização somente leitura · JimpNexus</p>
      </div>
    </div>
  );
};
