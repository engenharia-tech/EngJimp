import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import { Sparkles, BarChart3, Download, Clock, Filter, Truck, User as UserIcon, Lightbulb, TrendingDown, Target, Calendar, PauseCircle, Activity, DollarSign } from 'lucide-react';
import { AppState, User, InnovationType, ProjectType } from '../types';
import { analyzePerformance } from '../services/geminiService';
import { fetchUsers } from '../services/storageService';
import { useLanguage } from '../i18n/LanguageContext';

interface DashboardProps {
  data: AppState;
  currentUser: User;
  theme: 'light' | 'dark';
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6', '#ec4899'];

export const Dashboard: React.FC<DashboardProps> = ({ data, currentUser, theme }) => {
  const { t } = useLanguage();
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

  const filteredInterruptions = useMemo(() => {
    return data.interruptions.filter(i => {
      // Restrict visibility for PROJETISTA to their own interruptions only
      if (currentUser.role === 'PROJETISTA' && i.designerId !== currentUser.id) {
          return false;
      }
      
      let matchDate = true;
      if (startDate || endDate) {
        const iDate = new Date(i.startTime).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
        matchDate = iDate >= start && iDate <= end;
      }
      return matchDate;
    });
  }, [data.interruptions, startDate, endDate, currentUser.role, currentUser.id]);


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

  const totalHours = useMemo(() => {
    const seconds = filteredProjects.reduce((acc, p) => acc + p.totalActiveSeconds, 0);
    return Math.round(seconds / 3600);
  }, [filteredProjects]);

  const goalProgress = useMemo(() => {
    if (monthlyGoal <= 0) return 0;
    return Math.min(Math.round((totalHours / monthlyGoal) * 100), 100);
  }, [totalHours, monthlyGoal]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const rankingStats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return Object.keys(usersMap).map(userId => {
        const userName = usersMap[userId];
        let projectsToConsider = data.projects;

        if (rankingPeriod === 'CUSTOM') {
            projectsToConsider = filteredProjects;
        }

        const userProjects = projectsToConsider.filter(p => {
            if (p.userId !== userId) return false;
            if (p.status !== 'COMPLETED') return false;

            const pDate = new Date(p.endTime || p.startTime);
            
            if (rankingPeriod === 'MONTH') {
                return pDate.getMonth() === currentMonth && pDate.getFullYear() === currentYear;
            } else if (rankingPeriod === 'YEAR') {
                return pDate.getFullYear() === currentYear;
            }
            return true; 
        });

        const releases = userProjects.filter(p => p.type === ProjectType.RELEASE).length;
        const variations = userProjects.filter(p => p.type === ProjectType.VARIATION).length;
        const developments = userProjects.filter(p => p.type === ProjectType.DEVELOPMENT).length;

        return { id: userId, name: userName, releases, variations, developments, total: releases + variations + developments };
    }).filter(stat => stat.total > 0).sort((a, b) => b.total - a.total);
  }, [usersMap, data.projects, rankingPeriod, filteredProjects]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
  };

  const costPerSecond = useMemo(() => {
    if (data.settings && !data.settings.useAutomaticCost && data.settings.hourlyCost > 0) {
      return data.settings.hourlyCost / 3600;
    }
    
    const relevantUsers = data.users.filter(u => u.role !== 'CEO' && (u.salary || 0) > 0);
    const totalSalary = relevantUsers.reduce((acc, u) => acc + (u.salary || 0), 0);
    const numUsers = relevantUsers.length || 1;
    return ((totalSalary / numUsers) / 220) / 3600;
  }, [data.users, data.settings]);

  const costData = useMemo(() => {
    let totalProductive = 0;

    // 1. Costs from finished projects
    filteredProjects.forEach(p => {
      // Recalculate based on the new formula for consistency
      const productiveCost = (p.totalActiveSeconds / 3600) * (costPerSecond * 3600);
      totalProductive += productiveCost;
    });

    // 2. Costs from filtered interruptions
    const totalInterruptionSeconds = filteredInterruptions.reduce((acc, i) => acc + i.totalTimeSeconds, 0);
    const totalInterruptionCost = totalInterruptionSeconds * costPerSecond;

    const totalOverall = totalProductive + totalInterruptionCost;

    return {
      productive: totalProductive,
      interruption: totalInterruptionCost,
      totalInterruptionSeconds,
      total: totalOverall,
      percentageLost: totalOverall > 0 ? (totalInterruptionCost / totalOverall) * 100 : 0
    };
  }, [filteredProjects, filteredInterruptions, costPerSecond]);

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
      const name = usersMap[curr.userId || ''] || (curr.userId && curr.userId.length < 30 ? curr.userId : 'Desconhecido');
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
        const userName = usersMap[p.userId || ''] || (p.userId && p.userId.length < 30 ? p.userId : 'Desconhecido');
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
        const userName = usersMap[p.userId || ''] || (p.userId && p.userId.length < 30 ? p.userId : 'Desconhecido');
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

