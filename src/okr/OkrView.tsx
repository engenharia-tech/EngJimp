import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Target, Flag, CheckCircle2, AlertTriangle, Clock, Plus, Lock, RefreshCw, Layers, Trash2, Share2, Printer, Activity as ActivityIcon, Copy } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid, Legend } from 'recharts';
import { User, ProjectSession, OperationalActivity, ActivityType } from '../types';
import { fetchOkr, saveOkr, addAuditLog, enableOkrShare, fetchPublicOkr } from '../services/storageService';
import {
  OkrData, OkrKeyResult, OkrObjective, OkrCheckin, PortfolioItem,
  DEFAULT_OKR, DEFAULT_PORTFOLIO, krProgress, objProgress, overallProgress, progressColor, fmtValue,
} from './okr';
import { useToast } from '../components/Toast';

const STATUS_OPTIONS = ['Não iniciado', 'Em andamento', 'Em risco', 'Concluído'];

const barColor = (p: number) => {
  const c = progressColor(p);
  return c === 'green' ? 'bg-emerald-500' : c === 'amber' ? 'bg-amber-500' : 'bg-rose-500';
};
const textColor = (p: number) => {
  const c = progressColor(p);
  return c === 'green' ? 'text-emerald-600 dark:text-emerald-400' : c === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
};

