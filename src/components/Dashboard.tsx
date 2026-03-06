import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell 
} from 'recharts';
import { Sparkles, BarChart3, Download, Clock, Filter, Truck, User as UserIcon, Lightbulb, TrendingDown, Target, Calendar, PauseCircle, Activity } from 'lucide-react';
import { AppState, User, InnovationType, ProjectType } from '../types';
import { analyzePerformance } from '../services/geminiService';
import { fetchUsers } from '../services/storageService';

interface DashboardProps {
  data: AppState;
  currentUser: User;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6', '#ec4899'];

export const Dashboard: React.FC<DashboardProps> = ({ data, currentUser }) => {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [availableDesigners, setAvailableDesigners] = useState<User[]>([]);

  // Filter States
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Grouping States
  const [releaseGrouping, setReleaseGrouping] = useState<'MONTHLY' | 'YEARLY' | 'GLOBAL'>('MONTHLY');
  const [designerGrouping, setDesignerGrouping] = useState<'MONTHLY' | 'YEARLY' | 'TOTAL'>('TOTAL');
  const [monthlyGoal, setMonthlyGoal] = useState<number>(160); // Default 160h

  // Ranking Period State
  const [rankingPeriod, setRankingPeriod] = useState<'MONTH' | 'YEAR' | 'CUSTOM'>('MONTH');

  // Novo Estado: Filtro de Projetista para os Gráficos
  const [selectedDesignerForChart, setSelectedDesignerForChart] = useState<string>('ALL');
  const [selectedDesignerForReleases, setSelectedDesignerForReleases] = useState<string>('ALL');
  const [selectedInterruptionDesigner, setSelectedInterruptionDesigner] = useState<string>('ALL');

  useEffect(() => {
    // Load users for the manager chart
    const load = async () => {
      const users = await fetchUsers();
      const map = users.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {} as Record<string, string>);
      setUsersMap(map);
      setAvailableDesigners(users.filter(u => u.role !== 'CEO'));
    };
    load();
  }, []);