  // 8.1. Monthly Interruptions (General View)
  const interruptionsByMonth = useMemo(() => {
    const data: Record<string, { name: string, total: number, [key: string]: any }> = {};
    const allReasons = new Set<string>();

    filteredProjects.forEach(p => {
        const date = new Date(p.startTime);
        const monthYear = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        
        if (!data[monthYear]) {
            data[monthYear] = { name: monthYear, total: 0 };
        }
        
        if (p.pauses && p.pauses.length > 0) {
            p.pauses.forEach(pause => {
                const reason = pause.reason || 'Outros';
                allReasons.add(reason);
                data[monthYear][reason] = (data[monthYear][reason] || 0) + 1;
                data[monthYear].total++;
            });
        }
    });

    const result = Object.values(data).sort((a, b) => {
        const [mA, yA] = a.name.split('/');
        const [mB, yB] = b.name.split('/');
        return new Date(`20${yA}-${mA}-01`).getTime() - new Date(`20${yB}-${mB}-01`).getTime();
    });

    return { data: result, reasons: Array.from(allReasons) };
  }, [filteredProjects]);

  // 9. Interruptions for Selected Designer (Grouped by Project)
  const interruptionsForSelectedDesigner = useMemo(() => {
    if (selectedInterruptionDesigner === 'ALL') return [];

    const data: Record<string, { name: string, [key: string]: any }> = {};
    const allReasons = new Set<string>();

    const designerProjects = filteredProjects.filter(p => p.userId === selectedInterruptionDesigner);

    designerProjects.forEach(p => {
        const date = new Date(p.startTime);
        const monthYear = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        
        if (!data[monthYear]) {
            data[monthYear] = { name: monthYear };
        }
        
        if (p.pauses && p.pauses.length > 0) {
            p.pauses.forEach(pause => {
                const reason = pause.reason || 'Outros';
                allReasons.add(reason);
                data[monthYear][reason] = (data[monthYear][reason] || 0) + 1;
            });
        }
    });

    const result = Object.values(data).sort((a, b) => {
        const [mA, yA] = a.name.split('/');
        const [mB, yB] = b.name.split('/');
        return new Date(`20${yA}-${mA}-01`).getTime() - new Date(`20${yB}-${mB}-01`).getTime();
    });

    return { data: result, reasons: Array.from(allReasons) };
  }, [filteredProjects, selectedInterruptionDesigner]);

