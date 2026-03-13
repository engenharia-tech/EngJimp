import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { 
  PauseCircle, Clock, AlertTriangle, TrendingDown, 
  Users, BarChart3, PieChart as PieChartIcon, Calendar,
  Target, Activity
} from 'lucide-react';
import { AppState, InterruptionRecord, InterruptionStatus, InterruptionArea } from '../types';

interface InterruptionDashboardProps {
  data: AppState;
  theme: 'light' | 'dark';
}

const COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];

export const InterruptionDashboard: React.FC<InterruptionDashboardProps> = ({ data, theme }) => {
  const interruptions = data.interruptions;

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthInterruptions = interruptions.filter(i => {
      const d = new Date(i.startTime);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalTimeSeconds = monthInterruptions.reduce((acc, curr) => acc + curr.totalTimeSeconds, 0);
    const avgTimeSeconds = monthInterruptions.length > 0 ? totalTimeSeconds / monthInterruptions.length : 0;
    
    const hourlyCost = data.settings?.hourlyCost || 0;
    const totalCost = (totalTimeSeconds / 3600) * hourlyCost;

    return {
      totalMonth: monthInterruptions.length,
      totalTimeHours: (totalTimeSeconds / 3600).toFixed(1),
      avgTimeMinutes: (avgTimeSeconds / 60).toFixed(0),
      totalCost: totalCost,
      openCount: interruptions.filter(i => i.status === InterruptionStatus.OPEN || i.status === InterruptionStatus.WAITING).length
    };
  }, [interruptions, data.settings]);

  const byCategoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    interruptions.forEach(i => {
      counts[i.problemType] = (counts[i.problemType] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [interruptions]);

  const byAreaData = useMemo(() => {
    const counts: Record<string, number> = {};
    interruptions.forEach(i => {
      counts[i.responsibleArea] = (counts[i.responsibleArea] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [interruptions]);

  const timeByAreaData = useMemo(() => {
    const times: Record<string, number> = {};
    interruptions.forEach(i => {
      times[i.responsibleArea] = (times[i.responsibleArea] || 0) + i.totalTimeSeconds;
    });
    return Object.entries(times).map(([name, value]) => ({ 
      name, 
      hours: Number((value / 3600).toFixed(1)) 
    }));
  }, [interruptions]);

  const monthlyTrendData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const counts: Record<string, number> = {};
    
    interruptions.forEach(i => {
      const date = new Date(i.startTime);
      const key = `${months[date.getMonth()]}/${date.getFullYear().toString().slice(-2)}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [interruptions]);

  const impactedDesignersData = useMemo(() => {
    const counts: Record<string, number> = {};
    interruptions.forEach(i => {
      counts[i.designerId] = (counts[i.designerId] || 0) + 1;
    });
    // Ideally map designerId to name here
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [interruptions]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">Total no Mês</p>
            <p className="text-2xl font-bold text-black dark:text-white">{stats.totalMonth}</p>
          </div>
          <div className="h-10 w-10 bg-amber-50 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400">
            <PauseCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">Tempo Perdido (Mês)</p>
            <p className="text-2xl font-bold text-black dark:text-white">{stats.totalTimeHours}h</p>
          </div>
          <div className="h-10 w-10 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 dark:text-red-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">Custo Perdido (Mês)</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(stats.totalCost)}</p>
          </div>
          <div className="h-10 w-10 bg-red-50 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-600 dark:text-red-400">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">Abertas Atualmente</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.openCount}</p>
          </div>
          <div className="h-10 w-10 bg-amber-50 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Interrupções por Área Responsável */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-6 flex items-center">
            <PieChartIcon className="w-5 h-5 mr-2 text-blue-500" />
            Interrupções por Área Responsável
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byAreaData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {byAreaData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tempo Perdido por Área */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-6 flex items-center">
            <Clock className="w-5 h-5 mr-2 text-red-500" />
            Tempo Perdido por Área (Horas)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeByAreaData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis type="number" tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} width={100} />
                <Tooltip 
                  contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                  cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }}
                />
                <Bar dataKey="hours" name="Horas Perdidas" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tipos de Erro mais Frequentes */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 col-span-1 md:col-span-2">
          <h3 className="text-lg font-bold text-black dark:text-white mb-6 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-amber-500" />
            Tipos de Erro mais Frequentes
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byCategoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '10px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} interval={0} angle={-45} textAnchor="end" height={100} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                  cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }}
                />
                <Bar dataKey="value" name="Ocorrências" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tendência Mensal */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-6 flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-indigo-500" />
            Tendência de Interrupções
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                />
                <Line type="monotone" dataKey="count" name="Interrupções" stroke="#6366f1" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Projetistas mais Impactados */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-gray-700 dark:text-slate-200 mb-6 flex items-center">
            <Users className="w-5 h-5 mr-2 text-emerald-500" />
            Projetistas mais Impactados
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={impactedDesignersData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                  cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }}
                />
                <Bar dataKey="value" name="Interrupções" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
