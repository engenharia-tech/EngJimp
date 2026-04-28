import React, { useMemo } from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  Users2,
  TrendingUp,
  MoreVertical,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { AppState, GanttTaskStatus, TaskPriority } from '../../types';

interface DashboardViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ state }) => {
  const tasks = state.ganttTasks;

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter(t => t.status === GanttTaskStatus.DONE || t.status === GanttTaskStatus.CLOSED).length;
    const inProgress = tasks.filter(t => t.status === GanttTaskStatus.IN_PROGRESS).length;
    const todo = tasks.filter(t => t.status === GanttTaskStatus.TODO).length;
    const overdue = tasks.filter(t => {
       const end = new Date(t.endDate);
       return end < new Date() && t.status !== GanttTaskStatus.DONE && t.status !== GanttTaskStatus.CLOSED;
    }).length;

    return { total, done, inProgress, todo, overdue };
  }, [tasks]);

  const statusData = useMemo(() => [
    { name: 'Aberto', value: stats.todo, color: '#94a3b8' },
    { name: 'Em projeto', value: stats.inProgress, color: '#fbbf24' },
    { name: 'Feito', value: stats.done, color: '#22d3ee' },
  ], [stats]);

  const priorityData = useMemo(() => {
     const urgent = tasks.filter(t => t.priority === TaskPriority.URGENT).length;
     const high = tasks.filter(t => t.priority === TaskPriority.HIGH).length;
     const medium = tasks.filter(t => t.priority === TaskPriority.MEDIUM).length;
     const low = tasks.filter(t => t.priority === TaskPriority.LOW).length;
     return [
       { name: 'Urgente', value: urgent, color: '#ef4444' },
       { name: 'Alta', value: high, color: '#f59e0b' },
       { name: 'Média', value: medium, color: '#3b82f6' },
       { name: 'Baixa', value: low, color: '#94a3b8' },
     ];
  }, [tasks]);

  const workloadData = useMemo(() => {
    return state.users.map(u => ({
      name: u.name,
      tasks: tasks.filter(t => t.assignedTo.includes(u.id)).length,
    }));
  }, [state.users, tasks]);

  return (
    <div className="h-full bg-slate-50 dark:bg-black overflow-y-auto p-6 space-y-6 select-none font-sans">
      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
           label="Total de Tarefas" 
           value={stats.total} 
           icon={<Activity size={20} />} 
           color="text-blue-600" 
           bg="bg-blue-50 dark:bg-blue-900/20"
           trend="+12% este mês"
        />
        <StatCard 
           label="Concluídas" 
           value={stats.done} 
           icon={<CheckCircle2 size={20} />} 
           color="text-emerald-600" 
           bg="bg-emerald-50 dark:bg-emerald-900/20"
           trend="85% de taxa"
        />
        <StatCard 
           label="Em Projeto" 
           value={stats.inProgress} 
           icon={<Clock size={20} />} 
           color="text-amber-600" 
           bg="bg-amber-50 dark:bg-amber-900/20"
           trend="Ativo agora"
        />
        <StatCard 
           label="Atrasadas" 
           value={stats.overdue} 
           icon={<AlertCircle size={20} />} 
           color="text-rose-600" 
           bg="bg-rose-50 dark:bg-rose-900/20"
           trend="Atenção necessária"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-tight">Distribuição de Status</h3>
              <PieChartIcon size={18} className="text-slate-400" />
           </div>
           <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#1e293b', color: '#fff' }} 
                  />
                </PieChart>
              </ResponsiveContainer>
           </div>
           <div className="mt-4 flex flex-col gap-2">
              {statusData.map(item => (
                <div key={item.name} className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                     <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{item.name}</span>
                   </div>
                   <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.value}</span>
                </div>
              ))}
           </div>
        </div>

        {/* Workload by User */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
           <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-tight">Carga por Usuário</h3>
              <Users2 size={18} className="text-slate-400" />
           </div>
           <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workloadData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" opacity={0.1} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc', opacity: 0.05 }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: '#1e293b', color: '#fff' }} 
                  />
                  <Bar dataKey="tasks" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Priority Card */}
         <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-tight mb-6">Prioridade das Tarefas</h3>
            <div className="space-y-4">
               {priorityData.map(item => (
                 <div key={item.name} className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs">
                       <span className="font-bold text-slate-600 dark:text-slate-400">{item.name}</span>
                       <span className="font-black text-slate-800 dark:text-slate-200">{item.value} ({Math.round((item.value / stats.total) * 100 || 0)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                       <div 
                         className="h-full rounded-full transition-all duration-500" 
                         style={{ width: `${(item.value / stats.total) * 100}%`, backgroundColor: item.color }} 
                       />
                    </div>
                 </div>
               ))}
            </div>
         </div>

         {/* Project Pulse (Activity) */}
         <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 overflow-hidden">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-tight mb-6">Pulso do Projeto</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[
                  { day: 'Seg', activity: 4 },
                  { day: 'Ter', activity: 7 },
                  { day: 'Qua', activity: 5 },
                  { day: 'Qui', activity: 8 },
                  { day: 'Sex', activity: 12 },
                  { day: 'Sáb', activity: 5 },
                  { day: 'Dom', activity: 3 },
                ]}>
                  <defs>
                    <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="activity" stroke="#4f46e5" fillOpacity={1} fill="url(#colorActivity)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
         </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon, color, bg, trend }: any) => (
  <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3">
    <div className="flex items-center justify-between">
       <div className={`${bg} ${color} p-2.5 rounded-lg`}>
          {icon}
       </div>
       <button className="text-slate-300 dark:text-slate-600 hover:text-slate-500 transition-colors"><MoreVertical size={16} /></button>
    </div>
    <div>
       <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none block mb-1">{label}</span>
       <h4 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{value}</h4>
    </div>
    <div className="pt-2 border-t border-slate-50 dark:border-slate-800 flex items-center gap-1 text-[10px] font-bold text-emerald-500">
       <TrendingUp size={12} />
       <span>{trend}</span>
    </div>
  </div>
);