  const handleAiAnalysis = async () => {
    setIsLoadingAi(true);
    const result = await analyzePerformance(filteredProjects, filteredIssues, filteredInterruptions, data.settings, data.users);
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
      <div className="bg-white dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center text-black dark:text-white font-bold">
          <Filter className="w-5 h-5 mr-2 text-blue-600" />
          {t('analysisFilters')}
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-slate-400">{t('from')}</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:bg-black dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-black dark:text-white">{t('to')}</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-2 border dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:bg-black dark:text-white"
            />
          </div>
          {currentUser.role === 'GESTOR' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-black dark:text-white">{t('designer')}</span>
              <select
                value={selectedDesignerForReleases}
                onChange={(e) => {
                  setSelectedDesignerForReleases(e.target.value);
                  setSelectedDesignerForChart(e.target.value); // Sync both for convenience
                }}
                className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-gray-50 dark:bg-black dark:text-white cursor-pointer"
              >
                <option value="ALL">{t('all')}</option>
                {availableDesigners.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
          <button 
            onClick={handleExportCSV}
            className="flex items-center text-sm font-medium text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-white bg-gray-50 dark:bg-black border border-gray-200 dark:border-slate-600 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors ml-auto md:ml-0"
          >
            <Download className="w-4 h-4 mr-2" />
            {t('exportCsv')}
          </button>
      </div>

      {/* KPI Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {averageTimes.length > 0 && averageTimes.map((stat) => (
            <div key={stat.type} className="bg-white dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-black dark:text-white uppercase tracking-wider mb-1">{t('avgTime')} {stat.type}</p>
                <p className="text-xl font-bold text-black dark:text-white">{formatDuration(stat.avgSeconds)}</p>
              </div>
              <div className="h-8 w-8 bg-blue-50 dark:bg-black rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
          ))}
          
          <div className="bg-white dark:bg-black p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">{t('totalHours')}</p>
              <p className="text-xl font-bold text-indigo-800 dark:text-indigo-300">{totalHours}h</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${goalProgress}%` }}></div>
                </div>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{goalProgress}%</span>
              </div>
            </div>
            <div className="h-8 w-8 bg-indigo-50 dark:bg-black rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>

          {/* Innovation KPI */}
           <div className="bg-white dark:bg-black p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">{t('annualSavings')}</p>
                <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300">{formatCurrency(totalSavings)}</p>
              </div>
              <div className="h-8 w-8 bg-emerald-50 dark:bg-black rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <TrendingDown className="w-4 h-4" />
              </div>
            </div>

          {/* Cost KPI */}
          <div className="bg-white dark:bg-black p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">{t('totalProjectValue')}</p>
              <p className="text-xl font-bold text-blue-800 dark:text-blue-300">{formatCurrency(costData.productive)}</p>
              <p className="text-[10px] text-blue-500 font-medium mt-1">{t('productiveTimeBase')}</p>
            </div>
            <div className="h-8 w-8 bg-blue-50 dark:bg-black rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>

          {/* Interruption Cost KPI */}
          <div className="bg-white dark:bg-black p-4 rounded-xl border border-red-100 dark:border-red-900/30 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">{t('interruptionCost')}</p>
              <p className="text-xl font-bold text-red-800 dark:text-red-300">{formatCurrency(costData.interruption)}</p>
              <p className="text-[10px] text-red-500 font-medium mt-1">{t('totalTime')}: {formatDuration(costData.totalInterruptionSeconds)}</p>
            </div>
            <div className="h-8 w-8 bg-red-50 dark:bg-black rounded-full flex items-center justify-center text-red-600 dark:text-red-400">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
        </div>

      {/* AI Insights Section */}
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:bg-black p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-indigo-900 dark:text-indigo-300 flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
              Análise Inteligente (IA)
            </h3>
            <button 
              onClick={handleAiAnalysis}
              disabled={isLoadingAi}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isLoadingAi ? 'Analisando...' : 'Gerar Relatório'}
            </button>
          </div>
          
          {aiAnalysis ? (
            <div className="prose prose-sm max-w-none text-black dark:text-white bg-white/50 dark:bg-black p-4 rounded-lg">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{aiAnalysis}</pre>
            </div>
          ) : (
            <p className="text-black dark:text-white text-sm">
              Clique em "Gerar Relatório" para que a IA analise o desempenho do período selecionado.
            </p>
          )}
        </div>

      {/* NOVO: Gráfico Horas Realizadas vs Meta Mensal */}
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[400px]">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div className="flex flex-col">
                <h3 className="text-lg font-bold text-black dark:text-white flex items-center">
                    <Target className="w-5 h-5 mr-2 text-indigo-500" />
                    {t('hoursVsGoalTitle')}
                </h3>
                <p className="text-xs text-black dark:text-white ml-7 opacity-70">{t('hoursVsGoalSub')}</p>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-slate-400">{t('goalLabel')}</span>
                    <input 
                        type="number" 
                        value={monthlyGoal}
                        onChange={(e) => setMonthlyGoal(Number(e.target.value))}
                        className="w-16 p-1 border dark:border-slate-600 rounded text-sm outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-black dark:text-white"
                    />
                </div>

                {currentUser.role === 'GESTOR' && (
                <select
                    value={selectedDesignerForChart}
                    onChange={(e) => setSelectedDesignerForChart(e.target.value)}
                    className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-gray-50 dark:bg-black dark:text-white cursor-pointer"
                >
                    <option value="ALL">{t('allDesigners')}</option>
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
                <ComposedChart data={hoursVsGoalData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                  <YAxis 
                    allowDecimals={false} 
                    tickLine={false} 
                    axisLine={false} 
                    style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}
                    label={{ value: t('hours'), angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#9ca3af', fontSize: '12px' } }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                    cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }}
                    formatter={(value: number) => [`${value}h`, '']}
                  />
                  <Legend wrapperStyle={{ paddingTop: '10px' }} />
                  <Bar dataKey="Realizado" name={t('realizedHours')} fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                  <Line type="monotone" dataKey="Meta" name={t('goal')} stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                <Target className="w-8 h-8 text-gray-200 dark:text-slate-700 mb-2" />
                {t('noHoursData')}
              </div>
            )}
          </div>
        </div>

      {/* NOVO: Ranking do Mês (CEO/GESTOR/COORDENADOR) */}
      {(currentUser.role === 'CEO' || currentUser.role === 'GESTOR' || currentUser.role === 'COORDENADOR') && (
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
            <div className="flex flex-col md:flex-row items-center justify-between mb-4 gap-4">
                <h3 className="text-lg font-bold text-black dark:text-white flex items-center">
                    <Target className="w-5 h-5 mr-2 text-purple-600" />
                    {t('productivityRankingTitle')}
                </h3>
                
                <div className="flex bg-gray-100 dark:bg-black p-1 rounded-lg">
                    <button 
                        onClick={() => setRankingPeriod('MONTH')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'MONTH' ? 'bg-white dark:bg-black text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        <Calendar className="w-3 h-3" />
                        {t('thisMonth')}
                    </button>
                    <button 
                        onClick={() => setRankingPeriod('YEAR')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'YEAR' ? 'bg-white dark:bg-black text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        <Calendar className="w-3 h-3" />
                        {t('thisYear')}
                    </button>
                    <button 
                        onClick={() => setRankingPeriod('CUSTOM')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${rankingPeriod === 'CUSTOM' ? 'bg-white dark:bg-black text-purple-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        <Filter className="w-3 h-3" />
                        {t('custom')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                            <tr>
                                <th className="p-3">{t('designerCol')}</th>
                                <th className="p-3 text-center">{t('releases')}</th>
                                <th className="p-3 text-center">{t('variations')}</th>
                                <th className="p-3 text-center">{t('developments')}</th>
                                <th className="p-3 text-center">{t('total')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                            {rankingStats.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-4 text-center text-black dark:text-white italic">
                                        {rankingPeriod === 'MONTH' ? t('noProjectsMonth') : 
                                         rankingPeriod === 'YEAR' ? t('noProjectsYear') : 
                                         t('noProjects')}
                                    </td>
                                </tr>
                            ) : (
                                rankingStats.map((stat, index) => (
                                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                                        <td className="p-3 font-medium text-black dark:text-white">
                                            <div className="flex items-center">
                                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                                                    index === 0 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 
                                                    index === 1 ? 'bg-gray-100 text-gray-700 dark:bg-black dark:text-slate-300' : 
                                                    index === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                }`}>
                                                    {index + 1}
                                                </span>
                                                {stat.name}
                                            </div>
                                        </td>
                                        <td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400">{stat.releases}</td>
                                        <td className="p-3 text-center font-bold text-orange-600 dark:text-orange-400">{stat.variations}</td>
                                        <td className="p-3 text-center font-bold text-green-600 dark:text-green-400">{stat.developments}</td>
                                        <td className="p-3 text-center font-bold text-black dark:text-white">{stat.total}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={rankingStats}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                            <XAxis type="number" hide />
                            <YAxis 
                                dataKey="name" 
                                type="category" 
                                axisLine={false} 
                                tickLine={false}
                                style={{ fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}
                                width={100}
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }}
                            />
                            <Bar dataKey="total" name={t('totalDeliveries')} fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={30}>
                                {rankingStats.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 0 ? '#8b5cf6' : index === 1 ? '#a78bfa' : index === 2 ? '#c4b5fd' : '#ddd6fe'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Removed: Issue Distribution (Pie Chart) */}

        {/* Releases per Month (Bar Chart) */}
            <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px] col-span-1 md:col-span-2">
            <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col">
                    <h3 className="text-lg font-bold text-black dark:text-white flex items-center">
                        <BarChart3 className="w-5 h-5 mr-2 text-blue-500" />
                        {currentUser.role === 'GESTOR' || currentUser.role === 'CEO' ? t('teamReleases') : t('yourPerformance')}
                    </h3>
                    {selectedDesignerForReleases !== 'ALL' && (
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold ml-7">{t('filteredBy')}: {usersMap[selectedDesignerForReleases] || selectedDesignerForReleases}</span>
                    )}
                </div>
                <div className="flex bg-gray-100 dark:bg-black p-1 rounded-lg">
                    <button 
                        onClick={() => setReleaseGrouping('MONTHLY')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'MONTHLY' ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        {t('monthly')}
                    </button>
                    <button 
                        onClick={() => setReleaseGrouping('YEARLY')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'YEARLY' ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        {t('yearly')}
                    </button>
                    <button 
                        onClick={() => setReleaseGrouping('GLOBAL')}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${releaseGrouping === 'GLOBAL' ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400'}`}
                    >
                        {t('global')}
                    </button>
                </div>
            </div>
            <div className="h-[250px] w-full">
                {barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                        cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                    />
                    <Bar dataKey="liberacoes" name={t('releases')} fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={releaseGrouping === 'GLOBAL' ? 80 : 40} />
                    </BarChart>
                </ResponsiveContainer>
                ) : (
                <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                    {t('noData')}
                </div>
                )}
            </div>
            </div>

        {/* Innovations Chart */}
            <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px]">
            <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
                <Lightbulb className="w-5 h-5 mr-2 text-yellow-500" />
                {t('innovationStatus')}
            </h3>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={innovationChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                        <YAxis allowDecimals={false} tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                            cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                        />
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
            <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px]">
                <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
                    <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                    {t('activitiesByDesigner')}
                </h3>
                <div className="h-[300px] w-full">
                    {activitiesByDesigner.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activitiesByDesigner}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                    cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                                />
                                <Legend />
                                <Bar dataKey={ProjectType.RELEASE} name={t('releases')} stackId="a" fill="#3b82f6" />
                                <Bar dataKey={ProjectType.VARIATION} name={t('variations')} stackId="a" fill="#f97316" />
                                <Bar dataKey={ProjectType.DEVELOPMENT} name={t('developments')} stackId="a" fill="#10b981" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                            {t('noActivityData')}
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Paradas by Designer (Stacked Bar) */}
            <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 min-h-[350px] col-span-1 md:col-span-2">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-700 dark:text-slate-200 flex items-center">
                        <PauseCircle className="w-5 h-5 mr-2 text-red-500" />
                        {t('stopAnalysis')}
                    </h3>
                    <select 
                        value={selectedInterruptionDesigner}
                        onChange={(e) => setSelectedInterruptionDesigner(e.target.value)}
                        className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm bg-gray-50 dark:bg-black dark:text-white cursor-pointer"
                    >
                        <option value="ALL">{t('overviewAll')}</option>
                        {availableDesigners.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                    </select>
                </div>

                <div className="h-[300px] w-full">
                    {selectedInterruptionDesigner === 'ALL' ? (
                        interruptionsByMonth.data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={interruptionsByMonth.data}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} label={{ value: t('stopCount'), angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#9ca3af', fontSize: '12px' } }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                        cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                                    />
                                    {/* No legend in general view as requested */}
                                    <Bar dataKey="total" name={t('stopCount')} fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm">
                                {t('noStopsPeriod')}
                            </div>
                        )
                    ) : (
                        interruptionsForSelectedDesigner.data.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={interruptionsForSelectedDesigner.data}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} style={{fontSize: '12px', fill: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} label={{ value: t('stopCount'), angle: -90, position: 'insideLeft', style: { fill: theme === 'dark' ? '#64748b' : '#9ca3af', fontSize: '12px' } }} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f1f5f9' : '#1e293b' }}
                                        cursor={{ fill: theme === 'dark' ? '#334155' : '#f3f4f6' }} 
                                    />
                                    <Legend />
                                    {interruptionsForSelectedDesigner.reasons.map((reason, index) => (
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
                            <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm border-2 border-dashed border-gray-100 dark:border-slate-700 rounded-lg">
                                {t('noStopsDesigner')}
                            </div>
                        )
                    )}
                </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
