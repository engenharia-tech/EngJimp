import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Target, RefreshCw, Layers, Users as UsersIcon, CheckCircle2, TrendingUp, Lock } from 'lucide-react';
import { User } from '../types';
import { fetchAllOkr } from '../services/storageService';
import { OkrStore, OkrPeriod, krProgress } from './okr';

// Progresso do período ativo de um OKR (média dos KRs).
const periodProgress = (p?: OkrPeriod) => {
  const krs = (p?.objectives || []).flatMap(o => o.keyResults).filter(k => !k.archived);
  return krs.length ? krs.reduce((a, k) => a + krProgress(k), 0) / krs.length : 0;
};
const activePeriod = (s: OkrStore) => s.periods.find(p => p.id === s.activePeriodId) || s.periods[0];
const barColor = (p: number) => p >= 0.7 ? '#10b981' : p >= 0.3 ? '#f59e0b' : '#ef4444';
const textColor = (p: number) => p >= 0.7 ? 'text-emerald-600 dark:text-emerald-400' : p >= 0.3 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';

const Tile: React.FC<{ label: string; value: string; color?: string; icon: React.ReactNode }> = ({ label, value, color, icon }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700">
    <div className="flex items-center gap-1.5 text-slate-400 mb-1">{icon}<span className="text-[10px] font-bold uppercase tracking-wide">{label}</span></div>
    <div className={`text-2xl font-black tabular-nums ${color || 'text-slate-800 dark:text-white'}`}>{value}</div>
  </div>
);

interface Props { currentUser: User; users: User[]; }

// Visão macro do OKR por setor — só Edson e CEO. Não edita nada, só lê.
export const OkrIndicators: React.FC<Props> = ({ users }) => {
  const [rows, setRows] = useState<{ ownerKey: string; store: OkrStore }[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => { setLoading(true); try { setRows(await fetchAllOkr()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  // owner_key (username minúsculo) -> usuário
  const byKey = useMemo(() => {
    const m: Record<string, User> = {};
    (users || []).forEach(u => { m[(u.username || '').trim().toLowerCase()] = u; });
    return m;
  }, [users]);

  const people = useMemo(() => {
    return (rows || []).map(r => {
      const u = byKey[r.ownerKey];
      const ap = activePeriod(r.store);
      const krs = (ap?.objectives || []).flatMap(o => o.keyResults).filter(k => !k.archived);
      const done = krs.filter(k => krProgress(k) >= 1 || k.status === 'Concluído').length;
      const risk = krs.filter(k => k.status === 'Em risco').length;
      return {
        ownerKey: r.ownerKey,
        name: u?.name || r.store.owner || r.ownerKey,
        sector: (u?.sector || '').trim() || '—',
        progress: periodProgress(ap),
        krs: krs.length, done, risk,
      };
    }).sort((a, b) => a.sector.localeCompare(b.sector) || a.name.localeCompare(b.name));
  }, [rows, byKey]);

  // Agrupado por setor (só setores nomeados; "—" fica de fora do gráfico).
  const bySector = useMemo(() => {
    const g: Record<string, { sector: string; progresso: number; n: number; krs: number; done: number }> = {};
    people.forEach(p => {
      if (p.sector === '—') return;
      const s = g[p.sector] || (g[p.sector] = { sector: p.sector, progresso: 0, n: 0, krs: 0, done: 0 });
      s.progresso += p.progress; s.n += 1; s.krs += p.krs; s.done += p.done;
    });
    return Object.values(g).map(s => ({ ...s, progresso: s.n ? s.progresso / s.n : 0 }))
      .sort((a, b) => b.progresso - a.progresso);
  }, [people]);

  const chart = useMemo(() => bySector.map(s => ({ name: s.sector, valor: Math.round(s.progresso * 100) })), [bySector]);
  const overall = useMemo(() => people.length ? people.reduce((a, p) => a + p.progress, 0) / people.length : 0, [people]);
  const totKrs = people.reduce((a, p) => a + p.krs, 0);
  const totDone = people.reduce((a, p) => a + p.done, 0);

  if (loading) return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Carregando indicadores…</div>;

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><TrendingUp size={22} /></div>
            <div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Indicadores de OKR</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Visão macro por setor · {people.length} pessoas com OKR</p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-1"><Lock size={11} /> Só você e a diretoria</span>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-black tabular-nums ${textColor(overall)}`}>{Math.round(overall * 100)}%</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Progresso médio geral</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Setores com OKR" value={`${bySector.length}`} icon={<Layers size={14} />} color="text-blue-600 dark:text-blue-400" />
        <Tile label="Pessoas com OKR" value={`${people.length}`} icon={<UsersIcon size={14} />} />
        <Tile label="KRs concluídos" value={`${totDone}/${totKrs}`} icon={<CheckCircle2 size={14} />} color="text-emerald-600 dark:text-emerald-400" />
        <Tile label="Progresso médio" value={`${Math.round(overall * 100)}%`} icon={<Target size={14} />} color={textColor(overall)} />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Progresso médio por setor</h4>
        {chart.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">Ainda não há setores com OKR cadastrado.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, chart.length * 46)}>
            <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Bar dataKey="valor" radius={[0, 6, 6, 0]} label={{ position: 'right', formatter: (v: any) => `${v}%`, fontSize: 11 }}>
                {chart.map((c, i) => <Cell key={i} fill={barColor(c.valor / 100)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Detalhe por pessoa</h4>
          <button onClick={load} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"><RefreshCw size={12} /> Atualizar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-semibold px-5 py-2.5">Setor</th>
                <th className="text-left font-semibold px-5 py-2.5">Pessoa</th>
                <th className="text-left font-semibold px-5 py-2.5 w-[38%]">Progresso</th>
                <th className="text-center font-semibold px-5 py-2.5">KRs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {people.map(p => (
                <tr key={p.ownerKey} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{p.sector}</span></td>
                  <td className="px-5 py-3 font-semibold text-slate-800 dark:text-white">{p.name}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.round(p.progress * 100)}%`, background: barColor(p.progress) }} />
                      </div>
                      <span className={`text-xs font-bold tabular-nums w-9 text-right ${textColor(p.progress)}`}>{Math.round(p.progress * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-center text-slate-600 dark:text-slate-300 tabular-nums">
                    {p.done}/{p.krs}{p.risk > 0 && <span className="text-rose-500 font-semibold"> · {p.risk} risco</span>}
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">Nenhum OKR cadastrado ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 px-1">Somente leitura. Cada pessoa edita o próprio OKR; aqui você acompanha o andamento por setor.</p>
    </div>
  );
};
