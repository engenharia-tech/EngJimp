import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend
} from 'recharts';
import { Beaker, Clock, Moon, CalendarDays, TrendingUp } from 'lucide-react';
import { User, ProjectSession, OperationalActivity, AppSettings } from '../types';
import { calcActiveSeconds } from '../utils/workdayCalc';
import { isEdsonUser } from '../utils/identity';
import { isPndCarveoutUser } from '../utils/pndSplit';

interface Props {
  activities: OperationalActivity[];
  projects: ProjectSession[];
  users: User[];
  settings: AppSettings;
  theme: 'light' | 'dark';
  t: (k: string) => string;
  currentUser: User;
  startDate?: string; // segue o filtro DE/ATÉ global do Dashboard
  endDate?: string;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Parse 'YYYY-MM-DD' como data LOCAL (evita o off-by-one do fuso ao usar new Date).
const parseLocal = (s?: string): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// Ausência não é esforço; marcadores quebrados/pausas não são trabalho medido.
const isAbsence = (n?: string) => !!n && /folga|falta|atestado|f[ée]rias|feriado/i.test(n);
const isNonWork = (n?: string) => !!n && /almo[çc]o|fim de expediente|^pausar|intervalo|transito|trânsito|aguardando|atraso/i.test(n);

// Categoria do lançamento (P&D primeiro).
const categorize = (name?: string): string => {
  const s = (name || '').toLowerCase();
  if (/p&d|desenvolv|app|c[áa]lculo|calculo|vpc|ferramenta|prot[óo]tipo|prototipo|plataforma|software|gabarito|jimp|sales ?force|jaltest/.test(s)) return 'P&D aplicado';
  if (/f[áa]brica|oficina|costela|basculante|chapea|solda|perfilad|montagem|furaç|furac|dispositivo|trator/.test(s)) return 'Fábrica / Protótipo';
  if (/reuni|conselho|senai|ufsc|microsoft|garantia|crise/.test(s)) return 'Reuniões';
  if (/aula|mba|curso|cur[çc]o|treinam|metrologia|capacit/.test(s)) return 'Formação';
  if (/gerencial|document|an[áa]lise|analise|feedback|gest[ãa]o|apresenta|padr[ãa]o|documenta/.test(s)) return 'Gestão';
  return 'Outros';
};

const CAT_COLORS: Record<string, string> = {
  'P&D aplicado': '#8b5cf6',
  'Fábrica / Protótipo': '#0ea5e9',
  'Reuniões': '#f59e0b',
  'Formação': '#10b981',
  'Gestão': '#64748b',
  'Outros': '#94a3b8',
};

const MAX_SESSION_H = 16; // acima disso é lançamento aberto/esquecido — fora da conta

export const PndManagerial: React.FC<Props> = ({ activities, projects, users, settings, theme, t, currentUser, startDate, endDate }) => {
  // Sujeito fixo do painel: o Edson (mesmo quando o CEO abre).
  const subject = useMemo(() => {
    return users.find(u => isEdsonUser(u)) || users.find(u => isPndCarveoutUser(u)) || null;
  }, [users]);

  // Segue o filtro DE/ATÉ do Dashboard. Sem filtro → ano corrente.
  const range = useMemo(() => {
    const now = new Date();
    const start = parseLocal(startDate) ?? new Date(now.getFullYear(), 0, 1);
    start.setHours(0, 0, 0, 0);
    const end = parseLocal(endDate) ?? now;
    end.setHours(23, 59, 59, 999);
    const spanDays = (end.getTime() - start.getTime()) / 86400000;
    return { start, end, byDay: spanDays <= 62 }; // até ~2 meses → por dia; senão por mês
  }, [startDate, endDate]);

  const data = useMemo(() => {
    const noLunch: AppSettings = { ...settings, lunchStart: '00:00', lunchEnd: '00:00' };
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();

    const buckets = new Map<string, { label: string; normal: number; extra: number; sort: number }>();
    const byCat = new Map<string, number>();
    let totalNormal = 0, totalExtra = 0, pndHours = 0, ignored = 0, sessions = 0;

    const bucketFor = (d: Date) => {
      if (range.byDay) {
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        return { key, label: `${d.getDate()}/${d.getMonth() + 1}`, sort: d.getTime() };
      }
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      return { key, label: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, sort: d.getFullYear() * 12 + d.getMonth() };
    };

    const add = (name: string | undefined, startStr?: string, endStr?: string) => {
      if (!subject) return;
      if (isAbsence(name) || isNonWork(name)) return;
      if (!startStr || !endStr) { if (startStr) ignored++; return; }
      const start = new Date(startStr);
      const end = new Date(endStr);
      const startT = start.getTime(), endT = end.getTime();
      if (isNaN(startT) || isNaN(endT) || endT <= startT) return;
      const elapsedH = (endT - startT) / 3600000;
      if (elapsedH > MAX_SESSION_H) { ignored++; return; }         // lançamento quebrado
      if (endT < startMs || startT > endMs) return;                 // fora do período

      // normal = dentro da jornada (dias úteis) menos almoço
      const normal = calcActiveSeconds(start, end, settings, false);
      // esforço extra = tudo (todos os dias/horas) menos a janela útil SEM almoço
      const total = calcActiveSeconds(start, end, settings, true);
      const windowNoLunch = calcActiveSeconds(start, end, noLunch, false);
      const extra = Math.max(0, total - windowNoLunch);

      if (normal <= 0 && extra <= 0) return;
      sessions++;

      const b = bucketFor(start);
      const cur = buckets.get(b.key) || { label: b.label, normal: 0, extra: 0, sort: b.sort };
      cur.normal += normal / 3600;
      cur.extra += extra / 3600;
      buckets.set(b.key, cur);

      const cat = categorize(name);
      byCat.set(cat, (byCat.get(cat) || 0) + (normal + extra) / 3600);
      if (cat === 'P&D aplicado') pndHours += (normal + extra) / 3600;

      totalNormal += normal / 3600;
      totalExtra += extra / 3600;
    };

    (activities || []).filter(a => a.userId === subject?.id).forEach(a => add(a.activityName, a.startTime, a.endTime));

    const monthly = Array.from(buckets.values()).sort((a, b) => a.sort - b.sort)
      .map(b => ({ name: b.label, Normal: +b.normal.toFixed(1), Extra: +b.extra.toFixed(1) }));

    const categories = Array.from(byCat.entries())
      .map(([name, h]) => ({ name, horas: +h.toFixed(1) }))
      .sort((a, b) => b.horas - a.horas);

    const totalHours = totalNormal + totalExtra;
    const extraPct = totalHours > 0 ? (totalExtra / totalHours) * 100 : 0;

    return {
      monthly, categories,
      totalHours: +totalHours.toFixed(1),
      totalNormal: +totalNormal.toFixed(1),
      totalExtra: +totalExtra.toFixed(1),
      pndHours: +pndHours.toFixed(1),
      extraPct: +extraPct.toFixed(0),
      ignored, sessions,
    };
  }, [activities, subject, settings, range]);

  const axis = theme === 'dark' ? '#94a3b8' : '#475569';
  const grid = theme === 'dark' ? '#334155' : '#e2e8f0';

  const card = 'bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700';

  if (!subject) {
    return <div className={`${card} p-6 text-gray-600 dark:text-gray-300`}>Usuário de P&amp;D não encontrado.</div>;
  }

  const viewerIsSubject = isEdsonUser(currentUser);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className={`${card} p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-l-4 border-l-violet-500`}>
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300">
            <Beaker size={24} />
          </div>
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-gray-400 dark:text-slate-500">P&amp;D · <span className="text-orange-500 dark:text-orange-400">Gerencial</span></p>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">P&amp;D — Painel Gerencial</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {subject.name}{subject.surname ? ` ${subject.surname}` : ''} · P&amp;D aplicado e esforço além da jornada
              {!viewerIsSubject && <span className="ml-1 italic">(visão do CEO)</span>}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Período (filtro do painel)</div>
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {range.start.toLocaleDateString('pt-BR')} – {range.end.toLocaleDateString('pt-BR')}
          </div>
        </div>
      </div>

      {/* Cartões */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1"><Clock size={16} /> Horas no período</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.totalHours.toLocaleString('pt-BR')} h</div>
          <div className="text-xs text-gray-400 mt-1">{data.sessions} lançamentos válidos</div>
        </div>
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 text-violet-500 text-sm mb-1"><Beaker size={16} /> P&amp;D aplicado</div>
          <div className="text-2xl font-bold text-violet-600 dark:text-violet-300">{data.pndHours.toLocaleString('pt-BR')} h</div>
          <div className="text-xs text-gray-400 mt-1">{data.totalHours > 0 ? Math.round((data.pndHours / data.totalHours) * 100) : 0}% do seu tempo</div>
        </div>
        <div className={`${card} p-5 ring-2 ring-amber-400/60`}>
          <div className="flex items-center gap-2 text-amber-500 text-sm mb-1"><Moon size={16} /> Esforço extra</div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{data.totalExtra.toLocaleString('pt-BR')} h</div>
          <div className="text-xs text-gray-400 mt-1">fora da jornada + fins de semana · não remunerado</div>
        </div>
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1"><TrendingUp size={16} /> % além da jornada</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">{data.extraPct}%</div>
          <div className="text-xs text-gray-400 mt-1">{data.totalNormal.toLocaleString('pt-BR')} h dentro do expediente</div>
        </div>
      </div>

      {/* Gráfico do tempo: normal vs extra */}
      <div className={`${card} p-6`}>
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={18} className="text-gray-500 dark:text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Seu tempo ao longo do período</h3>
        </div>
        {data.monthly.length === 0 ? (
          <div className="text-gray-400 text-sm py-10 text-center">Sem lançamentos no período.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="name" stroke={axis} fontSize={12} />
              <YAxis stroke={axis} fontSize={12} unit="h" />
              <Tooltip
                contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: `1px solid ${grid}`, borderRadius: 12, color: theme === 'dark' ? '#fff' : '#0f172a' }}
                formatter={(v: number) => [`${v} h`, '']}
              />
              <Legend />
              <Bar dataKey="Normal" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Extra" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Categorias */}
      <div className={`${card} p-6`}>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Onde foi seu tempo (por categoria)</h3>
        {data.categories.length === 0 ? (
          <div className="text-gray-400 text-sm py-10 text-center">Sem lançamentos no período.</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, data.categories.length * 46)}>
            <BarChart data={data.categories} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
              <XAxis type="number" stroke={axis} fontSize={12} unit="h" />
              <YAxis type="category" dataKey="name" stroke={axis} fontSize={12} width={120} />
              <Tooltip
                contentStyle={{ background: theme === 'dark' ? '#1e293b' : '#fff', border: `1px solid ${grid}`, borderRadius: 12, color: theme === 'dark' ? '#fff' : '#0f172a' }}
                formatter={(v: number) => [`${v} h`, 'Horas']}
              />
              <Bar dataKey="horas" radius={[0, 6, 6, 0]}>
                {data.categories.map((c, i) => <Cell key={i} fill={CAT_COLORS[c.name] || '#94a3b8'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {data.ignored > 0 && (
        <p className="text-xs text-gray-400 px-2">
          {data.ignored} lançamento(s) fora da conta por estarem abertos/sem fim ou acima de {MAX_SESSION_H} h (evita inflar o número).
        </p>
      )}
    </div>
  );
};