const fmtDue = (iso: string) => {
  try { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; } catch { return iso; }
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
  readOnly?: boolean;   // modo público (link externo): sem edição
  external?: OkrData;   // dados vindos do link público (não busca no supabase)
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'];

export const OkrView: React.FC<OkrViewProps> = ({ currentUser, projects = [], activities = [], activityTypes = [], readOnly = false, external }) => {
  const { addToast } = useToast();
  const [okr, setOkr] = useState<OkrData | null>(external || null);
  const [loading, setLoading] = useState(!external);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [shareLink, setShareLink] = useState<string>('');
  const [sharing, setSharing] = useState(false);

  // Métricas de atividade (só as MINHAS, do Desempenho Operacional).
  const activity = useMemo(() => {
    const uid = currentUser.id;
    const myProjects = (projects || []).filter(p => p.userId === uid && p.status === 'COMPLETED');
    const myActs = (activities || []).filter(a => a.userId === uid);
    const typeName: Record<string, string> = {};
    (activityTypes || []).forEach(t => { typeName[t.id] = t.name; });

    // Horas por tipo de atividade
    const byType: Record<string, number> = {};
    myActs.forEach(a => { const k = typeName[a.activityTypeId] || 'Outros'; byType[k] = (byType[k] || 0) + (a.durationSeconds || 0); });
    const hoursByType = Object.entries(byType).map(([name, s]) => ({ name, horas: +(s / 3600).toFixed(1) })).sort((a, b) => b.horas - a.horas).slice(0, 8);

    // Liberações (projetos concluídos) por mês — últimos 6 meses
    const months: { key: string, label: string, n: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('pt-BR', { month: 'short' }), n: 0 });
    }
    myProjects.forEach(p => {
      const d = p.endTime ? new Date(p.endTime) : new Date(p.startTime);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const m = months.find(x => x.key === k); if (m) m.n++;
    });

    const totalHoras = myActs.reduce((a, x) => a + (x.durationSeconds || 0), 0) / 3600 + myProjects.reduce((a, x) => a + (x.totalActiveSeconds || 0), 0) / 3600;
    const horasExtra = (myActs.filter(a => a.isOvertime).reduce((a, x) => a + (x.durationSeconds || 0), 0) + myProjects.filter(p => p.isOvertime).reduce((a, x) => a + (x.totalActiveSeconds || 0), 0)) / 3600;

    return {
      liberacoes: myProjects.length,
      totalHoras: Math.round(totalHoras),
      horasExtra: +horasExtra.toFixed(1),
      hoursByType,
      libByMonth: months.map(m => ({ name: m.label, liberações: m.n })),
    };
  }, [projects, activities, activityTypes, currentUser.id]);

  // Carrega; se ainda não existe no banco, semeia com o OKR do xlsx.
  useEffect(() => {
    if (external) { setOkr(external); setLoading(false); return; } // modo público
    (async () => {
      setLoading(true);
      try {
        const data = await fetchOkr();
        if (data && data.objectives?.length) {
          if (!data.portfolio || data.portfolio.length === 0) data.portfolio = DEFAULT_PORTFOLIO;
          if (!data.checkins) data.checkins = [];
          setOkr(data);
        } else {
          setOkr(DEFAULT_OKR);
          try { await saveOkr(DEFAULT_OKR); } catch { /* semeia na 1a edição se falhar */ }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(async (next: OkrData) => {
    if (readOnly) return; // link público: sem edição, no-op total
    setOkr(next);
    setSaving('saving');
    try {
      await saveOkr(next);
      setSaving('saved');
      setTimeout(() => setSaving('idle'), 1500);
    } catch (e) {
      console.error('saveOkr', e);
      setSaving('error');
      addToast('Não consegui salvar o OKR.', 'error');
    }
  }, [addToast]);

  const updateKr = (objId: string, krId: string, patch: Partial<OkrKeyResult>) => {
    if (!okr) return;
    const next: OkrData = {
      ...okr,
      objectives: okr.objectives.map(o => o.id !== objId ? o : {
        ...o,
        keyResults: o.keyResults.map(k => k.id !== krId ? k : { ...k, ...patch }),
      }),
    };
    persist(next);
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const token = await enableOkrShare();
      const link = `${window.location.origin}/?okr=${token}`;
      setShareLink(link);
      try { await navigator.clipboard.writeText(link); addToast('Link copiado! Quem abrir só visualiza (sem editar).', 'success'); }
      catch { addToast('Link gerado (somente leitura).', 'success'); }
    } catch (e) {
      console.error(e);
      addToast('Não consegui gerar o link de compartilhamento.', 'error');
    } finally { setSharing(false); }
  };
  const handleExport = () => window.print();

  const overall = useMemo(() => okr ? overallProgress(okr) : 0, [okr]);
  // Dados dos gráficos do OKR.
  const objChart = useMemo(() => (okr?.objectives || []).map(o => ({ name: o.id, progresso: Math.round(objProgress(o) * 100) })), [okr]);
  const krStatusChart = useMemo(() => {
    const krs = (okr?.objectives || []).flatMap(o => o.keyResults);
    const b = { 'Concluído': 0, 'Em andamento': 0, 'Em risco': 0, 'Não iniciado': 0 } as Record<string, number>;
    krs.forEach(k => {
      const p = krProgress(k);
      if (p >= 1 || k.status === 'Concluído') b['Concluído']++;
      else if (k.status === 'Em risco') b['Em risco']++;
      else if (k.status === 'Em andamento' || p > 0) b['Em andamento']++;
      else b['Não iniciado']++;
    });
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [okr]);
  const pfChart = useMemo(() => {
    const b: Record<string, number> = {};
    (okr?.portfolio || []).forEach(i => { b[i.status] = (b[i.status] || 0) + 1; });
    return Object.entries(b).map(([name, value]) => ({ name, value }));
  }, [okr]);
  const totals = useMemo(() => {
    if (!okr) return { krs: 0, done: 0, risk: 0 };
    const krs = okr.objectives.flatMap(o => o.keyResults);
    return {
      krs: krs.length,
      done: krs.filter(k => krProgress(k) >= 1 || k.status === 'Concluído').length,
      risk: krs.filter(k => k.status === 'Em risco' || (krProgress(k) < 0.3 && k.status !== 'Não iniciado')).length,
    };
  }, [okr]);

  if (loading) {
    return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Carregando seu OKR…</div>;
  }
  if (!okr) return <div className="p-10 text-center text-slate-400">Não consegui carregar o OKR.</div>;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><Target size={22} /></div>
            <div className="min-w-0">
              <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Meu OKR</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{okr.owner} · {okr.period}</p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-full px-2 py-1"><Lock size={11} /> Só você vê</span>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className={`text-3xl font-black tabular-nums ${textColor(overall)}`}>{Math.round(overall * 100)}%</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Progresso geral</div>
            </div>
            <div className="w-14 h-14 rounded-full grid place-items-center" style={{ background: `conic-gradient(currentColor ${overall * 360}deg, rgba(148,163,184,.2) 0deg)` }}>
              <div className={`w-11 h-11 rounded-full bg-white dark:bg-slate-900 grid place-items-center ${textColor(overall)}`}>
                <Flag size={16} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{okr.objectives.length} objetivos · {totals.krs} KRs</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">{totals.done} concluídos</span>
          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">{totals.risk} em risco</span>
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-full text-slate-400">
            {saving === 'saving' ? 'salvando…' : saving === 'saved' ? 'salvo ✓' : saving === 'error' ? 'erro ao salvar' : `atualizado ${okr.updatedAt ? new Date(okr.updatedAt).toLocaleString('pt-BR') : ''}`}
          </span>
          {!readOnly && (
            <div className="ml-auto flex items-center gap-2 no-print">
              <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"><Printer size={14} /> Exportar PDF</button>
              <button onClick={handleShare} disabled={sharing} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"><Share2 size={14} /> {sharing ? 'Gerando…' : 'Compartilhar'}</button>
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
        <StatTile label="Progresso geral" value={`${Math.round(overall * 100)}%`} color={textColor(overall)} icon={<Flag size={16} />} />
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
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Portfólio por status">
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={pfChart} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72} paddingAngle={2}>
                {pfChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
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
              <Tooltip formatter={(v: any) => `${v} h`} />
              <Bar dataKey="horas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Minhas liberações por mês">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={activity.libByMonth} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="liberações" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        </>)}
      </div>

      {/* Objetivos */}
      {okr.objectives.map(o => {
        const op = objProgress(o);
        return (
          <div key={o.id} className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 grid place-items-center font-black">{o.id}</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-800 dark:text-white leading-snug">{o.title}</h3>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor(op)} transition-all duration-500`} style={{ width: `${op * 100}%` }} />
                  </div>
                  <span className={`text-sm font-black tabular-nums ${textColor(op)}`}>{Math.round(op * 100)}%</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {o.keyResults.map(k => {
                const p = krProgress(k);
                return (
                  <div key={k.id} className="rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-black text-blue-600 dark:text-blue-400">{k.id}</span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1"><Clock size={11} /> {fmtDue(k.due)}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{k.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{k.metric}</p>
                      </div>
                      <span className={`shrink-0 text-sm font-black tabular-nums ${textColor(p)}`}>{Math.round(p * 100)}%</span>
                    </div>

                    <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${barColor(p)} transition-all duration-500`} style={{ width: `${p * 100}%` }} />
                    </div>

                    {/* Edição do Atual + Status */}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">Atual</span>
                        {k.format === 'bin' ? (
                          <button
                            onClick={() => updateKr(o.id, k.id, { current: k.current >= 1 ? 0 : 1, status: k.current >= 1 ? 'Em andamento' : 'Concluído' })}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${k.current >= 1 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                          >
                            {k.current >= 1 ? 'Feito' : 'Marcar feito'}
                          </button>
                        ) : k.format === 'pct' ? (
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={100} defaultValue={Math.round(k.current * 100)}
                              onBlur={e => { const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)); updateKr(o.id, k.id, { current: v / 100 }); }}
                              className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                            <span className="text-slate-400 text-sm">%</span>
                          </div>
                        ) : (
                          <input type="number" min={0} max={k.target} defaultValue={k.current}
                            onBlur={e => { const v = Math.max(0, parseFloat(e.target.value) || 0); updateKr(o.id, k.id, { current: v }); }}
                            className="w-20 px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                        )}
                        <span className="text-[11px] text-slate-400">meta {fmtValue(k.target, k.format)}</span>
                      </div>

                      <select value={k.status} onChange={e => updateKr(o.id, k.id, { status: e.target.value })}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        {!STATUS_OPTIONS.includes(k.status) && <option value={k.status}>{k.status}</option>}
                      </select>
                    </div>

                    {(k.initiatives || k.notes) && (
                      <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
                        {k.initiatives && <p><b className="text-slate-500 dark:text-slate-400">Iniciativas:</b> {k.initiatives}</p>}
                        {k.notes && <p className="italic">{k.notes}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Portfólio de inovação (KR1.2) */}
      <PortfolioPanel okr={okr} persist={persist} readOnly={readOnly} />

      {/* Check-ins (só no modo interno) */}
      {!readOnly && <CheckinsPanel okr={okr} persist={persist} currentUser={currentUser} />}
    </div>
  );
};

// Página pública (sem login): abre o OKR pelo token do link, somente leitura.
export const OkrPublicPage: React.FC<{ token: string }> = ({ token }) => {
  const [data, setData] = useState<OkrData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    (async () => {
      const d = await fetchPublicOkr(token);
      if (d && (d as any).objectives) { setData(d); setState('ok'); } else setState('error');
    })();
  }, [token]);
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

const PF_STATUS = ['Produção', 'Desenvolvimento', 'Protótipo', 'Ferramenta', 'Pausado'];
const statusStyle = (s: string) =>
  s === 'Produção' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
  : s === 'Desenvolvimento' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
  : s === 'Ferramenta' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
  : s === 'Pausado' ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

const PortfolioPanel: React.FC<{ okr: OkrData; persist: (d: OkrData) => Promise<void>; readOnly?: boolean }> = ({ okr, persist, readOnly }) => {
  const items = okr.portfolio || [];
  const update = (id: string, patch: Partial<PortfolioItem>) => {
    persist({ ...okr, portfolio: items.map(i => i.id === id ? { ...i, ...patch } : i) });
  };
  const remove = (id: string) => persist({ ...okr, portfolio: items.filter(i => i.id !== id) });
  const add = () => {
    const id = `p${Date.now().toString(36)}`;
    persist({ ...okr, portfolio: [...items, { id, name: 'Novo projeto', what: '', category: 'Sistemas', status: 'Desenvolvimento', nextMilestone: '' }] });
  };
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
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 dark:text-white">{i.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{i.what}</p>
                {i.url && <a href={`https://${i.url}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline">{i.url}</a>}
              </div>
              {!readOnly && <button onClick={() => remove(i.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all shrink-0" title="Remover"><Trash2 size={14} /></button>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <select value={i.status} onChange={e => update(i.id, { status: e.target.value })}
                className={`text-[11px] font-bold px-2 py-1 rounded-full border-0 outline-none cursor-pointer ${statusStyle(i.status)}`}>
                {PF_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                {!PF_STATUS.includes(i.status) && <option value={i.status}>{i.status}</option>}
              </select>
              <span className="text-[10px] text-slate-400">{i.category}</span>
            </div>
            <div className="mt-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Próximo marco</span>
              <input defaultValue={i.nextMilestone} onBlur={e => update(i.id, { nextMilestone: e.target.value })} placeholder="—"
                className="w-full mt-0.5 px-2 py-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CheckinsPanel: React.FC<{ okr: OkrData; persist: (d: OkrData) => Promise<void>; currentUser: User }> = ({ okr, persist, currentUser }) => {
  const allKrs = okr.objectives.flatMap(o => o.keyResults);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [kr, setKr] = useState(allKrs[0]?.id || '');
  const [comment, setComment] = useState('');
  const [next, setNext] = useState('');

  const add = () => {
    if (!comment.trim()) return;
    const krObj = allKrs.find(k => k.id === kr);
    const entry: OkrCheckin = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}`,
      date, kr, current: krObj?.current ?? 0, comment: comment.trim(), next: next.trim(),
    };
    persist({ ...okr, checkins: [entry, ...(okr.checkins || [])] });
    try {
      addAuditLog({ userId: currentUser.id, userName: currentUser.name, action: 'CREATE', entityType: 'OKR_CHECKIN', entityId: entry.id, entityName: kr, details: `Check-in OKR ${kr} (${date}) por ${currentUser.name}` });
    } catch { /* silencioso */ }
    setComment(''); setNext('');
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
      <h3 className="text-base font-bold text-slate-800 dark:text-white mb-3 flex items-center gap-2"><CheckCircle2 size={18} className="text-blue-600" /> Check-ins</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
        <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)}
          className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]" />
        <select value={kr} onChange={e => setKr(e.target.value)}
          className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">
          {allKrs.map(k => <option key={k.id} value={k.id}>{k.id}</option>)}
        </select>
        <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentário / decisão"
          className="md:col-span-2 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
        <input value={next} onChange={e => setNext(e.target.value)} placeholder="Próximo passo (opcional)"
          className="md:col-span-3 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
        <button onClick={add} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors"><Plus size={16} /> Registrar</button>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {(okr.checkins || []).length === 0 && <p className="text-sm text-slate-400 text-center py-4">Sem check-ins ainda.</p>}
        {(okr.checkins || []).map(c => (
          <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/40 border border-gray-100 dark:border-slate-800">
            <span className="text-[11px] font-black text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">{c.kr}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-700 dark:text-slate-200">{c.comment}</p>
              {c.next && <p className="text-[11px] text-slate-400 mt-0.5"><AlertTriangle size={10} className="inline mr-1" />Próximo: {c.next}</p>}
            </div>
            <span className="text-[11px] text-slate-400 shrink-0">{fmtDue(c.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
