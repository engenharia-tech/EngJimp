import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, RefreshCw, Clock } from 'lucide-react';
import { User } from '../types';
import { fetchAllOkr } from '../services/storageService';
import { OkrStore, krProgress } from './okr';

const activePeriod = (s: OkrStore) => s.periods.find(p => p.id === s.activePeriodId) || s.periods[0];
const parse = (iso?: string): Date | null => { if (!iso) return null; const d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : '')); return isNaN(d.getTime()) ? null : d; };
const barColor = (p: number, status: string) => status === 'Em risco' ? '#ef4444' : p >= 0.7 ? '#10b981' : p >= 0.3 ? '#f59e0b' : '#3b82f6';
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const monthLabel = (mk: number) => new Date(Math.floor(mk / 12), mk % 12, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

interface Bar { ownerKey: string; person: string; sector: string; krId: string; title: string; s: Date; e: Date; progress: number; status: string; }

interface Props { currentUser: User; users: User[]; }

export const OkrTimeline: React.FC<Props> = ({ users }) => {
  const [rows, setRows] = useState<{ ownerKey: string; store: OkrStore }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const load = async () => { setLoading(true); try { setRows(await fetchAllOkr()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const byKey = useMemo(() => { const m: Record<string, User> = {}; (users || []).forEach(u => { m[(u.username || '').trim().toLowerCase()] = u; }); return m; }, [users]);

  const { bars, semData, mkStart, mkEnd } = useMemo(() => {
    const bars: Bar[] = []; const semData: { person: string; krId: string; title: string }[] = [];
    (rows || []).forEach(r => {
      const u = byKey[r.ownerKey]; const person = u?.name || r.store.owner || r.ownerKey; const sector = (u?.sector || '').trim();
      const ap = activePeriod(r.store);
      (ap?.objectives || []).forEach(o => o.keyResults.forEach(k => {
        if (k.archived) return;
        const s0 = parse((k as any).start); const e0 = parse(k.due);
        const s = s0 || e0; const e = e0 || s0;
        if (!s || !e) { semData.push({ person, krId: k.id, title: k.title }); return; }
        const a = s <= e ? s : e; const b = s <= e ? e : s;
        bars.push({ ownerKey: r.ownerKey, person, sector, krId: k.id, title: k.title, s: a, e: b, progress: krProgress(k), status: String(k.status) });
      }));
    });
    if (bars.length === 0) return { bars, semData, mkStart: 0, mkEnd: 0 };
    let mkStart = Infinity, mkEnd = -Infinity;
    bars.forEach(bar => { mkStart = Math.min(mkStart, monthKey(bar.s)); mkEnd = Math.max(mkEnd, monthKey(bar.e)); });
    return { bars, semData, mkStart, mkEnd };
  }, [rows, byKey]);

  const months = useMemo(() => { const arr: number[] = []; for (let m = mkStart; m <= mkEnd; m++) arr.push(m); return arr; }, [mkStart, mkEnd]);
  // posição 0..1 de uma data no eixo (por mês, fração pelo dia)
  const pos = (d: Date) => { const total = (mkEnd - mkStart) + 1; if (total <= 0) return 0; const within = (monthKey(d) - mkStart) + (d.getDate() - 1) / 30; return Math.max(0, Math.min(1, within / total)); };

  // agrupado por pessoa (ordem por setor/nome)
  const groups = useMemo(() => {
    const g: Record<string, Bar[]> = {};
    bars.forEach(b => { (g[b.person] = g[b.person] || []).push(b); });
    return Object.entries(g).map(([person, list]) => ({ person, sector: list[0].sector, list: list.sort((a, b) => a.s.getTime() - b.s.getTime()) }))
      .sort((a, b) => (a.sector || 'zz').localeCompare(b.sector || 'zz') || a.person.localeCompare(b.person));
  }, [bars]);

  if (loading) return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Carregando a linha do tempo…</div>;

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><CalendarRange size={22} /></div>
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Linha do tempo dos KRs</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Quando cada resultado-chave começa e termina · {bars.length} KRs com período</p>
          </div>
        </div>
        <button onClick={load} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"><RefreshCw size={12} /> Atualizar</button>
      </div>

      {bars.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 shadow-sm border border-gray-200 dark:border-slate-700 text-center text-slate-400">
          <Clock size={28} className="mx-auto mb-3 opacity-50" />
          Nenhum KR tem período (início/fim) definido ainda. Preencha as datas nos KRs para vê-los aqui.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700 overflow-x-auto">
          <div className="min-w-[720px]">
            {/* eixo de meses */}
            <div className="flex items-center border-b border-gray-100 dark:border-slate-800 pb-2 mb-2">
              <div className="w-56 shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Resultado-chave</div>
              <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                {months.map(m => <div key={m} className="text-[10px] font-bold text-slate-400 uppercase text-center border-l border-gray-100 dark:border-slate-800">{monthLabel(m)}</div>)}
              </div>
            </div>
            {groups.map(gr => (
              <div key={gr.person} className="mb-1">
                <div className="flex items-center gap-2 py-1.5">
                  <span className="text-xs font-black text-slate-700 dark:text-slate-200">{gr.person}</span>
                  {gr.sector && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{gr.sector}</span>}
                </div>
                {gr.list.map(b => {
                  const left = pos(b.s) * 100; const right = pos(b.e) * 100; const width = Math.max(2, right - left);
                  return (
                    <div key={b.krId + b.title} className="flex items-center py-1">
                      <div className="w-56 shrink-0 pr-2 truncate text-[11px] text-slate-600 dark:text-slate-300"><span className="font-bold text-blue-600 dark:text-blue-400 mr-1">{b.krId}</span>{b.title}</div>
                      <div className="flex-1 relative h-5">
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                          {months.map(m => <div key={m} className="border-l border-gray-100 dark:border-slate-800" />)}
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full flex items-center px-2" style={{ left: `${left}%`, width: `${width}%`, background: barColor(b.progress, b.status) }} title={`${b.krId} · ${Math.round(b.progress * 100)}% · ${b.status}`}>
                          <span className="text-[9px] font-bold text-white/90 tabular-nums truncate">{Math.round(b.progress * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {semData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
          <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Sem período definido ({semData.length})</h4>
          <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
            {semData.map((x, i) => <li key={i}><span className="font-bold text-slate-600 dark:text-slate-300">{x.person}</span> · <span className="text-blue-600 dark:text-blue-400 font-bold">{x.krId}</span> {x.title}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};