  // Filter Data Logic
  const filteredProjects = useMemo(() => {
    return data.projects.filter(p => {
      if (p.status !== 'COMPLETED') return false;

      // Restrict visibility for PROJETISTA to their own projects only
      if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
          return false;
      }
      
      let matchDate = true;
      if (startDate || endDate) {
        const pDate = new Date(p.endTime || p.startTime).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
        matchDate = pDate >= start && pDate <= end;
      }
      return matchDate;
    });
  }, [data.projects, startDate, endDate, currentUser.role, currentUser.id]);

  const filteredIssues = useMemo(() => {
     return data.issues.filter(i => {
      let matchDate = true;
      if (startDate || endDate) {
        const iDate = new Date(i.date).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
        matchDate = iDate >= start && iDate <= end;
      }
      return matchDate;
     });
  }, [data.issues, startDate, endDate]);

   const filteredInnovations = useMemo(() => {
    return data.innovations.filter(inv => {
      let matchDate = true;
      if (startDate || endDate) {
        const iDate = new Date(inv.createdAt).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
        matchDate = iDate >= start && iDate <= end;
      }
      return matchDate;
    });
  }, [data.innovations, startDate, endDate]);


  // 1. Calculate Average Time per Project Type
  const averageTimes = useMemo(() => {
    const sums: Record<string, { total: number; count: number }> = {};
    
    filteredProjects.forEach(p => {
      if (!sums[p.type]) sums[p.type] = { total: 0, count: 0 };
      sums[p.type].total += p.totalActiveSeconds;
      sums[p.type].count += 1;
    });

    return Object.entries(sums).map(([type, stats]) => ({
      type,
      avgSeconds: Math.round(stats.total / stats.count)
    }));
  }, [filteredProjects]);

  // 1.5 Calculate Total Savings (ONLY APPROVED/IMPLEMENTED)
  const totalSavings = useMemo(() => {
    return filteredInnovations.reduce((acc, curr) => {
        if (curr.status === 'APPROVED' || curr.status === 'IMPLEMENTED') {
            return acc + (curr.totalAnnualSavings || 0);
        }
        return acc;
    }, 0);
  }, [filteredInnovations]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
  };

  // --- NOVO GRÁFICO: Horas Realizadas vs Meta Mensal ---
  const hoursVsGoalData = useMemo(() => {
    const sums: Record<string, number> = {};
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    filteredProjects.forEach(p => {
      const date = new Date(p.endTime || p.startTime);
      const month = months[date.getMonth()];
      const year = date.getFullYear().toString().slice(-2);
      const key = `${month}/${year}`;
      
      if (selectedDesignerForChart === 'ALL' || p.userId === selectedDesignerForChart) {
        sums[key] = (sums[key] || 0) + (p.totalActiveSeconds || 0);
      }
    });

    return Object.keys(sums).map(key => ({
      name: key,
      Realizado: Number((sums[key] / 3600).toFixed(1)),
      Meta: monthlyGoal
    })).sort((a, b) => {
        // Chronological sort: Parse "Mês/Ano" (e.g., "Jan/24")
        const [monthA, yearA] = a.name.split('/');
        const [monthB, yearB] = b.name.split('/');
        
        const yearDiff = parseInt(yearA) - parseInt(yearB);
        if (yearDiff !== 0) return yearDiff;
        
        return months.indexOf(monthA) - months.indexOf(monthB);
    });
  }, [filteredProjects, selectedDesignerForChart, monthlyGoal]);

  // 2. Bar Chart Data: Releases (Monthly, Yearly or Global)
  const barData = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    if (releaseGrouping === 'GLOBAL') {
        return [{
            name: 'Total Global',
            liberacoes: filteredProjects.length
        }];
    }

    const releasesByPeriod = filteredProjects
      .filter(p => selectedDesignerForReleases === 'ALL' || p.userId === selectedDesignerForReleases)
      .reduce((acc, curr) => {
        const date = new Date(curr.endTime || curr.startTime);
        let key = '';
        
        if (releaseGrouping === 'MONTHLY') {
            const month = months[date.getMonth()];
            const year = date.getFullYear().toString().slice(-2);
            key = `${month}/${year}`;
        } else {
            key = date.getFullYear().toString();
        }
        
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return Object.keys(releasesByPeriod).map(key => ({
      name: key,
      liberacoes: releasesByPeriod[key]
    })).sort((a, b) => {
        if (releaseGrouping === 'MONTHLY') {
            const [mA, yA] = a.name.split('/');
            const [mB, yB] = b.name.split('/');
            if (yA !== yB) return parseInt(yA) - parseInt(yB);
            return months.indexOf(mA) - months.indexOf(mB);
        }
        return a.name.localeCompare(b.name);
    });
  }, [filteredProjects, releaseGrouping, selectedDesignerForReleases]);

  // 3. Removed: Issue Type Distribution (Pie Chart)

  // 4. Pie Chart: Implement Type Distribution
  const implementData = useMemo(() => {
    const counts = filteredProjects.reduce((acc, curr) => {
      const type = curr.implementType || 'Não Informado';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts).map(key => ({
      name: key,
      value: counts[key]
    }));
  }, [filteredProjects]);

  // 5. Bar Chart: Releases by Designer (Manager Only)
  const designerData = useMemo(() => {
    if (currentUser.role !== 'GESTOR') return [];

    const counts = filteredProjects.reduce((acc, curr) => {
      const name = usersMap[curr.userId || ''] || 'Desconhecido';
      const date = new Date(curr.endTime || curr.startTime);
      
      let key = name;
      if (designerGrouping === 'MONTHLY') {
          const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          const month = months[date.getMonth()];
          const year = date.getFullYear().toString().slice(-2);
          key = `${name} (${month}/${year})`;
      } else if (designerGrouping === 'YEARLY') {
          const year = date.getFullYear();
          key = `${name} (${year})`;
      }

      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.keys(counts).map(key => ({
      name: key,
      liberacoes: counts[key]
    }));
  }, [filteredProjects, currentUser.role, usersMap, designerGrouping]);

  // 6. Stacked Bar Chart: Innovations by Status and Type
  const innovationChartData = useMemo(() => {
    const statuses = ['PENDING', 'APPROVED', 'IMPLEMENTED', 'REJECTED'];
    const labelMap: Record<string, string> = {
        'PENDING': 'Pendente',
        'APPROVED': 'Aprovado',
        'IMPLEMENTED': 'Implementado',
        'REJECTED': 'Rejeitado'
    };

    return statuses.map(status => {
        const items = filteredInnovations.filter(i => i.status === status);
        const newProjects = items.filter(i => i.type === InnovationType.NEW_PROJECT).length;
        const improvements = items.filter(i => i.type === InnovationType.PRODUCT_IMPROVEMENT).length;
        const optimizations = items.filter(i => i.type === InnovationType.PROCESS_OPTIMIZATION).length;
        
        return {
            name: labelMap[status],
            "Novo Projeto": newProjects,
            "Melhoria": improvements,
            "Otimização": optimizations
        };
    });
  }, [filteredInnovations]);


  // 7. Stacked Bar Chart: Activities by Designer (Release, Variation, Development)
  const activitiesByDesigner = useMemo(() => {
    const data: Record<string, { name: string, [key: string]: any }> = {};

    filteredProjects.forEach(p => {
        const userName = usersMap[p.userId || ''] || 'Desconhecido';
        if (!data[userName]) {
            data[userName] = { 
                name: userName, 
                [ProjectType.RELEASE]: 0, 
                [ProjectType.VARIATION]: 0, 
                [ProjectType.DEVELOPMENT]: 0 
            };
        }
        
        // Count occurrences
        if (p.type === ProjectType.RELEASE) data[userName][ProjectType.RELEASE]++;
        else if (p.type === ProjectType.VARIATION) data[userName][ProjectType.VARIATION]++;
        else if (p.type === ProjectType.DEVELOPMENT) data[userName][ProjectType.DEVELOPMENT]++;
    });

    return Object.values(data);
  }, [filteredProjects, usersMap]);

  // 8. Stacked Bar Chart: Interruptions by Designer (Reason Breakdown)
  const interruptionsByDesigner = useMemo(() => {
    const data: Record<string, { name: string, [key: string]: any }> = {};
    const allReasons = new Set<string>();

    filteredProjects.forEach(p => {
        const userName = usersMap[p.userId || ''] || 'Desconhecido';
        if (!data[userName]) {
            data[userName] = { name: userName };
        }
        
        if (p.pauses && p.pauses.length > 0) {
            p.pauses.forEach(pause => {
                const reason = pause.reason || 'Outros';
                allReasons.add(reason);
                data[userName][reason] = (data[userName][reason] || 0) + 1;
            });
        }
    });

    // Ensure all keys exist for recharts to stack correctly (optional but good practice)
    const result = Object.values(data).map(item => {
        allReasons.forEach(r => {
            if (!item[r]) item[r] = 0;
        });
        return item;
    });

    return { data: result, reasons: Array.from(allReasons) };
  }, [filteredProjects, usersMap]);

  // 9. Interruptions for Selected Designer (Grouped by Project)
  const interruptionsForSelectedDesigner = useMemo(() => {
    if (selectedInterruptionDesigner === 'ALL') return [];

    return filteredProjects
        .filter(p => p.userId === selectedInterruptionDesigner && p.pauses && p.pauses.length > 0)
        .map(p => ({
            id: p.id,
            ns: p.ns,
            client: p.clientName,
            date: p.startTime,
            totalPaused: p.pauses.reduce((acc, curr) => acc + Number(curr.durationSeconds), 0),
            pauses: p.pauses
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [filteredProjects, selectedInterruptionDesigner]);

  const handleAiAnalysis = async () => {
    setIsLoadingAi(true);
    const result = await analyzePerformance(filteredProjects, filteredIssues);
    setAiAnalysis(result);
    setIsLoadingAi(false);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'NS', 'Codigo', 'Tipo', 'Implemento', 'Inicio', 'Fim', 'Tempo Total(s)', 'Status', 'Notas'];
    const rows = filteredProjects.map(p => [
      p.id,
      p.ns,
      p.projectCode || '',
      p.type,
      p.implementType || '',
      p.startTime,
      p.endTime || '',
      p.totalActiveSeconds,
      p.status,
      `"${(p.notes || '').replace(/"/g, '""')}"`
    ].join(','));

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `design_track_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Date Filter Section */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center text-gray-700 font-bold">
          <Filter className="w-5 h-5 mr-2 text-blue-600" />
          Filtros de Análise
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
          {currentUser.role === 'GESTOR' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Projetista:</span>
              <select
                value={selectedDesignerForReleases}
                onChange={(e) => {
                  setSelectedDesignerForReleases(e.target.value);
                  setSelectedDesignerForChart(e.target.value); // Sync both for convenience
                }}
                className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-gray-50 cursor-pointer"
              >
                <option value="ALL">Todos</option>
                {availableDesigners.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
          <button 
            onClick={handleExportCSV}
            className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-50 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors ml-auto md:ml-0"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </button>
      </div>

      {/* KPI Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {averageTimes.length > 0 && averageTimes.map((stat) => (
            <div key={stat.type} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Média {stat.type}</p>
                <p className="text-xl font-bold text-gray-800">{formatDuration(stat.avgSeconds)}</p>
              </div>
              <div className="h-8 w-8 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          ))}
          {/* Innovation KPI */}
           <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Economia Aprovada</p>
                <p className="text-xl font-bold text-emerald-800">{formatCurrency(totalSavings)}</p>
              </div>
              <div className="h-8 w-8 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>
        </div>

      {/* AI Insights Section */}
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-xl border border-indigo-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-indigo-900 flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-indigo-600" />
              Análise Inteligente (IA)
            </h3>
            <button 
              onClick={handleAiAnalysis}
              disabled={isLoadingAi}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isLoadingAi ? 'Analisando...' : 'Gerar Relatório'}
            </button>
          </div>
          
          {aiAnalysis ? (
            <div className="prose prose-sm max-w-none text-indigo-900 bg-white/50 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{aiAnalysis}</pre>
            </div>
          ) : (
            <p className="text-indigo-600/70 text-sm">
              Clique em "Gerar Relatório" para que a IA analise o desempenho do período selecionado.
            </p>
          )}
        </div>

      {/* NOVO: Gráfico Horas Realizadas vs Meta Mensal */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[400px]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div className="flex flex-col">
                <h3 className="text-lg font-bold text-gray-700 flex items-center">
                    <Target className="w-5 h-5 mr-2 text-indigo-500" />
                    Horas Realizadas vs Meta Mensal
                </h3>
                <p className="text-xs text-gray-500 ml-7">Comparativo de produtividade por período</p>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Meta (h):</span>
                    <input 
                        type="number" 
                        value={monthlyGoal}
                        onChange={(e) => setMonthlyGoal(Number(e.target.value))}
                        className="w-16 p-1 border rounded text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                </div>

                {currentUser.role === 'GESTOR' && (
                <select
                    value={selectedDesignerForChart}
                    onChange={(e) => setSelectedDesignerForChart(e.target.value)}
                    className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-gray-50 cursor-pointer"
                >
                    <option value="ALL">Todos os Projetistas</option>
                    {availableDesigners.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
                )}
            </div>
          </div>

          <div className="h-[300px] w-full">
            {hoursVsGoalData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hoursVsGoalData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '12px' }} />
                  <YAxis 
                    allowDecimals={false} 
                    tickLine={false} 
                    axisLine={false} 
                    label={{ value: 'Horas', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: '12px' } }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f3f4f6' }}
                    formatter={(value: number) => [`${value}h`, '']}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />
                  <Bar dataKey="Realizado" name="Horas Realizadas" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                  <Bar dataKey="Meta" name="Meta Mensal" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm">
                <Target className="w-8 h-8 text-gray-200 mb-2" />
                Sem dados de horas para exibir no filtro selecionado.
              </div>
            )}
          </div>
        </div>

      {/* NOVO: Ranking do Mês (CEO/GESTOR) */}
      {(currentUser.role === 'CEO' || currentUser.role === 'GESTOR') && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
                <h3 className="text-lg font-bold text-gray-700 flex items-center">
                    <Target className="w-5 h-5 mr-2 text-purple-600" />
                    Ranking de Produtividade
                </h3>
                
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setRankingPeriod('MONTH')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'MONTH' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        <Calendar className="w-3 h-3" />
                        Este Mês
                    </button>
                    <button 
                        onClick={() => setRankingPeriod('YEAR')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'YEAR' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        <Calendar className="w-3 h-3" />
                        Este Ano
                    </button>
                    <button 
                        onClick={() => setRankingPeriod('CUSTOM')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'CUSTOM' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        <Filter className="w-3 h-3" />
                        Personalizado
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                        <tr>
                            <th className="p-3">Projetista</th>
                            <th className="p-3 text-center">Liberações</th>
                            <th className="p-3 text-center">Desenvolvimentos</th>
                            <th className="p-3 text-center">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(() => {
                            const now = new Date();
                            const currentMonth = now.getMonth();
                            const currentYear = now.getFullYear();

                            // Iterate over user IDs directly from usersMap keys
                            const stats = Object.keys(usersMap).map(userId => {
                                const userName = usersMap[userId];
                                
                                // Determine which project set to use based on rankingPeriod
                                let projectsToConsider = data.projects; // Default to all projects for filtering

                                if (rankingPeriod === 'CUSTOM') {
                                    // Use the globally filtered projects (respects top date filters)
                                    projectsToConsider = filteredProjects;
                                }

                                // Filter projects for this user based on the selected period logic
                                const userProjects = projectsToConsider.filter(p => {
                                    if (p.userId !== userId) return false;
                                    if (p.status !== 'COMPLETED') return false;

                                    const pDate = new Date(p.endTime || p.startTime);
                                    
                                    if (rankingPeriod === 'MONTH') {
                                        return pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear;
                                    } else if (rankingPeriod === 'YEAR') {
                                        return pDate.getFullYear() === currentYear;
                                    }
                                    
                                    // For CUSTOM, filteredProjects already handles the date filtering
                                    return true; 
                                });

                                const releases = userProjects.filter(p => p.type === ProjectType.RELEASE).length;
                                const developments = userProjects.filter(p => p.type === ProjectType.DEVELOPMENT).length;

                                return { name: userName, releases, developments, total: releases + developments };
                            }).filter(stat => stat.total > 0).sort((a, b) => b.total - a.total);

                            if (stats.length === 0) {
                                return (
                                    <tr>
                                        <td colSpan={4} className="p-4 text-center text-gray-400 italic">
                                            {rankingPeriod === 'MONTH' ? 'Nenhum projeto neste mês.' : 
                                             rankingPeriod === 'YEAR' ? 'Nenhum projeto neste ano.' : 
                                             'Nenhum projeto no período selecionado.'}
                                        </td>
                                    </tr>
                                );
                            }

                            return stats.map((stat, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="p-3 font-medium text-gray-800">
                                        <div className="flex items-center">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                                                index === 0 ? 'bg-yellow-100 text-yellow-700' : 
                                                index === 1 ? 'bg-gray-100 text-gray-700' : 
                                                index === 2 ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-600'
                                            }`}>
                                                {index + 1}
                                            </span>
                                            {stat.name}
                                        </div>
                                    </td>
                                    <td className="p-3 text-center font-bold text-blue-600">{stat.releases}</td>
                                    <td className="p-3 text-center font-bold text-green-600">{stat.developments}</td>
                                    <td className="p-3 text-center font-bold text-gray-800">{stat.total}</td>
                                </tr>
                            ));
                        })()}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Removed: Issue Distribution (Pie Chart) */}

        {/* Releases per Month (Bar Chart) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[350px] col-span-1 md:col-span-2">
            <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold text-gray-700 flex items-center">
                        <BarChart3 className="w-5 h-5 mr-2 text-blue-500" />
                        {currentUser.role === 'GESTOR' || currentUser.role === 'CEO' ? 'Liberações da Equipe' : 'Seu Desempenho de Liberações'}
                    </h3>
                    {selectedDesignerForReleases !== 'ALL' && (
                        <span className="text-xs text-blue-600 font-semibold ml-7">Filtrado por: {usersMap[selectedDesignerForReleases]}</span>
                    )}
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setReleaseGrouping('MONTHLY')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'MONTHLY' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        Mensal
                    </button>
                    <button 
                        onClick={() => setReleaseGrouping('YEARLY')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'YEARLY' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        Anual
                    </button>
                    <button 
                        onClick={() => setReleaseGrouping('GLOBAL')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'GLOBAL' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        Global
                    </button>
                </div>
            </div>
            <div className="h-[250px] w-full">
                {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px'}} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{ fill: '#f3f4f6' }} />
                    <Bar dataKey="liberacoes" name="Liberações" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={releaseGrouping === 'GLOBAL' ? 80 : 40} />
                    </BarChart>
                </ResponsiveContainer>
                ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    Sem dados para exibir.
                </div>
                )}
            </div>
            </div>

        {/* Innovations Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[350px]">
            <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center">
                <Lightbulb className="w-5 h-5 mr-2 text-yellow-500" />
                Status de Inovações
            </h3>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={innovationChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px'}} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: '#f3f4f6' }} />
                        <Legend />
                        <Bar dataKey="Novo Projeto" stackId="a" fill="#8b5cf6" />
                        <Bar dataKey="Melhoria" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="Otimização" stackId="a" fill="#f97316" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            </div>

        {/* Implement Type (Pie Chart) - REMOVED AS REQUESTED */}


        {/* Manager Only: Releases by Designer */}
        {currentUser.role === 'GESTOR' && (
          <>
            {/* 1. Activities by Designer (Stacked Bar) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[350px]">
                <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center">
                    <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                    Atividades por Projetista
                </h3>
                <div className="h-[300px] w-full">
                    {activitiesByDesigner.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activitiesByDesigner}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px'}} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                <Tooltip cursor={{ fill: '#f3f4f6' }} />
                                <Legend />
                                <Bar dataKey={ProjectType.RELEASE} name="Liberação" stackId="a" fill="#3b82f6" />
                                <Bar dataKey={ProjectType.VARIATION} name="Variação" stackId="a" fill="#f97316" />
                                <Bar dataKey={ProjectType.DEVELOPMENT} name="Desenvolvimento" stackId="a" fill="#10b981" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                            Sem dados de atividades para exibir.
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Interruptions by Designer (Stacked Bar) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 min-h-[350px] col-span-1 md:col-span-2">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-700 flex items-center">
                        <PauseCircle className="w-5 h-5 mr-2 text-red-500" />
                        Análise de Interrupções por Projetista
                    </h3>
                    <select 
                        value={selectedInterruptionDesigner}
                        onChange={(e) => setSelectedInterruptionDesigner(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm bg-gray-50 cursor-pointer"
                    >
                        <option value="ALL">Visão Geral (Todos)</option>
                        {availableDesigners.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>

                {selectedInterruptionDesigner === 'ALL' ? (
                    <div className="h-[300px] w-full">
                        {interruptionsByDesigner.data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={interruptionsByDesigner.data}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px'}} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} label={{ value: 'Qtd. Paradas', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: '12px' } }} />
                                    <Tooltip cursor={{ fill: '#f3f4f6' }} />
                                    <Legend />
                                    {interruptionsByDesigner.reasons.map((reason, index) => (
                                        <Bar 
                                            key={reason} 
                                            dataKey={reason} 
                                            stackId="a" 
                                            fill={COLORS[index % COLORS.length]} 
                                        />
                                    ))}
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                                Nenhuma interrupção registrada no período.
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {interruptionsForSelectedDesigner.length > 0 ? (
                            <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                                        <tr>
                                            <th className="p-3">Projeto (NS)</th>
                                            <th className="p-3">Cliente</th>
                                            <th className="p-3">Data</th>
                                            <th className="p-3 text-center">Qtd</th>
                                            <th className="p-3 text-center">Total Parado</th>
                                            <th className="p-3">Detalhes das Paradas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {interruptionsForSelectedDesigner.map((item) => (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="p-3 font-mono font-bold text-gray-800">{item.ns}</td>
                                                <td className="p-3 text-gray-600">{item.client || '-'}</td>
                                                <td className="p-3 text-gray-500 text-xs">
                                                    {new Date(item.date).toLocaleDateString('pt-BR')}
                                                </td>
                                                <td className="p-3 text-center font-bold text-gray-700">
                                                    {item.pauses.length}
                                                </td>
                                                <td className="p-3 text-center font-bold text-red-600">
                                                    {formatDuration(item.totalPaused)}
                                                </td>
                                                <td className="p-3">
                                                    <div className="space-y-1">
                                                        {item.pauses.map((pause, idx) => (
                                                            <div key={idx} className="flex items-center text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-100 w-fit">
                                                                <span className="font-bold mr-2">{pause.reason}:</span>
                                                                <span>{formatDuration(Number(pause.durationSeconds))}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-lg">
                                Nenhuma interrupção encontrada para este projetista no período selecionado.
                            </div>
                        )}
                    </div>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
