import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, RefreshCw, Clock } from 'lucide-react';
import { User } from '../types';
import { fetchAllOkr } from '../services/storageService';
import { OkrStore, OkrPeriod, krProgress } from './okr';

const activePeriod = (s: OkrStore) => s.periods.find(p => p.id === s.activePeriodId) || s.periods[0];
const parse = (iso?: string): Date | null => { if (!iso) return null; const d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : '')); return isNaN(d.getTime()) ? null : d; };
const barColor = (p: number, status: string) => status === 'Em risco' ? '#ef4444' : (p >= 1 || status === 'Concluído') ? '#10b981' : p >= 0.4 ? '#f59e0b' : '#3b82f6';
const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();
const monthLabel = (mk: number) => new Date(Math.floor(mk / 12), mk % 12, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
const fmtDay = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

// Janela padrão de um período: lê o "range" (dd/mm/aaaa a dd/mm/aaaa);
// se não der, usa o quadrimestre que termina em dez/2026 (01/09 a 31/12/2026).
const periodBounds = (p?: OkrPeriod): { ps: Date; pe: Date } => {
  const m = (p?.range || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return { ps: new Date(+m[3], +m[2] - 1, +m[1]), pe: new Date(+m[6], +m[5] - 1, +m[4]) };
  return { ps: new Date(2026, 8, 1), pe: new Date(2026, 11, 31) };
};

interface Bar { person: string; sector: string; krId: string; title: string; s: Date; e: Date; progress: number; status: string; concl: boolean; }
interface Props { currentUser: User; users: User[]; }

export const OkrTimeline: React.FC<Props> = ({ users }) => {
  const [rows, setRows] = useState<{ ownerKey: string; store: OkrStore }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'quad' | 'sem' | 'ano'>('quad'); // janela: 4 / 6 / 12 meses
  const load = async () => { setLoading(true); try { setRows(await fetchAllOkr()); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const byKey = useMemo(() => { const m: Record<string, User> = {}; (users || []).forEach(u => { m[(u.username || '').trim().toLowerCase()] = u; }); return m; }, [users]);

  const { bars, refYear, waiting } = useMemo(() => {
    const bars: Bar[] = []; let waiting = 0;
    (rows || []).forEach(r => {
      const u = byKey[r.ownerKey]; const person = u?.name || r.store.owner || r.ownerKey; const sector = (u?.sector || '').trim();
      const ap = activePeriod(r.store); const { ps, pe } = periodBounds(ap);
      (ap?.objectives || []).forEach(o => o.keyResults.forEach(k => {
        if (k.archived) return;
        const p = krProgress(k);
        const concl = p >= 1 || String(k.status) === 'Concluído';
        const hasDue = !!parse(k.due);
        // "Aguardando": não começou (0%), sem data de FIM e não concluído — fica FORA do gráfico.
        if (!hasDue && p <= 0 && !concl) { waiting++; return; }
        // início: o preenchido, senão o começo do período.
        const start = parse((k as any).start) || ps;
        // fim: o preenchido; senão, concluído termina quando foi dado como feito
        // (último ponto do histórico) e em andamento corre até o fim do período.
        let end = parse(k.due);
        if (!end) {
          if (concl && (k.history && k.history.length)) end = parse(k.history[k.history.length - 1].date) || pe;
          else end = pe;
        }
        let s = start, e = end;
        if (e < s) { const t = s; s = e; e = t; }
        bars.push({ person, sector, krId: k.id, title: k.title, s, e, progress: krProgress(k), status: String(k.status), concl });
      }));
    });
    // ano de referência: a janela sempre termina em dez/(ano do fim mais tardio).
    let refYear = 2026;
    bars.forEach(b => { refYear = Math.max(refYear, b.e.getFullYear()); });
    return { bars, refYear };
  }, [rows, byKey]);

  // Janela do gráfico pela visão escolhida, sempre terminando em dez do ano-ref.
  const monthsBack = view === 'ano' ? 12 : view === 'sem' ? 6 : 4;
  const mkEnd = refYear * 12 + 11;            // dezembro
  const mkStart = mkEnd - (monthsBack - 1);
  const months = useMemo(() => { const arr: number[] = []; for (let m = mkStart; m <= mkEnd; m++) arr.push(m); return arr; }, [mkStart, mkEnd]);
  const axisStart = new Date(Math.floor(mkStart / 12), mkStart % 12, 1).getTime();
  const axisEnd = new Date(Math.floor(mkEnd / 12), mkEnd % 12 + 1, 0, 23, 59).getTime(); // último dia do último mês
  const pct = (d: Date) => { const span = axisEnd - axisStart; return span <= 0 ? 0 : Math.max(0, Math.min(100, (d.getTime() - axisStart) / span * 100)); };

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
            <p className="text-xs text-slate-500 dark:text-slate-400">Quando cada resultado-chave corre — do início até a conclusão · {bars.length} KRs</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {([['quad', 'Quadrimestre'], ['sem', 'Semestre'], ['ano', 'Ano']] as const).map(([v, lb]) => (
              <button key={v} onClick={() => setView(v)} className={`text-xs font-bold px-3 py-1.5 transition-colors ${view === v ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{lb}</button>
            ))}
          </div>
          <button onClick={load} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"><RefreshCw size={12} /> Atualizar</button>
        </div>
      </div>

      {bars.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 shadow-sm border border-gray-200 dark:border-slate-700 text-center text-slate-400">
          <Clock size={28} className="mx-auto mb-3 opacity-50" /> Nenhum KR andou ainda — todos aguardando (sem data e sem progresso).{waiting > 0 ? ` (${waiting} aguardando)` : ''}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700 overflow-x-auto">
          <div className="min-w-[760px]">
            {/* eixo de meses */}
            <div className="flex items-stretch border-b border-gray-100 dark:border-slate-800 pb-2 mb-2">
              <div className="w-64 shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wide flex items-end">Resultado-chave</div>
              <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                {months.map(m => <div key={m} className="text-[10px] font-bold text-slate-400 uppercase text-center border-l border-gray-100 dark:border-slate-800 pb-0.5">{monthLabel(m)}</div>)}
              </div>
            </div>
            {groups.map(gr => (
              <div key={gr.person} className="mb-1.5">
                <div className="flex items-center gap-2 py-1.5">
                  <span className="text-xs font-black text-slate-700 dark:text-slate-200">{gr.person}</span>
                  {gr.sector && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{gr.sector}</span>}
                </div>
                {gr.list.map((b, idx) => {
                  const left = pct(b.s); const width = Math.max(2.5, pct(b.e) - left);
                  const col = barColor(b.progress, b.status);
                  return (
                    <div key={b.krId + idx} className="flex items-center py-1">
                      <div className="w-64 shrink-0 pr-2 truncate text-[11px] text-slate-600 dark:text-slate-300"><span className="font-bold text-blue-600 dark:text-blue-400 mr-1">{b.krId}</span>{b.title}</div>
                      <div className="flex-1 relative h-6">
                        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
                          {months.map(m => <div key={m} className="border-l border-gray-100 dark:border-slate-800" />)}
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 h-4 rounded-md flex items-center justify-between px-2 shadow-sm overflow-hidden" style={{ left: `${left}%`, width: `${width}%`, background: col }} title={`${b.krId} · ${fmtDay(b.s)} → ${fmtDay(b.e)} · ${Math.round(b.progress * 100)}%${b.concl ? ' · concluído' : ''}`}>
                          <span className="text-[9px] font-bold text-white/95 tabular-nums truncate">{Math.round(b.progress * 100)}%</span>
                          {!b.concl && width > 12 && <span className="text-[9px] font-semibold text-white/80 truncate hidden sm:inline">em andamento</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <p className="text-[10px] text-slate-400 mt-3">Só entram KRs que já andaram (com progresso, com data ou concluídos). Um KR em andamento sem fim corre até dez/2026; concluído termina quando foi feito.{waiting > 0 ? ` · ${waiting} KR(s) aguardando (sem data e sem progresso) fora do gráfico.` : ''}</p>
          </div>
        </div>
      )}
    </div>
  );
};
